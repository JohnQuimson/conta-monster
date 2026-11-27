// Server locale: `npm start` → http://localhost:3000 (e dal telefono, sulla stessa Wi-Fi, l'indirizzo "In rete").
// I dati finiscono nella cartella data/.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import { handle, image } from './lib/app.js';

const PORT = Number(process.env.PORT || 3000);
const INDEX = new URL('./index.html', import.meta.url);

const STATIC = {
  '/icon.svg': 'image/svg+xml',
  '/favicon-32.png': 'image/png',
  '/apple-touch-icon.png': 'image/png',
  '/icon-192.png': 'image/png',
  '/icon-512.png': 'image/png',
  '/manifest.webmanifest': 'application/manifest+json',
};

const send = (res, code, type, data, extra = {}) => { res.writeHead(code, { 'Content-Type': type, ...extra }); res.end(data); };

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname === '/api/state') {
      let body = {};
      if (req.method === 'POST') {
        let raw = '';
        for await (const chunk of req) { raw += chunk; if (raw.length > 1_000_000) return send(res, 413, 'text/plain', 'Troppo grande'); }
        try { body = JSON.parse(raw || '{}'); } catch { return send(res, 400, 'application/json', '{"ok":false,"error":"JSON non valido"}'); }
      }
      const r = await handle(req.method, body);
      return send(res, r.code, 'application/json; charset=utf-8', JSON.stringify(r.body), { 'Cache-Control': 'no-store' });
    }
    if (url.pathname === '/api/img') {
      const buf = await image(url.searchParams.get('id'));
      return buf ? send(res, 200, 'image/jpeg', buf, { 'Cache-Control': 'public, max-age=31536000, immutable' }) : send(res, 404, 'text/plain', 'Non trovata');
    }
    // icone e manifest (online, su Vercel, sono semplici file nella radice del progetto)
    if (STATIC[url.pathname]) {
      return send(res, 200, STATIC[url.pathname], await readFile(new URL('.' + url.pathname, import.meta.url)), { 'Cache-Control': 'no-cache' });
    }
    if (url.pathname === '/' || url.pathname === '/index.html') {
      return send(res, 200, 'text/html; charset=utf-8', await readFile(INDEX), { 'Cache-Control': 'no-cache' });
    }
    send(res, 404, 'text/plain', 'Non trovato');
  } catch (e) {
    console.error(e);
    send(res, 500, 'text/plain', 'Errore del server');
  }
}).listen(PORT, () => {
  console.log(`\n  Conto Monster è acceso\n  Su questo PC:  http://localhost:${PORT}`);
  for (const list of Object.values(os.networkInterfaces()))
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) console.log(`  In rete:       http://${a.address}:${PORT}`);
  console.log('\n  Ctrl+C per spegnere\n');
});
