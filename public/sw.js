/**
 * Phase 7 — Service Worker
 *
 * Network-first caching for GET navigations only.
 * Cache name: aa-tech-2026-v1
 *
 * Rules:
 * - POST (and all non-GET methods) are never cached — writes are live.
 * - Model replies (/api/chat) are never cached — always fresh from the server.
 * - Only same-origin HTML navigations are cached, network-first.
 * - If the network fails, the last cached navigation is served.
 */

const CACHE_NAME = "aa-tech-2026-v1";

self.addEventListener("install", (_event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)),
        ),
      ),
      self.clients.claim(),
    ]),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  // POST and other non-GET methods are never cached.
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Only handle same-origin requests.
  if (url.origin !== self.location.origin) return;

  // Never cache model replies — they must always be fresh from the server.
  if (url.pathname === "/api/chat") return;

  // Network-first for GET navigations (HTML page loads).
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() =>
          caches.match(request).then(
            (cached) =>
              cached ||
              new Response("Offline", {
                status: 503,
                headers: { "Content-Type": "text/plain" },
              }),
          ),
        ),
    );
  }
});
