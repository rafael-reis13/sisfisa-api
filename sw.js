// Service Worker do SIS-FISA
const CACHE_NAME = 'sisfisa-cache-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Passa as requisições normais para a rede
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
