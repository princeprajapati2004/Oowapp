"use client";

import { useEffect } from "react";

// Catches errors thrown in the root layout itself (src/app/layout.tsx) —
// route-level error.tsx boundaries (e.g. admin/(dashboard)/error.tsx) can't
// see those since they don't wrap layouts above their own segment. Must
// define its own <html>/<body> and inline styles: it replaces the root
// layout entirely, so none of ThemeProvider, globals.css, or fonts apply.
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          background: "#fafafa",
          color: "#18181b",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 16,
            textAlign: "center",
            maxWidth: 360,
          }}
        >
          <div
            style={{
              display: "flex",
              width: 56,
              height: 56,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 16,
              background: "#fee2e2",
              fontSize: 28,
            }}
          >
            ⚠️
          </div>
          <div>
            <p style={{ fontWeight: 600, fontSize: 14, margin: 0 }}>
              Something went wrong
            </p>
            <p style={{ fontSize: 14, color: "#71717a", margin: "4px 0 0" }}>
              An unexpected error occurred. Please try again.
            </p>
            {error.digest && (
              <p style={{ fontSize: 12, color: "#a1a1aa", margin: "8px 0 0" }}>
                Reference: {error.digest}
              </p>
            )}
          </div>
          <button
            onClick={() => unstable_retry()}
            style={{
              border: "1px solid #d4d4d8",
              borderRadius: 8,
              padding: "8px 16px",
              fontSize: 14,
              fontWeight: 500,
              background: "#fff",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
