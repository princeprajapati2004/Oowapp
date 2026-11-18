// Dynamically imported inside request() rather than statically — api-client.ts
// is a plain fetch wrapper used by every client component (admin, staff,
// customer); a static import would pull the gate's React/UI code into every
// one of those bundles even where it can never fire (its own actorType check
// below already no-ops for staff/customer responses).
async function maybeOpenSubscriptionGate(body: Record<string, unknown> | null) {
  if (body?.code === "SUBSCRIPTION_EXPIRED" && body?.actorType === "admin") {
    const { openSubscriptionGate } = await import("@/components/shared/subscription-gate");
    openSubscriptionGate();
  }
}

export class ApiError extends Error {
  status: number;
  data: Record<string, unknown> | null;
  constructor(message: string, status: number, data: Record<string, unknown> | null = null) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

async function request<T>(
  path: string,
  init?: RequestInit,
  // Optional bounded wait — a caller with no natural retry/feedback loop
  // (e.g. checkout) can opt in so the request never hangs indefinitely.
  // Omitted, behavior is unchanged: a bare fetch with no ceiling, same as
  // every existing caller today.
  timeoutMs?: number
): Promise<T> {
  const controller = timeoutMs ? new AbortController() : undefined;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : undefined;
  try {
    const res = await fetch(path, {
      ...init,
      signal: controller?.signal,
      headers: {
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });

    const isJson = res.headers.get("content-type")?.includes("application/json");
    const body = isJson ? await res.json().catch(() => null) : null;

    if (!res.ok) {
      if (res.status === 403) maybeOpenSubscriptionGate(body);
      throw new ApiError(body?.error ?? "Something went wrong", res.status, body);
    }

    return body as T;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export const api = {
  get: <T,>(path: string) => request<T>(path),
  post: <T,>(path: string, data?: unknown, timeoutMs?: number) =>
    request<T>(path, { method: "POST", body: data ? JSON.stringify(data) : undefined }, timeoutMs),
  patch: <T,>(path: string, data?: unknown) =>
    request<T>(path, { method: "PATCH", body: data ? JSON.stringify(data) : undefined }),
  put: <T,>(path: string, data?: unknown) =>
    request<T>(path, { method: "PUT", body: data ? JSON.stringify(data) : undefined }),
  delete: <T,>(path: string) => request<T>(path, { method: "DELETE" }),
};
