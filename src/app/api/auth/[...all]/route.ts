import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/lib/auth";

// Build the handler per request, deriving baseURL from the request's own URL so
// Better Auth always has a valid absolute origin (it is not reliably available
// from env at module load on the Worker).
const handlerFor = (request: Request) =>
  toNextJsHandler(getAuth(new URL(request.url).origin));

export const GET = (request: Request): Promise<Response> =>
  handlerFor(request).GET(request);

export const POST = (request: Request): Promise<Response> =>
  handlerFor(request).POST(request);
