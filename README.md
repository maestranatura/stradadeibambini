# stradadeibambini
Sito ufficiale La Strada dei Bambini - educazione all'aperto e percorsi didattici

## Sito statico e Atlante di Siracusa

La home è recuperata dal sito pubblico esistente, con immagini e dati incorporati
nel suo HTML originale. L'unica modifica al contenuto originale è la voce di
navigazione **Atlante di Siracusa**. Non sono stati riscritti CSS, JavaScript,
immagini, testi o funzionalità della home.

Il deploy precedente era manuale (`drop`), senza build o commit Git associato.
Il connettore Netlify non esponeva comando, base, publish e repository nelle
impostazioni restituite. `netlify.toml` rende esplicita la nuova configurazione:
base e publish nella radice, comando vuoto; i file pubblici sono già generati.

La home originale include 14 immagini in data URI, più dati incorporati nel
lettore; non richiede directory di immagini separate. I link interni del sito
originario sono ancore della stessa pagina. `robots.txt`, `sitemap.xml`,
`sitemap_index.xml` e `favicon.ico` restituivano 404 e non sono stati inventati.
Google Fonts, video e mappe restano servizi esterni come sul sito originario.
`/.netlify/scripts/hud` è un endpoint della piattaforma iniettato sul sito live,
non un file del deploy: non si ricrea una sua copia nel repository.

### Nuove pagine

- `/siracusa/`: presentazione, metodo Genius Loci e catalogo filtrabile.
- `/siracusa/neapolis.html`, `/siracusa/ortigia.html`, `/siracusa/citta.html`,
  `/siracusa/dintorni.html`: 35 luoghi, fonti, discipline, coordinate con limiti.
- `/siracusa/percorsi.html`: 35 proposte classe–luogo (8 terza, 13 comuni alle
  due quarte, 14 seconda secondaria), riferimenti al curricolo.
- `/siracusa/fonti.html`: fonti originali, testi aperti e stati di lettura.

Origine dei contenuti: Page **Siracusa, atlante delle aule possibili**, versione
consultata l'8 novembre 2026. `siracusa/dati.json` conserva i dati di provenienza;
le sole pagine HTML sono generate dal relativo script. Nessun PDF di terzi è
caricato. Le nuove pagine non usano immagini di terzi.

Il progetto è preparatorio: nessuna uscita o raccolta orale già avviata. Memoria
orale **da raccogliere con le classi**. Per attività nelle aree archeologiche
servono autorizzazioni del Parco; coordinate e schede non certificano accessi,
sicurezza, accessibilità o spazi di sosta.

### Generazione e verifica locale

Python 3, sola libreria standard; nessun framework o dipendenza di build.

```sh
python3 scripts/build_atlas.py
python3 scripts/check_site.py
python3 -m http.server 8788 --bind 127.0.0.1
# aprire http://127.0.0.1:8788 e /siracusa/
```

Lo script genera solo `/siracusa/`, mai la home. Lo stile base riprende
esattamente il CSS della home; gli adattamenti responsive della sezione sono
separati in `siracusa/atlante.css`. I filtri sono un miglioramento progressivo:
senza JavaScript tutti i contenuti restano visibili.
