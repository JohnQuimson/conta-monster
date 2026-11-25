// Foto delle Monster caricate dagli utenti
import { image } from '../lib/app.js';

export default async function handler(req, res) {
  const buf = await image(req.query.id).catch(() => null);
  if (!buf) return res.status(404).end();
  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.end(buf);
}
