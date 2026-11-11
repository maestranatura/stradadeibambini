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

## Fase 2 (pronta, SPENTA)

`netlify/functions/genius-loci.mjs` → `/api/genius-loci`.
- `GET` risponde `{abilitato:false}` finché le variabili non sono impostate: il frontend resta in fase 1.
- `POST {domanda}`: rifà la stessa ricerca lato server, manda al modello solo quei passi con un prompt di sistema
  che obbliga a citare [S1], [S2]…, a dire «non lo so», a non inventare voci dei bambini, a distinguere vissuta/proposta.
- Limiti: giornaliero globale e per IP (IP salvato solo come hash giornaliero) in Netlify Blobs `genius-loci-limiti`; max token.

Variabili d'ambiente (Netlify → Site configuration → Environment variables; nessun valore nel codice):

| Nome | Esempio di valore | Note |
|---|---|---|
| `GENIUS_LOCI_ABILITATO` | `true` | qualsiasi altro valore = spento |
| `GENIUS_LOCI_PROVIDER` | `openai-compatibile` oppure `anthropic` | OpenAI-compatibile copre Mistral, Gemini, OpenAI, Groq, OpenRouter |
| `GENIUS_LOCI_BASE_URL` | `https://api.mistral.ai/v1` | solo per openai-compatibile |
| `GENIUS_LOCI_MODELLO` | `mistral-small-2603` | nome del modello del provider |
| `GENIUS_LOCI_API_KEY` | *(segreta)* | da impostare solo nel pannello Netlify |
| `GENIUS_LOCI_MAX_TOKENS` | `500` | massimo 1500 |
| `GENIUS_LOCI_LIMITE_GIORNALIERO` | `200` | domande al giorno su tutto il sito |
| `GENIUS_LOCI_LIMITE_IP` | `15` | domande al giorno per IP |
| `GENIUS_LOCI_PASSI` | `8` | passi passati al modello (max 12) |
| `GENIUS_LOCI_CORPUS_CHIAVE` | *(segreta)* | chiave base64 della base privata; senza, la fase 2 usa solo l'indice pubblico |

## Base di conoscenza privata (fase 2)

Il repository è pubblico, quindi i documenti interni **non** sono mai in chiaro nel repo né sul sito.

- `netlify/genius-loci-dati/corpus.cifrato.json` — passi (materiali del team a testo completo, metodo completo,
  rielaborazioni con parole nostre di opere di terzi e dei libri di testo, sintesi del progetto Siracusa senza
  cifre) cifrati con AES-256-GCM. La funzione li importa nel bundle e li decifra solo in memoria con
  `GENIUS_LOCI_CORPUS_CHIAVE`. `/netlify/*` risponde comunque 404 (vedi `_redirects`).
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
(poi va copiata nella variabile su Netlify e la base va rigenerata).
