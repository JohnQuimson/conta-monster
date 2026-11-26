// Logica di Conto Monster, uguale in locale e su Vercel.
// Ogni giocatore entra col proprio PIN: ogni partita, consegna o modifica viene salvata con chi l'ha fatta e quando
// (l'ora la mette il server, non il telefono). Lo storico lo può modificare solo l'amministratore (ADMIN_NAME, di
// default "John"): quello che elimina sparisce del tutto. Chi ha appena segnato qualcosa può annullarlo entro UNDO_SECS.
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { getStore, fail, HttpError } from './store.js';
import { BUILTIN, BUILTIN_IDS } from './flavors.js';

const GROUP_CODE = String(process.env.GROUP_CODE ?? '').trim(); // facoltativo: serve per unirsi al gruppo
const ADMIN_NAME = String(process.env.ADMIN_NAME ?? 'John').trim().toLowerCase(); // chi può modificare lo storico
const UNDO_SECS = 120; // chi ha appena segnato una partita o una consegna può annullarla per 2 minuti
const MAX_FAVS = 3;
const LOG_MAX = 600;

const newId = () => randomBytes(6).toString('hex');
const now = () => Math.floor(Date.now() / 1000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const emptyDb = () => ({ rev: 0, players: [], matches: [], payments: [], flavors: [], log: [] });
function normalize(db) {
  const d = db && typeof db === 'object' ? db : emptyDb();
  for (const k of ['players', 'matches', 'payments', 'flavors', 'log']) if (!Array.isArray(d[k])) d[k] = [];
  d.players.forEach((p) => { if (!Array.isArray(p.favs)) p.favs = []; });
  // vecchie partite/consegne "annullate" (versioni precedenti): ora le eliminazioni sono definitive
  if (!Array.isArray(d.flavorOrder)) d.flavorOrder = [];
  d.matches = d.matches.filter((m) => !m.del);
  d.payments = d.payments.filter((p) => !p.del);
  d.rev = Number(d.rev || 0);
  return d;
}
// L'amministratore è il giocatore col nome ADMIN_NAME, purché abbia attivato il profilo (PIN impostato).
const adminId = (db) => db.players.find((p) => p.pin && p.name.toLowerCase() === ADMIN_NAME)?.id ?? null;

const hashPin = (pin, salt) => scryptSync(String(pin), salt, 32).toString('hex');
const samePin = (pin, rec) => {
  if (!rec?.salt || !rec?.hash) return false;
  const a = Buffer.from(hashPin(pin, rec.salt), 'hex'), b = Buffer.from(rec.hash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
};
const makePin = (pin) => {
  if (!/^\d{4}$/.test(String(pin ?? ''))) fail(400, 'Il PIN deve essere di 4 cifre');
  const salt = randomBytes(8).toString('hex');
  return { salt, hash: hashPin(pin, salt) };
};
const sameCode = (code) => {
  const a = Buffer.from(String(code ?? '').trim().toLowerCase()), b = Buffer.from(GROUP_CODE.toLowerCase());
  return a.length === b.length && timingSafeEqual(a, b);
};
const cleanName = (v, max = 24) => {
  const n = String(v ?? '').replace(/\s+/gu, ' ').trim();
  if (!n || [...n].length > max) fail(400, `Il nome deve avere da 1 a ${max} caratteri`);
  return n;
};
function decodeImg(dataUrl) {
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl ?? ''));
  if (!m) fail(400, 'Immagine non valida');
  const buf = Buffer.from(m[1], 'base64');
  if (buf.length > 300_000) fail(400, 'Immagine troppo grande');
  if (buf[0] !== 0xff || buf[1] !== 0xd8) fail(400, 'Immagine non valida');
  return buf;
}

