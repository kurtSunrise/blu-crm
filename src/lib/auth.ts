import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/db";
import { account, session, user, verification } from "@/db/schema";

// Microsoft 365 (Entra ID) SSO activates once the tenant admin registers
// the Entra app and supplies the env vars (PRD §4.3); email/password works
// regardless.
const microsoftConfigured = Boolean(
  process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET
);

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
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
          clientId: process.env.MICROSOFT_CLIENT_ID ?? "",
          clientSecret: process.env.MICROSOFT_CLIENT_SECRET ?? "",
          tenantId: process.env.MICROSOFT_TENANT_ID,
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
  },
});

export const isMicrosoftSsoEnabled = microsoftConfigured;
