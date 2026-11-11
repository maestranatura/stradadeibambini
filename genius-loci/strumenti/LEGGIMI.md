# Parla con il Genius Loci — prototipo

Pagina: `/genius-loci/` (noindex, **non** collegata dal menu). Si può aprire anche con una domanda già scritta: `/genius-loci/?q=la%20ferita%20del%20luogo`.

## Fase 1 (attiva, gratuita, senza intelligenza artificiale)

- `genius-loci/indice.json` — passi già pronti (UDA, aule, metodo). Si rigenera con
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