// Gusti di base (lib/flavors.js) con le modifiche fatte dall'app, più i gusti creati dall'app.
// Per un gusto di base, db.flavors contiene solo le modifiche (stesso id); "Ripristina" le cancella.
const HEX = /^#[0-9a-f]{6}$/i;
function catalog(db) {
  const over = new Map(db.flavors.map((f) => [f.id, f]));
  const list = [
    ...BUILTIN.map((b) => {
      const o = over.get(b.id) || {};
      return {
        ...b, builtin: true, edited: over.has(b.id),
        name: o.name || b.name, body: o.body || b.body, accent: o.accent || b.accent, ink: o.ink || b.ink,
        img: o.img ?? null, imgBy: o.imgBy ?? null, hidden: !!o.hidden, editedBy: o.editedBy ?? null,
      };
    }),
    ...db.flavors.filter((f) => !BUILTIN_IDS.has(f.id)).map((f) => ({ ...f, builtin: false, hidden: false })),
  ];
  // ordine scelto trascinando (db.flavorOrder); quelle non ancora ordinate restano nella posizione di default, in fondo
  const order = new Map((db.flavorOrder || []).map((id, i) => [id, i]));
  return list.sort((a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9));
}
const dropFav = (db, id) => db.players.forEach((p) => { p.favs = (p.favs || []).filter((f) => f !== id); });
function publicView(db) {
  const { players, ...rest } = db;
  return {
    state: { ...rest, players: players.map(({ pin, ...p }) => ({ ...p, claimed: !!pin })) },
    catalog: catalog(db),
    needsCode: GROUP_CODE !== '',
    adminId: adminId(db),
    undoSecs: UNDO_SECS,
    now: now(), // ora del server, per calcolare la finestra di annullamento
  };
}

