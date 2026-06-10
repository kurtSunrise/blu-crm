import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/db";
import { account, session, user, verification } from "@/db/schema";

// Microsoft 365 (Entra ID) SSO is part of M0 (PRD §4.3) but needs an Entra
// app registration first — add it under socialProviders once the tenant
// admin supplies MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET / TENANT_ID.
export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { account, session, user, verification },
  }),
  emailAndPassword: {
    enabled: true,
  },
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
