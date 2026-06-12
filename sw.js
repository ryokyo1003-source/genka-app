// Service Worker - キャッシュバージョン管理
// ★ バージョンを変えると全キャッシュがリセットされます
const CACHE_NAME = 'yakuzai-v9';

const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/config.js',
  './js/format-utils.js',
  './js/image-utils.js',
  './js/sheets.js',
  './js/gemini.js',
  './js/ocr-service.js',
  './js/medicine-service.js',
  './js/price-service.js',
  './js/compare-service.js',
  './js/price-alert-service.js',
  './js/components.js',
  './js/upload-view.js',
  './js/ocr-result-view.js',
  './js/medicine-view.js',
  './js/price-view.js',
  './js/compare-view.js',
  './js/order-view.js',
  './js/inventory-list-view.js',
  './js/price-list-view.js',
  './js/app.js',
];

// インストール時: キャッシュに全アセットを追加
self.addEventListener('install', (e) => {
  self.skipWaiting(); // 即座にアクティベート
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // addAll の失敗でインストール失敗にならないよう個別に追加
      return Promise.allSettled(ASSETS.map(url => cache.add(url).catch(() => {})));
    })
  );
});

// アクティベート時: 古いキャッシュを全削除
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => {
            console.log('[SW] 古いキャッシュを削除:', k);
            return caches.delete(k);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// フェッチ: API はキャッシュしない、それ以外はネットワーク優先
self.addEventListener('fetch', (e) => {
  const url = e.request.url;

  // 外部API呼び出しはキャッシュしない（常にネットワークから）
  if (
    url.includes('googleapis.com') ||
    url.includes('generativelanguage') ||
    url.includes('script.google.com')
  ) {
    e.respondWith(fetch(e.request).catch(() => new Response('', { status: 503 })));
    return;
  }

  // ネットワーク優先: 取得できたらキャッシュを更新、失敗時はキャッシュから返す
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
