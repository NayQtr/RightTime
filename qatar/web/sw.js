// HerZone service worker: shows phone notifications sent by the API (Web Push), opens the right screen on tap, and keeps
// the app's own files on the device so a member can open her booking details without a connection (NMX-16).
// Network first: online, every file comes fresh from the server (the copy on the device is only refreshed); the device
// copy is used only when the network fails. API calls (another origin) and the admin console are never touched.
const SHELL = "hz-shell-v2";
const CORE = ["/", "/app.js", "/theme-init.js", "/strings.js", "/quiz-flow.js", "/icons.js", "/plans.js", "/motif.js", "/config.js", "/monitor.js",
  "/styles.css", "/tokens.css", "/fonts/fonts.css", "/favicon.svg", "/manifest.webmanifest",
  "/fonts/alexandria-arabic-800-normal.woff2", "/fonts/ibm-plex-sans-arabic-arabic-400-normal.woff2"];

self.addEventListener("install", (e) => {
  // best effort: a file that fails to download must not stop notifications from working
  e.waitUntil(caches.open(SHELL).then((c) => Promise.all(CORE.map((u) => c.add(u).catch(() => null)))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k.startsWith("hz-shell-") && k !== SHELL) await caches.delete(k);
  await self.clients.claim();
})()));

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // the public page (/about) is not part of the app: kept out of the device copy, so it never replaces the app's "/"
  if (url.origin !== self.location.origin || url.pathname.startsWith("/admin") || url.pathname.startsWith("/about")) return;
  e.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res.ok && res.type === "basic") {
        const copy = res.clone();
        e.waitUntil(caches.open(SHELL).then((c) => c.put(req.mode === "navigate" ? "/" : req, copy)).catch(() => null));
      }
      return res;
    } catch (err) {
      const hit = req.mode === "navigate" ? await caches.match("/") : await caches.match(req, { ignoreSearch: true });
      if (hit) return hit;
      throw err;
    }
  })());
});

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "HerZone", {
    body: d.body || "", lang: d.lang || "ar", dir: d.dir || "rtl", tag: d.tag, icon: "/icons/icon-192.png", badge: "/icons/badge-96.png",
    // a coordinator's safety alert (urgent) stays on screen until she acts on it
    requireInteraction: d.urgent === true,
    data: { url: typeof d.url === "string" && d.url.startsWith("/") ? d.url : "/#/inbox" },
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "/#/inbox", self.location.origin).href;
  e.waitUntil((async () => {
    // only a window already on the same page is reused (the admin console for an alert, the app for a member's update);
    // the member app at "/", the admin console at "/admin/" and the venue page at "/venue/" never replace each other
    const path = (u) => new URL(u).pathname.replace(/\/index\.html$/, "/").replace(/(.)\/$/, "$1");
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const w = wins.find((c) => new URL(c.url).origin === self.location.origin && path(c.url) === path(url));
    if (w) {
      await w.focus();
      if ("navigate" in w) await w.navigate(url);
      return;
    }
    await self.clients.openWindow(url);
  })());
});
