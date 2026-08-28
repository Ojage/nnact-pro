/* Firebase Cloud Messaging service worker — loads public config from the API. */
/* eslint-disable no-undef */
importScripts("https://www.gstatic.com/firebasejs/11.0.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/11.0.2/firebase-messaging-compat.js");

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

const apiBase = self.location.origin.replace(":3000", ":3001");

fetch(`${apiBase}/api/public/firebase-config`)
  .then((response) => response.json())
  .then((config) => {
    if (!config?.apiKey) return;
    firebase.initializeApp(config);
    const messaging = firebase.messaging();
    messaging.onBackgroundMessage((payload) => {
      const title = payload.notification?.title ?? "NNACT Pro";
      const options = {
        body: payload.notification?.body ?? "",
        data: payload.data ?? {},
      };
      self.registration.showNotification(title, options);
    });
  })
  .catch(() => {});
