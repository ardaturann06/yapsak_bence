/* ============================================================
   YAPSAK BENCE — Service Worker
   Offline cache + background notifications
   ============================================================ */

const CACHE_NAME = 'yapsak-bence-v52';
const CACHE_FILES = [
  './',
  './index.html',
  './app.js',
  './style.css',
  './firebase-config.js',
  './icon.svg',
  './manifest.json'
];

// ---- Install: cache app shell ----
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(c => c.addAll(CACHE_FILES)).catch(() => {})
  );
  self.skipWaiting();
});

// ---- Activate: remove old caches ----
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ---- Fetch: network-first for page navigation, cache-first for assets ----
self.addEventListener('fetch', e => {
  const url = e.request.url;
  // Skip Firebase SDK CDN requests — always fetch fresh
  if (url.includes('gstatic.com') || url.includes('firebaseapp.com') || url.includes('googleapis.com')) {
    return;
  }
  // Network-first with no-cache to bypass CDN stale content
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' }).catch(() => caches.match(e.request))
  );
});

// ---- Notification click: focus or open app window ----
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const appWindow = list.find(c => c.url.includes('index.html') || c.url.endsWith('/'));
      if (appWindow) return appWindow.focus();
      return clients.openWindow('./');
    })
  );
});

