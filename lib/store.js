// Dove vengono salvati i dati.
// - Online (Vercel): Upstash Redis, tramite la sua API REST (variabili KV_REST_API_URL / KV_REST_API_TOKEN).
// - In locale: file nella cartella data/ (db.json + immagini in data/img/).
import { promises as fs } from 'node:fs';
import path from 'node:path';

export class HttpError extends Error { constructor(code, msg) { super(msg); this.code = code; } }
export const fail = (code, msg) => { throw new HttpError(code, msg); };

const KEY = 'contomonster:db';
const REV = 'contomonster:rev';
const IMG = 'contomonster:img:';

// Salva solo se nessun altro ha scritto nel frattempo (controllo sul numero di revisione)
const CAS = `
if tonumber(redis.call('GET', KEYS[2]) or '0') ~= tonumber(ARGV[1]) then return 0 end
redis.call('SET', KEYS[1], ARGV[2])
redis.call('SET', KEYS[2], ARGV[3])
return 1`;

function redisStore(url, token) {
  async function cmd(c) {
    const r = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(c),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) fail(502, 'Errore del database: ' + (j.error || r.status));
    return j.result;
  }
  return {
    kind: 'redis',
    async read() { const raw = await cmd(['GET', KEY]); return raw ? JSON.parse(raw) : null; },
    async cas(prev, db) {
      return Number(await cmd(['EVAL', CAS, '2', KEY, REV, String(prev), JSON.stringify(db), String(db.rev)])) === 1;
    },
    async putImg(id, buf) { await cmd(['SET', IMG + id, buf.toString('base64')]); },
    async getImg(id) { const b = await cmd(['GET', IMG + id]); return b ? Buffer.from(b, 'base64') : null; },
  };
}

function fileStore(dir) {
  const dbFile = path.join(dir, 'db.json');
  const imgDir = path.join(dir, 'img');
  let lock = Promise.resolve();
  const serial = (fn) => { const p = lock.then(fn, fn); lock = p.catch(() => {}); return p; };
  const read = async () => {
    try { return JSON.parse(await fs.readFile(dbFile, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
  };
  return {
    kind: 'file',
    read,
    cas: (prev, db) => serial(async () => {
      const cur = await read();
      if (Number(cur?.rev || 0) !== Number(prev)) return false;
      await fs.mkdir(dir, { recursive: true });
      const tmp = dbFile + '.tmp';
      await fs.writeFile(tmp, JSON.stringify(db, null, 1));
      await fs.rename(tmp, dbFile);
      return true;
    }),
    async putImg(id, buf) { await fs.mkdir(imgDir, { recursive: true }); await fs.writeFile(path.join(imgDir, id + '.jpg'), buf); },
    async getImg(id) {
      try { return await fs.readFile(path.join(imgDir, id + '.jpg')); } catch { return null; }
    },
  };
}

let store;
export function getStore() {
  if (store) return store;
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) store = redisStore(url, token);
  else if (process.env.VERCEL) fail(500, 'Database non collegato: aggiungi Upstash Redis dal Marketplace di Vercel');
  else store = fileStore(process.env.DATA_DIR || path.join(process.cwd(), 'data'));
  return store;
}
