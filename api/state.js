// Funzione serverless di Vercel: tutta la logica sta in lib/app.js
import { handle } from '../lib/app.js';

export default async function handler(req, res) {
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body || '{}'); } catch { body = {}; } }
  const r = await handle(req.method, body);
  res.setHeader('Cache-Control', 'no-store');
  res.status(r.code).json(r.body);
}
