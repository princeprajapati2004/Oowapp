"use strict";

const CACHE = "oowapp-v1";
const OFFLINE = "/offline.html";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.add(OFFLINE)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const { request } = e;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  // API routes: always network (no caching of auth/data responses)
  if (url.pathname.startsWith("/api/")) return;

  // Immutable static chunks (content-hashed): cache first
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.webmanifest" ||
    url.pathname === "/logo_1.webp"
  ) {
    e.respondWith(cacheFirst(request));
    return;
  }

  // Navigation: network first, offline fallback
  if (request.mode === "navigate") {
    e.respondWith(networkFirstNavigate(request));
    return;
  }

  // Everything else (other images, fonts): stale-while-revalidate
  e.respondWith(staleWhileRevalidate(request));
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE);
    cache.put(request, response.clone());
  }
  return response;
}

async function networkFirstNavigate(request) {
  try {
    return await fetch(request);
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return (await caches.match(OFFLINE)) ?? new Response("Offline", { status: 503 });
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  const networkFetch = fetch(request)
    .then((r) => {
      if (r.ok) cache.put(request, r.clone());
      return r;
    })
    .catch(() => null);
  return cached ?? networkFetch;
}