// Applica un'azione al db (modifica sul posto). `me` è l'id di chi la fa (già verificato).
function apply(db, input, me, ctx) {
  const ts = now();
  const P = new Map(db.players.map((p) => [p.id, p]));
  const find = (key, id) => db[key].find((r) => r.id === String(id ?? '')) || fail(404, 'Elemento non trovato');
  const byName = (name, exceptId) => db.players.find((p) => p.id !== exceptId && p.name.toLowerCase() === name.toLowerCase());
  // l'amministratore modifica tutto; chi l'ha appena segnata può annullarla subito (per correggere un tocco sbagliato)
  const canEditHistory = (rec) => me === adminId(db) || (rec.by === me && ts - rec.ts <= UNDO_SECS);
  const adminLabel = () => db.players.find((p) => p.id === adminId(db))?.name ?? ADMIN_NAME;
  const log = (t, extra = {}) => {
    db.log.push({ id: newId(), ts, by: me, t, ...extra });
    if (db.log.length > LOG_MAX) db.log.splice(0, db.log.length - LOG_MAX);
  };

  switch (input.action) {
    case 'register': {
      const name = cleanName(input.name);
      if (byName(name)) fail(409, `${name} c'è già: sceglilo dalla lista`);
      const id = newId();
      db.players.push({ id, name, archived: false, favs: [], pin: ctx.pin, createdBy: id, createdAt: ts });
      me = id;
      db.log.push({ id: newId(), ts, by: id, t: 'join', player: id });
      return { me: id };
    }
    case 'claim': {
      const p = find('players', input.id);
      if (p.pin) fail(409, 'Questo profilo ha già un PIN');
      p.pin = ctx.pin;
      p.archived = false;
      db.log.push({ id: newId(), ts, by: p.id, t: 'claim', player: p.id });
      return { me: p.id };
    }
    case 'addPlayer': {
      const name = cleanName(input.name);
      const old = byName(name);
      if (old && !old.archived) fail(409, `${name} c'è già`);
      if (old) { old.archived = false; log('unarchive', { player: old.id }); return {}; }
      const id = newId();
      db.players.push({ id, name, archived: false, favs: [], pin: null, createdBy: me, createdAt: ts });
      log('addPlayer', { player: id });
      return {};
    }
    case 'renamePlayer': {
      const p = find('players', input.id);
      if (p.id !== me && p.pin) fail(403, 'Puoi cambiare solo il tuo nome');
      if (p.id === adminId(db) && cleanName(input.name).toLowerCase() !== p.name.toLowerCase()) fail(403, 'Il nome dell\'amministratore non si può cambiare');
      const name = cleanName(input.name);
      if (byName(name, p.id)) fail(409, `${name} c'è già`);
      if (name === p.name) return {};
      log('rename', { player: p.id, from: p.name, to: name });
      p.name = name;
      return {};
    }
    case 'archivePlayer': {
      const p = find('players', input.id);
      const v = input.archived !== false;
      if (p.archived === v) return {};
      p.archived = v;
      log(v ? 'archive' : 'unarchive', { player: p.id });
      return {};
    }
    case 'setFavs': {
      const ok = new Set(catalog(db).filter((f) => !f.hidden).map((f) => f.id));
      const favs = [...new Set((input.favs || []).map(String))].filter((f) => ok.has(f));
      if (favs.length > MAX_FAVS) fail(400, `Puoi scegliere al massimo ${MAX_FAVS} Monster`);
      P.get(me).favs = favs;
      return {};
    }
    case 'changePin': {
      P.get(me).pin = ctx.pin;
      log('pin', { player: me });
      return {};
    }
    case 'addMatch': {
      const mode = Number(input.mode);
      const a = [...new Set((input.a || []).map(String))];
      const b = [...new Set((input.b || []).map(String))];
      if (![1, 2, 3].includes(mode)) fail(400, 'Modalità non valida');
      if (a.length !== mode || b.length !== mode) fail(400, `Servono ${mode} giocatori per squadra`);
      if (a.some((id) => b.includes(id))) fail(400, 'Un giocatore non può stare in entrambe le squadre');
      if ([...a, ...b].some((id) => !P.has(id))) fail(400, 'Giocatore sconosciuto');
      if (input.winner !== 'A' && input.winner !== 'B') fail(400, 'Vincitore non valido');
      const id = newId();
      db.matches.push({ id, ts, mode, a, b, winner: input.winner, by: me });
      return { id };
    }
    case 'deleteMatch': {
      const m = find('matches', input.id);
      if (!canEditHistory(m)) fail(403, 'Lo storico lo può modificare solo ' + adminLabel());
      db.matches.splice(db.matches.indexOf(m), 1); // eliminata del tutto, non resta traccia
      return {};
    }
    case 'addPayment': {
      const from = String(input.from ?? ''), to = String(input.to ?? ''), qty = Math.trunc(Number(input.qty));
      if (!P.has(from) || !P.has(to) || from === to) fail(400, 'Giocatori non validi');
      if (to !== me) fail(403, 'La consegna la conferma solo chi riceve la Monster');
      if (!(qty >= 1 && qty <= 50)) fail(400, 'Quantità non valida');
      const id = newId();
      db.payments.push({ id, ts, from, to, qty, by: me });
      return { id };
    }
    case 'deletePayment': {
      const p = find('payments', input.id);
      if (!canEditHistory(p)) fail(403, 'Lo storico lo può modificare solo ' + adminLabel());
      db.payments.splice(db.payments.indexOf(p), 1);
      return {};
    }
    case 'clearHistory': {
      if (me !== adminId(db)) fail(403, 'Lo storico lo può pulire solo ' + adminLabel());
      if (input.what === 'log') db.log = [];
      else if (input.what === 'all') { db.log = []; db.matches = []; db.payments = []; } // i conti ripartono da zero
      else fail(400, 'Cosa vuoi pulire?');
      return {};
    }
    case 'saveFlavor': {
      const id = String(input.id ?? '');
      const name = cleanName(input.name, 28);
      if (catalog(db).some((f) => f.id !== id && f.name.toLowerCase() === name.toLowerCase())) fail(409, `${name} c'è già`);
      const colors = {};
      for (const k of ['body', 'accent', 'ink']) {
        if (!HEX.test(String(input[k] ?? ''))) fail(400, 'Colore non valido');
        colors[k] = String(input[k]).toLowerCase();
      }
      let f;
      if (!id) {
        f = { id: 'c' + newId(), by: me, ts, img: null, imgBy: null };
        db.flavors.push(f);
        log('addFlavor', { flavor: f.id, name });
      } else if (BUILTIN_IDS.has(id)) {
        f = db.flavors.find((x) => x.id === id);
        if (!f) { f = { id }; db.flavors.push(f); }
        f.editedBy = me; f.hidden = false;
        log('editFlavor', { flavor: id, name });
      } else {
        f = find('flavors', id);
        f.editedBy = me;
        log('editFlavor', { flavor: id, name });
      }
      Object.assign(f, { name }, colors);
      if (ctx.imgId) { f.img = ctx.imgId; f.imgBy = me; }
      else if (input.removeImg) { f.img = null; f.imgBy = null; }
      return { id: f.id };
    }
    case 'deleteFlavor': {
      const id = String(input.id ?? '');
      const cur = catalog(db).find((x) => x.id === id) || fail(404, 'Gusto non trovato');
      if (cur.builtin) {
        let f = db.flavors.find((x) => x.id === id);
        if (!f) { f = { id }; db.flavors.push(f); }
        f.hidden = true; f.editedBy = me;
        log('hideFlavor', { flavor: id, name: cur.name });
      } else {
        db.flavors.splice(db.flavors.findIndex((x) => x.id === id), 1);
        log('deleteFlavor', { flavor: id, name: cur.name });
      }
      dropFav(db, id);
      return {};
    }
    case 'reorderFlavors': {
      // `ids` è il nuovo ordine (anche parziale): si tengono solo gusti esistenti, gli altri restano dopo, nell'ordine di prima
      const all = catalog(db).map((f) => f.id), known = new Set(all);
      const ids = [...new Set((Array.isArray(input.ids) ? input.ids : []).map(String))].filter((id) => known.has(id));
      db.flavorOrder = [...ids, ...all.filter((id) => !ids.includes(id))];
      return {};
    }
    case 'restoreFlavor': {
      const id = String(input.id ?? '');
      if (!BUILTIN_IDS.has(id)) fail(400, 'Si possono ripristinare solo i gusti di base');
      const i = db.flavors.findIndex((x) => x.id === id);
      if (i >= 0) db.flavors.splice(i, 1);
      log('restoreFlavor', { flavor: id, name: BUILTIN.find((b) => b.id === id).name });
      return {};
    }
    default:
      fail(400, 'Azione sconosciuta');
  }
}

