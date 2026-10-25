# Dib'OS

Dib'OS è la ROM della famiglia. È l'app che doveva essere chiusa da tempo: una immagine per telefono e per il browser, con chat, automazioni, il Nonno Saggio e una shell.

Non è il cervello Tauros del PC (`tauros-cognitive-os`). Quello resta un programma a parte. Qui Tauros e Jarvis sono due identità della ROM, insieme a Dio, Michele, Matildina e Lucifero.

## Cosa c'è nell'interfaccia

- **Chat.** In cima c'è scritto Dib'OS · ROM. Da lì si sceglie chi parla.
- **Automazioni.** Passato, presente, futuro.
- **Nonno.** Approva un comando e firma un permesso prima che un membro agisca.
- **Shell.** Riga di comando dell'app.

## PWA

La build web è installabile: manifest `public/manifest.webmanifest`, service worker `public/sw.js`, schermo `standalone`.

```bash
pnpm install
pnpm dev
```

Il sito di sviluppo Metro sta sulla porta 8081. Per una cartella da pubblicare: `npx expo export --platform web`.

## Prova

Chi apre l'app riceve 3 giorni di chat, senza limite di messaggi. Il conto parte la prima volta e resta in `data/trials.json` sul server. Finiti i 3 giorni la chat si ferma e chiede **9,90 €**, una volta sola. La cifra sta in `shared/price.ts`. Un pagamento confermato da Stripe sblocca quella prova. Per incassare serve `STRIPE_SECRET_KEY` e `STRIPE_WEBHOOK_SECRET`. `STRIPE_PRICE_ID` è facoltativo: se lo metti, quel prezzo Stripe sostituisce i 9,90 €.

## Fuori casa

L'app in casa usa `/api/trpc`. Da fuori si usa un indirizzo pubblico e queste rotte, con header `Authorization: Bearer <DIB_API_TOKEN>`:

- `GET /api/health` senza token
- `GET /api/v1/family`
- `POST /api/v1/trial` con corpo `{ "trialId": "un-id-di-almeno-16-caratteri" }`
- `POST /api/v1/chat` con corpo `{ "message": "ciao", "identity": "tauros", "trialId": "lo-stesso-id" }`

Le identità ammesse sono `dio`, `michele`, `matildina`, `lucifero`, `tauros`, `jarvis`.

Sul telefono, se l'app non è stata compilata con `EXPO_PUBLIC_API_BASE_URL`, si può salvare l'indirizzo nel browser:

```js
localStorage.setItem("dib_api_base", "https://il-tuo-indirizzo")
localStorage.setItem("dib_api_token", "il-token")
```

Il server va esposto con un tunnel o un hosting che inoltra la porta 3000. Non aprire la porta di casa sul router senza il token.

## Proprietà

Vedi `LICENSE`. Il software è del titolare. Non è open source.
