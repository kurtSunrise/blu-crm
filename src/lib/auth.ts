import { getCloudflareContext } from "@opennextjs/cloudflare";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/db";
import { account, session, user, verification } from "@/db/schema";

// On the Cloudflare Worker, env vars and secrets are only present on
// process.env inside a request context, not at module-load time. The previous
// version built the Better Auth instance at module load with
// `baseURL: process.env.BETTER_AUTH_URL`, so baseURL was empty and Better Auth
// threw "TypeError: Invalid URL string." on sign-in (a 500). The fix: resolve
// config from the Cloudflare env binding and build the instance LAZILY on first
// use, which always happens during a request when the env is populated.

const readEnv = (key: string): string | undefined => {
  try {
    const env = getCloudflareContext().env as unknown as Record<
      string,
      string | undefined
    >;
    if (env[key]) {
      return env[key];
    }
  } catch {
    // Outside a Cloudflare request context (local dev, tsx scripts, tests):
    // fall back to process.env, which is populated there.
  }
  return process.env[key];
};

const buildAuth = (baseURL: string | undefined) => {
  const microsoftConfigured = Boolean(
    readEnv("MICROSOFT_CLIENT_ID") && readEnv("MICROSOFT_CLIENT_SECRET")
  );

  return betterAuth({
    ...(baseURL ? { baseURL } : {}),
    secret: readEnv("BETTER_AUTH_SECRET"),
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: { account, session, user, verification },
    }),
    emailAndPassword: {
      enabled: true,
    },
    socialProviders: microsoftConfigured
      ? {
          microsoft: {
            clientId: readEnv("MICROSOFT_CLIENT_ID") ?? "",
            clientSecret: readEnv("MICROSOFT_CLIENT_SECRET") ?? "",
            tenantId: readEnv("MICROSOFT_TENANT_ID"),
          },
        }
      : undefined,
    user: {
      additionalFields: {
        role: {
          type: "string",
          defaultValue: "sales",
          input: false,
        },
      },
      // Lets a member delete their own account from the Account settings page.
      // No verification email is configured, so deletion requires the current
      // password (handled by the client call) and happens immediately.
      deleteUser: {
        enabled: true,
      },
    },
  });
};

// Built lazily (inside a request) and cached per baseURL. The baseURL is
// derived from the incoming request at the call sites, which is always a valid
// absolute URL, so Better Auth never has to infer it (and never sees an empty
// BETTER_AUTH_URL). One Worker serves one host, so the cache holds a single
// entry in practice.
const authByBaseUrl = new Map<string, ReturnType<typeof buildAuth>>();

export const getAuth = (baseURL?: string): ReturnType<typeof buildAuth> => {
  const key = baseURL ?? "";
  const existing = authByBaseUrl.get(key);
  if (existing) {
    return existing;
  }
  const created = buildAuth(baseURL);
  authByBaseUrl.set(key, created);
  return created;
};

// Derive an absolute origin (https://host) from a request's headers, for the
// session helpers that only have headers, not the full request URL.
export const baseUrlFromHeaders = (
  requestHeaders: Headers
): string | undefined => {
  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  if (!host) {
    return;
  }
  const proto = requestHeaders.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
};

// Display-only hint for the sign-in page's SSO button. Microsoft SSO is
// optional and currently unset, so the module-load read (false when unset) is
// adequate here.
export const isMicrosoftSsoEnabled = Boolean(
  process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET
);
