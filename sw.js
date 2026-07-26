'use strict';

const APP_VERSION = '3.0.3';
const CACHE_NAME = `centum-diary-shell-${APP_VERSION}`;
const APP_SHELL = ["./", "./index.html", "./css/style.css", "./js/prompts.js", "./js/store.js", "./js/app.js", "./manifest.json", "./version.json", "./assets/icon-192.png", "./assets/icon-512.png", "./assets/icon-maskable-192.png", "./assets/icon-maskable-512.png", "./assets/apple-touch-icon.png", "./assets/growth-bg.png", "./assets/growth-grid.png", "./navi_img/001.png", "./navi_img/002.png", "./navi_img/003.png", "./navi_img/004.png", "./navi_img/005.png", "./navi_img/006.png", "./navi_img/007.png", "./navi_img/008.png", "./navi_img/009.png", "./navi_img/010.png", "./navi_img/011.png", "./navi_img/012.png", "./navi_img/013.png", "./navi_img/014.png", "./navi_img/015.png", "./navi_img/016.png", "./navi_img/017.png", "./navi_img/018.png", "./navi_img/019.png", "./navi_img/020.png", "./navi_img/021.png", "./navi_img/022.png", "./navi_img/023.png", "./navi_img/024.png", "./navi_img/025.png", "./navi_img/026.png", "./navi_img/027.png", "./navi_img/028.png", "./navi_img/029.png", "./navi_img/030.png", "./navi_img/031.png", "./navi_img/032.png", "./navi_img/033.png", "./navi_img/034.png", "./navi_img/035.png", "./navi_img/036.png", "./navi_img/037.png", "./navi_img/038.png", "./navi_img/039.png", "./navi_img/040.png", "./navi_img/041.png", "./navi_img/042.png", "./navi_img/043.png", "./navi_img/044.png", "./navi_img/045.png", "./navi_img/046.png", "./navi_img/047.png", "./navi_img/048.png", "./navi_img/049.png", "./navi_img/050.png", "./navi_img/051.png", "./navi_img/052.png", "./navi_img/053.png", "./navi_img/054.png", "./navi_img/055.png", "./navi_img/056.png", "./navi_img/057.png", "./navi_img/058.png", "./navi_img/059.png", "./navi_img/060.png", "./navi_img/061.png", "./navi_img/062.png", "./navi_img/063.png", "./navi_img/064.png", "./navi_img/065.png", "./navi_img/066.png", "./navi_img/067.png", "./navi_img/068.png", "./navi_img/069.png", "./navi_img/070.png", "./navi_img/071.png", "./navi_img/072.png", "./navi_img/073.png", "./navi_img/074.png", "./navi_img/075.png", "./navi_img/076.png", "./navi_img/077.png", "./navi_img/078.png", "./navi_img/079.png", "./navi_img/080.png", "./navi_img/081.png", "./navi_img/082.png", "./navi_img/083.png", "./navi_img/084.png", "./navi_img/085.png", "./navi_img/086.png", "./navi_img/087.png", "./navi_img/088.png", "./navi_img/089.png", "./navi_img/090.png", "./navi_img/091.png", "./navi_img/092.png", "./navi_img/093.png", "./navi_img/094.png", "./navi_img/095.png", "./navi_img/096.png", "./navi_img/097.png", "./navi_img/098.png", "./navi_img/099.png", "./navi_img/100.png", "./navi_img/101.png", "./navi_img/102.png", "./navi_img/103.png", "./navi_img/104.png", "./navi_img/105.png", "./navi_img/106.png", "./navi_img/107.png", "./navi_img/108.png", "./navi_img/109.png", "./navi_img/110.png", "./navi_img/111.png", "./navi_img/112.png", "./assets/growth-cells/cell-1.jpg", "./assets/growth-cells/cell-10.jpg", "./assets/growth-cells/cell-100.jpg", "./assets/growth-cells/cell-11.jpg", "./assets/growth-cells/cell-12.jpg", "./assets/growth-cells/cell-13.jpg", "./assets/growth-cells/cell-14.jpg", "./assets/growth-cells/cell-15.jpg", "./assets/growth-cells/cell-16.jpg", "./assets/growth-cells/cell-17.jpg", "./assets/growth-cells/cell-18.jpg", "./assets/growth-cells/cell-19.jpg", "./assets/growth-cells/cell-2.jpg", "./assets/growth-cells/cell-20.jpg", "./assets/growth-cells/cell-21.jpg", "./assets/growth-cells/cell-22.jpg", "./assets/growth-cells/cell-23.jpg", "./assets/growth-cells/cell-24.jpg", "./assets/growth-cells/cell-25.jpg", "./assets/growth-cells/cell-26.jpg", "./assets/growth-cells/cell-27.jpg", "./assets/growth-cells/cell-28.jpg", "./assets/growth-cells/cell-29.jpg", "./assets/growth-cells/cell-3.jpg", "./assets/growth-cells/cell-30.jpg", "./assets/growth-cells/cell-31.jpg", "./assets/growth-cells/cell-32.jpg", "./assets/growth-cells/cell-33.jpg", "./assets/growth-cells/cell-34.jpg", "./assets/growth-cells/cell-35.jpg", "./assets/growth-cells/cell-36.jpg", "./assets/growth-cells/cell-37.jpg", "./assets/growth-cells/cell-38.jpg", "./assets/growth-cells/cell-39.jpg", "./assets/growth-cells/cell-4.jpg", "./assets/growth-cells/cell-40.jpg", "./assets/growth-cells/cell-41.jpg", "./assets/growth-cells/cell-42.jpg", "./assets/growth-cells/cell-43.jpg", "./assets/growth-cells/cell-44.jpg", "./assets/growth-cells/cell-45.jpg", "./assets/growth-cells/cell-46.jpg", "./assets/growth-cells/cell-47.jpg", "./assets/growth-cells/cell-48.jpg", "./assets/growth-cells/cell-49.jpg", "./assets/growth-cells/cell-5.jpg", "./assets/growth-cells/cell-50.jpg", "./assets/growth-cells/cell-51.jpg", "./assets/growth-cells/cell-52.jpg", "./assets/growth-cells/cell-53.jpg", "./assets/growth-cells/cell-54.jpg", "./assets/growth-cells/cell-55.jpg", "./assets/growth-cells/cell-56.jpg", "./assets/growth-cells/cell-57.jpg", "./assets/growth-cells/cell-58.jpg", "./assets/growth-cells/cell-59.jpg", "./assets/growth-cells/cell-6.jpg", "./assets/growth-cells/cell-60.jpg", "./assets/growth-cells/cell-61.jpg", "./assets/growth-cells/cell-62.jpg", "./assets/growth-cells/cell-63.jpg", "./assets/growth-cells/cell-64.jpg", "./assets/growth-cells/cell-65.jpg", "./assets/growth-cells/cell-66.jpg", "./assets/growth-cells/cell-67.jpg", "./assets/growth-cells/cell-68.jpg", "./assets/growth-cells/cell-69.jpg", "./assets/growth-cells/cell-7.jpg", "./assets/growth-cells/cell-70.jpg", "./assets/growth-cells/cell-71.jpg", "./assets/growth-cells/cell-72.jpg", "./assets/growth-cells/cell-73.jpg", "./assets/growth-cells/cell-74.jpg", "./assets/growth-cells/cell-75.jpg", "./assets/growth-cells/cell-76.jpg", "./assets/growth-cells/cell-77.jpg", "./assets/growth-cells/cell-78.jpg", "./assets/growth-cells/cell-79.jpg", "./assets/growth-cells/cell-8.jpg", "./assets/growth-cells/cell-80.jpg", "./assets/growth-cells/cell-81.jpg", "./assets/growth-cells/cell-82.jpg", "./assets/growth-cells/cell-83.jpg", "./assets/growth-cells/cell-84.jpg", "./assets/growth-cells/cell-85.jpg", "./assets/growth-cells/cell-86.jpg", "./assets/growth-cells/cell-87.jpg", "./assets/growth-cells/cell-88.jpg", "./assets/growth-cells/cell-89.jpg", "./assets/growth-cells/cell-9.jpg", "./assets/growth-cells/cell-90.jpg", "./assets/growth-cells/cell-91.jpg", "./assets/growth-cells/cell-92.jpg", "./assets/growth-cells/cell-93.jpg", "./assets/growth-cells/cell-94.jpg", "./assets/growth-cells/cell-95.jpg", "./assets/growth-cells/cell-96.jpg", "./assets/growth-cells/cell-97.jpg", "./assets/growth-cells/cell-98.jpg", "./assets/growth-cells/cell-99.jpg"];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('centum-diary-shell-') && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html').then((cached) => cached || fetch(request).catch(() => caches.match('./index.html')))
    );
    return;
  }

  if (url.pathname.endsWith('/version.json')) {
    event.respondWith(
      fetch(request, { cache: 'no-store' }).catch(() => caches.match(request))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => 'focus' in client);
      if (existing) return existing.focus();
      return self.clients.openWindow('./?action=write');
    })
  );
});
