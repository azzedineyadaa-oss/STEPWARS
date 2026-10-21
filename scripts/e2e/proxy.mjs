// Fait passer /rest/v1/* (URL utilisée par supabase-js) vers PostgREST.
import http from 'node:http';
const target = Number(process.env.PGRST_PORT);
http.createServer((req, res) => {
  const path = req.url.replace(/^\/rest\/v1/, '') || '/';
  const up = http.request({ host: '127.0.0.1', port: target, path, method: req.method, headers: req.headers }, (r) => {
    res.writeHead(r.statusCode, r.headers);
    r.pipe(res);
  });
  up.on('error', (e) => { res.writeHead(502); res.end(String(e)); });
  req.pipe(up);
}).listen(Number(process.env.PROXY_PORT), '127.0.0.1');
