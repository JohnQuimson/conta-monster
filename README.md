# Conto Monster

Segna chi deve quante Monster a chi dopo le partite a Just Volleyball (1v1, 2v2, 3v3).
Ogni vincitore riceve 1 lattina, ogni perdente ne dà 1. I debiti vengono compensati:
se tu devi una Monster a Omay e Jery ne deve una a te, Jery la dà direttamente a Omay.

- `index.html` – l'app (una sola pagina, niente build)
- `lib/` – la logica (uguale in locale e online), `api/` – le funzioni per Vercel, `server.js` – il server locale
- Dati: in locale file nella cartella `data/`; online **Upstash Redis** (gratis, collegato da Vercel). Niente MySQL.

## Avviarlo in locale
```sh
npm start
```
Apri http://localhost:3000. Dal telefono, collegato alla stessa Wi-Fi, usa l'indirizzo "In rete" che compare nel terminale.
Se Windows chiede il permesso per il firewall, consenti le reti private. Non servono `npm install` né dipendenze.

## Contro chi bara
- Ognuno entra col **proprio PIN** (4 cifre, lo sceglie al primo accesso). Ogni partita resta firmata da chi l'ha segnata,
  con data e ora prese dal server, non dal telefono.
- Una consegna la può confermare **solo chi riceve** la Monster: chi deve non può cancellarsi il debito da solo.
- Una partita la può annullare solo chi l'ha segnata o chi l'ha giocata. Niente sparisce: nello storico resta "annullata da X".
- Nomi aggiunti, rinominati, nascosti, foto e gusti nuovi finiscono nello storico, sotto "Modifiche".
- PIN dimenticato: in locale si azzera cancellando il campo `pin` di quel giocatore in `data/db.json`.

## Deploy su Vercel (gratis, ~5 minuti)

1. **Metti il progetto su GitHub**
   ```sh
   git init
   git add .
   git commit -m "Conto Monster"
   ```
   Crea un repository vuoto su github.com e fai `git remote add origin <url>` + `git push -u origin main`.

2. **Importa su Vercel**: vai su https://vercel.com/new, accedi con GitHub, scegli il repository.
   Framework Preset: *Other*. Non serve cambiare nient'altro → **Deploy**.

3. **Collega il database**: nel progetto su Vercel → **Storage** → **Create Database** →
   **Upstash for Redis** (piano Free) → collegalo al progetto.
   Vercel aggiunge da solo le variabili `KV_REST_API_URL` e `KV_REST_API_TOKEN`.

4. **Imposta il codice del gruppo** (consigliato, altrimenti chiunque abbia il link può crearsi un profilo):
   **Settings** → **Environment Variables** → aggiungi `GROUP_CODE` = per esempio `spikeballa`.
   Serve solo la prima volta, per entrare nel gruppo; poi ognuno usa il suo PIN.

5. **Rideploya** (Deployments → ⋯ → Redeploy) così le variabili vengono lette. Fatto: apri l'URL
   `https://<nome>.vercel.app` e condividilo agli amici. Dal telefono puoi fare "Aggiungi a schermata Home".

Ogni `git push` successivo aggiorna il sito da solo.

### In alternativa, dal terminale
```sh
npm i -g vercel
vercel          # primo deploy, collega il progetto
# collega Upstash dalla dashboard (punto 3) e aggiungi il codice del gruppo:
vercel env add GROUP_CODE
vercel --prod
```

Nota: i dati salvati in locale (`data/`) non vengono caricati online: online si riparte da zero.

## Come funziona
- **Partita**: scegli 1v1/2v2/3v3, tocca i giocatori (primo tocco → A, secondo → B, terzo → fuori),
  poi premi chi ha vinto. Puoi annullare dal messaggio in basso.
- **Conti**: la lista già compensata di chi dà a chi, con la Monster preferita di chi riceve. Chi riceve preme "Ricevuta".
- **Storico**: partite, consegne e modifiche, con chi le ha fatte e quando.
- **Gruppo**: aggiungi amici, nascondili, metti le foto vere delle lattine o crea gusti nuovi.
- **Profilo** (tocca il tuo nome in alto): scegli fino a 3 Monster preferite, cambia nome o PIN.
