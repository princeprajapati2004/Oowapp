import type { Instrumentation } from "next";

// Server Component / Route Handler / Server Action errors reach the browser
// with only a `digest` (message is stripped in production to avoid leaking
// details) — this is the only place the real message and stack are still
// available server-side. Logged as a single structured line so it's
// greppable by digest in the hosting platform's function logs.
export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context
) => {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  const digest =
    typeof error === "object" && error !== null && "digest" in error
      ? String((error as { digest?: unknown }).digest)
      : undefined;

  console.error("[server-error]", {
    digest,
    message,
    stack,
    path: request.path,
    method: request.method,
    routePath: context.routePath,
    routeType: context.routeType,
    renderSource: context.renderSource,
    timestamp: new Date().toISOString(),
  });
};
