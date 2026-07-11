const CACHE = "stock-survival-v30";
const APP_SHELL = ["/", "/index.html", "/styles.css", "/mobile-first.css", "/design-system.css", "/app.js", "/ui-shell.js", "/ui-state.js", "/engine.js", "/i18n.js", "/manifest.webmanifest", "/survival-mvp/config.js", "/survival-mvp/events.js", "/survival-mvp/event-effects.js", "/survival-mvp/assets.js", "/survival-mvp/skills.js", "/survival-mvp/game-state.js", "/survival-mvp/game-logic.js", "/survival-mvp/progression.js", "/survival-mvp/ui.js"];
self.addEventListener("install", (event) => event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())));
self.addEventListener("activate", (event) => event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(event.request).then((response) => {
    const copy = response.clone();
    caches.open(CACHE).then((cache) => cache.put(event.request, copy));
    return response;
  }).catch(() => caches.match(event.request).then((cached) => cached || caches.match("/index.html"))));
});
