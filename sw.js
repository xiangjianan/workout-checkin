// sw.js —— Service Worker：离线缓存静态资源（仅 http/https 下生效，file:// 自动跳过）
// 根路径 = 每日打卡（index.html），健身打卡在 /100（100.html）
const CACHE = 'workout-v20';

const ASSETS = [
  '.',
  'index.html',
  '100.html',
  'styles.css',
  'js/logic.js',
  'js/store.js',
  'js/ui.js',
  'js/app.js',
  'js/daily-logic.js',
  'js/daily-store.js',
  'js/daily-ui.js',
  'js/daily-app.js',
  'manifest.webmanifest',
  'manifest-100.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

// Cloudflare Pages 会把 *.html 308 到无扩展名路径（如 /100.html → /100），fetch
// 跟随重定向后拿到的响应 redirected=true。WebKit（iOS Safari / 主屏 PWA）不允许
// Service Worker 用带重定向历史的响应应答导航请求，会直接报错：
//   iFT "Response served by service worker has redirections"
// 因此写入缓存前与返回给页面前，都把这类响应重建为"干净"的同体 Response。
async function cleanResponse(res) {
  if (!res || !res.redirected) return res;
  const headers = new Headers();
  res.headers.forEach((value, key) => {
    // body 已被解码，这两个头与重建后的实际内容不再匹配，必须剔除
    if (key !== 'content-encoding' && key !== 'content-length') headers.set(key, value);
  });
  return new Response(await res.text(), { status: res.status, statusText: res.statusText, headers });
}

self.addEventListener('install', (e) => {
  // 不用 addAll：它会原样存入 308 跟随后的 redirected 响应（"中毒"条目，导航命中
  // 即触发上面的 WebKit 报错）。改为逐个抓取 → 洗净 → 写入；单个资源失败只跳过
  // 该资源、不再让整个 install 回滚（弱网下更稳）。
  e.waitUntil(
    caches.open(CACHE).then((cache) =>
      Promise.all(ASSETS.map(async (asset) => {
        try {
          const res = await fetch(asset);
          if (res.ok) await cache.put(asset, await cleanResponse(res));
        } catch (err) {
          console.warn('[SW] 预缓存失败，跳过：', asset, err && err.message);
        }
      }))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 缓存优先，失败回退网络并顺手补缓存（带 ?v=N 的资源也能命中：忽略查询串匹配）
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(async (hit) => {
      // 命中也要洗净：v18 及更早的缓存里可能存有 redirected 条目
      if (hit) return cleanResponse(hit);
      const res = await fetch(e.request);
      if (res.ok && new URL(e.request.url).origin === location.origin) {
        const clean = await cleanResponse(res.clone());
        caches.open(CACHE).then((c) => c.put(e.request, clean));
      }
      // 回退路径同样不能把 redirected 响应直接回给导航（如旧链接 /daily 的 308）
      return res.redirected ? cleanResponse(res) : res;
    })
  );
});
