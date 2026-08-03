// scripts/dev-server.js —— 零依赖静态文件服务器（本机预览 + 局域网部署）
// 用法：node scripts/dev-server.js [--port 8000] [--host 0.0.0.0]

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const argv = process.argv.slice(2);
function argVal(name, dflt) {
  const i = argv.indexOf(name);
  if (i !== -1 && argv[i + 1]) return argv[i + 1];
  const eq = argv.find((a) => a.startsWith(name + '='));
  return eq ? eq.split('=')[1] : dflt;
}

const port = Number(argVal('--port', process.env.PORT || 7100));
const host = argVal('--host', '0.0.0.0');
const root = path.resolve(__dirname, '..');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8',
};

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const file = path.normalize(path.join(root, urlPath));
  if (!file.startsWith(root)) { // 防目录穿越
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache', // 局域网/手机端永远拿最新代码
    });
    res.end(data);
  });
});

server.listen(port, host, () => {
  console.log('');
  console.log('  🏋️  健身打卡服务已启动');
  console.log('');
  console.log(`  本机访问:   http://localhost:${port}`);
  const nets = os.networkInterfaces();
  for (const list of Object.values(nets)) {
    for (const n of list || []) {
      if (n.family === 'IPv4' && !n.internal) {
        console.log(`  局域网访问: http://${n.address}:${port}   ← 手机连同一 Wi-Fi 打开这个`);
      }
    }
  }
  console.log('');
  console.log('  按 Ctrl + C 停止服务');
  console.log('');
});
