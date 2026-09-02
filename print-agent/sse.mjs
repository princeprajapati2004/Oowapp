// Minimal SSE client for the agent's job stream. Node has no browser
// EventSource global to rely on (and its availability/stability varies by
// Node version), so this parses the `event: <type>\ndata: <json>\n\n` wire
// format itself directly off the fetch() response body — the same format
// createOrderEventStream() in the backend writes and the same one the
// browser's own useOrderEvents hook consumes via EventSource.
//
// Resolves once the connection ends (server closed it, network dropped, or
// `signal` aborted) so the caller decides how/whether to reconnect — same
// manual-backoff responsibility use-order-events.ts's browser hook has.

/** @param {Response} response @param {(event: {type: string, data: unknown}) => void} onEvent */
export async function consumeSseStream(response, onEvent) {
  if (!response.body) throw new Error("Stream response has no body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let sepIndex;
      while ((sepIndex = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, sepIndex);
        buffer = buffer.slice(sepIndex + 2);
        if (!frame || frame.startsWith(":")) continue; // heartbeat comment

        let type = "message";
        let dataRaw = "";
        for (const line of frame.split("\n")) {
          if (line.startsWith("event:")) type = line.slice("event:".length).trim();
          else if (line.startsWith("data:")) dataRaw += line.slice("data:".length).trim();
        }
        if (!dataRaw) continue;
        try {
          onEvent({ type, data: JSON.parse(dataRaw) });
        } catch {
          // malformed frame — skip rather than kill the whole connection
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
