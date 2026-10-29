self.addEventListener('install', (e) => {
    console.log('[Service Worker] Install');
});

self.addEventListener('fetch', (e) => {
    // 今回は基本的なネットワークリクエストをそのままパススルーします
    e.respondWith(fetch(e.request));
});