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

## Modello delle schede (`esperienze.json`)

Ogni voce è una scheda. Il tipo **non** si scrive a mano: il sito lo ricava dai dati (`tipoScheda` in `app.js`).

| In pagina | Quando | Dati |
|---|---|---|
| **UDA** | esperienza vissuta con i bambini: scheda completa (volume del Salento) o percorso | `stato: "vissuta"`, niente `percorso_uda`; un percorso ha anche `tappe: [{esperienza_id, aula_id, titolo, nota}]` |
| **Tappa** / **Tappa · proposta** | una sosta di un percorso | `percorso_uda: {id, titolo, tappa}` che punta alla scheda del percorso; il percorso la elenca in `tappe` |
| **Proposta** | tutto ciò che non è ancora stato provato con una classe | `stato: "proposta"` |
| **Contributo** | racconto di un visitatore approvato (da `/api/pubblicati`) | `contributo: true` |

- Nell'Archivio le tappe stanno chiuse sotto il loro percorso e si aprono con un clic. Una tappa la cui UDA non c'è (o è nascosta) resta come riga a sé.
- I numeri di home, Archivio e pagina di Valdobbiadene si calcolano dai dati (`contaSchede` in `app.js`; nell'HTML `<span data-num="uda|tappe|tappe_video|proposte|proposte_schede|percorsi" data-comunita="…">`). Le comunità in `COMUNITA_NASCOSTE` non si contano. L'elenco statico di `comunita/valdobbiadene.html` va rigenerato se cambiano percorsi o tappe.

### Cantiere: «da completare», «da validare con i docenti»

Le formule di lavoro (`da completare / da validare / da definire con i docenti`, `non documentato`, `in verifica`) e il campo `da_completare` **restano nei dati** (servono a chi corregge e al Genius Loci, che continua a dire che un dato non è verificato) ma **non si vedono in pagina**: `pulisciCantiere` in `app.js` nasconde la frase se è fatta solo di segnaposto e toglie in modo pulito il pezzo di segnaposto se è parte di una frase («proposta di raccordo, da validare con i docenti» → «proposta di raccordo»). Le frasi oneste del tipo «non documentata come svolta / come realizzato» restano. Le sezioni rimaste vuote non si mostrano. Al loro posto la scheda mostra un solo segno: **«Scheda in lavorazione»**.

### Tre voci del manifesto (facoltative)

Subito dopo `lettura` ogni scheda ha tre campi testo, oggi **vuoti per tutte**:

| Campo | Titolo in pagina | Cosa scrivere |
|---|---|---|
| `ferita_cura` | Ferita e cura | cosa di quel luogo è rotto, trascurato o dimenticato, e cosa ha fatto la classe |
| `stare_bene` | Cosa fa stare bene qui | la lettura salutogenica del luogo |
| `strato_digitale` | Strato digitale | cosa resta in rete per chi arriva dopo (con provenienza dichiarata) |

Si compilano solo con fonti reali (docenti, documenti, video): una voce vuota non compare. Compaiono in fondo alla «Lettura pedagogica», sotto «Con il manifesto della Strada», e entrano nell'indice del Genius Loci (`costruisci_indice.py`) quando sono compilate. Testo semplice; una riga vuota separa i paragrafi.
