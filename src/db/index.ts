import { neon } from "@neondatabase/serverless";
import {
  drizzle as drizzleNeonHttp,
  type NeonHttpDatabase,
} from "drizzle-orm/neon-http";
import { schema } from "./schema";

type Database = NeonHttpDatabase<typeof schema>;

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

// Neon publishes AAAA records, and on networks without a working IPv6 path
// Node's Happy Eyeballs (autoSelectFamily, default since Node 20) times out
// fresh socket connects with bare ETIMEDOUT — reliably so when parallel
// queries open several sockets at once. Disable it in the Node runtime;
// Cloudflare Workers' fetch is unaffected and workerd may not implement
// this node:net API, hence the guards.
if (process.release?.name === "node") {
  try {
    const { setDefaultAutoSelectFamily } =
      require("node:net") as typeof import("node:net");
    if (typeof setDefaultAutoSelectFamily === "function") {
      setDefaultAutoSelectFamily(false);
    }
  } catch {
    // node:net unavailable in this runtime; nothing to disable.
  }
}

// Neon's HTTP driver only talks to Neon's proxy, so local development against
// a plain Postgres (localhost DATABASE_URL) uses the node-postgres driver
// instead. Both drivers expose the same Drizzle query-builder API.
const createDb = (): Database => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and fill in your Neon connection string."
    );
  }
  if (LOCAL_HOSTS.has(new URL(databaseUrl).hostname)) {
    // Local Postgres is a dev/E2E-only path; the deployed Worker always points
    // at a remote Neon URL and never reaches this branch. The specifier is
    // assembled at runtime so esbuild can't constant-fold it back to a literal
    // and bundle `pg` (and its optional `pg-cloudflare` socket shim) into the
    // Workers bundle, where `pg-cloudflare` fails to resolve at build time.
    const nodePostgresModule = ["drizzle-orm", "node-postgres"].join("/");
    const { drizzle: drizzleNodePg } = require(
      nodePostgresModule
    ) as typeof import("drizzle-orm/node-postgres");
    return drizzleNodePg(databaseUrl, { schema }) as unknown as Database;
  }
  return drizzleNeonHttp(neon(databaseUrl), { schema });
};

let cachedDb: Database | undefined;

// `next build` evaluates route modules while collecting page data, and CI
// builders (Cloudflare Workers Builds) have no DATABASE_URL. Creating the
// client on first query keeps imports side-effect free so the build can run
// without database credentials.
export const db = new Proxy({} as Database, {
  get(_target, prop) {
    cachedDb ??= createDb();
    const value = Reflect.get(cachedDb, prop, cachedDb);
    return typeof value === "function" ? value.bind(cachedDb) : value;
  },
});