const PUBLIC_ACTIONS = new Set(['register', 'claim', 'login']);

export async function handle(method, input) {
  const store = getStore();
  const read = async () => normalize(await store.read());
  try {
    if (method === 'GET') return { code: 200, body: { ok: true, ...publicView(await read()) } };
    if (method !== 'POST') fail(405, 'Metodo non permesso');
    input = input && typeof input === 'object' ? input : {};
    const action = String(input.action ?? '');

    // --- chi sei? ---
    const db0 = await read();
    const ctx = {};
    let me = null;
    if (PUBLIC_ACTIONS.has(action)) {
      if (action === 'login') {
        const p = db0.players.find((x) => x.id === String(input.id ?? ''));
        if (!p || !samePin(input.pin, p.pin)) { await sleep(700); fail(401, 'PIN sbagliato'); }
        return { code: 200, body: { ok: true, me: p.id, ...publicView(db0) } };
      }
      if (GROUP_CODE && !sameCode(input.code)) { await sleep(700); fail(401, 'Codice del gruppo sbagliato'); }
      ctx.pin = makePin(input.pin);
    } else {
      const p = db0.players.find((x) => x.id === String(input.auth?.id ?? ''));
      if (!p || !samePin(input.auth?.pin, p.pin)) {
        await sleep(700);
        return { code: 401, body: { ok: false, auth: true, error: 'Accesso scaduto, rientra col tuo PIN' } };
      }
      me = p.id;
      if (action === 'changePin') ctx.pin = makePin(input.newPin);
    }
    if (action === 'saveFlavor' && input.img) {
      const buf = decodeImg(input.img);
      ctx.imgId = newId();
      await store.putImg(ctx.imgId, buf);
    }

    // --- leggi → modifica → salva solo se nessuno ha scritto nel frattempo, altrimenti riprova ---
    for (let attempt = 0; attempt < 6; attempt++) {
      const db = attempt === 0 ? db0 : await read();
      const prev = db.rev;
      const extra = apply(db, input, me, ctx);
      db.rev = prev + 1;
      if (await store.cas(prev, db)) return { code: 200, body: { ok: true, ...extra, ...publicView(db) } };
    }
    fail(409, 'Troppe modifiche contemporanee, riprova');
  } catch (e) {
    if (e instanceof HttpError) return { code: e.code, body: { ok: false, error: e.message } };
    console.error(e);
    return { code: 500, body: { ok: false, error: 'Errore del server' } };
  }
}

export async function image(id) {
  if (!/^[0-9a-f]{12}$/.test(String(id ?? ''))) return null;
  return getStore().getImg(id);
}
