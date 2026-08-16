// Local dev server for testing the plugin in Nuvio's Plugin Tester.
// Usage: node server.js   (then add http://<your-ip>:3000/manifest.json in the app)
const http = require('http');
const fs = require('fs');
const path = require('path');

const port = process.env.PORT || 3000;
const root = __dirname;

const mime = {
  '.json': 'application/json',
  '.js': 'text/javascript',
  '.html': 'text/html',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  let p = decodeURIComponent((req.url || '/').split('?')[0]);
  if (p === '/') p = '/index.html';

  const file = path.join(root, p);
  if (!file.startsWith(root)) {
    res.writeHead(403, { 'Access-Control-Allow-Origin': '*' });
    res.end('Forbidden');
    return;
  }

  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Access-Control-Allow-Origin': '*' });
      res.end('Not found: ' + p);
      return;
    }
    res.writeHead(200, {
      'Content-Type': mime[path.extname(file)] || 'application/octet-stream',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store'
    });
    res.end(data);
  });
});

server.listen(port, '0.0.0.0', () => {
  const nets = require('os').networkInterfaces();
  const ips = [];
  for (const name in nets) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) ips.push(net.address);
    }
  }
  console.log('Serving nuvio-torbox on port ' + port);
  console.log('On this machine : http://localhost:' + port + '/manifest.json');
  ips.forEach(ip => console.log('On your phone   : http://' + ip + ':' + port + '/manifest.json'));
});