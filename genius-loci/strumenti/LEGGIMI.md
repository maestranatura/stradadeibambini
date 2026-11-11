# Parla con il Genius Loci — prototipo

Pagina: `/genius-loci/` (noindex, collegata dal menu «Genius Loci»). Si può aprire anche con una domanda già scritta: `/genius-loci/?q=la%20ferita%20del%20luogo`.

## Fase 1 (attiva, gratuita, senza intelligenza artificiale)

- `genius-loci/indice.json` — indice PUBBLICO: solo contenuti del sito (UDA e aule) più un estratto breve
  (prime frasi) per ogni capitolo del metodo Mappe Genius Loci. Il testo completo del metodo è nella base
  privata della fase 2. Si rigenera con
  `python3 genius-loci/strumenti/costruisci_indice.py --metodo /percorso/metodo.txt`
  dopo ogni modifica a `esperienze.json` o `luoghi.geojson`.
- `genius-loci/cerca.mjs` — ricerca BM25 in italiano (radici semplici, sinonimi, luoghi, classi, discipline),
  raggruppa per scheda e prepara la frase introduttiva da modelli fissi. Nessun testo viene inventato.
- `genius-loci/app.mjs`, `genius-loci.css`, `index.html` — interfaccia.

Regole già nel codice:
- le voci dei bambini entrano nell'indice solo se `verificata: true` e la scheda non ha `voci_in_verifica`;
- ogni scheda mostra Vissuta / Proposta;
- se non trova niente di pertinente lo dice e propone domande alternative.

## Fase 2 (pronta, SPENTA) — Mistral Small 4

`netlify/functions/genius-loci.mjs` → `/api/genius-loci`.
- `GET` risponde `{abilitato:false}` finché le variabili non sono impostate: il frontend resta in fase 1.
- `POST {domanda}`: rifà la stessa ricerca lato server (indice pubblico + base privata), manda al modello solo quei
  passi con un prompt di sistema che obbliga a citare [S1], [S2]…, a dire «non lo so», a non inventare voci dei
  bambini, a distinguere vissuta/proposta.
- Modello predefinito: `mistral-small-2603` (Mistral Small 4, API compatibile OpenAI su `https://api.mistral.ai/v1`;
  listino Mistral a novembre 2026: 0,15 $/M token in ingresso, 0,60 $/M in uscita). Una domanda ≈ 5–6k token in
  ingresso + ≤500 in uscita ≈ 0,001 $; 200 domande/giorno ≈ 0,25 $/giorno al massimo.
- Limiti: 200 domande al giorno sul sito e 15 per IP (IP salvato solo come hash giornaliero) in Netlify Blobs
  `genius-loci-limiti`; max token.
- **Comunità nascoste** (`genius-loci/comunita-nascoste.json`, oggi `["Siracusa"]`, insieme a `COMUNITA_NASCOSTE` in
  `app.js`): l'indice pubblico non le contiene, la funzione scarta i passi privati e i risultati che le nominano,
  risponde «non lo so» alle domande su di esse e le toglie dal prompt. Per riattivarne una: toglierla da entrambe le
  liste, rigenerare l'indice (`costruisci_indice.py`) e rifare il deploy (la base privata non va ricaricata).

Variabili d'ambiente (Netlify → Site configuration → Environment variables; nessun valore nel codice):

| Nome | Valore | Note |
|---|---|---|
| `GENIUS_LOCI_ABILITATO` | `true` | qualsiasi altro valore = spento |
| `GENIUS_LOCI_PROVIDER` | `openai-compatibile` | oppure `anthropic` |
| `GENIUS_LOCI_BASE_URL` | `https://api.mistral.ai/v1` | predefinito se assente |
| `GENIUS_LOCI_MODELLO` | `mistral-small-2603` | predefinito se assente |
| `GENIUS_LOCI_API_KEY` | *(segreta)* | chiave Mistral |
| `GENIUS_LOCI_MAX_TOKENS` | `500` | massimo 1500 |
| `GENIUS_LOCI_LIMITE_GIORNALIERO` | `200` | domande al giorno su tutto il sito |
| `GENIUS_LOCI_LIMITE_IP` | `15` | domande al giorno per IP |
| `GENIUS_LOCI_PASSI` | `8` | passi passati al modello (max 12) |
| `GENIUS_LOCI_CORPUS_CHIAVE` | *(segreta)* | chiave base64 della base privata; senza, la fase 2 usa solo l'indice pubblico |

### Accensione

Le variabili si impostano dal pannello Netlify (o dal connettore Netlify), contesto production, con
`GENIUS_LOCI_API_KEY` e `GENIUS_LOCI_CORPUS_CHIAVE` come segrete; poi nuovo deploy. Spegnere:
`GENIUS_LOCI_ABILITATO=false` e nuovo deploy.

## Base di conoscenza privata (fase 2)

Il repository è pubblico, quindi i documenti interni **non** sono nel repo né sul sito, nemmeno cifrati.

- `netlify/genius-loci-dati/corpus.cifrato.json` — passi (materiali del team a testo completo, metodo completo,
  rielaborazioni con parole nostre di opere di terzi e dei libri di testo, sintesi del progetto Siracusa senza
  cifre) cifrati con AES-256-GCM. La funzione li importa nel bundle e li decifra solo in memoria con
  `GENIUS_LOCI_CORPUS_CHIAVE`. `/netlify/*` risponde comunque 404 (vedi `_redirects`). Chiave ruotata l'11/11/2026:
  le copie precedenti nello storico git usano una chiave non più valida.
- `netlify/genius-loci-dati/sorgenti-private.cifrato.json` — copia cifrata degli input scritti a mano
  (manifest e rielaborazioni), per poter rigenerare la base anche su un altro computer.
- Le fonti private si citano con titolo e autore, **mai** con link a Drive; nel frontend appaiono come
  «Documenti del team consultati».

Rigenerare (cartella privata fuori dal repo, es. `/workspace/genius-loci-privato`, con `CHIAVE_CORPUS`):

```
python3 genius-loci/strumenti/costruisci_corpus.py --privato DIR --ripristina   # se mancano manifest/rielaborati
# scaricare da Drive i file del manifest in DIR/sorgenti/<drive_id>.<ext> (lo script elenca i mancanti)
python3 genius-loci/strumenti/costruisci_corpus.py --privato DIR --ocr          # --ocr: rifà l'OCR se serve
```

Lo script estrae il testo (pdftotext, python-pptx, python-docx; OCR con rapidocr per i file fatti di immagini),
toglie email, telefoni, codici fiscali, link, filigrane con nomi di acquirenti, righe con budget e prezzi,
anonimizza i nomi indicati nel manifest, scarta i passi delle Mappe Genius Loci già presenti nel metodo e
si ferma se il controllo privacy finale trova qualcosa. Una chiave nuova si crea con `--nuova-chiave`
(poi va rimessa nella variabile su Netlify e serve un nuovo deploy).
