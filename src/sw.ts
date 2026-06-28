/// <reference lib="webworker" />
import { clientsClaim } from "workbox-core";
import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { createHandlerBoundToURL } from "workbox-precaching";

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Update flow: with injectManifest the SW must opt in to activating a new
// build. The page posts SKIP_WAITING (see src/lib/pwa.ts) when it's ready to
// swap in the new build; we then take control so a reload serves the new UI.
// Without this, a new SW stays "waiting" and refreshes keep serving the stale
// shell — the root cause of "refresh doesn't load the new UI".
clientsClaim();
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

// SPA navigation fallback — /api/* must reach the Worker, not the cached shell.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL("/index.html"), {
    denylist: [/^\/api\//],
  }),
);

self.addEventListener("push", (event) => {
  if (!event.data) return;
  const { title, body, tag } = event.data.json() as {
    title: string;
    body: string;
    tag?: string;
  };
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/favicon.svg",
      badge: "/favicon.svg",
      tag: tag ?? "nudge",
      data: { url: "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        const target = clients.find((c) => c.url.startsWith(self.location.origin));
        return target ? target.focus() : self.clients.openWindow("/");
      }),
  );
});
