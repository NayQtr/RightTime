// HerZone service worker: shows phone notifications sent by the API (Web Push) and opens the right screen on tap.
// It deliberately has no fetch handler and caches nothing, so the site always loads fresh from the network.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "HerZone", {
    body: d.body || "", lang: d.lang || "ar", dir: d.dir || "rtl", tag: d.tag, icon: "/icons/icon-192.png", badge: "/icons/badge-96.png",
    data: { url: typeof d.url === "string" && d.url.startsWith("/") ? d.url : "/#/inbox" },
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "/#/inbox", self.location.origin).href;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const w of wins) {
      if (new URL(w.url).origin === self.location.origin) {
        await w.focus();
        if ("navigate" in w) await w.navigate(url);
        return;
      }
    }
    await self.clients.openWindow(url);
  })());
});
