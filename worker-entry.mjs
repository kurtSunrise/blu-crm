// Custom Worker entry wrapping the OpenNext-generated handler.
//
// Why: on the deployed Worker, dynamic renders intermittently stall before the
// response starts — tiny CPU time, no error, the fetch promise simply never
// settles, and the request hangs until the client disconnects (tracked in
// WorkLogs; upstream suspects: workerd streaming changes of June 2026 /
// opennextjs-cloudflare#1282). Until that is fixed upstream, this watchdog
// bounds the damage: if the handler has not produced a Response within the
// deadline, retry the request once. The retry is NOT raced against a timer, so
// a legitimately slow response (e.g. a cold Neon wake-up) is never cut off —
// the wrapper only ever adds one deadline's delay, it never breaks a request
// that today would succeed.
//
// Only GET/HEAD are retried: they are safe to repeat, and every observed hang
// has been a document/RSC GET. Other methods pass straight through.
//
// The generated worker re-exports its Durable Object classes; wrangler's
// `main` points here, so they must be re-exported again.
import worker from "./.open-next/worker.js";

// biome-ignore lint/performance/noBarrelFile: wrangler requires Durable Object classes to be exported from `main`; this re-export is that contract, not a convenience barrel
export {
  BucketCachePurge,
  DOQueueHandler,
  DOShardedTagCache,
} from "./.open-next/worker.js";

const FIRST_RESPONSE_DEADLINE_MS = 12_000;

const raceDeadline = (promise, ms) => {
  let timer;
  const deadline = new Promise((resolve) => {
    timer = setTimeout(() => resolve("watchdog-timeout"), ms);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
};

// Cron sweeps (wrangler.jsonc `triggers.crons`) are dispatched as an
// in-memory request to the app's own cron route. The OpenNext-generated
// worker exports only `fetch`, so `scheduled` lives here. Global fetch to the
// public hostname is deliberately avoided: `global_fetch_strictly_public` is
// enabled and self-fetching risks subrequest-recursion blocking, while the
// in-memory call has neither problem and skips a network hop. The real
// production hostname keeps any absolute-URL derivation inside the render
// consistent; the route itself never reads Host.
const CRON_ROUTE =
  "https://blu-crm.kurt-0f6.workers.dev/api/cron/notifications";

export default {
  scheduled(controller, env, ctx) {
    const url = new URL(CRON_ROUTE);
    url.searchParams.set("cron", controller.cron);
    ctx.waitUntil(
      worker
        .fetch(
          new Request(url, {
            method: "POST",
            headers: { authorization: `Bearer ${env.CRON_SECRET}` },
          }),
          env,
          ctx
        )
        .then(async (response) => {
          const body = await response.text();
          console.log(
            `[cron] ${controller.cron} -> ${response.status} ${body}`
          );
        })
        .catch((error) => {
          console.error(`[cron] ${controller.cron} failed`, error);
        })
    );
  },

  async fetch(request, env, ctx) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return worker.fetch(request, env, ctx);
    }

    const firstAttempt = worker.fetch(request.clone(), env, ctx);
    const result = await raceDeadline(firstAttempt, FIRST_RESPONSE_DEADLINE_MS);
    if (result !== "watchdog-timeout") {
      return result;
    }

    // The stalled attempt is abandoned (it never settles on its own); the
    // runtime cancels it with the invocation. Log so observability counts
    // every caught hang, then retry unraced.
    console.warn(
      `[hang-watchdog] no response after ${FIRST_RESPONSE_DEADLINE_MS}ms, retrying: ${request.method} ${new URL(request.url).pathname}`
    );
    return worker.fetch(request, env, ctx);
  },
};
