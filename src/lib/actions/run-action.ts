import { unstable_rethrow } from "next/navigation";

const GENERIC_ACTION_ERROR =
  "Something went wrong saving that. Please try again.";

// Wraps a server action body so an infrastructure failure (Neon outage,
// network blip on the workerd runtime) surfaces as a typed { error } the
// form can render, instead of an opaque unhandled server-action error.
// Every *ActionState interface carries an optional `error: string`, so the
// fallback object is assignable to all of them.
export const runAction = async <T extends { error?: string }>(
  work: () => Promise<T>
): Promise<T | { error: string }> => {
  try {
    return await work();
  } catch (error) {
    // redirect() and notFound() communicate via thrown control-flow errors
    // that must keep propagating (e.g. createQuickAddDeal redirects on
    // success). Swallowing them here would break every redirecting action.
    unstable_rethrow(error);
    console.error("[action-error]", error);
    return { error: GENERIC_ACTION_ERROR };
  }
};
