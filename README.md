# La Strada dei Bambini

Sito pubblico: [stradadeibambini.it](https://stradadeibambini.it)

Sussidiario vivo: Racconto · Mappa · Archivio · Contribuisci.

## Deploy

Progetto Netlify `cheery-alfajores-6cb1b4`, branch `main`.

- Build command: *(none)*
- Publish directory: `.` (radice del repo)
- File statici già generati; vedi `netlify.toml`.

Il modulo **Contribuisci** usa Netlify Forms (`contribuisci`). I contributi restano privati finché non vengono approvati a mano.

## Struttura

- `index.html` — Racconto
- `mappa.html` + `luoghi.geojson` — Mappa delle aule
- `archivio.html` + `esperienze.json` — Archivio
- `racconta.html` — Contribuisci
- `comunita/` — pagine comunità
- `mappa/foto/` — foto aule (servite da `/mappa/foto/…`)
- `_redirects` — URL del sito precedente
