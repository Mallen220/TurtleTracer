// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
const VERSION = "v2";
const CACHE_NAME = `turtle-tracer-${VERSION}`;

const APP_STATIC_RESOURCES = [
  "/",
  "/favicon.ico",
  "/fields/centerstage.webp",
  "/fields/intothedeep.webp",
  "/fields/decode.webp",
  "/robot.png",
  "/assets/index.js",
  "/assets/index.css",
  "/fonts/Poppins-Regular.ttf",
  "/fonts/Poppins-SemiBold.ttf",
  "/fonts/Poppins-Light.ttf",
  "/fonts/Poppins-ExtraLight.ttf",
];

// On install, cache the static resources
globalThis.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      cache.addAll(APP_STATIC_RESOURCES);
    })(),
  );
});

// delete old caches on activate
globalThis.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.map((name) => {
          if (name !== CACHE_NAME) {
            return caches.delete(name);
          }
          return undefined;
        }),
      );
      await clients.claim();
    })(),
  );
});

// On fetch, intercept server requests
globalThis.addEventListener("fetch", (event) => {
  // Only handle GET requests
  if (event.request.method !== "GET") return;

  // Use a Network First, falling back to cache strategy
  // This ensures users always get the latest version if online,
  // while still being able to load the app when offline.
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      try {
        // 1. Try to fetch from the network first
        const networkResponse = await fetch(event.request);

        // If we get a valid response, update the cache and return it
        if (networkResponse && networkResponse.ok) {
          cache.put(event.request, networkResponse.clone());
        }
        return networkResponse;
      } catch (error) {
        // 2. If the network fails (offline), try to get from cache
        const cachedResponse = await cache.match(event.request);
        if (cachedResponse) {
          return cachedResponse;
        }

        // 3. If it's a navigation request and we're offline, return the cached index.html
        if (event.request.mode === "navigate") {
          const cachedIndex = await cache.match("/");
          if (cachedIndex) return cachedIndex;
        }

        // 4. If all else fails, return a 404 or a generic error
        return new Response("Offline and not found in cache", {
          status: 503,
          statusText: "Service Unavailable",
        });
      }
    })(),
  );
});
