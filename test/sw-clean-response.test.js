// test/sw-clean-response.test.js —— SW 重定向响应清洗（iOS iFT 报错回归）
//
// 背景：Cloudflare Pages 把 /100.html 308 到 /100，fetch 跟随重定向后拿到的
// 响应 redirected=true。WebKit（iOS Safari / 主屏 PWA）不允许 Service Worker
// 用带重定向历史的响应应答导航请求，会直接报错：
//   iFT "Response served by service worker has redirections"
// 因此 sw.js 在写入缓存前与命中/回退返回前，都要把这类响应重建为"干净"响应。

const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const zlib = require('node:zlib');
const { loadSW } = require('./helpers/load');

// 模拟 Cloudflare Pages 行为的本地服务：/100.html 308 → /100（gzip + content-length
// 的 200，用于一并验证解码后的响应头剔除逻辑）
async function withPagesLikeServer(fn) {
  const body = '<!doctype html><html><title>健身打卡</title></html>';
  const gz = zlib.gzipSync(Buffer.from(body));
  const server = http.createServer((req, res) => {
    if (req.url === '/100.html') {
      res.writeHead(308, { location: '/100' });
      res.end();
    } else if (req.url === '/100') {
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'content-encoding': 'gzip',
        'content-length': String(gz.length),
      });
      res.end(gz);
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    return await fn(base, body);
  } finally {
    await new Promise((r) => server.close(r));
  }
}

// 拿一个"真实"的 redirected 响应（跟随后 status 200 但 redirected=true，
// 与手机上中毒缓存条目的形态完全一致）
function fetchRedirected(base) {
  return fetch(base + '/100.html');
}

test('cleanResponse：非重定向响应原样返回（不重建、不额外拷贝）', async () => {
  const { cleanResponse } = loadSW();
  const res = new Response('hello', { status: 200, headers: { 'content-type': 'text/plain' } });
  assert.equal(await cleanResponse(res), res);
});

test('cleanResponse：308 跟随后的 redirected 响应被重建为干净响应', async () => {
  await withPagesLikeServer(async (base, body) => {
    const { cleanResponse } = loadSW();
    const res = await fetchRedirected(base);
    assert.equal(res.redirected, true); // 前置：确认还原了线上故障形态
    assert.equal(res.status, 200);

    const clean = await cleanResponse(res);
    assert.equal(clean.redirected, false);
    assert.equal(clean.status, 200);
    assert.equal(await clean.text(), body); // 解码后的正文完整保留
    assert.equal(clean.headers.get('content-type'), 'text/html; charset=utf-8');
    assert.equal(clean.headers.get('content-encoding'), null); // 解码后头与体不再匹配，必须剔除
    assert.equal(clean.headers.get('content-length'), null);
  });
});

test('fetch 命中路径：缓存里已中毒（redirected）的条目返回前被洗净', async () => {
  await withPagesLikeServer(async (base, body) => {
    const poisoned = await fetchRedirected(base); // v18 缓存里 addAll 存入的中毒条目
    const sw = loadSW({
      location: { origin: base },
      caches: {
        match: async () => poisoned,
        open: async () => { throw new Error('命中路径不应写缓存'); },
      },
      fetch: async () => { throw new Error('命中路径不应走网络'); },
    });
    const fetchListener = sw.listeners.fetch[0];
    assert.ok(fetchListener, 'sw.js 应注册 fetch 监听');

    let captured;
    fetchListener({
      request: new Request(base + '/100.html'),
      respondWith: (p) => { captured = p; },
    });

    const served = await captured;
    assert.equal(served.redirected, false); // Safari 不再报 iFT
    assert.equal(await served.text(), body);
  });
});

test('CACHE 版本：必须离开中毒的 workout-v18', () => {
  const { CACHE } = loadSW();
  assert.match(CACHE, /^workout-v\d+$/);
  assert.notEqual(CACHE, 'workout-v18');
});
