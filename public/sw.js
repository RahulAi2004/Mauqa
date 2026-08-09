// Minimal service worker: makes the app installable as a PWA (Android share target).
// Network-first; no aggressive caching so updates always land.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
