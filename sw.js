/* TAE POS — service worker (POS app v4.0)
 * Lưu sẵn giao diện app + ảnh sản phẩm trong iPad để mở được khi KHÔNG có mạng.
 * Đổi VERSION mỗi khi sửa index.html để iPad tự nhận bản mới. */
const VERSION = 'tae-pos-v4.0.0';
const SHELL = VERSION + '-shell';
const IMG = 'tae-pos-img';            // ảnh giữ qua các lần nâng cấp
const SHELL_FILES = ['./', './index.html', './config.js', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== SHELL && k !== IMG).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

function isImage(url) {
  return /googleusercontent\.com|drive\.google\.com|\.(png|jpe?g|gif|webp)(\?|$)/i.test(url);
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;                       // API (POST) đi thẳng ra mạng
  const url = new URL(req.url);
  if (url.hostname.endsWith('script.google.com')) return;

  if (url.origin === self.location.origin) {
    // Giao diện app: lấy bản trong máy ngay (mở tức thì, không cần mạng), đồng thời cập nhật ngầm
    e.respondWith(caches.open(SHELL).then(cache =>
      cache.match(req, { ignoreSearch: true }).then(hit => {
        const net = fetch(req).then(res => { if (res && res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
        return hit || net.then(r => r || cache.match('./index.html'));
      })));
    return;
  }
  if (isImage(req.url)) {
    // Ảnh sản phẩm: có trong máy thì dùng luôn, chưa có thì tải rồi lưu lại
    e.respondWith(caches.open(IMG).then(cache =>
      cache.match(req.url).then(hit => hit || fetch(req.url, { mode: 'no-cors' }).then(res => {
        if (res && (res.ok || res.type === 'opaque')) cache.put(req.url, res.clone());
        return res;
      }).catch(() => new Response('', { status: 504 })))));
  }
});

// App gửi danh sách ảnh → tải hết về máy (dùng khi mất mạng)
self.addEventListener('message', e => {
  const d = e.data || {};
  if (d.type !== 'precache-images' || !Array.isArray(d.urls)) return;
  e.waitUntil(caches.open(IMG).then(async cache => {
    let ok = 0;
    for (const u of d.urls) {
      try {
        if (await cache.match(u)) { ok++; continue; }
        const res = await fetch(u, { mode: 'no-cors' });
        if (res && (res.ok || res.type === 'opaque')) { await cache.put(u, res); ok++; }
      } catch (err) { /* bỏ qua ảnh lỗi */ }
    }
    const clients = await self.clients.matchAll();
    clients.forEach(c => c.postMessage({ type: 'precache-done', ok, total: d.urls.length }));
  }));
});
