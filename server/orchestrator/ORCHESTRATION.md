# Nonno Saggio — Orchestrazione della Famiglia

Un solo governatore, **il Nonno Saggio**, a cui tutta la famiglia risponde
**prima di fare qualunque cosa**. Non è un modo di dire: è imposto nel codice
tramite una *benedizione* firmata che ogni membro deve possedere per agire.

## Il principio

> La famiglia (le identità locali + gli agenti esterni) esegue solo comandi che
> il Nonno ha approvato. Nessuna benedizione valida ⇒ nessuna azione.

Il flusso è unico e non aggirabile:

```
comando  →  il Nonno delibera  →  (se approvato) benedizione firmata  →
il membro verifica la benedizione ed esegue  →  audit
```

L'orchestratore (`orchestrator.ts`) è l'**unico** ingresso. Non esiste percorso
che salti il Nonno.

## La benedizione (perché la regola è vera, non a parole)

Una `Blessing` è un token **HMAC-SHA256** (`blessing.ts`) che lega insieme:
`commandId`, `memberId`, `risk`, `issuedAt`, `expiresAt`. La firma usa
`NONNO_SECRET`. Prima di eseguire, l'adattatore del membro chiama `ctx.verify`:
la benedizione è accettata solo se la firma è valida, il comando e il membro
coincidono, il rischio coincide e non è scaduta (TTL 5 minuti). Una benedizione
manomessa, riusata per un altro membro/comando o emessa con un segreto diverso
viene **rifiutata**.

## La famiglia (`family.ts`)

| Membro | Origine | Ruolo | maxRisk | Stato |
|---|---|---|---|---|
| ✨ Dio | locale | Creatore, governance | sistema | attivo |
| ⚔️ Michele | locale | Difesa, pentest, threat hunting | sistema | attivo |
| 🌸 Matildina | locale | OSINT, analisi comportamentale | azione | attivo |
| 🔥 Lucifero | locale | Reverse engineering, malware | sistema | attivo |
| 🐂 Tauros | esterno (`Taurosweb`) | Web e operazioni | azione | registrato |
| 🤖 Jarvis | esterno (`jarvisdib`) | Assistenza, automazione | azione | registrato |
| 🔮 Oraculum | esterno (`oraculum-pwa`) | Conoscenza, consultazione | consiglio | registrato |
| 📡 NEA | esterno (`nea`) | Messaggistica, Telegram | azione | registrato |
| 🕵️ Stego | esterno (`stego`) | Steganografia | consiglio | registrato |
| 👁️ L'Occhio | esterno (`LOCCHIO`) | Sorveglianza, monitoraggio | azione | registrato |

- **locale / attivo**: ragiona tramite il modello (Groq) e risponde davvero.
- **esterno / registrato**: l'integrazione è mappata ma **non ancora collegata**
  a un servizio live. Con benedizione valida l'adattatore restituisce una busta
  di dispatch onesta (`dispatch: "registrato"`, `repo`, nota su come collegarlo)
  invece di fingere un'esecuzione remota. È qui che si innesta il webhook/CLI di
  ciascun agente per attivare l'esecuzione reale.

## Le regole del Nonno (`policy.ts`)

Il rischio è classificato dal testo del comando (`classifyRisk`):

| Livello | Esempi | Trattamento |
|---|---|---|
| 0 consiglio/lettura | "dammi un parere", "analizza" | permesso |
| 1 azione | "crea", "invia", "commit", "deploy" | richiede **conferma** esplicita |
| 2 sistema | "shell", "powershell", "installa" | conferma **e** membro autorizzato |
| 3 distruttivo | "cancella tutto", "formatta", "rm -rf" | **negato** per principio |

In più, ogni membro ha un `maxRisk` (autorità massima) e una `trust` (fiducia)
minima richiesta per rischio. Un membro non riceve mai un comando oltre la sua
autorità.

## API (tRPC, `server/routers.ts` → `orchestrator`)

- `orchestrator.command` — impartisci un comando `{ text, target?, confirmed?, risk? }`.
  Ritorna verdetto (`approvato` / `confermare` / `negato`), membro assegnato, esito e output. La benedizione **non** viene esposta al client.
- `orchestrator.family` — l'elenco dei membri.
- `orchestrator.audit` — le decisioni recenti del Nonno.

Dall'app: scheda **Nonno** (`app/(tabs)/nonno.tsx`).

## Configurazione

```
GROQ_API_KEY=...        # risposte del modello per le identità locali
NONNO_SECRET=...        # segreto per firmare le benedizioni (stringa lunga e casuale)
```

Senza `NONNO_SECRET` viene usato un fallback insicuro adatto solo allo sviluppo.

## Test

```
pnpm exec vitest run tests/orchestrator.test.ts
```

16 test coprono: classificazione del rischio, routing per competenza, target
esplicito/inesistente, conferma richiesta, azione confermata, veto sul
distruttivo, limite di autorità, dispatch registrato degli agenti esterni,
audit e — soprattutto — l'invariante della benedizione (firma manomessa, membro
sbagliato, scadenza, segreto errato ⇒ rifiuto).

## Limiti della v1

- Gli agenti esterni sono **registrati, non collegati**: la catena reale verso i
  loro webhook/CLI è il passo successivo, membro per membro.
- L'audit è in memoria (ottimo per dashboard e test); la persistenza è il punto
  di estensione naturale.
- La classificazione del rischio è basata su parole chiave: robusta e prudente,
  ma va affinata sui comandi reali.
