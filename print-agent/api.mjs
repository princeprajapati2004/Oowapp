// Thin wrapper around the /api/agent/* backend routes — every call here
// mirrors a route documented in src/app/api/agent/. Uses Node's global
// fetch (stable since Node 18), no HTTP client dependency.

export class ApiError extends Error {
  constructor(status, body) {
    super(typeof body?.error === "string" ? body.error : `Request failed with status ${status}`);
    this.status = status;
    this.body = body;
  }
}

export function createApiClient(backendUrl, token) {
  async function request(method, path, body) {
    const res = await fetch(new URL(path, backendUrl), {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    const json = text ? JSON.parse(text) : null;
    if (!res.ok) throw new ApiError(res.status, json);
    return json;
  }

  return {
    register: (input) => request("POST", "/api/agent/register", input),
    heartbeat: (version) => request("POST", "/api/agent/heartbeat", { version }),
    reportPrinters: (printers) => request("POST", "/api/agent/printers", { printers }),
    listPendingJobs: () => request("GET", "/api/agent/jobs"),
    claimJob: (id) => request("POST", `/api/agent/jobs/${id}/claim`),
    completeJob: (id) => request("POST", `/api/agent/jobs/${id}/complete`),
    failJob: (id, errorMessage) => request("POST", `/api/agent/jobs/${id}/fail`, { errorMessage }),
    /** Raw fetch to the SSE stream endpoint — the caller reads the body itself (see sse.mjs). */
    openJobStream: (signal) =>
      fetch(new URL("/api/agent/jobs/stream", backendUrl), {
        headers: { Authorization: `Bearer ${token}` },
        signal,
      }),
  };
}
