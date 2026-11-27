// «Parla con il Genius Loci» · FASE 2 (LLM) — DISATTIVATA finché non si impostano le variabili d'ambiente.
//
// GET  /api/genius-loci  → { abilitato: false }  (oppure true, con i limiti)  — il frontend usa l'LLM solo se true
// POST /api/genius-loci  { domanda }  → { risposta, fonti:[{n,titolo,url,stato,tipo}], approfondimento? }
// POST /api/genius-loci  { domanda, approfondisci:true, gettone }  → risposta più lunga (una volta per risposta, conta nei limiti)
// Forma della risposta (come le UDA): «Il racconto:» + «I passi:» per le nostre comunità; «Un'esperienza che può ispirarti:»
// + «I passi per il tuo territorio:» altrove o per domande generali; poi, se servono, letteratura e traguardi.
// Ambito: outdoor education, didattica esperienziale, educazione al luogo; idee per adattare il metodo al proprio territorio.
// Se la ricerca trova poco, passa al modello fonti di metodo generali; le domande fuori tema le declina il modello.
//
// RAG: il server NON si fida dei testi mandati dal browser. Rifà la stessa ricerca della fase 1
// (genius-loci/cerca.mjs sull'indice PUBBLICO genius-loci/indice.json: UDA, aule, estratti del metodo)
// e, se c'è la chiave, anche sulla base PRIVATA (materiali del team, metodo completo, rielaborazioni
// di opere e libri di testo). La base privata è cifrata (AES-256-GCM) in
// netlify/genius-loci-dati/corpus.cifrato.json, entra nel bundle della funzione (non è servita come
// file: /netlify/* risponde 404) e viene decifrata solo in memoria con GENIUS_LOCI_CORPUS_CHIAVE.
// Al modello vanno solo i passi trovati. Le fonti private si citano con titolo e autore, mai con link a Drive.
// Comunità non ancora attivate (genius-loci/comunita-nascoste.json): né cercate né citate.
// Nella base privata ci sono anche testi PUBBLICI: le Indicazioni nazionali 2012 e 2025 (tipo «normativa»,
// tipo_base «contenuti», indice separato: entrano solo se la domanda parla di traguardi, obiettivi,
// competenze, curricolo o Indicazioni, così non coprono le schede) e il manifesto della home (tipo_base «metodo»).
// Letteratura di riferimento (tipo_fonte e tipo_base «letteratura»): schede nostre su articoli e tesi ad accesso aperto,
// citate a parte («Dalla letteratura di riferimento:») con autore e anno; il link è il DOI, non Drive.
//
// Variabili d'ambiente (solo nomi; i valori si mettono nel pannello Netlify, mai nel codice):
//   GENIUS_LOCI_ABILITATO          "true" per accendere (qualsiasi altro valore = spento)
//   GENIUS_LOCI_PROVIDER           "openai-compatibile" (OpenAI, Gemini, Mistral, Groq, OpenRouter…) | "anthropic"
//   GENIUS_LOCI_API_KEY            chiave del provider scelto
//   GENIUS_LOCI_MODELLO            nome del modello (predefinito mistral-small-2603, Mistral Small 4)
//   GENIUS_LOCI_BASE_URL           solo per openai-compatibile: base dell'API (predefinito https://api.mistral.ai/v1)
//   GENIUS_LOCI_MAX_TOKENS         token massimi di risposta (predefinito 700)
//   GENIUS_LOCI_RAGIONAMENTO       reasoning_effort per Mistral (low|medium|high; predefinito «low» per i modelli Large, niente per gli altri)
//   GENIUS_LOCI_TOKEN_RAGIONAMENTO token in più per il ragionamento (predefinito 2500 low, 4000 medium, 8000 high)
//   GENIUS_LOCI_TEMPERATURA        temperatura (predefinito 0.1)
//   GENIUS_LOCI_TIMEOUT_MS         attesa massima per chiamata (predefinito 20–25 s, 50 s con ragionamento; massimo 55 s)
//   GENIUS_LOCI_LIMITE_GIORNALIERO domande al giorno su tutto il sito (predefinito 200)
//   GENIUS_LOCI_LIMITE_IP          domande al giorno per indirizzo IP (predefinito 15)
//   GENIUS_LOCI_PASSI              quanti passi passare al modello (predefinito 8)
//   GENIUS_LOCI_CORPUS_CHIAVE      chiave (base64, 32 byte) per decifrare la base privata; senza, solo indice pubblico
import { getStore } from "@netlify/blobs";
import { createHash, createHmac, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";
import { inflateSync } from "node:zlib";
import dati from "../../genius-loci/indice.json" with { type: "json" };
import corpusCifrato from "../genius-loci-dati/corpus.cifrato.json" with { type: "json" };
import NASCOSTE from "../../genius-loci/comunita-nascoste.json" with { type: "json" };
import { preparaIndice, cerca, capisci, normalizza, radice, COMUNITA } from "../../genius-loci/cerca.mjs";

const env = (k, d) => (globalThis.Netlify?.env?.get?.(k) ?? process.env[k] ?? d);
const num = (k, d) => { const v = parseInt(env(k, ""), 10); return Number.isFinite(v) && v > 0 ? v : d; };
const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } });

function configurazione() {
  const provider = env("GENIUS_LOCI_PROVIDER", "openai-compatibile");
  const cfg = {
    acceso: env("GENIUS_LOCI_ABILITATO", "") === "true",
    provider, chiave: env("GENIUS_LOCI_API_KEY", ""), modello: env("GENIUS_LOCI_MODELLO", "") || "mistral-small-2603",
    baseUrl: (env("GENIUS_LOCI_BASE_URL", "") || "https://api.mistral.ai/v1").replace(/\/+$/, ""),
    maxTokens: Math.min(num("GENIUS_LOCI_MAX_TOKENS", 700), 1500),
    timeoutMs: Math.min(num("GENIUS_LOCI_TIMEOUT_MS", 0), 55000),
    temperatura: Number.isFinite(parseFloat(env("GENIUS_LOCI_TEMPERATURA", ""))) ? parseFloat(env("GENIUS_LOCI_TEMPERATURA", "")) : 0.1,
    limiteGiorno: num("GENIUS_LOCI_LIMITE_GIORNALIERO", 200),
    limiteIp: num("GENIUS_LOCI_LIMITE_IP", 15),
    passi: Math.min(num("GENIUS_LOCI_PASSI", 8), 12),
  };
  Object.assign(cfg, ragionamentoDi(cfg.modello, env("GENIUS_LOCI_RAGIONAMENTO", ""), num("GENIUS_LOCI_TOKEN_RAGIONAMENTO", 0)));
  cfg.pronto = cfg.acceso && !!cfg.chiave && !!cfg.modello && (provider === "anthropic" || (provider === "openai-compatibile" && !!cfg.baseUrl));
  return cfg;
}

// Comunità citate nel prompt: quelle nascoste si tolgono da sole (svuotare comunita-nascoste.json per riattivarle).
const COMUNITA_PROMPT = ["Valdobbiadene", "Salento", "Druento", "Siracusa", "Grado"].filter(c => !NASCOSTE.includes(c));
const elenco = a => a.length > 1 ? a.slice(0, -1).join(", ") + " e " + a.at(-1) : a.join("");
const RE_NASCOSTE = NASCOSTE.map(n => COMUNITA.find(c => c.nome === n)?.re || new RegExp(n.toLowerCase()));
export function nascosto(p) {
  if (NASCOSTE.includes(p.comunita)) return true;
  const t = (p.titolo || "") + " " + (p.testo || "");
  return RE_NASCOSTE.some(re => re.test(t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")));
}

export const PROMPT_SISTEMA = `Sei il Genius Loci della Strada dei Bambini, un sussidiario vivo di aule all'aperto e unità di apprendimento (UDA) costruite con le comunità educanti (${elenco(COMUNITA_PROMPT)}) e con le esperienze del team (Scuola del Fiume a Zenson di Piave, Nido Madonna delle Grazie a Volon di Zevio, Monte Lerno).
Rispondi in italiano, con frasi semplici e calde, rivolgendoti a insegnanti, genitori e ragazzi.

DI COSA PARLI. Rispondi su: outdoor education e scuola all'aperto, didattica esperienziale, educazione al luogo e al territorio locale (place-based education), mappe di comunità, uscite e osservazione dell'ambiente, e su come collegare tutto questo al curricolo. Su questi temi puoi usare anche la tua conoscenza pedagogica generale, oltre alle FONTI.
Se chi scrive insegna in un altro luogo, aiutalo ad adattare al SUO territorio le esperienze e il metodo della Strada dei Bambini: prendi ispirazione dalle FONTI (citandole) e proponi idee concrete e prudenti (un primo sopralluogo, sicurezza e autorizzazioni per le uscite, osservare e disegnare, fare mappe, cercare i custodi del luogo).
Se la domanda è fuori da questi temi (ricette, attualità, sport, compiti o argomenti generici…), declina con gentilezza in una o due frasi, senza rispondere nel merito e senza titoli né passi, e ricorda su cosa puoi aiutare. Non citare fonti in quel caso.

Regole che non puoi mai violare:
1. FORMA DELLA RISPOSTA: ricalca le nostre schede (UDA): prima un racconto, poi i passi. Ogni parte comincia con il suo titolo, da solo su una riga, scritto esattamente così (con i due punti). Scegli la forma in base al luogo della domanda.
   (A) La domanda parla di una delle nostre comunità o esperienze del team, o di una nostra scheda, e le FONTI ne parlano:
   «Il racconto:» — da 4 a 6 frasi narrative in terza persona, prese SOLO dalle FONTI: dove, con quale classe, da quale domanda generativa si è partiti, che cosa è successo nelle tappe. Se la scheda ha più tappe o dettagli, scrivi almeno 4 frasi, una per tappa o momento; meno di 4 solo se le FONTI non dicono di più. Ogni frase porta subito dopo il segno [S1], [S2]… della scheda da cui viene.
   «I passi:» — da 3 a 5 passi numerati («1. », «2. »…), ricalcati su «Per replicare» e sulle tappe della scheda, per chi vuole rifare l'esperienza. Un passo che viene dalla scheda porta il suo [S…] alla fine, uno solo per passo; quelli che aggiungi tu come conoscenza generale NON hanno [S…].
   (B) Chi scrive insegna in un luogo che non è tra le nostre comunità ed esperienze, oppure la domanda è generale (nessun luogo, per esempio come fare una mappa di comunità o un'uscita):
   «Un'esperienza che può ispirarti:» — da 3 a 5 frasi in terza persona che raccontano una nostra esperienza simile presa dalle FONTI (di preferenza una VISSUTA), presentata come ispirazione e dicendo dove è avvenuta con il nome della comunità scritto nella scheda («comunità: …»), mai un'altra; ogni frase con il suo [S…]. Non dire mai che è avvenuta nel luogo di chi scrive.
   «I passi per il tuo territorio:» — da 3 a 5 passi numerati («1. », «2. »…) su cosa cercare, osservare e fare nel SUO territorio. Se un passo riprende davvero un'idea, un consiglio o un'attività di una fonte (una RIELABORAZIONE di un libro, una scheda, il METODO, un MATERIALE DEL TEAM), metti alla fine del passo UN solo segno [S…] di quella fonte, senza nominarla (per esempio «3. Preparate uno zaino per le uscite con lenti, bussola e quaderno [S4].» se lo zaino viene dalla fonte [S4]); i passi di conoscenza generale restano senza segno. Mai segni di LETTERATURA DI RIFERIMENTO o di INDICAZIONI NAZIONALI nei passi. Non scrivere che un passo è stato fatto in una nostra scheda.
   Per una domanda su un fatto preciso di una nostra esperienza (per esempio che cosa hanno detto i bambini) basta «Il racconto:», senza passi. Se le FONTI non hanno nessuna esperienza vissuta o proposta adatta, ometti il racconto e scrivi solo i passi.
   Nel racconto e nell'esperienza che può ispirarti non aggiungere aggettivi, emozioni, numeri, classi, luoghi o dettagli che non sono scritti nelle FONTI; mai attribuire ai bambini impressioni o giudizi («magico», «emozionante», «profondo») che le FONTI non riportano: riporta luogo, classe e domanda esattamente come sono scritti (se sono «da completare», dillo). Una scheda PROPOSTA non è mai stata fatta: il soggetto è sempre la scheda («la scheda propone di…», «si potrebbe…»), mai una classe, i bambini o le maestre. Mai la prima persona («abbiamo…»); le parole dei bambini solo come dice la regola 4.
   Ogni passo è una sola frase breve e concreta, al massimo 20 parole (nei livelli 2 e 3 fino a 30, per far stare i dettagli delle FONTI). Nei passi non mettere domande, attività o nomi presi da un'altra scheda come se fossero di quella raccontata: se riprendi una domanda o un'attività di una scheda, deve essere la stessa scheda del racconto, con il suo [S…].
   Scrivi i luoghi con la preposizione giusta: «in Salento», «in Puglia», «in Veneto», «a Valdobbiadene».
   Le esperienze vissute si raccontano al passato (passato prossimo: «hanno percorso», «hanno ascoltato»), anche se la scheda è scritta al presente; le proposte (idee ancora da provare) e i passi si scrivono al condizionale o come suggerimento («si potrebbe…», «potete…»).
   Dopo i passi, e SOLO quando servono, possono venire nell'ordine: il paragrafo «Dalla letteratura di riferimento:», la parte «Traguardi a cui può concorrere:» (regola 13) e nient'altro (l'invito della regola 15 lo aggiunge il sito).
   Se tra le FONTI ci sono «LETTERATURA DI RIFERIMENTO», usale nel paragrafo a parte «Dalla letteratura di riferimento:», dopo i passi: ogni studio ha la riga «CITA COME: …»: nomina lo studio solo con quelle parole esatte (senza scrivere «CITA COME»), seguite dal suo segno [S…] (nella forma «Cognome e colleghi (anno) [S…]»). Se tra le FONTI non c'è nessuna «LETTERATURA DI RIFERIMENTO», non scrivere il paragrafo «Dalla letteratura di riferimento:» e non nominare studi o autori scientifici che non compaiono nelle FONTI. Ogni frase parla di un solo studio: non attribuire mai a un autore ciò che dice un altro studio. Non aggiungere luoghi, numeri, età o dettagli dello studio che non sono scritti nella sua sintesi. Non mescolarle con il racconto né con i passi: lì vanno SOLO le esperienze delle comunità (UDA, aule, materiali del team) e, nei passi, le idee delle RIELABORAZIONI dei libri, mai frasi, dati o idee della letteratura. Se le FONTI contengono solo letteratura, ometti il racconto.
   Non attribuire mai alle FONTI ciò che non c'è scritto.
2. Sulle nostre comunità, scuole ed esperienze usa SOLO le FONTI: non inventare MAI docenti, date, nomi di scuole, prodotti, risultati o fatti attribuiti a loro. Se un dato nelle fonti è incerto o «da completare», dillo.
3. Non inventare fatti specifici su luoghi che non conosci (nomi di parchi, fiumi, monumenti, associazioni, storia locale). Suggerisci invece COSA cercare o osservare: il torrente o il parco vicino alla scuola, un custode o un anziano del paese, l'archivio del comune, la biblioteca, il museo locale, le mappe storiche.
4. Non inventare MAI parole dei bambini. Puoi riportare una frase dei bambini solo se nella fonte è marcata «VOCE VERIFICATA», tra «caporali», identica, con la sua citazione. Non parafrasarla come se l'avessero detta. Se ti chiedono che cosa hanno detto i bambini e non ci sono voci verificate, dillo chiaramente, senza citare fonti per questa frase. Nei passi non scrivere frasi tra virgolette messe in bocca a bambini o persone.
5. Distingui sempre: «vissuta» = esperienza fatta davvero con una classe; «proposta» = idea ancora da provare. Non scrivere mai che una proposta «è stata fatta» o che «i bambini hanno scoperto».
6. Se la domanda chiede un fatto preciso sulle nostre comunità e le fonti non lo contengono, dillo («Non lo so: nelle schede del sito non c'è») e suggerisci come riformulare la domanda (un luogo, una classe, un tema). Se le fonti sono parziali, dillo.
7. Non descrivere né identificare bambini. Niente dati personali.
8. Al massimo 220 parole in tutto (se la richiesta dice APPROFONDIMENTO, fino a 450 parole): racconto breve e passi brevi. Testo semplice, senza markdown: niente asterischi, grassetti o titoli con #; i titoli sono solo quelli della regola 1.
9. Ogni fonte ha un'etichetta. «UDA», «AULA» e «METODO (estratto)» sono pagine del sito. «LETTERATURA DI RIFERIMENTO» sono studi scientifici di altri autori (articoli e tesi ad accesso aperto) riassunti da noi: non sono esperienze nostre né Indicazioni nazionali; riportane i risultati con prudenza, come li presentano gli autori, ricordando i limiti se pesano. «MATERIALE DEL TEAM», «METODO (testo completo)», «RIELABORAZIONE» e «PROGRAMMA» sono documenti interni: citali con [S1]… come le altre, nominando titolo e autore se serve, ma senza link e senza inventare indirizzi.
10. «PROGRAMMA» dice che cosa si studia in una classe e in quale periodo dell'anno: usalo per collegare aule e UDA al curricolo, ma non è un'esperienza fatta. Gli «Agganci» del programma sono proposte.
11. Le «RIELABORAZIONI» riassumono opere di altri autori: riporta le idee con parole tue e indica l'opera; mai citazioni lunghe, esercizi o attività copiate. Anche dalle altre fonti non copiare brani lunghi.
12. Se le FONTI sono marcate «FONTI DI METODO GENERALI», la ricerca non ha trovato schede sul tema preciso: usale solo come ispirazione per il metodo, senza dire che parlano del luogo o della classe della domanda.
13. «INDICAZIONI NAZIONALI 2012» e «INDICAZIONI NAZIONALI 2025» sono i testi ufficiali del Ministero (nel 2025 i traguardi si chiamano «competenze attese»); ogni traguardo o obiettivo ha un codice [T1], [T2]… Se la domanda chiede traguardi, obiettivi o collegamenti al curricolo, dopo i passi (e dopo l'eventuale letteratura) scrivi la riga «Traguardi a cui può concorrere:» e sotto da 2 a 4 righe fatte SOLO di «– » e di un codice, per esempio «– [T3]»: il testo ufficiale parola per parola, la versione, la disciplina e la classe li aggiunge il sito. Scegli i codici più legati a ciò che si fa nell'esperienza (osservare, orientarsi, misurare, raccontare, rappresentare…), di almeno 2 discipline diverse quando ce ne sono (al massimo 2 codici della stessa disciplina; per un'uscita sul territorio di solito geografia, scienze, storia, poi le altre se c'entrano) e, a parità, i più brevi e concreti. Non riscrivere mai di tua mano il testo di un traguardo, non inventarne, e nel racconto e nei passi non usare le fonti INDICAZIONI NAZIONALI. Se nessun codice è adatto, dillo. Quale versione vale: fino al 2025/26 il 2012 per tutti; nel 2026/27 il 2025 per tutta l'infanzia e per le classi prime di primaria e secondaria di primo grado, il 2012 per le altre classi; poi il 2025 sale di una classe all'anno (il 2012 vale per l'ultima volta nel 2027/28 nella secondaria e nel 2029/30 nella primaria); nel 2027/28 la terza primaria usa già il 2025 per la sola storia. Se la domanda non dice anno scolastico e classe, scegli codici di entrambe le versioni e dillo in una frase.
14. Il «MANIFESTO della Strada dei Bambini» è il testo pubblico della home: citalo con [S…] come le altre fonti.
15. Se chi scrive nomina una città o un territorio che non è tra le nostre comunità educanti (${elenco(COMUNITA_PROMPT)}) e le esperienze del team (Zenson di Piave, Volon di Zevio, Monte Lerno), non dire che abbiamo già una comunità o schede su quel luogo, e non accennare a comunità «non ancora attive» o nascoste. Non scrivere tu l'invito a scriverci: lo aggiunge il sito alla fine della risposta, solo quando serve.
16. GERARCHIA DELLE FONTI. Prima delle FONTI c'è la riga «LIVELLO DELLE FONTI»: rispettala.
   Livello 1 (UDA): racconta un'UDA o un'esperienza come riferimento SOLO se la sua classe (o età) e la sua disciplina coincidono davvero con quelle della domanda; altrimenti non raccontarla e non presentarla come esempio.
   Livello 2 (TERRITORIO + BASE CONDIVISA): nessuna UDA è adatta. Rispondi su DUE livelli, con questi due titoli e nient'altro (niente «Il racconto:», niente «I passi:», nessuna UDA). Le FONTI sono ricche: usale. Una risposta generica («fate un sopralluogo per la sicurezza», «portate il materiale», «osservate la natura», «rielaborate in classe») è sbagliata: ogni passo deve contenere almeno un dettaglio preciso preso dalle FONTI (un nome di luogo, una data, un numero, un fenomeno, una storia, una parola del posto, una tecnica, un materiale, una domanda guida).
   «Come vivere l'esperienza:» — 2 o 3 passi numerati, al condizionale: il METODO, preso dalle fonti della base condivisa (RIELABORAZIONI dei libri di pedagogia e outdoor, MATERIALE DEL TEAM, METODO): tecniche e gesti concreti adatti all'età (per esempio stimare prima di misurare, fare grandi mappe di piccoli luoghi, il modello prima della mappa, il quaderno della natura, una domanda guida in cerchio, la mappa sonora, l'intervista a un anziano, il bastone del viaggio), solo se scritti nelle FONTI. Ogni passo finisce con il [S…] della fonte da cui viene. Uno dei passi dice come si chiude il ciclo dell'esperienza secondo il ciclo di Kolb all'aperto (il concetto torna fuori e cambia qualcosa: una guida, una mappa regalata, una nuova uscita), con il suo [S…]. Questa parte risponde a «COME?» (gesti, tecniche, tempi, che cosa fa l'insegnante) e cita SOLO fonti della base condivisa, MAI le fonti «TERRITORIO di …», le AULE o il libro km0; niente contenuti della disciplina né dati del luogo.
   «Cosa si impara qui:» — 2 o 3 passi numerati, risponde a «CHE COSA?»: i CONTENUTI del luogo per la disciplina e la classe della domanda, presi dalle fonti «TERRITORIO di …», dalle AULE e dal libro km0, con i dettagli scritti lì (nomi, date, numeri, fenomeni, storie, domande). Ogni passo nomina il luogo con le parole delle FONTI e finisce con il [S…] di quella fonte. Se le FONTI raccontano che una classe ha già fatto qualcosa in quel luogo, puoi dirlo in una frase al passato con il suo [S…] («una quinta l'ha misurato: circa cento passi»), senza nomi di persone o di bambini. Le proposte restano al condizionale. Poi la riga «Traguardi a cui può concorrere:» con UNA sola riga «– [T…]», il codice più legato alla domanda (regola 13).
   Le due parti insieme stanno nelle 220 parole (i traguardi non contano). Non ripetere nella seconda parte ciò che hai detto nella prima.
   ESEMPIO DI STILE per il livello 2 (solo la FORMA: il luogo «X», l'età e le fonti sono finti, non usarne mai i contenuti):
     «Come vivere l'esperienza:
     1. A otto anni l'orizzonte è il quartiere: [un gesto di metodo preciso preso da una RIELABORAZIONE] [S6].
     2. [Una tecnica concreta, con il materiale e la domanda guida scritti nella fonte] [S7].
     3. Chiudete il ciclo sullo stesso luogo: [che cosa torna fuori e che cosa cambia, dal ciclo di Kolb all'aperto] [S9].
     Cosa si impara qui:
     1. Al ponte di X una seconda si è chiesta [la domanda scritta nella fonte] e ha scoperto [il fatto scritto nella fonte] [S2].
     2. Si potrebbe [attività della disciplina con i numeri, le date o i nomi del luogo scritti nella fonte] [S3].»
   Livello 3 (BASE CONDIVISA): nessuna UDA adatta e nessun materiale del territorio. Scrivi SOLO «Come vivere l'esperienza:» con da 3 a 5 passi numerati, al condizionale, con tecniche e idee concrete delle fonti di metodo, delle RIELABORAZIONI e del MATERIALE DEL TEAM (con il loro [S…]), adatte alla classe, all'età e alla disciplina della domanda, collegate a un argomento del PROGRAMMA della classe se c'è; luoghi solo generici («un parco vicino alla scuola»). Uno dei passi dice come si chiude il ciclo secondo il ciclo di Kolb all'aperto, con il suo [S…]. Non scrivere «Cosa si impara qui:» e non raccontare esperienze. Non inventare esperienze, luoghi o classi.
   In tutti i livelli le attività devono essere adatte all'età indicata. Sotto i 6 anni (nido e scuola dell'infanzia) NIENTE scrittura e NIENTE lettura, nemmeno «scrivere col dito», lettere, parole scritte, targhe o quaderni: solo esperienze dei sensi (toccare, annusare, ascoltare, guardare), movimento, segni e disegni liberi, gioco e parola detta.
   Ogni dettaglio concreto di un luogo (oggetti, piante, animali, barche, edifici, misure, nomi) deve essere scritto nelle FONTI: niente abbellimenti, niente scenari aggiunti («lungomare», «barche ormeggiate») se le FONTI non li nominano. In dubbio, resta generico («nel luogo scelto»).
   Nei livelli 2 e 3 l'ultimo passo è il rientro: come rielaborare l'esperienza secondo una fonte della base condivisa (di solito il ciclo di Kolb all'aperto: esperienza, osservazione, concetti, nuova prova; oppure il decalogo o una RIELABORAZIONE) e porta il suo [S…]. Solo un passo che usa insieme un luogo del territorio e un'idea della base condivisa può avere due segni, uno per fonte.
   Nel livello 2 nomina solo luoghi scritti nelle FONTI (aule e materiali del territorio), con il loro nome esatto e senza unire due luoghi diversi; per altri posti resta generico («un prato vicino alla scuola»).`;

// Quando la ricerca non trova (quasi) niente: fonti di metodo da passare comunque al modello,
// così può dare idee per il proprio territorio. Pubbliche (con link) e private (documenti del team).
const ANCORE_PUBBLICHE = ["genius loci survey"];
const ANCORE_PRIVATE = ["genius loci survey", "ciclo di Kolb", "decalogo scuole naturali", "mapmaking sense of place", "dirty teaching learning outdoors"];
function unisci(dest, res, max) {
  for (const r of res?.risultati || []) {
    if (dest.risultati.length >= max) break;
    if (!dest.risultati.some(x => x.titolo === r.titolo) && !nascosto(r)) dest.risultati.push(r);
  }
}
export function fontiDiMetodo(ix, ixP, domanda, res, resP) {
  const pub = { risultati: [...(res?.risultati || [])] };
  const pri = { risultati: [...(resP?.risultati || [])] };
  // 1) parole della domanda prese una alla volta (parco, fiume, bosco…), solo se non troppo comuni
  const termini = capisci(domanda).termini.filter(t => t.length > 3);
  for (const t of termini.slice(0, 8)) {
    const raro = i => i && (i.df.get(t) || 0) > 0 && (i.df.get(t) || 0) / i.N < 0.06;
    if (raro(ix)) unisci(pub, cerca(ix, t, { max: 1 }), 3);
    if (ixP && raro(ixP)) unisci(pri, cerca(ixP, t, { max: 1, comunitaMorbida: true }), 3);
  }
  // 2) il metodo della Strada dei Bambini
  for (const q of ANCORE_PUBBLICHE) unisci(pub, cerca(ix, q, { max: 1 }), 4);
  if (ixP) for (const q of ANCORE_PRIVATE) unisci(pri, cerca(ixP, q, { max: 1, comunitaMorbida: true }), 6);
  return { res: pub, resP: ixP ? pri : null };
}

// Domande sul metodo delle mappe (mappe di comunità, genius loci, mappe fondative…) senza una comunità nominata:
// prima UDA vissute che hanno costruito davvero una mappa, poi gli estratti del metodo; via le UDA che non parlano di mappe.
const RE_TEMA_MAPPE = /\bmapp[ae] (di |della |delle )?comunit|\bgenius loci\b|\bmapp[ae] (fondativ|educativ|emozional|sensorial|del paese|del quartiere)/;
const RE_TESTO_MAPPA = /mapp[ae] (di |della )?comunit|mappa del paese|mappa (finale|collettiva|emozionale)/;
export function fontiMappe(ix, ixP, domanda, res, resP) {
  const q = normalizza(domanda), cap = capisci(domanda);
  if (!RE_TEMA_MAPPE.test(q) || cap.comunita) return { res, resP };
  const testo = id => ix.passi.find(p => p.id === id)?.testo || "";
  const pub = { risultati: [] };
  const metti = (r, max) => { if (r && pub.risultati.length < max && !pub.risultati.some(x => x.titolo === r.titolo) && !nascosto(r)) pub.risultati.push(r); };
  // 1) UDA vissute con una mappa costruita dai bambini (prima quelle della classe chiesta)
  const conta = new Map();
  for (const p of ix.passi) if (p.tipo === "uda" && p.stato === "vissuta" && RE_TESTO_MAPPA.test(normalizza(p.testo))) conta.set(p.ref, (conta.get(p.ref) || 0) + 1);
  const refs = [...conta.keys()].map(ref => ({ ref, s: ix.schede.get(ref) })).filter(x => x.s && !nascosto(x.s))
    .sort((a, b) => (cap.classe && b.s.eta?.includes(cap.classe)) - (cap.classe && a.s.eta?.includes(cap.classe)) || conta.get(b.ref) - conta.get(a.ref));
  for (const { ref, s } of refs.slice(0, 2)) metti(cerca(ix, `${s.titolo} mappa`, { max: 5 }).risultati.find(x => x.ref === ref), 2);
  // 2) estratti del metodo Mappe Genius Loci
  for (const r of cerca(ix, "come si fa una mappa di comunità", { max: 6 }).risultati.filter(r => r.tipo === "metodo")) metti(r, 4);
  // 3) il resto della ricerca, solo se parla di mappe
  for (const r of res?.risultati || []) if (r.tipo === "metodo" || (r.passi || []).some(id => /mapp/.test(normalizza(testo(id))))) metti(r, 5);
  let pri = resP;
  if (ixP) {
    pri = { risultati: [] };
    for (const a of ["mappe educative di comunità", "trascrizione lezione mappe di comunità", "mappe fondative"]) unisci(pri, cerca(ixP, a, { max: 1, comunitaMorbida: true }), 3);
    unisci(pri, resP, 4);
  }
  return { res: pub, resP: pri };
}

function etichetta(r) {
  if (r.esperienzaTeam) return `MATERIALE DEL TEAM (esperienza del team a ${r.comunita}, un altro luogo: usala solo come metodo, al passato)`;
  if (r.privato && r.comunita && !r.stato && r.tipo !== "normativa") return `TERRITORIO di ${r.comunita} (knowledge base territoriale: contenuti sul luogo)`;
  if (r.tipo === "uda") return `UDA ${r.stato === "vissuta" ? "VISSUTA" : "PROPOSTA"}`;
  if (r.tipo === "aula") return "AULA";
  if (!r.privato) return "METODO Mappe Genius Loci (estratto)";
  if (r.tipo === "metodo") return "METODO Mappe Genius Loci (testo completo)";
  if (r.tipo === "normativa") return `INDICAZIONI NAZIONALI ${r.versione} (testo ufficiale, ${r.decreto})`;
  if (r.tipo_fonte === "manifesto") return "MANIFESTO della Strada dei Bambini (testo pubblico della home)";
  if (r.tipo_fonte === "libro di testo") return "PROGRAMMA (dai libri di testo, rielaborato)";
  if (r.tipo_fonte === "rielaborato") return "RIELABORAZIONE (sintesi con parole nostre)";
  if (r.tipo_fonte === "letteratura") return "LETTERATURA DI RIFERIMENTO (studio scientifico ad accesso aperto, sintesi con parole nostre)";
  return `MATERIALE DEL TEAM${r.stato === "vissuta" ? " — VISSUTA" : r.stato === "proposta" ? " — PROPOSTA" : ""}`;
}

// «Hood, Baumann (2024)» → «Hood e Baumann (2024)»; tre o più autori → «Kuo e colleghi (2019)».
const cognome = n => { const t = String(n).trim().split(/\s+/); const k = t.findIndex((w, i) => i > 0 && /^(van|von|de|di|da|del|della|le|la)$/i.test(w)); return k > 0 ? t.slice(k).join(" ") : t[t.length - 1]; };
export function citaStudio(autore) {
  const m = String(autore || "").match(/^(.*?)\s*\((\d{4})\)\s*$/); if (!m) return null;
  const c = m[1].split(/,\s*/).filter(Boolean).map(cognome);
  return `${c.length === 1 ? c[0] : c.length === 2 ? `${c[0]} e ${c[1]}` : `${c[0]} e colleghi`} (${m[2]})`;
}
// Controllo lato server sulla letteratura: (1) le frasi che citano uno studio non restano in «Dalle nostre schede:»,
// passano nel paragrafo «Dalla letteratura di riferimento:»; (2) ogni frase su un solo studio porta il nome giusto
// (se nomina l'autore di un altro studio, il nome si corregge; se non nomina nessuno, si aggiunge).
// Titoli delle parti della risposta (ricalcano le UDA: prima il racconto, poi i passi). I vecchi titoli
// («Dalle nostre schede», «Idee…») si riconoscono ancora e diventano quelli nuovi.
export const TITOLI = {
  "il racconto": "Il racconto:", "i passi": "I passi:",
  "un'esperienza che può ispirarti": "Un'esperienza che può ispirarti:", "i passi per il tuo territorio": "I passi per il tuo territorio:",
  "dalla letteratura di riferimento": "Dalla letteratura di riferimento:", "traguardi a cui può concorrere": "Traguardi a cui può concorrere:",
  "come vivere l'esperienza": "Come vivere l'esperienza:", "cosa si impara qui": "Cosa si impara qui:",
};
const ALIAS_TITOLI = { "dalle nostre schede": "il racconto", "idee per il tuo territorio": "i passi per il tuo territorio", "idee generali": "i passi per il tuo territorio" };
export const RE_TITOLO = /^\s*(?:\*\*|#+\s*)?(Il racconto|I passi per il tuo territorio|I passi|Come vivere l['’]esperienza|Cosa si impara qui|Un['’]esperienza che (?:può|puo) ispirarti|Dalla letteratura di riferimento|Traguardi a cui (?:può|puo) concorrere|Dalle nostre schede|Idee per il tuo territorio|Idee generali)(?:\*\*)?\s*(?::\s*(?:\*\*)?\s*|$)/i;
export function chiaveTitolo(t) {
  const k = String(t).toLowerCase().replace(/’/g, "'").replace(/\bpuo\b/g, "può").replace(/\s+/g, " ").trim();
  return ALIAS_TITOLI[k] || k;
}
// parti narrative (con [S…] delle schede) e parte di soli suggerimenti generali (senza [S…])
const PARTI_SCHEDE = new Set(["il racconto", "i passi", "un'esperienza che può ispirarti"]);
const PARTE_GENERALE = "i passi per il tuo territorio";
// risposta a due livelli (territorio e base condivisa): parte pedagogica e parte disciplinare, entrambe a passi numerati
const PARTI_DUE = new Set(["come vivere l'esperienza", "cosa si impara qui"]);
const PARTI_PASSI = new Set(["i passi", PARTE_GENERALE, ...PARTI_DUE]);
const escRe = t => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const codiciSDi = (f, fonti) => [...f.matchAll(/\[S(\d+)\]/g)].map(m => fonti[Number(m[1]) - 1]);
export function separaLetteratura(testo, fonti = [], tuttiStudi = []) {
  const lett = fonti.filter(f => f?.lett && f.cita);
  if (!testo) return testo;
  const codiciS = f => codiciSDi(f, fonti);
  // studi della nostra letteratura NON presenti tra le fonti di questa risposta: se il modello li nomina, la frase si toglie
  const assenti = tuttiStudi.filter(c => !lett.some(l => l.cita === c)).map(c => c.split(/ e |\s\(/)[0]);
  const inventata = f => assenti.some(c => new RegExp(`\\b${escRe(c)}\\b`).test(f)) && !codiciS(f).some(x => x?.lett);
  testo = testo.replace(/CITA COME:\s*/g, "");
  const parti = []; let cur = { tit: null, righe: [] }; parti.push(cur);
  for (const riga of testo.split("\n")) {
    const m = riga.match(RE_TITOLO);
    if (m) { cur = { tit: chiaveTitolo(m[1]), righe: [] }; parti.push(cur); const r = riga.slice(m[0].length); if (r.trim()) cur.righe.push(r); }
    else cur.righe.push(riga);
  }
  // senza letteratura tra le fonti il paragrafo non ha base: si toglie (resta il resto della risposta)
  if (!lett.length) for (const p of parti) if (p.tit === "dalla letteratura di riferimento") p.righe = [];
  const spostate = [];
  for (const p of parti) if (PARTI_SCHEDE.has(p.tit)) p.righe = p.righe.map(r => {
    const frasi = r.split(/(?<=[.!?»)\]])\s+(?=[A-ZÀ-Ý«“"(])/);
    const resta = frasi.filter(f => { if (codiciS(f).some(x => x?.lett) || lett.some(l => new RegExp(`\\b${escRe(l.cita.split(/ e |\s\(/)[0])}\\b`).test(f))) { spostate.push(f.trim()); return false; } return true; });
    return resta.join(" ");
  });
  let pl = parti.find(p => p.tit === "dalla letteratura di riferimento");
  // riga fatta solo del nome di uno studio («Sella e colleghi (2023) [S4]»), come un titoletto: si unisce alla riga
  // che segue («Secondo Sella e colleghi (2023) [S4], …») se questa non nomina già uno studio; altrimenti si toglie.
  // Poi via le righe della letteratura senza nessun segno [S…] né nome di studio: non si saprebbe di chi sono.
  if (pl) {
    pl.righe = pl.righe.map(r => r.replace(/^(\s*[–-]?\s*)CITA COME:\s*/i, "$1"));
    const RE_NOME = /^\s*[–-]?\s*([A-ZÀ-Ý][\p{L}'’-]+(?: e colleghi| e [A-ZÀ-Ý][\p{L}'’-]+)? \(\d{4}\))\s*(\[S\d+\]\s*)*:?\s*$/u;
    const nomeSolo = r => { const m = r.match(RE_NOME); return m && (lett.find(l => l.cita === m[1]) || { cita: m[1] }); };
    const citata = r => /\[S\d+\]/.test(r) || lett.some(l => r.includes(l.cita.split(" (")[0]));
    const righe = [];
    for (let i = 0; i < pl.righe.length; i++) {
      const r = pl.righe[i], l = nomeSolo(r);
      if (!l) { righe.push(r); continue; }
      let j = i + 1; while (j < pl.righe.length && !pl.righe[j].trim()) j++;
      const dopo = pl.righe[j];
      if (dopo && !nomeSolo(dopo) && !citata(dopo) && !RE_TITOLO.test(dopo)) {
        const segni = (r.match(/\[S\d+\]/g) || []).join(" ");
        righe.push(`Secondo ${l.cita}${segni ? " " + segni : ""}, ${dopo.trim().replace(/^\p{Lu}(?!\p{Lu})/u, c => c.toLowerCase())}`);
        i = j;
      }
    }
    pl.righe = righe.filter(r => !r.trim() || citata(r));
  }
  if (spostate.length) {
    if (!pl) { // dopo il racconto e i passi, prima dei traguardi
      pl = { tit: "dalla letteratura di riferimento", righe: [] };
      const k = parti.findLastIndex(p => PARTI_SCHEDE.has(p.tit) || PARTI_PASSI.has(p.tit));
      parti.splice(k >= 0 ? k + 1 : 1, 0, pl);
    }
    const k = pl.righe.findIndex(r => r.trim());
    if (k >= 0) pl.righe[k] = spostate.join(" ") + " " + pl.righe[k]; else pl.righe.unshift(spostate.join(" "));
  }
  if (pl) pl.righe = pl.righe.map(r => r.split(/(?<=[.!?»)\]])\s+(?=[A-ZÀ-Ý«“"(])/).map(f => {
    if (/\[S\d+\]/.test(f) && codiciS(f).every(x => !x)) return ""; // segno [S…] inesistente
    const ls = [...new Set(codiciS(f).filter(x => x?.lett))];
    if (ls.length !== 1) return f;
    const giusto = ls[0];
    for (const altro of lett) if (altro !== giusto) {
      const c0 = escRe(altro.cita.split(/ e |\s\(/)[0]);
      f = f.replace(new RegExp(`\\b${c0}(\\s+(e colleghi|et al\\.?|e\\s+[A-ZÀ-Ý][\\wà-ÿ' ]*?))?(\\s*\\(\\d{4}\\))?(?=[\\s,.;:)]|$)`, "g"), giusto.cita);
    }
    const g0 = giusto.cita.split(/ e |\s\(/)[0];
    if (!new RegExp(`\\b${escRe(g0)}\\b`).test(f)) f = f.replace(/\s*(\[S\d+\])/, ` (${giusto.cita.replace(/ \((\d{4})\)$/, ", $1")}) $1`);
    return f;
  }).join(" "));
  if (assenti.length) for (const p of parti) p.righe = p.righe.map(r => r.split(/(?<=[.!?»)\]])\s+(?=[A-ZÀ-Ý«“"(])/).filter(f => !inventata(f)).join(" "));
  const out = [];
  for (const p of parti) {
    if (p.tit && !p.righe.some(r => r.trim())) continue; // titolo rimasto vuoto
    if (p.tit) { out.push(TITOLI[p.tit] || p.tit); if (out.length > 1 && out[out.length - 2]?.trim()) out.splice(out.length - 1, 0, ""); }
    out.push(...p.righe);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

// gruppi = [{ ix, res, privato }]
export function contesto(...gruppi) {
  if (gruppi.length === 2 && gruppi[0]?.passi && gruppi[1]?.risultati) gruppi = [{ ix: gruppi[0], res: gruppi[1] }]; // firma vecchia (ix, res)
  const fonti = []; const blocchi = []; const testiNorm = {}; const codici = [];
  for (const { ix, res, privato, budget = 8000 } of gruppi) {
    if (!ix || !res) continue;
    let usati = 0;
    for (const r0 of res.risultati) {
      const r = { ...r0, privato: !!privato };
      let ids = [...(r.passi || [])];
      // UDA: i 2 passi trovati migliori, poi «In breve», «L’UDA in sintesi» (quando, dove, chi), «Domanda generativa» e «Per replicare» (il racconto e i passi le ricalcano)
      if (r.tipo === "uda") {
        const sez = ["In breve", "L’UDA in sintesi", "Domanda generativa", "Per replicare"].map(z => ix.passi.find(x => x.ref === r.ref && x.sezione === z)?.id).filter(Boolean);
        ids = [...new Set([...ids.slice(0, 2), ...sez, ...ids.slice(2)])];
      }
      let scelti = ids.slice(0, r.maxPassi || (privato ? 2 : r.tipo === "uda" ? 6 : 3));
      if (r.maxPassi) scelti = scelti.sort((a, b) => ix.passi.findIndex(x => x.id === a) - ix.passi.findIndex(x => x.id === b)); // in ordine di lettura
      for (const id of scelti) {
        const p = ix.passi.find(x => x.id === id); if (!p) continue;
        if (usati + p.testo.length > budget) { if (r.maxPassi) continue; break; }
        usati += p.testo.length;
        if (r.tipo === "normativa") (testiNorm[r.titolo] ||= []).push(p.testo);
        let n = fonti.findIndex(f => f.titolo === r.titolo) + 1;
        if (!n) {
          fonti.push(privato
            ? { n: fonti.length + 1, titolo: r.titolo, autore: r.autore || null, url: p.url || null, stato: r.stato || null, tipo: r.tipo === "normativa" ? "normativa" : "documento", tipo_fonte: r.tipo_fonte || (r.tipo === "metodo" ? "team" : null) }
            : { n: fonti.length + 1, titolo: r.titolo, url: r.url || null, stato: r.stato || null, tipo: r.tipo });
          n = fonti.length;
        }
        const meta = r.tipo === "normativa"
          ? [p.disciplina, p.ordine === p.classe ? p.ordine : p.classe?.replace(/ (\d)$/, " · classe $1")].filter(Boolean).join(" · ")
          : [r.comunita ? `comunità: ${r.comunita}` : "", r.eta?.length ? `fascia d'età: ${r.eta.join(", ")} (la classe precisa è quella scritta nel testo)` : "", r.classi, (r.discipline || []).join(", "), privato && r.autore ? `autore: ${r.autore}` : ""].filter(Boolean).join(" · ");
        let testo = p.testo;
        if (r.tipo === "normativa" && p.sezione_tipo !== "premessa") { // un codice [T…] per ogni traguardo o obiettivo
          testo = p.testo.split("\n").map(l => {
            if (!/^[–-]\s/.test(l) && (l.length < 60 && !/[.;:]$/.test(l))) return l; // titoletto (Orientamento, Paesaggio…)
            codici.push({ testo: l.replace(/^[–-]\s*/, "").trim(), n, versione: p.versione, disciplina: p.disciplina, sezione: p.sezione });
            return `[T${codici.length}] ${l.replace(/^[–-]\s*/, "")}`;
          }).join("\n");
        }
        if (r.tipo_fonte === "letteratura") { fonti[n - 1].lett = true; fonti[n - 1].cita = citaStudio(r.autore); }
        const avviso = r.tipo !== "uda" ? "" : r.stato === "proposta" ? "\nATTENZIONE: PROPOSTA, non ancora fatta con una classe: raccontala come idea («la scheda propone…», al condizionale)."
          : "\nVISSUTA: fatta davvero con una classe; anche se il testo è al presente, raccontala al passato prossimo («hanno camminato», «hanno ascoltato»).";
        blocchi.push(`[S${n}] ${etichetta(r)}${avviso}${r.tipo_fonte === "letteratura" && fonti[n - 1].cita ? `\nCITA COME: ${fonti[n - 1].cita}` : ""} — «${r.titolo}»${meta ? ` (${meta})` : ""}\nSezione: ${p.sezione || ""}${p.voce ? " — VOCE VERIFICATA" : ""}\n${testo}`);
      }
    }
  }
  return { fonti, testo: blocchi.join("\n\n---\n\n"), testiNorm, codici };
}

// «– [T3]» → può concorrere a «testo ufficiale» (Indicazioni 2012, geografia, traguardi al termine della scuola primaria) [S8]
const sezioneBreve = s => String(s || "").replace(/^Traguardi (per lo sviluppo|di sviluppo) dell[ae] competenz[ae]/i, "traguardi")
  .replace(/^Competenze attese/i, "competenze attese").replace(/^Obiettivi specifici di apprendimento/i, "obiettivi specifici")
  .replace(/^Obiettivi di apprendimento/i, "obiettivi").replace(/^Obiettivi specifici/i, "obiettivi specifici").replace(/\s*\(.*$/, "").trim();
export function espandiCodici(testo, codici, fonti = [], domanda = "") {
  const cita = c => `può concorrere a «${c.testo.replace(/[.;]$/, "")}» (Indicazioni ${c.versione}, ${c.disciplina || "indicazioni generali"}, ${sezioneBreve(c.sezione)}) [S${c.n}]`;
  const norm = k => fonti[Number(k) - 1]?.tipo === "normativa";
  const out = []; let parte = "a"; const scelti = [], proposti = [];
  const perVersione = new Set((codici || []).map(c => c.versione)).size > 1 ? 2 : 4; // con una sola versione, fino a 4
  // con almeno 2 discipline davanti, 1 solo codice per disciplina: il modello tende a sceglierne 2 di geografia
  const discCand = new Set((codici || []).map(c => c.disciplina).filter(Boolean));
  const perDisc = discCand.size >= 2 ? 1 : 2;
  for (const riga of testo.split("\n")) {
    const mt = riga.match(RE_TITOLO), kt = mt && chiaveTitolo(mt[1]);
    if (kt === "traguardi a cui può concorrere") { parte = "t"; out.push("Traguardi a cui può concorrere:"); continue; }
    if (kt) parte = kt === PARTE_GENERALE ? "i" : "a"; // racconto, passi della scheda, letteratura: come la vecchia parte (a)
    const ks = [...riga.matchAll(/\[T(\d+)\]/g)].map(m => codici?.[Number(m[1]) - 1]).filter(Boolean);
    if (parte === "t") { // solo codici, al massimo 4 (2 per versione), espansi con il testo ufficiale
      for (const c of ks) if (!proposti.includes(c)) proposti.push(c);
      if (!ks.length && riga.trim() && !/^\s*[–-]/.test(riga)) out.push(riga); // eventuale frase («nessun traguardo adatto…»)
      continue;
    }
    if (ks.length || /\[T\d+\]/.test(riga)) continue; // codici fuori posto: la riga si toglie (niente testi ufficiali riscritti)
    if (parte === "a" && codici?.length && !kt) { // nel racconto e nei passi via le frasi che citano solo le Indicazioni
      const frasi = riga.split(/(?<=[.!?])\s+/).filter(f => { const ss = [...f.matchAll(/\[S(\d+)\]/g)].map(m => m[1]); return !ss.length || !ss.every(norm); });
      out.push(frasi.join(" "));
      continue;
    }
    out.push(riga);
  }
  // Il sito completa in modo deterministico: fino a 3 codici (o tanti quante le discipline) di discipline diverse.
  // Per ogni disciplina che manca si prende il codice più vicino per parole alla domanda e alla risposta; contano anche
  // le parole della domanda e del racconto (torrente, orto → scienze, geografia; mulini, anziani, monumento → storia):
  // una disciplina senza questi segnali entra solo se finora ce n'è una sola.
  // Se la domanda chiedeva i traguardi (ci sono codici) ma il modello ha dimenticato la parte, la aggiungo io allo stesso modo.
  const dimenticata = codici?.some(c => c.disciplina) && !out.includes("Traguardi a cui può concorrere:");
  if (dimenticata) out.push("", "Traguardi a cui può concorrere:");
  const obiettivo = perDisc === 1 ? Math.min(3, discCand.size) : 2;
  const radiciDi = t => new Set(normalizza(t).split(" ").filter(w => w.length > 4).map(w => w.slice(0, 6)));
  const kp = out.findIndex(r => /^I passi/.test(r));
  const racconto = (kp > 0 ? out.slice(0, kp) : []).join(" ");
  const segnali = pesiDiscipline(domanda + " " + racconto);
  // parole-ponte tra l'esperienza all'aperto e il lessico delle Indicazioni (osservare l'ambiente, tracce del passato…)
  const ponte = ["ambiente territorio osservare locale circostante esplorare aperto"];
  if (segnali.scienze) ponte.push("fenomeni naturali viventi piante animali ecosistemi");
  if (segnali.storia) ponte.push("tracce passato segni storiche patrimonio");
  if (segnali.arte) ponte.push("beni artistico culturali opere patrimonio");
  const vicino = radiciDi(domanda + " " + out.join(" ") + " " + ponte.join(" "));
  const rel = c => { const r = radiciDi(c.testo); return [...r].filter(w => vicino.has(w)).length / Math.sqrt(r.size || 1); };
  const quota = c => scelti.filter(x => x.versione === c.versione).length;
  const voto = c => rel(c) + 0.5 * Math.min(segnali[c.disciplina] || 0, 3) - 0.3 * quota(c) - c.testo.length / 600;
  // 1) fra i codici proposti dal modello: per ogni disciplina (nell'ordine in cui compare) il più vicino all'esperienza,
  //    alternando le versioni quando ci sono tutte e due
  for (const d of [...new Set(proposti.map(c => c.disciplina))]) {
    if (scelti.length >= 4) break;
    const cand = proposti.filter(c => c.disciplina === d && quota(c) < perVersione && !scelti.includes(c));
    const gia = scelti.filter(x => x.disciplina === d).length;
    for (let i = gia; i < perDisc && cand.length; i++) {
      const c = cand.sort((a, b) => voto(b) - voto(a)).shift();
      if (quota(c) < perVersione) scelti.push(c);
    }
  }
  // 2) il sito completa fino a 3 codici (o tante quante le discipline) con le discipline che mancano: una disciplina
  //    senza segnali nella domanda o nel racconto entra solo se finora ce n'è una sola
  if ((scelti.length || dimenticata) && scelti.length < obiettivo) {
    while (scelti.length < obiettivo) {
      const presenti = new Set(scelti.map(c => c.disciplina));
      let best = null, bestS = -Infinity;
      for (const c of codici || []) {
        if (scelti.includes(c) || !c.disciplina || presenti.has(c.disciplina) || quota(c) >= perVersione) continue;
        if (!segnali[c.disciplina] && presenti.size >= 2) continue;
        if (rel(c) < 0.3) continue;
        const sc = voto(c);
        if (sc > bestS) { bestS = sc; best = c; }
      }
      if (!best) break;
      scelti.push(best);
    }
  }
  // 3) senza anno scolastico nella domanda ci sono tutte e due le versioni: se ne è uscita una sola, aggiungo il codice
  //    più vicino dell'altra (anche della stessa disciplina, è un altro testo ufficiale)
  const versioniScelte = new Set(scelti.map(c => c.versione));
  if (scelti.length && scelti.length < 4 && perVersione === 2 && versioniScelte.size === 1) {
    const altra = (codici || []).filter(c => c.disciplina && !versioniScelte.has(c.versione) && rel(c) >= 0.3
      && (segnali[c.disciplina] || scelti.some(x => x.disciplina === c.disciplina)))
      .sort((a, b) => voto(b) - 0.5 * scelti.some(x => x.disciplina === b.disciplina) - voto(a) + 0.5 * scelti.some(x => x.disciplina === a.disciplina))[0];
    if (altra) scelti.push(altra);
  }
  // inserisco le righe scelte subito dopo il titolo «Traguardi a cui può concorrere:»
  const k = out.indexOf("Traguardi a cui può concorrere:");
  if (k >= 0) {
    if (scelti.length) out.splice(k + 1, 0, ...scelti.map(c => `– ${cita(c)}.`));
    else if (!out[k + 1]?.trim() || RE_TITOLO.test(out[k + 1])) out.splice(k, 1);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").replace(/^(Dalle nostre schede|Il racconto|Un['’]esperienza che può ispirarti):\s*\n+(?=Traguardi a cui)/, "");
}

// Citazioni delle Indicazioni: il testo tra «…» deve essere identico alla fonte. Se il modello l'ha accorciato
// o ritoccato, lo sostituisco con la frase (o voce) intera del testo ufficiale più vicina; se non c'è, tolgo la riga.
const parolePiane = t => normalizza(t).split(" ").filter(w => w.length > 2);
const piatto = t => String(t).replace(/\s+/g, " ").replace(/[’']/g, "’").trim();
export function verificaCitazioni(testo, fonti, testiNorm) {
  if (!testiNorm || !Object.keys(testiNorm).length) return testo;
  return testo.split("\n").map(riga => {
    const ref = [...riga.matchAll(/\[S(\d+)\]/g)].map(m => fonti[Number(m[1]) - 1]).find(f => f?.tipo === "normativa");
    if (!ref || !riga.includes("«")) return riga;
    const fonte = (testiNorm[ref.titolo] || []).join("\n");
    const candidati = fonte.split("\n").map(l => l.replace(/^[–-]\s*/, "").trim()).filter(l => l.length > 20)
      .flatMap(l => [l, ...l.split(/(?<=[.;])\s+(?=[A-ZÀ-Ý])/)]);
    let ok = true;
    const nuova = riga.replace(/«([^»]+)»/g, (m, q) => {
      if (piatto(fonte).includes(piatto(q).replace(/[.;]$/, ""))) return m;
      const pq = new Set(parolePiane(q)); let best = null, bestF = 0;
      for (const c of candidati) {
        const pc = new Set(parolePiane(c)); const com = [...pq].filter(w => pc.has(w)).length;
        const rec = com / (pq.size || 1), prec = com / (pc.size || 1), f1 = rec + prec ? 2 * rec * prec / (rec + prec) : 0;
        if (rec >= 0.6 && f1 > bestF) { bestF = f1; best = c; }
      }
      if (!best) { ok = false; return m; }
      return `«${best.replace(/[.;]$/, "")}»`;
    });
    return ok ? nuova : null;
  }).filter(r => r !== null).join("\n");
}

// ---------- base privata cifrata ----------
export function decifraCorpus(obj, chiaveB64) {
  const chiave = Buffer.from(String(chiaveB64 || "").trim(), "base64");
  if (chiave.length !== 32 || !obj?.iv || !obj?.dati) return null;
  const buf = Buffer.from(obj.dati, "base64");
  const d = createDecipheriv("aes-256-gcm", chiave, Buffer.from(obj.iv, "base64"));
  d.setAuthTag(buf.subarray(buf.length - 16));
  const chiaro = Buffer.concat([d.update(buf.subarray(0, buf.length - 16)), d.final()]);
  return JSON.parse(inflateSync(chiaro).toString("utf8"));
}

let ixPrivato, ixNormativa, ixLetteratura; // undefined = non ancora provato, null = non disponibile
// Restituisce l'indice dei materiali (team, metodo, manifesto…); quello delle Indicazioni nazionali va in ixNormativa.
// La letteratura di riferimento ha un indice suo (come le Indicazioni): al massimo 2 testi per risposta, senza togliere posto alle schede.
export function indiceDaCifrato(cifrato, chiave) {
  ixNormativa = null; ixLetteratura = null;
  try {
    const corpus = chiave && cifrato ? decifraCorpus(cifrato, chiave) : null;
    const tutti = (corpus?.passi || []).filter(p => p.tipo === "normativa" || !nascosto(p)); // comunità nascoste: fuori dal recupero
    const lett = p => p.tipo_fonte === "letteratura";
    const passi = tutti.filter(p => p.tipo !== "normativa" && !lett(p)), norm = tutti.filter(p => p.tipo === "normativa"), lettere = tutti.filter(lett);
    if (norm.length) ixNormativa = preparaIndice({ passi: norm, schede: [], aule: [] });
    if (lettere.length) ixLetteratura = preparaIndice({ passi: lettere, schede: [], aule: [] });
    return passi.length ? preparaIndice({ passi, schede: [], aule: [] }) : null;
  } catch { return null; } // chiave sbagliata o file alterato: solo indice pubblico
}
export async function indicePrivato() {
  if (ixPrivato === undefined) ixPrivato = indiceDaCifrato(corpusCifrato, env("GENIUS_LOCI_CORPUS_CHIAVE", ""));
  return ixPrivato;
}
export const indiceNormativa = () => ixNormativa || null;
export const indiceLetteratura = () => ixLetteratura || null;
let studiL;
export const studiLetteratura = () => studiL ||= [...new Set((ixLetteratura?.passi || []).map(p => citaStudio(p.autore)).filter(Boolean))];

// ---------- Indicazioni nazionali: solo se la domanda parla di curricolo ----------
const RE_CURRICOLO = /\b(traguard\w*|obiettiv\w* (di apprendimento|specific\w*)|obiettiv\w* (di |della |del |per (la |l )?)?(geografia|storia|scienze|italiano|matematica|arte|musica|tecnologia|inglese|educazione \w+)|competenze attese|indicazioni( nazionali| 20(12|25)| ministerial\w*)|curricol\w*|campi? di esperienza|programmi ministeriali|puo concorrere|concorr\w*)\b/;
export function chiedeCurricolo(domanda) { return RE_CURRICOLO.test(" " + normalizza(domanda) + " "); }
const DISC_NORM = { "educazione motoria": "educazione motoria", motoria: "educazione motoria", "educazione fisica": "educazione motoria", inglese: "inglese", tecnologia: "tecnologia", arte: "arte", musica: "musica",
  italiano: "italiano", storia: "storia", geografia: "geografia", matematica: "matematica", scienze: "scienze" };
// Sceglie i passi ufficiali per disciplina, ordine e classe (testo intero di traguardi/competenze attese e obiettivi).
// Senza una disciplina nominata, per primaria e secondaria si scelgono 2–3 discipline legate all'esperienza:
// parole della domanda, discipline delle schede trovate, e una base da uscita sul territorio (geografia, scienze, storia).
const PRIORI_DISCIPLINE = [
  [/\b(torrent|fium|ruscell|sorgent|acqu|lag[oh]|mare|lagun|bosc|alber|fogli|ort[oi]|giardin|piant|sem[ei]|fior|animal|insett|terr[ae]|suol|rocc|sass|stagion|natur)/, { scienze: 2, geografia: 1 }],
  [/\b(mapp|territor|paesagg|percors|cammin|uscit|quartier|paes[ei]|citta|orient|confin|carta|luog)/, { geografia: 2 }],
  [/\b(stori[ac]|passato|monument|chies|castell|muse[io]|archivi|anzian|nonn[io]|memori|tradizion|mulin|antic|patrimon|toponom|si chiama cosi)/, { storia: 2, arte: 1.5 }],
  [/\b(comunit|toponom|si chiam)/, { storia: 1.5 }],
  [/\b(disegn|dipint|scult|fotograf|artist|immagin|colori)/, { arte: 1.5 }],
  [/\b(gioc|moviment|corp[oi]|equilibri|arramp|corsa|correre)/, { "educazione motoria": 1 }],
  [/\b(raccont|intervist|scriv|scrittur|legg|poesi|fiab|testo|testi)/, { italiano: 1.5 }],
  [/\b(misur|contar|numer|geometr|area|stima|forme)/, { matematica: 1.5 }],
  [/\b(costrui|attrezz|strument|material|ricicl|energi)/, { tecnologia: 1 }],
];
const BASE_USCITA = { geografia: 1, scienze: 1 }; // storia solo se si parla di passato, memoria, mulini, anziani…
// segnali delle discipline nelle parole (domanda, racconto): senza base
export function pesiDiscipline(testo) {
  const q = " " + normalizza(testo) + " ", peso = {};
  for (const [re, pesi] of PRIORI_DISCIPLINE) if (re.test(q)) for (const [d, v] of Object.entries(pesi)) peso[d] = (peso[d] || 0) + v;
  return peso;
}
export function disciplinePertinenti(domanda, disciplineSchede = [], punteggi = new Map()) {
  const q = " " + normalizza(domanda) + " ", peso = {};
  const somma = (d, v) => { if (DISC_NORM[d]) peso[DISC_NORM[d]] = (peso[DISC_NORM[d]] || 0) + v; };
  for (const [d, v] of Object.entries(BASE_USCITA)) somma(d, v);
  for (const [re, pesi] of PRIORI_DISCIPLINE) if (re.test(q)) for (const [d, v] of Object.entries(pesi)) somma(d, v);
  const conta = {};
  for (const d of disciplineSchede) { const k = DISC_NORM[normalizza(d)] || DISC_NORM[d]; if (k) conta[k] = Math.min(1.5, (conta[k] || 0) + 0.5); }
  for (const [d, v] of Object.entries(conta)) somma(d, v);
  const maxP = Math.max(0, ...punteggi.values()) || 1;
  for (const [d, v] of punteggi) if (peso[d] !== undefined) peso[d] += v / maxP; // le parole aiutano solo le discipline già in gioco
  return Object.entries(peso).filter(([, v]) => v >= 1).sort((a, b) => b[1] - a[1]).map(([d]) => d).slice(0, 3);
}
export function cercaNormativa(ixN, domanda, { max = 6, disciplineSchede = [], sempre = null } = {}) {
  // sempre = { discipline, n }: risposta a due livelli con il territorio, i traguardi della disciplina servono anche se non li chiede
  if (!ixN || (!sempre && !chiedeCurricolo(domanda))) return null;
  const cap = capisci(domanda), q = " " + normalizza(domanda) + " ";
  let versioni = /\b2012\b/.test(q) && !/\b2025\b/.test(q) ? ["2012"] : /\b(2025|nuove indicazioni)\b/.test(q) && !/\b2012\b/.test(q) ? ["2025"] : ["2012", "2025"];
  // solo le discipline nominate per intero («geografia», non «storico» per storia) restringono la ricerca
  let disc = [...new Set(Object.keys(DISC_NORM).filter(d => q.includes(" " + d + " ")).map(d => DISC_NORM[d]))];
  if (sempre) {
    if (!disc.length) disc = (sempre.discipline || []).filter(d => Object.values(DISC_NORM).includes(d));
    // anno 2026/27: il 2025 vale per l'infanzia e per la prima, il 2012 per le altre classi
    if (sempre.n) versioni = [sempre.n === 1 ? "2025" : "2012"];
  }
  const ordine = !cap.classe ? null : cap.classe === "infanzia" ? "infanzia" : cap.classe === "secondaria" ? "secondaria" : "primaria";
  const n = { prima: 1, seconda: 2, terza: 3, quarta: 4, quinta: 5, "1a": 1, "2a": 2, "3a": 3, "4a": 4, "5a": 5 }[cap.numeroClasse] || null;
  const classeObiettivi = ordine === "primaria" && n ? (n <= 3 ? "primaria 3" : "primaria 5") : ordine === "secondaria" ? "secondaria 3" : null;
  const termini = cap.termini.filter(t => !/^(traguard|obiettiv|competenz|attes|indicazion|nazional|curricol|concorr|pu|2012|2025)/.test(t));
  const punteggio = p => {
    let s = 0;
    for (const t of termini) { const f = p._tf.get(t); if (f) s += Math.log(1 + ixN.N / ((ixN.df.get(t) || 0) + 1)) * f / (f + 1.2); }
    return s;
  };
  const adatti = ixN.passi.filter(p => ["traguardi", "obiettivi"].includes(p.sezione_tipo)
    && (!disc.length || disc.includes(p.disciplina) || (ordine === "infanzia" && p.campo_esperienza))
    && (!ordine || p.ordine === ordine)
    && (disc.length || ordine === "infanzia" || termini.length));
  if (!adatti.length || (!disc.length && !ordine)) {
    // domanda generale sulle Indicazioni: ricerca semplice anche nelle premesse
    const r = cerca(ixN, domanda, { max: 2, comunitaMorbida: true });
    return r.risultati.length ? r : null;
  }
  const scelti = [];
  const lineaMedia = p => p.testo.length / Math.max(1, p.testo.split("\n").length);
  const ordina = a => a.sort((x, y) => y.s - x.s || lineaMedia(x.p) - lineaMedia(y.p) || x.p.id.localeCompare(y.p.id, "en", { numeric: true }));
  if (!disc.length && ordine && ordine !== "infanzia") {
    // primaria e secondaria senza disciplina nominata: 2–3 discipline pertinenti, per ognuna e per versione
    // il blocco dei traguardi e poi quello degli obiettivi della classe; prima i traguardi di tutte, così il budget taglia gli obiettivi
    const classeTr = ordine === "primaria" ? "primaria 5" : "secondaria 3";
    const punteggi = new Map();
    for (const p of adatti) punteggi.set(p.disciplina, Math.max(punteggi.get(p.disciplina) || 0, punteggio(p)));
    const scelte = disciplinePertinenti(domanda, disciplineSchede, punteggi).filter(d => adatti.some(p => p.disciplina === d));
    const tr = [], ob = [];
    for (const d of scelte) for (const v of versioni) {
      const pv = adatti.filter(p => p.versione === v && p.disciplina === d).map(p => ({ p, s: punteggio(p) }));
      const t = ordina(pv.filter(x => x.p.sezione_tipo === "traguardi" && x.p.classe === classeTr))[0];
      const o = ordina(pv.filter(x => x.p.sezione_tipo === "obiettivi" && (!classeObiettivi || x.p.classe === classeObiettivi)))[0];
      if (t) tr.push(t.p); if (o) ob.push(o.p);
    }
    scelti.push(...tr, ...ob);
  }
  if (!scelti.length) for (const v of versioni) {
    const pv = adatti.filter(p => p.versione === v).map(p => ({ p, s: punteggio(p) }));
    const tr = pv.filter(x => x.p.sezione_tipo === "traguardi" && (!ordine || ordine === "infanzia" || x.p.classe === (ordine === "primaria" ? "primaria 5" : "secondaria 3")));
    const ob = pv.filter(x => x.p.sezione_tipo === "obiettivi" && (!classeObiettivi || x.p.classe === classeObiettivi));
    // a parità di punteggio, all'infanzia prima i campi più legati alle uscite (conoscenza del mondo, corpo e movimento)
    const CAMPI = ["La conoscenza del mondo", "Il corpo e il movimento", "Immagini, suoni, colori", "I discorsi e le parole", "Il sé e l’altro"];
    const rango = p => p.campo_esperienza ? CAMPI.indexOf(p.campo_esperienza) : 0;
    const migliori = a => a.sort((x, y) => y.s - x.s || rango(x.p) - rango(y.p) || x.p.id.localeCompare(y.p.id, "en", { numeric: true }));
    // tutto il blocco dei traguardi (di solito 1–2 passi) e il passo di obiettivi più vicino alla domanda
    scelti.push(...migliori(tr).slice(0, 2).map(x => x.p), ...migliori(ob).slice(0, 1).map(x => x.p));
  }
  const gruppi = new Map();
  for (const p of scelti.slice(0, max * 2)) { // max gruppi «titolo · sezione», ognuno di solito con un passo
    const k = `${p.titolo} · ${p.sezione}`;
    if (!gruppi.has(k)) gruppi.set(k, { tipo: "normativa", titolo: k, versione: p.versione, decreto: p.decreto, autore: p.autore, tipo_fonte: "normativa", passi: [] });
    gruppi.get(k).passi.push(p.id);
  }
  return { risultati: [...gruppi.values()] };
}

// Approfondimento: stessa forma e stesse regole, risposta più lunga (fino a ~450 parole) e un po' più di fonti.
export const RICHIESTA_APPROFONDIMENTO = "APPROFONDIMENTO: chi scrive ha già letto la risposta breve e chiede una versione più lunga e dettagliata. Usa la stessa forma (stessi titoli) e TUTTE le stesse regole, ma fino a 450 parole: un racconto più ricco (da 5 a 8 frasi, con più dettagli presi dalle FONTI, mai inventati; le esperienze VISSUTE sempre al passato prossimo, mai al presente) e da 4 a 7 passi più precisi. Nelle risposte a due livelli («Come vivere l'esperienza:» e «Cosa si impara qui:») scrivi da 3 a 5 passi per parte: nella prima più tecniche concrete della base condivisa; nella seconda le attività, le schede e i dettagli del libro km0 e della sintesi del territorio (misure, materiali, livelli delle schede, domande), sempre con il loro [S…].";
// Modelli che ragionano sempre (Mistral Large 4: reasoning_effort low|medium|high, predefinito high, «none» rifiutato):
// i token del ragionamento contano nei max_tokens e si pagano come uscita. Mandiamo lo sforzo scelto (predefinito «low»
// per Large) e aggiungiamo ai token della risposta un margine per il ragionamento, altrimenti la risposta arriva vuota.
// Per Small 4 e Medium 3.5 senza GENIUS_LOCI_RAGIONAMENTO non si manda nulla (risposta diretta, come finora).
export function ragionamentoDi(modello, scelto = "", extra = 0) {
  const sempre = /large/i.test(modello || "");
  const sforzo = scelto || (sempre ? "low" : "");
  const margine = extra || (!sforzo || sforzo === "none" ? 0 : sforzo === "low" ? 2500 : sforzo === "medium" ? 4000 : 8000);
  return { ragionamento: sforzo, tokenRagionamento: margine };
}
export const maxTokensDi = (cfg, approfondisci) => (approfondisci ? Math.min(cfg.maxTokens * 2, 1600) : cfg.maxTokens) + (cfg.tokenRagionamento || 0) * (approfondisci ? 2 : 1);
export async function chiamaModello(cfg, domanda, ctx, generali = false, approfondisci = false) {
  const utente = `${generali ? "FONTI DI METODO GENERALI (la ricerca non ha trovato schede sul tema preciso della domanda)" : "FONTI"}\n\n${ctx}\n\nDOMANDA\n${domanda}${approfondisci ? `\n\n${RICHIESTA_APPROFONDIMENTO}` : ""}`;
  // le due chiamate partono insieme: con il ragionamento c'è più margine, sempre sotto i 60 s delle Netlify Functions
  const ctrl = AbortSignal.timeout(cfg.timeoutMs || (cfg.ragionamento && cfg.ragionamento !== "none" ? 50000 : approfondisci ? 25000 : 20000));
  const max_tokens = maxTokensDi(cfg, approfondisci);
  if (cfg.provider === "anthropic") {
    const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", signal: ctrl,
      headers: { "content-type": "application/json", "x-api-key": cfg.chiave, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: cfg.modello, max_tokens, temperature: 0.1, system: PROMPT_SISTEMA, messages: [{ role: "user", content: utente }] }) });
    if (!r.ok) throw new Error(`provider ${r.status}`);
    const j = await r.json();
    return (j.content || []).map(c => c.text || "").join("").trim();
  }
  const r = await fetch(`${cfg.baseUrl}/chat/completions`, { method: "POST", signal: ctrl,
    headers: { "content-type": "application/json", authorization: `Bearer ${cfg.chiave}` },
    body: JSON.stringify({ model: cfg.modello, max_tokens, temperature: cfg.temperatura ?? 0.1,
      ...(cfg.ragionamento ? { reasoning_effort: cfg.ragionamento } : {}),
      messages: [{ role: "system", content: PROMPT_SISTEMA }, { role: "user", content: utente }] }) });
  if (!r.ok) throw new Error(`provider ${r.status}`);
  const j = await r.json();
  const c = j.choices?.[0]?.message?.content;
  // con il ragionamento il contenuto è una lista di blocchi (thinking + text): teniamo solo il testo finale
  if (j.choices?.[0]?.finish_reason === "length" && !(Array.isArray(c) ? c.some(b => b.type === "text" && b.text) : c)) throw new Error("provider: token finiti nel ragionamento");
  return (Array.isArray(c) ? c.filter(b => b.type === "text").map(b => b.text || "").join("") : c || "").trim();
}

// [S1, S2] o [S1,S3] → [S1][S2] (il sito collega solo [S1]); nei «I passi per il tuo territorio» i segni restano solo
// sui passi numerati, spostati in fondo (verificaPassi poi ne tiene al massimo uno, se il passo viene davvero da quella fonte).
export function ripulisci(testo) {
  let t = String(testo || "").replace(/\[S(\d+(?:\s*[,;]\s*S?\d+)+)\]/g, (m, g) => g.split(/\s*[,;]\s*/).map(x => `[S${x.replace(/^S/, "")}]`).join(""));
  t = t.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/(^|[\s(«])\*([^*\n]+)\*(?=[\s.,;:!?)»]|$)/gm, "$1$2");
  t = correggiPreposizioni(t.replace(/[\u00ad\u200b-\u200d\u2060\ufeff]/g, "")) // via trattini morbidi e caratteri invisibili
    .replace(/^\s*(-{3,}|\*{3,}|_{3,})\s*$/gm, "") // righe separatrici markdown
    .replace(/^(\d+[.)]\s*)((?:\[S\d+\])+)\s*(.+?)([.;!?]?)$/gm, "$1$3 $2$4") // «1. [S1] Fare…» → «1. Fare… [S1]»
    .replace(/^(\s*)([a-zàèéìòù])/gm, (m, sp, c) => sp + c.toUpperCase()) // riga che comincia minuscola
    .replace(new RegExp(`^(${Object.values(TITOLI).map(escRe).join("|").replace(/'/g, "['’]")})\\s*\\n\\s*\\n`, "gm"), "$1\n") // niente riga vuota dopo un titolo
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\.\s+((?:\[S\d+\])+)(?=\s|$)/g, " $1."); // «frase. [S2]» → «frase [S2].»
  while (/^(\d+[.)] .*)\n\s*\n(?=\d+[.)] )/m.test(t)) t = t.replace(/^(\d+[.)] .*)\n\s*\n(?=\d+[.)] )/gm, "$1\n"); // passi senza righe vuote in mezzo
  let generale = false;
  t = t.split("\n").filter(riga => !/vuoi portare la strada dei bambini|^\s*[–-]?\s*(scrivici a\s*)?info@scuolenaturali\.it\.?\s*$/i.test(riga)).map(riga => {
    const m = riga.match(RE_TITOLO);
    if (m) generale = chiaveTitolo(m[1]) === PARTE_GENERALE || PARTI_DUE.has(chiaveTitolo(m[1]));
    if (!generale || m) return riga;
    if (!/^\s*\d+[.)]\s/.test(riga)) return riga.replace(/\s*\[S\d+\]/g, "");
    return segniInFondo(riga);
  }).join("\n");
  return t.trim();
}

// «1. Fare [S2] una cosa [S3].» → «1. Fare una cosa [S2][S3].»
export function segniInFondo(riga) {
  const segni = [...new Set([...riga.matchAll(/\[S\d+\]/g)].map(x => x[0]))];
  if (!segni.length) return riga;
  const m = riga.replace(/\s*\[S\d+\]/g, "").trimEnd().match(/^(.*?)([.;!?]?)$/);
  return `${m[1]} ${segni.join("")}${m[2]}`;
}

// «A Salento» → «In Salento», «a Puglia» → «in Puglia» (regioni e territori vogliono «in»; le Marche restano a parte)
// i comuni vogliono «a»: «In Valdobbiadene» → «A Valdobbiadene»
const COMUNI_A = ["Valdobbiadene", "Grado", "Fossalon", "Botrugno", "Nociglia", "Supersano", "San Cassiano", "Siracusa", "Druento", "Zenson di Piave", "Volon", "Guia", "Bergamo"];
const TERRITORI_IN = () => ["Salento", ...REGIONI.map(([n]) => n).filter(n => n !== "Marche")].sort((a, b) => b.length - a.length);
export function correggiPreposizioni(t) {
  const alt = TERRITORI_IN().map(escRe).join("|");
  return String(t).replace(new RegExp(`(^|[^\\p{L}’'])([Aa]) (${alt})(?![\\p{L}])`, "gmu"), (m, pre, a, nome) => `${pre}${a === "A" ? "In" : "in"} ${nome}`)
    .replace(new RegExp(`(^|[^\\p{L}’'])([Ii])n (${COMUNI_A.map(escRe).join("|")})(?![\\p{L}])`, "gmu"), (m, pre, i, nome) => `${pre}${i === "I" ? "A" : "a"} ${nome}`);
}

// Passi numerati con [S…] (in «I passi» e in «I passi per il tuo territorio»): il segno resta solo se il passo riprende
// davvero il testo di quella fonte (almeno il 40% delle parole piene si ritrova nella fonte), mai per letteratura e
// Indicazioni nazionali; resta al massimo un segno per passo, quello della fonte più vicina, alla fine del passo.
const radici = t => normalizza(t).split(" ").filter(w => w.length >= 5).map(w => w.slice(0, 5));
const RE_CONDIVISA = /^\[S\d+\] (MATERIALE DEL TEAM(?! — (?:VISSUTA|PROPOSTA))|RIELABORAZIONE|METODO|PROGRAMMA|MANIFESTO)/;
export function verificaPassi(testo, ctxTesto = "") {
  const perFonte = new Map(), testi = new Map(), uda = new Set(), vietate = new Set(), titoliAula = new Map(), condivise = new Set(), territoriali = new Set();
  for (const b of String(ctxTesto).split("\n\n---\n\n")) {
    const m = b.match(/^\[S(\d+)\]/); if (!m) continue;
    if (/^\[S\d+\] UDA /.test(b)) uda.add(m[1]);
    if (/^\[S\d+\] (LETTERATURA DI RIFERIMENTO|INDICAZIONI NAZIONALI)/.test(b)) vietate.add(m[1]);
    if (RE_CONDIVISA.test(b)) condivise.add(m[1]);
    if (/^\[S\d+\] TERRITORIO di /.test(b)) territoriali.add(m[1]);
    const set = perFonte.get(m[1]) || new Set(); for (const r of radici(b)) set.add(r); perFonte.set(m[1], set);
    const tit = /^\[S\d+\] AULA/.test(b) && normalizza((b.match(/— «([^»]+)»/) || [])[1] || "");
    if (tit && tit.length >= 5) titoliAula.set(m[1], tit);
    testi.set(m[1], (testi.get(m[1]) || "") + " " + normalizza(b));
  }
  // fonti citate nel racconto: una domanda «…?» nei passi che viene da un'ALTRA scheda non è di questa esperienza
  const nelRacconto = new Set();
  { let pt = null; for (const r of String(testo || "").split("\n")) { const mt = r.match(RE_TITOLO); if (mt) { pt = chiaveTitolo(mt[1]); continue; } if (pt === "il racconto") for (const x of r.matchAll(/\[S(\d+)\]/g)) nelRacconto.add(x[1]); } }
  const domandaAltrui = riga => [...riga.matchAll(/«([^»]{8,}\?)»/g)].some(([, q]) => {
    const nq = normalizza(q); if (!nq) return false;
    const da = [...testi].filter(([, t]) => t.includes(nq)).map(([n]) => n);
    return da.length > 0 && nelRacconto.size > 0 && !da.some(n => nelRacconto.has(n));
  });
  let parte = null, k = 0;
  return String(testo || "").split("\n").map(riga => {
    const mt = riga.match(RE_TITOLO); if (mt) { parte = chiaveTitolo(mt[1]); k = 0; return riga; }
    if (parte === "i passi" && /^\s*\d+[.)]\s/.test(riga)) {
      if (domandaAltrui(riga)) return null;
      // attività attribuita a un'altra UDA (non quella del racconto): non è un passo di questa esperienza
      const cit = [...riga.matchAll(/\[S(\d+)\]/g)].map(x => x[1]);
      if (cit.length && nelRacconto.size && cit.every(n => uda.has(n) && !nelRacconto.has(n))) return null;
      riga = riga.replace(/^\s*\d+([.)])/, (m, p) => `${++k}${p}`); // rinumero se un passo è saltato
    }
    if (!PARTI_PASSI.has(parte) || !/^\s*\d+[.)]\s/.test(riga) || !/\[S\d+\]/.test(riga)) return riga;
    const parole = [...new Set(radici(riga.replace(/\[S\d+\]/g, "")))];
    let best = null, bestQ = 0;
    for (const [, n] of riga.matchAll(/\[S(\d+)\]/g)) {
      const f = perFonte.get(n); if (!f || vietate.has(n) || !parole.length) continue;
      // un passo che nomina il luogo di un'AULA (Ponte Bianco…) viene da quella fonte
      const q = titoliAula.has(n) && normalizza(riga).includes(titoliAula.get(n)) ? 1 : parole.filter(w => f.has(w)).length / parole.length;
      // fonti pedagogiche della base condivisa (Kolb, decalogo, rielaborazioni): l'idea si riprende con parole nuove, soglia più bassa
      if (q >= (condivise.has(n) || territoriali.has(n) ? 0.25 : 0.4) && q > bestQ) { best = n; bestQ = q; }
    }
    const senza = riga.replace(/\s*\[S\d+\]/g, "").replace(/\s+([.;!?])$/, "$1");
    return best ? segniInFondo(`${senza} [S${best}]`) : senza;
  }).filter(r => r !== null).join("\n");
}

// Letteratura: via le frasi che danno allo studio un luogo che la sua sintesi non nomina («in una scuola del nord Italia…»)
// e il nome dello studio rimasto in coda a una riga («… Sella e colleghi (2023) [S4]»).
let reLuoghi; const RE_LUOGHI_STUDIO = () => reLuoghi ||= new RegExp(`\\b(italia|europa|stati uniti|regno unito|inghilterra|scozia|germania|francia|spagna|scandinavia|danimarca|svezia|norvegia|finlandia|australia|canada|nord|sud|${REGIONI.map(([n]) => normalizza(n)).join("|")})\\b`, "g");
// Racconto ed esperienza: una frase che mette l'esperienza in un luogo (comune, territorio, regione) che le sue fonti non nominano si toglie.
const PARTI_RACCONTO = new Set(["il racconto", "un'esperienza che può ispirarti"]);
let reLuoghiR; const RE_LUOGHI_RACCONTO = () => reLuoghiR ||= new RegExp(`\\b(${[...COMUNI_A, "Salento", "Italia", ...REGIONI.map(([n]) => n)].map(n => escRe(normalizza(n))).join("|")})\\b`, "g");
export function verificaLetteratura(testo, ctxTesto = "") {
  const testi = new Map();
  for (const b of String(ctxTesto).split("\n\n---\n\n")) { const m = b.match(/^\[S(\d+)\]/); if (m) testi.set(m[1], (testi.get(m[1]) || "") + " " + normalizza(b)); }
  let parte = null;
  return String(testo || "").split("\n").map(riga => {
    const mt = riga.match(RE_TITOLO); if (mt) { parte = chiaveTitolo(mt[1]); return riga; }
    const lett = parte === "dalla letteratura di riferimento";
    if (!lett && !PARTI_RACCONTO.has(parte)) return riga;
    if (lett) riga = riga.replace(/(\S.*?[.!?»)])\s+[A-ZÀ-Ý][\p{L}'’ -]+ (e colleghi|e [A-ZÀ-Ý][\p{L}'’-]+) \(\d{4}\)\s*(\[S\d+\])?\s*$/u, "$1");
    const frasi = riga.split(/(?<=[.!?»)\]])\s+(?=[A-ZÀ-Ý«“"(])/);
    const tenute = frasi.filter(f => {
      const cit = [...f.matchAll(/\[S(\d+)\]/g)].map(x => testi.get(x[1])).filter(Boolean);
      if (!cit.length) return true;
      const luoghi = [...normalizza(f.replace(/\[S\d+\]/g, "")).matchAll(lett ? RE_LUOGHI_STUDIO() : RE_LUOGHI_RACCONTO())].map(x => x[1]);
      return luoghi.every(l => cit.some(t => new RegExp(`\\b${l}\\b`).test(t)));
    });
    // nel racconto, se cade la prima frase (dove e chi) il resto resterebbe senza soggetto: via tutto il paragrafo
    if (!lett && frasi[0]?.trim() && tenute[0] !== frasi[0]) return "";
    return tenute.join(" ");
  }).join("\n");
}

// Conteggi giornalieri: si tengono 30 giorni, poi si cancellano (impronte IP e totali).
const GIORNI_CONTEGGI = 30;
export function dataMenoGiorni(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - n);
  return dt.toISOString().slice(0, 10);
}
export function dataDellaChiave(key) {
  const m = String(key).match(/(?:^|\/)(\d{4}-\d{2}-\d{2})(?=\/|$)/);
  return m ? m[1] : null;
}
async function pulisciConteggiVecchi(store, giorno) {
  const marker = `pulizia/${giorno}`;
  if (await store.get(marker, { type: "text" })) return { fatta: false };
  const cutoff = dataMenoGiorni(giorno, GIORNI_CONTEGGI);
  let tolti = 0;
  for (const prefix of ["giorno/", "ip/", "pulizia/", "approfondito/"]) {
    const { blobs } = await store.list({ prefix });
    for (const b of blobs) {
      const d = dataDellaChiave(b.key);
      if (d && d < cutoff) { await store.delete(b.key); tolti++; }
    }
  }
  await store.set(marker, "ok");
  return { fatta: true, cutoff, tolti };
}
async function controllaLimiti(cfg, req, context) {
  const store = getStore({ name: "genius-loci-limiti", consistency: "strong" });
  const giorno = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
  const ip = context?.ip || req.headers.get("x-nf-client-connection-ip") || "sconosciuto";
  const ipHash = createHash("sha256").update(giorno + "|" + ip).digest("hex").slice(0, 24); // niente IP in chiaro
  const kG = `giorno/${giorno}`, kI = `ip/${giorno}/${ipHash}`;
  const [g, i] = await Promise.all([store.get(kG, { type: "json" }), store.get(kI, { type: "json" })]);
  const nG = g?.n || 0, nI = i?.n || 0;
  if (nG >= cfg.limiteGiorno) return { ok: false, motivo: "Per oggi il Genius Loci ha risposto a tutte le domande previste. Riprova domani." };
  if (nI >= cfg.limiteIp) return { ok: false, motivo: "Hai già fatto molte domande oggi. Riprova domani." };
  await Promise.all([store.setJSON(kG, { n: nG + 1 }), store.setJSON(kI, { n: nI + 1 })]);
  // Pulizia una volta al giorno, dopo aver aggiornato i conteggi di oggi (non si toccano).
  try { await pulisciConteggiVecchi(store, giorno); } catch {}
  return { ok: true };
}

// «Approfondisci»: un solo approfondimento per risposta. Ogni risposta con fonti porta un gettone firmato
// (giorno, numero casuale, domanda); il gettone vale fino al giorno dopo e una volta sola (segno in Blobs «approfondito/…»).
const firmaGettone = (cfg, giorno, nonce, domanda) => createHmac("sha256", "genius-loci-approfondisci|" + cfg.chiave)
  .update(`${giorno}|${nonce}|${normalizza(domanda)}`).digest("base64url").slice(0, 32);
export function creaGettone(cfg, domanda, giorno = oggiRoma()) {
  const nonce = randomBytes(9).toString("base64url");
  return `${giorno}.${nonce}.${firmaGettone(cfg, giorno, nonce, domanda)}`;
}
export function verificaGettone(cfg, domanda, gettone, oggi = oggiRoma()) {
  const m = String(gettone || "").match(/^(\d{4}-\d{2}-\d{2})\.([\w-]{12})\.([\w-]{32})$/);
  if (!m || (m[1] !== oggi && m[1] !== dataMenoGiorni(oggi, 1))) return null;
  const atteso = Buffer.from(firmaGettone(cfg, m[1], m[2], domanda)), dato = Buffer.from(m[3]);
  return atteso.length === dato.length && timingSafeEqual(atteso, dato) ? { giorno: m[1], nonce: m[2] } : null;
}
const oggiRoma = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });

let ix = null;
export default async (req, context) => {
  const cfg = configurazione();
  if (req.method === "GET") {
    const giorno = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
    try { await pulisciConteggiVecchi(getStore({ name: "genius-loci-limiti", consistency: "strong" }), giorno); } catch {}
    return json(cfg.pronto ? { abilitato: true, limiteIp: cfg.limiteIp } : { abilitato: false });
  }
  if (req.method !== "POST") return json({ errore: "metodo non ammesso" }, 405);
  if (!cfg.pronto) return json({ abilitato: false, errore: "La risposta scritta non è attiva." }, 503);
  let domanda = "", corpo = {};
  try { corpo = (await req.json()) || {}; domanda = String(corpo.domanda || "").trim().slice(0, 300); } catch {}
  if (domanda.length < 3) return json({ errore: "Domanda vuota." }, 400);
  const approfondisci = corpo.approfondisci === true;
  let segno = null;
  if (approfondisci) { // conta come una domanda nei limiti; una volta sola per risposta
    const g = verificaGettone(cfg, domanda, corpo.gettone);
    if (!g) return json({ errore: "Approfondimento non disponibile per questa risposta: rifai la domanda." }, 400);
    segno = `approfondito/${g.giorno}/${g.nonce}`;
    if (await getStore({ name: "genius-loci-limiti", consistency: "strong" }).get(segno, { type: "text" })) return json({ errore: "Questa risposta è già stata approfondita." }, 409);
  }
  const lim = await controllaLimiti(cfg, req, context);
  if (!lim.ok) return json({ errore: lim.motivo }, 429);
  if (segno) await getStore({ name: "genius-loci-limiti", consistency: "strong" }).set(segno, "1");
  const out = await rispondi(cfg, domanda, { approfondisci });
  if (out.errore) { // il modello non ha risposto: l'approfondimento si può riprovare
    if (segno) try { await getStore({ name: "genius-loci-limiti", consistency: "strong" }).delete(segno); } catch {}
    return json({ errore: out.errore }, out.status || 500);
  }
  if (!approfondisci && out.fonti?.length) out.approfondimento = creaGettone(cfg, domanda);
  return json(out);
};

// Invito a scriverci se la domanda nomina un luogo senza schede recensite.
// Comunità attive e esperienze del team: niente invito. Comunità nascoste: come una città non recensita.
export const EMAIL_CONTATTO = "info@scuolenaturali.it";
const LUOGHI_EXTRA = [
  { nome: "Druento", re: /\b(druento)\b/, attiva: true },
  { nome: "Monte Lerno", re: /\b(monte lerno)\b/, attiva: true },
  { nome: "Via Francigena", re: /\b((via )?francigena)\b/, attiva: true },
];
const REGIONI = [
  ["Valle d'Aosta", "valle d aosta|val d aosta"],
  ["Piemonte", "piemonte"],
  ["Lombardia", "lombardia"],
  ["Liguria", "liguria"],
  ["Veneto", "veneto"],
  ["Trentino-Alto Adige", "trentino alto adige"],
  ["Trentino", "trentino"],
  ["Alto Adige", "alto adige|sudtirolo"],
  ["Friuli-Venezia Giulia", "friuli venezia giulia"],
  ["Friuli", "friuli"],
  ["Emilia-Romagna", "emilia romagna"],
  ["Toscana", "toscana"],
  ["Umbria", "umbria"],
  ["Marche", "marche"],
  ["Lazio", "lazio"],
  ["Abruzzo", "abruzzo"],
  ["Molise", "molise"],
  ["Campania", "campania"],
  ["Puglia", "puglia"],
  ["Basilicata", "basilicata"],
  ["Calabria", "calabria"],
  ["Sicilia", "sicilia"],
  ["Sardegna", "sardegna"],
];
const CITTA = `torino milano genova venezia trieste bologna firenze perugia ancona roma
campobasso napoli bari potenza catanzaro palermo cagliari aosta trento bolzano
verona padova vicenza treviso rovigo belluno udine pordenone gorizia novara
alessandria asti cuneo vercelli biella verbania como varese lecco sondrio bergamo
brescia pavia cremona mantova lodi monza savona imperia pisa livorno lucca siena
arezzo pistoia prato grosseto terni pesaro urbino macerata fermo viterbo rieti
latina frosinone pescara chieti teramo isernia caserta salerno avellino benevento
foggia andria barletta trani taranto brindisi lecce matera cosenza crotone messina
catania trapani agrigento caltanissetta enna ragusa sassari nuoro oristano olbia
parma piacenza ferrara ravenna forli cesena rimini prato empoli viareggio
imola faenza carpi sassuolo fano jesi senigallia foligno spoleto guidonia pomezia
tivoli velletri aprilia civitavecchia acerra casoria afragola pozzuoli portici
ercolano aversa scafati battipaglia nola altamura molfetta bitonto monopoli
ostuni fasano gallipoli nardo casarano maglie otranto trani cerignola sansevero
manfredonia grottaglie manduria moncalieri cinisello
legnano vigevano conegliano montebelluna`.split(/\s+/).filter(Boolean);
const CITTA_COMPOSTE = [
  ["L'Aquila", "all aquila|dell aquila|l aquila"],
  ["La Spezia", "la spezia"],
  ["Reggio Emilia", "reggio emilia"],
  ["Reggio Calabria", "reggio calabria"],
  ["Ascoli Piceno", "ascoli piceno|ascoli"],
  ["Massa Carrara", "massa carrara"],
  ["Vibo Valentia", "vibo valentia"],
  ["Lamezia Terme", "lamezia terme|lamezia"],
  ["Giugliano", "giugliano"],
  ["Torre del Greco", "torre del greco"],
  ["Castellammare di Stabia", "castellammare"],
  ["Cava de' Tirreni", "cava de tirreni"],
  ["Civitanova Marche", "civitanova marche|civitanova"],
  ["Sesto San Giovanni", "sesto san giovanni"],
  ["Busto Arsizio", "busto arsizio"],
  ["San Severo", "san severo"],
  ["Martina Franca", "martina franca"],
  ["Vittorio Veneto", "vittorio veneto"],
  ["Forlì", "forli"],
];
const LUOGO_STOP = new Set(`scuola classe classi primaria secondaria aperta aperto parco parchi fiume fiumi
bosco boschi mare territorio territori paese paesi luogo luoghi quartiere quartieri montagna montagne
campagna citta comune comuni centro chiesa piazza strada aula aule giardino orto valle valli collina
colline lago laghi torrente monti alpi appennini nord sud est ovest zona area regione province provincia
circolo istituto plesso sezione media medie elementare elementari materna asilo universita liceo casa
famiglia natura ambiente aria acqua storia tema argomento esperienza uscite uscita giro gita attivita
seconda terza quarta quinta prima grado anno anni ciclo curricolo programma metodo pedagogia didattica
infanzia mattina pomeriggio serata italia italian europe europa nazionale`.split(/\s+/).filter(Boolean));
const reLista = (voci, flags = "") => new RegExp(`\\b(?:${voci})\\b`, flags);
const REGIONI_RE = REGIONI.map(([nome, alt]) => [nome, reLista(alt)]);
const CITTA_RE = [
  ...CITTA_COMPOSTE.map(([nome, alt]) => [nome, reLista(alt)]),
  ...CITTA.filter(c => !CITTA_COMPOSTE.some(([, alt]) => alt.split("|").includes(c)))
    .sort((a, b) => b.length - a.length)
    .map(nome => [nome.replace(/\b\w/g, c => c.toUpperCase()), reLista(nome)]),
];
const REGIONI_NORM = new Set(REGIONI.map(([n]) => normalizza(n)));

function titoloLuogo(s) {
  const piccoli = new Set(["di", "del", "della", "dei", "de", "da", "e"]);
  return String(s || "").trim().split(/\s+/).filter(Boolean).map((w, i) => {
    const low = w.toLowerCase();
    if (i > 0 && piccoli.has(low)) return low;
    return low.charAt(0).toUpperCase() + low.slice(1);
  }).join(" ");
}

function preposizioneLuogo(nome) {
  const n = normalizza(nome);
  if (n === "aquila" || n === "l aquila") return { prep: "all’", nome: "Aquila" };
  if (n === "marche") return { prep: "nelle ", nome: "Marche" };
  if (REGIONI_NORM.has(n) || n === "salento") return { prep: "in ", nome };
  if (/^[aeiouàèéìòù]/i.test(nome)) return { prep: "ad ", nome };
  return { prep: "a ", nome };
}

function notaLuogo(nome, attiva, nascosta, daElenco) {
  return { nome, attiva: !!attiva, nascosta: !!nascosta, daElenco: !!daElenco };
}

export function luoghiDellaDomanda(domanda) {
  const q = " " + normalizza(domanda) + " ";
  const out = [];
  const visto = new Set();
  const aggiungi = l => { const k = normalizza(l.nome); if (!k || visto.has(k)) return; visto.add(k); out.push(l); };
  for (const c of COMUNITA) {
    if (!c.re.test(q)) continue;
    aggiungi(notaLuogo(c.nome, !NASCOSTE.includes(c.nome), NASCOSTE.includes(c.nome), true));
  }
  for (const c of LUOGHI_EXTRA) {
    if (c.re.test(q)) aggiungi(notaLuogo(c.nome, c.attiva, false, true));
  }
  for (const [nome, re] of REGIONI_RE) if (re.test(q)) aggiungi(notaLuogo(nome, false, false, true));
  for (const [nome, re] of CITTA_RE) if (re.test(q)) aggiungi(notaLuogo(nome, false, false, true));
  // «insegno a / abito a / vivo a» anche per un comune non in elenco, se non è una parola vuota
  const reVerbo = /\b(?:insegno|insegniamo|abito|abita|vivo|viviamo|lavoro|lavoriamo|stiamo|siamo|scrivo|scrive)\s+(?:a|ad|in|da)\s+(?:l['’]|la |il |lo )?(?!un |una |uno )([a-zàèéìòù]+(?:\s+[a-zàèéìòù]+){0,2})\b/g;
  const piana = normalizza(domanda);
  let m;
  while ((m = reVerbo.exec(piana))) {
    const grezzo = m[1].trim();
    if (!grezzo || grezzo.split(" ").every(w => LUOGO_STOP.has(w) || w.length < 4)) continue;
    const pezzi = grezzo.split(" ").filter(w => !LUOGO_STOP.has(w) && w.length >= 3);
    if (!pezzi.length) continue;
    aggiungi(notaLuogo(titoloLuogo(pezzi.join(" ")), false, false, false));
  }
  return out;
}

export function luogoDaInvitare(domanda) {
  const luoghi = luoghiDellaDomanda(domanda);
  if (!luoghi.length || luoghi.some(l => l.attiva)) return null;
  return luoghi.find(l => !l.attiva) || null;
}

export function fraseInvito(luogo) {
  const { prep, nome } = preposizioneLuogo(luogo.nome);
  return `Vuoi portare la Strada dei Bambini ${prep}${nome}? Scrivici a ${EMAIL_CONTATTO}.`;
}

export function aggiungiInvito(risposta, domanda) {
  const luogo = luogoDaInvitare(domanda);
  if (!luogo) return risposta;
  const testo = String(risposta || "").trim();
  if (!testo) return risposta;
  if (/info@scuolenaturali\.it/i.test(testo) || /vuoi portare la strada dei bambini/i.test(testo)) {
    return testo.replace(/info@scuolenaturali\.it\.?\s*$/i, EMAIL_CONTATTO + ".");
  }
  return `${testo}\n\n${fraseInvito(luogo)}`;
}

// ---------- Gerarchia delle fonti (UDA pertinente → territorio → base condivisa) ----------
// 1) un'UDA di riferimento solo se classe/età e disciplina coincidono davvero con la domanda;
// 2) altrimenti, se la domanda nomina una nostra comunità che ha materiali (aule, documenti del luogo), attività da quelli;
// 3) altrimenti attività dalla base condivisa (metodo, rielaborazioni, programma, letteratura), senza esperienze.
const N_PAROLA = { prima: 1, seconda: 2, terza: 3, quarta: 4, quinta: 5, "1a": 1, "2a": 2, "3a": 3, "4a": 4, "5a": 5, i: 1, ii: 2, iii: 3, iv: 4, v: 5 };
const RE_DISCIPLINA = [
  ["matematica", /\b(matematic\w*|geometri\w*|aritmetic\w*|frazion\w*|numeri|calcol\w*|misur\w*|perimetr\w*|tabellin\w*|operazioni|problemi)\b/],
  ["italiano", /\b(italiano|grammatic\w*|ortografi\w*|poesi\w*|scrittura|riflessione linguistica|lessico)\b/],
  ["scienze", /\b(scienz\w*|botanic\w*|biologi\w*|ecosistem\w*)\b/],
  ["storia", /\bstoria\b/],
  ["geografia", /\b(geografi\w*|orientament\w*)\b/],
  ["arte", /\b(arte|artistic\w*)\b/],
  ["musica", /\bmusic\w*\b/],
  ["tecnologia", /\btecnologi\w*\b/],
  ["inglese", /\b(inglese|english)\b/],
  ["educazione motoria", /\b(motori\w*|educazione fisica|psicomotric\w*)\b/],
  ["educazione civica", /\bcivica\b/],
];
const ETICHETTA_N = ["", "prima", "seconda", "terza", "quarta", "quinta"];
// Che cosa chiede la domanda: ordine di scuola, classe (numero) e discipline.
export function richiestaDomanda(domanda) {
  const q = " " + normalizza(domanda) + " ", cap = capisci(domanda);
  let ordine = null, n = null, m;
  if (cap.classe === "secondaria") { ordine = "secondaria"; n = N_PAROLA[cap.numeroClasse] || null; }
  else if (cap.classe === "infanzia") ordine = "infanzia";
  else if (cap.classe) { ordine = "primaria"; n = N_PAROLA[cap.numeroClasse] || null; }
  if (!ordine && (m = q.match(/\b(?:in|una|la|le|mia|nostra|classe|classi) (prima|seconda)\b/))) { ordine = "primaria"; n = N_PAROLA[m[1]]; }
  if (/\b(nido|0 3 anni)\b/.test(q)) { ordine = "nido"; n = null; }
  if (!ordine && (m = q.match(/\b(\d{1,2}|tre|quattro|cinque|sei|sette|otto|nove|dieci|undici|dodici|tredici) anni\b/))) {
    const eta = Number(m[1]) || { tre: 3, quattro: 4, cinque: 5, sei: 6, sette: 7, otto: 8, nove: 9, dieci: 10, undici: 11, dodici: 12, tredici: 13 }[m[1]];
    if (eta <= 2) ordine = "nido"; else if (eta <= 5) ordine = "infanzia";
    else if (eta <= 10) { ordine = "primaria"; n = eta - 5; } else if (eta <= 13) { ordine = "secondaria"; n = eta - 10; }
  }
  const discipline = RE_DISCIPLINA.filter(([, re]) => re.test(q)).map(([d]) => d);
  const classe = ordine === "nido" ? "nido" : ordine === "infanzia" ? "scuola dell'infanzia" : ordine === "secondaria" ? (n ? `${ETICHETTA_N[n]} media` : "secondaria di primo grado")
    : ordine ? (n ? `${ETICHETTA_N[n]} primaria` : "primaria") : null;
  return { ordine, n, discipline, classe, comunita: cap.comunita };
}
// Classi di una scheda: chiavi «P4», «S2», «I» dal codice, dalla riga «Chi:» della sintesi e dal sottotitolo; se non c'è
// una classe precisa, dalla fascia d'età (primaria III-V → P3, P4, P5).
export function classiScheda(ix, s) {
  const precise = new Set();
  const cod = String(s.codice || "");
  let m = cod.match(/-(\d)([PSA])-/) || cod.match(/-PRI(\d)-/);
  if (m) precise.add((m[2] === "S" ? "S" : "P") + m[1]);
  const chi = normalizza((ix.passi.find(x => x.ref === s.ref && x.sezione === "L’UDA in sintesi")?.testo.match(/^Chi:(.*)$/m) || [])[1] || "");
  const testo = " " + chi + " " + normalizza(s.sottotitolo || "") + " ";
  const sec = /\b(secondaria|media|medie)\b/.test(chi);
  for (const mm of testo.matchAll(/\b(?:class[ei] |una |la |le )(prima|seconda|terza|quarta|quinta|i{1,3}|iv|v)\b|\b(prima|seconda|terza|quarta|quinta|i{1,3}|iv|v|[1-5]a) (?:primaria|elementare|secondaria|media|classe)\b/g)) {
    const k = N_PAROLA[mm[1] || mm[2]]; if (k) precise.add((sec ? "S" : "P") + k);
  }
  if (/\binfanzia\b/.test(chi)) precise.add("I");
  if (precise.size) return precise;
  const out = new Set();
  for (const e of s.eta || []) {
    if (e === "infanzia") out.add("I");
    else if (e === "secondaria") ["S1", "S2", "S3"].forEach(x => out.add(x));
    else if (e === "primaria I-II") ["P1", "P2"].forEach(x => out.add(x));
    else if (e === "primaria III-V") ["P3", "P4", "P5"].forEach(x => out.add(x));
  }
  return out;
}
export function udaPertinente(ix, s, req) {
  if (!s) return false;
  if (req.ordine) {
    const c = classiScheda(ix, s), pref = { primaria: "P", secondaria: "S", infanzia: "I", nido: "N" }[req.ordine];
    if (![...c].some(k => k.startsWith(pref) && (!req.n || pref === "I" || k === pref + req.n))) return false;
  }
  return !req.discipline.length || gradoDisciplina(ix, s, req) > 0;
}
// Quanto la disciplina chiesta è davvero della scheda: 2 = principale («(principale)», «(asse portante)»);
// 1 = una delle discipline di una scheda che ne dichiara al massimo 4; 0 = assente, o solo in un elenco interdisciplinare lungo.
const DISC_SCHEDA = d => normalizza(d).replace(/^arte e immagine$/, "arte").replace(/^(motoria|educazione fisica)$/, "educazione motoria");
export function gradoDisciplina(ix, s, req) {
  const riga = (ix.passi.find(x => x.ref === s.ref && x.sezione === "L’UDA in sintesi")?.testo.match(/^Discipline:(.*)$/m) || [])[1] || "";
  const voci = riga.split(/,|·/).map(v => v.trim()).filter(Boolean);
  const princ = voci.filter(v => /\((principale|asse portante)/i.test(v)).map(v => DISC_SCHEDA(v.replace(/\(.*$/, "")));
  const ds = (s.discipline || []).map(DISC_SCHEDA);
  if (req.discipline.some(d => princ.includes(d))) return 2;
  if (ds.length <= 4 && req.discipline.some(d => ds.includes(d))) return 1;
  return 0;
}
// Tra le UDA pertinenti, se qualcuna ha la disciplina come principale restano solo quelle.
export function filtraUda(ix, risultati, req) {
  const ok = risultati.filter(r => r.tipo !== "uda" || udaPertinente(ix, ix.schede.get(r.ref), req));
  if (!req.discipline.length) return ok;
  const top = Math.max(0, ...ok.filter(r => r.tipo === "uda").map(r => gradoDisciplina(ix, ix.schede.get(r.ref), req)));
  return ok.filter(r => r.tipo !== "uda" || gradoDisciplina(ix, ix.schede.get(r.ref), req) >= top);
}
const comunitaDi = r => r.comunita || null;
// Applica la gerarchia ai risultati della ricerca. Restituisce le fonti da passare al modello e il livello scelto.
export function applicaGerarchia(ix, ixP, domanda, res, resP) {
  const req = richiestaDomanda(domanda);
  const vincoli = !!(req.ordine || req.discipline.length);

  // documenti privati legati a un luogo (esperienze del team, lezioni sul territorio): contano come territorio di quel luogo
  const delLuogo = r => !!comunitaDi(r) && r.tipo !== "normativa";
  let pub = vincoli ? filtraUda(ix, res?.risultati || [], req) : [...(res?.risultati || [])];
  // il PROGRAMMA di un'altra classe non serve: resta solo quello della classe chiesta
  const altraClasse = r => req.ordine === "primaria" && req.n && (r.titolo.match(/^Programma della classe (\w+) primaria/) || [])[1] && normalizza(r.titolo.match(/^Programma della classe (\w+)/)[1]) !== ETICHETTA_N[req.n];
  let pri = (resP?.risultati || []).filter(r => !altraClasse(r) && (!delLuogo(r) || !vincoli || (req.comunita && comunitaDi(r) === req.comunita)));
  if (pub.some(r => r.tipo === "uda") || (!vincoli && pri.some(r => delLuogo(r) && r.stato === "vissuta"))) {
    return { res: { ...res, risultati: pub }, resP: resP && { ...resP, risultati: pri }, livello: "uda", req, vincoli };
  }
  // 2) territorio: aule e documenti della comunità nominata
  if (req.comunita) {
    let aule = pub.filter(r => r.tipo === "aula" && r.comunita === req.comunita);
    if (aule.length < 2) for (const r of cerca(ix, `aule ${req.comunita}`, { max: 6 }).risultati)
      if (r.tipo === "aula" && r.comunita === req.comunita && !aule.some(a => a.titolo === r.titolo) && !nascosto(r) && aule.length < 4) aule.push(r);
    // knowledge base territoriale (sintesi del territorio, libro di testo km0, materiali della comunità): cercata con la domanda,
    // poi con disciplina e classe
    let docs = pri.filter(r => comunitaDi(r) === req.comunita);
    const metti = (lista, max) => { for (const r of lista) if (comunitaDi(r) === req.comunita && !docs.some(d => d.titolo === r.titolo) && !nascosto(r) && docs.length < max) docs.push(r); };
    if (ixP) {
      metti(cerca(ixP, domanda, { max: 12, comunitaMorbida: true }).risultati, 3);
      if (docs.length < 2) metti(cerca(ixP, `${req.comunita} ${req.discipline.join(" ")} ${req.n ? ETICHETTA_N[req.n] : ""} territorio luoghi`, { max: 8 }).risultati, 3);
    }
    if (aule.length || docs.length) {
      const testiComunita = [...ix.passi, ...(ixP?.passi || [])].filter(p => p.comunita === req.comunita).map(p => p.titolo + " " + p.testo);
      const vocabolario = new Set(testiComunita.flatMap(radiciPasso));
      const nomiComunita = new Set(testiComunita.flatMap(t => normalizza(t).split(" ")));
      // territorio e base condivisa vanno INSIEME: il territorio dà i contenuti, la base condivisa l'impostazione pedagogica
      // ogni documento del territorio porta fino a 4 passi, scelti con la domanda e i gesti della disciplina (non solo i riquadri «Cosa»)
      if (ixP) {
        const gesti = req.discipline.map(d => GESTI_DISCIPLINA[d] || "").join(" ");
        const mirata = cerca(ixP, `${domanda} ${req.discipline.join(" ")} ${gesti}`, { max: 12, comunitaMorbida: true }).risultati;
        docs = docs.map(d => { const m = mirata.find(x => x.titolo === d.titolo); return { ...d, passi: [...new Set([...(m?.passi || []), ...(d.passi || [])])], maxPassi: 4 }; });
      }
      return { res: { ...res, risultati: [...aule, ...pub.filter(r => r.tipo === "metodo")].slice(0, 5) },
        resP: resP && conProgramma(ixP, domanda, req, { ...resP, risultati: [...docs, ...baseCondivisa(ixP, pri.filter(r => !delLuogo(r) && !altraClasse(r)), domanda, req)] }), livello: "territorio", req, vincoli, vocabolario, nomiComunita };
    }
  }
  // 3) base condivisa: metodo, rielaborazioni, programma (niente UDA, aule né esperienze di un luogo)
  const soloCondivise = (a, b) => {
    const p = { ...(a || {}), risultati: (a?.risultati || []).filter(r => r.tipo === "metodo") };
    const q = b && { ...b, risultati: (b.risultati || []).filter(r => !delLuogo(r) && !altraClasse(r) && r.tipo_fonte !== "letteratura") };
    return [p, q];
  };
  let [p3, q3] = soloCondivise(res, { risultati: pri });
  if (p3.risultati.length + (q3?.risultati.length || 0) < 3) {
    const f = fontiDiMetodo(ix, ixP, domanda, p3, q3);
    [p3, q3] = soloCondivise(f.res, f.resP);
  }
  if (ixP && q3) q3 = { ...q3, risultati: baseCondivisa(ixP, q3.risultati, domanda, req, 6) };
  return { res: p3, resP: ixP ? conProgramma(ixP, domanda, req, q3) : null, livello: "condivisa", req, vincoli };
}
// Base condivisa per tradurre i contenuti in attività: una ricerca MIRATA nella base pedagogica (rielaborazioni di
// PEDAGOGIA E OUTDOOR, materiali del team, metodo) con la domanda e i gesti tipici della disciplina, più il ciclo di Kolb
// all'aperto con le sue sezioni pratiche (le quattro fasi, «Cosa cambia, in pratica»). Niente documenti di un luogo,
// programmi di altre classi, letteratura (ha il suo paragrafo) né «Maturità scolare» fuori dall'infanzia e dalla prima.
const GESTI_DISCIPLINA = {
  matematica: "misurare misura stimare stima passi metro metri figure geometria perimetro area scala rettangolo quadrato angoli poligoni simmetrie coordinate contare calcolare numeri frazioni unità lunghezza",
  geografia: "mappa mappe carta percorso orientarsi bussola punti di riferimento paesaggio confini laguna luoghi speciali volo d'uccello",
  storia: "tracce fonti passato memoria racconto anziani nonni interviste storia storico orale antichi romani medioevo secolo epoca tempo ieri",
  scienze: "osservare sensi esplorare piante animali foglie suolo acqua quaderno della natura lenti tracce viventi alberi uccelli insetti specie materia maree",
  italiano: "racconto poesia parole ascolto leggere ad alta voce narrazione",
  arte: "disegno dal vero materiali naturali colori forme modello",
};
const ANCORA_KOLB = "ciclo di Kolb fasi sentire guardare pensare fare il ciclo si chiude cosa cambia in pratica gita riflessione plastica";
function baseCondivisa(ixP, trovate, domanda = "", req = null, max = 5) {
  const piccoli = req && (req.ordine === "infanzia" || req.ordine === "nido" || req.n === 1);
  // l'età del documento deve comprendere quella della domanda (niente nido e infanzia per la primaria, e viceversa)
  const etaOk = r => !req?.ordine || !r.eta?.length || r.eta.some(e => e.startsWith(req.ordine === "nido" ? "nido" : req.ordine));
  // esperienze del team in luoghi che non sono nostre comunità (Monte Lerno…) valgono come base condivisa
  const altrove = r => r.comunita && r.tipo_fonte === "team" && !COMUNITA_PROMPT.includes(r.comunita) && r.comunita !== req?.comunita;
  const ok = r => (!r.comunita || altrove(r)) && r.tipo_fonte !== "letteratura" && !/^Programma della classe/.test(r.titolo) && (piccoli || !/^Maturità scolare/.test(r.titolo)) && etaOk(r);
  const out = [];
  // al massimo 2 documenti sulle mappe di comunità: il resto deve venire da fonti diverse (Sobel, Barron, König, esperienze del team…)
  const RE_MAPPE = /mapp|genius loci|boundaries/i;
  const metti = r => { if (r && ok(r) && out.length < max - 1 && !out.some(x => x.titolo === r.titolo) && !(RE_MAPPE.test(r.titolo) && out.filter(x => RE_MAPPE.test(x.titolo)).length >= 2)) out.push({ ...r, maxPassi: 2, esperienzaTeam: altrove(r) }); };
  if (ixP) {
    // punteggio semplice per passo (radici in comune con domanda e gesti della disciplina, pesate per rarità): la ricerca
    // generale scarta i documenti che non coprono luogo e classe della domanda, qui servono proprio quelli di metodo
    const gesti = (req?.discipline || []).map(d => GESTI_DISCIPLINA[d] || "").join(" ");
    const q = new Set(radiciPasso(`${domanda} ${gesti}`).filter(w => !comune(w)));
    const df = ixP._dfRadici ||= (() => { const m = new Map(); for (const p of ixP.passi) for (const w of new Set(radiciPasso(p.testo))) m.set(w, (m.get(w) || 0) + 1); return m; })();
    const N = ixP.passi.length, perDoc = new Map();
    for (const p of ixP.passi) {
      if (!ok(p) || /kolb/i.test(p.titolo)) continue;
      const rad = new Set(radiciPasso(p.sezione + " " + p.testo));
      let sc = 0; for (const w of q) if (rad.has(w)) sc += Math.log(N / (df.get(w) || 1));
      if (p.tipo_fonte === "rielaborato" || altrove(p)) sc *= 1.3; // libri di pedagogia e outdoor ed esperienze del team prima delle presentazioni
      if (sc <= 0) continue;
      const d = perDoc.get(p.titolo) || { p, passi: [], s: 0 }; d.passi.push({ id: p.id, sc }); d.s = Math.max(d.s, sc); perDoc.set(p.titolo, d);
    }
    for (const d of [...perDoc.values()].sort((a, b) => b.s - a.s))
      metti({ ...d.p, ref: d.p.ref, titolo: d.p.titolo, autore: d.p.autore, tipo: d.p.tipo, tipo_fonte: d.p.tipo_fonte, comunita: d.p.comunita, passi: d.passi.sort((a, b) => b.sc - a.sc).map(x => x.id) });
  }
  for (const r of trovate) metti(r);
  if (ixP) {
    const k = cerca(ixP, ANCORA_KOLB, { max: 3, comunitaMorbida: true }).risultati.find(r => /kolb/i.test(r.titolo));
    if (k) {
      // tre pezzi: le quattro fasi, l'esempio (UDA «Il mio paese», Botrugno) e «Cosa cambia, in pratica»
      const primo = re => ixP.passi.find(p => p.titolo === k.titolo && re.test(p.sezione || ""))?.id;
      const passi = [primo(/^Il ciclo di Kolb \(/), primo(/^Un esempio/), primo(/^Cosa cambia/)].filter(Boolean);
      out.push({ ...k, passi: passi.length ? passi : k.passi, maxPassi: 3 });
    }
  }
  return out;
}
// Livelli 2 e 3: il PROGRAMMA della classe chiesta (che cosa si studia in quel periodo), se non c'è già.
function conProgramma(ixP, domanda, req, q) {
  if (!ixP || !q || req.ordine !== "primaria" || !req.n || q.risultati.some(r => /^Programma della classe/.test(r.titolo))) return q;
  const r = cerca(ixP, `programma classe ${ETICHETTA_N[req.n]} primaria ${req.discipline.join(" ")}`, { max: 6, comunitaMorbida: true }).risultati
    .find(x => normalizza(x.titolo).startsWith(`programma della classe ${ETICHETTA_N[req.n]} primaria`));
  return r ? { ...q, risultati: [...q.risultati, r] } : q;
}
const elencoDisc = d => d.length > 1 ? d.slice(0, -1).join(", ") + " e " + d.at(-1) : d[0] || "";
const RIGA_PICCOLI = "\nETÀ: sotto i 6 anni — nessuna attività di scrittura o lettura; solo sensi, movimento, segni e disegni liberi, gioco e parola detta.";
export function rigaLivello(g) {
  const r = rigaLivello0(g);
  return g.req && (g.req.ordine === "infanzia" || g.req.ordine === "nido") ? r + RIGA_PICCOLI : r;
}
function rigaLivello0(g) {
  const perChi = [g.req.classe ? `classe: ${g.req.classe}` : "", g.req.discipline.length ? `disciplina: ${elencoDisc(g.req.discipline)}` : ""].filter(Boolean).join("; ");
  if (g.livello === "uda") return "LIVELLO DELLE FONTI: 1 (UDA)" + (g.vincoli ? ` — le UDA tra le FONTI sono adatte alla domanda (${perChi}).` : ".");
  if (g.livello === "territorio") return `LIVELLO DELLE FONTI: 2 (TERRITORIO + BASE CONDIVISA) — nessuna UDA è adatta${perChi ? ` (${perChi})` : ""}: contenuti dai luoghi e dalla knowledge base territoriale di ${g.req.comunita}, impostazione delle attività dalla base condivisa.`;
  return `LIVELLO DELLE FONTI: 3 (BASE CONDIVISA) — nessuna UDA adatta${perChi ? ` (${perChi})` : ""} e nessun materiale del territorio: usa solo metodo, rielaborazioni e programma.`;
}
// Frase scritta dal sito (non dal modello) prima della risposta, quando non c'è un'UDA adatta.
export function notaLivello(g) {
  if (g.livello === "uda" || !g.vincoli) return "";
  const cl = g.req.classe ? (g.req.ordine === "nido" ? "il nido" : g.req.ordine === "infanzia" ? "la scuola dell'infanzia" : `la ${g.req.classe}`) : "";
  const perChi = (cl || "questa domanda") + (g.req.discipline.length ? ` (${elencoDisc(g.req.discipline)})` : "");
  if (g.livello === "territorio") return `Per ${perChi} non c'è ancora un'UDA adatta ${preposizioneLuogo(g.req.comunita).prep}${g.req.comunita}: ecco qualche idea dai luoghi e dalle fonti della comunità, con l'impostazione della Strada dei Bambini.`;
  return `Per ${perChi} non c'è ancora un'UDA adatta né un luogo delle nostre comunità: ecco qualche idea dalla base comune della Strada dei Bambini.`;
}

// ---------- Controlli sui passi dopo la risposta del modello ----------
// (a) nido e infanzia: via i passi con scrittura o lettura; (b) livello territorio: via i passi senza fonte che portano
// dettagli concreti assenti dalle FONTI («barche ormeggiate sul lungomare»); (c) livelli 2 e 3: se nessun passo cita la
// base condivisa, il segno va al passo senza fonte più vicino a una fonte pedagogica (solo se le parole coincidono davvero).
export const RE_SCRITTURA = /\b(scriv\w*|scritt\w*|legg[aeio]\w*|lettur\w*|lettere|alfabet\w*|quadern\w*|copia\w*|annot\w*|etichett\w*|cartellin\w*|didascali\w*|targa)\b/;
const PAROLE_COMUNI = new Set(`bambi ragaz class scuol insie tutti ognun propr ciasc prima dopo duran usand usare fate fatel prova propo chied chiede racco racco parla parli parol disegn fogli color matit pasti pennar osser guard ascol tocca annus sento senti camminat cammi passe uscit uscir tornat torna rient aula grand picco breve sempl quest quell essere avere luogo luogh mappa mappe perco tappa tappe segna segno insegn mostr scegl cerca trova provat potet potre potre dovre sarà sareb momen tempo giorn matti pomer gruppo grupp coppi cerch insie spazio spazi intor vicin lonta sopra sotto dentr fuori forma forme misur conta conti descr posto posti fatto fatti punti punto scala corda metro metri lente lenti bussol zaino zaini schede scheda carta carte cartel lavor attiv esper prepa rifle condi confr discu doman rispo nome nomi`.split(/\s+/));
// parole intere con radice leggera («lungomare» non è «lungo»; «barche» e «barca» sì)
const radiciPasso = t => normalizza(t).split(" ").filter(w => w.length >= 5).map(radice);
const comune = w => PAROLE_COMUNI.has(w.slice(0, 5));
const RE_VERBO = /(ndosi|ndoli|ndole|ndone|are|ere|ire|ate|ete|ite|atevi|etevi|itevi|atene|etene|itene|atelo|atela|ateli|atele|ando|endo|iamo|ato|ata|ati|ute|uto|ito|ita)$/;
// Parole «generiche»: base condivisa (senza comunità) e Indicazioni nazionali. Un dettaglio di luogo che non sta né qui né
// nella knowledge base della comunità (es. «lungomare» a Grado) è sospetto.
let vocGen;
function vocabolarioGenerale() {
  if (vocGen) return vocGen;
  vocGen = new Set();
  for (const p of [...(ixPrivato?.passi || []), ...(ixNormativa?.passi || [])]) if (!p.comunita) for (const w of radiciPasso(p.testo)) vocGen.add(w);
  return vocGen;
}
// Numeri nei passi: ogni numero (cifre o parole da «dieci» in su; 1–3 sono conteggi generici) deve stare nella fonte
// citata dal passo (senza segno: in tutte le FONTI) e, se il passo lo lega a una parola («cento passi», «25 metri»,
// «cinquanta per il lato corto» → «lato»), quella parola deve comparire entro 4 parole dal numero nella fonte.
const NUMERI_PAROLE = { dieci: "10", venti: "20", trenta: "30", quaranta: "40", cinquanta: "50", sessanta: "60", settanta: "70",
  ottanta: "80", novanta: "90", cento: "100", duecento: "200", trecento: "300", cinquecento: "500", mille: "1000" };
const RE_NUMERO = new RegExp(`^(\\d+|${Object.keys(NUMERI_PAROLE).join("|")})$`);
const VUOTE_NUM = new Set(["o", "e", "di", "da", "a", "in", "per", "il", "lo", "la", "i", "gli", "le", "del", "della", "dei", "delle", "circa", "quasi", "oltre", "fino", "ogni", "un", "una", "uno", "piu", "meno", "x"]);
const valoreNum = w => NUMERI_PAROLE[w] || w;
export function numeriInFonte(passo, blocchi) {
  const parole = normalizza(String(passo).replace(/^\s*\d+[.)]\s*/, "").replace(/\[S\d+\]/g, "")).split(" ");
  const citate = [...String(passo).matchAll(/\[S(\d+)\]/g)].map(m => m[1]);
  const fonti = (citate.length ? blocchi.filter(x => citate.includes(x.n)) : blocchi).map(x => normalizza(x.b).split(" "));
  for (let i = 0; i < parole.length; i++) {
    if (!RE_NUMERO.test(parole[i])) continue;
    const v = valoreNum(parole[i]);
    if (/^\d+$/.test(v) && +v <= 3) continue;
    let k = i + 1; while (k < parole.length && (VUOTE_NUM.has(parole[k]) || RE_NUMERO.test(parole[k]))) k++;
    const vicina = k < parole.length && k - i <= 4 ? radice(parole[k]) : null;
    const ok = fonti.some(f => f.some((w, j) => {
      if (valoreNum(w) !== v) return false;
      if (!vicina) return true;
      return f.slice(Math.max(0, j - 4), j + 5).some(x => radice(x) === vicina);
    }));
    if (!ok) return false;
  }
  return true;
}

export function controlliPassi(testo, ctxTesto, g) {
  // nelle due parti i punti elenco («– …») diventano passi numerati, così passano dagli stessi controlli
  let pd = null;
  const righe = String(testo || "").split("\n").map(r => { const mt = r.match(RE_TITOLO); if (mt) { pd = chiaveTitolo(mt[1]); return r; } return PARTI_DUE.has(pd) ? r.replace(/^\s*[–•*-]\s+/, "1. ") : r; });
  const blocchi = String(ctxTesto).split("\n\n---\n\n").map(b => ({ n: (b.match(/^\[S(\d+)\]/) || [])[1], b })).filter(x => x.n);
  const tutte = new Set(blocchi.flatMap(x => radiciPasso(x.b)));
  const nomiCtx = new Set(blocchi.flatMap(x => normalizza(x.b).split(" ")));
  const testoCtx = " " + normalizza(String(ctxTesto)) + " " + [...(g?.nomiComunita || [])].join(" ") + " ";
  for (const w of g?.vocabolario || []) tutte.add(w); // tutta la knowledge base del territorio, non solo i passi scelti
  for (const w of vocabolarioGenerale()) tutte.add(w); // parole della base condivisa e delle Indicazioni: verbi e nomi didattici comuni
  const condivise = blocchi.filter(x => RE_CONDIVISA.test(x.b));
  const piccoli = g?.req && (g.req.ordine === "infanzia" || g.req.ordine === "nido");
  const isPasso = r => /^\s*\d+[.)]\s/.test(r);
  let parte = null; const tolte = []; const inventati = new Set();
  let out = righe.map(r => {
    const mt = r.match(RE_TITOLO); if (mt) { parte = chiaveTitolo(mt[1]); return r; }
    if (!isPasso(r) || !PARTI_PASSI.has(parte)) return r;
    if (piccoli && RE_SCRITTURA.test(normalizza(r))) { tolte.push(r); return null; }
    // numeri e misure («circa 25 metri», «cinquanta per il lato corto») solo se scritti nella fonte citata, accanto alla stessa parola
    if (!numeriInFonte(r, blocchi)) { tolte.push(r); inventati.add(r); return null; }
    if (g?.livello === "territorio") {
      // parole intere del passo assenti da FONTI, knowledge base del territorio e base condivisa; i verbi (fate, sedere,
      // calcolatene…) non contano: resta il dettaglio concreto aggiunto («lungomare»)
      const ignote = [...new Set(normalizza(r.replace(/\[S\d+\]/g, "")).split(" ").filter(w => w.length >= 5))]
        .filter(w => !comune(w) && !tutte.has(radice(w)) && !(RE_VERBO.test(w) && !/mare$/.test(w)));
      if (ignote.length) { tolte.push(r); return null; }
      // nomi propri (Pitagora, «Lungomare Nazario Sauro»…) che non compaiono nelle fonti né nella knowledge base della comunità
      const nomi = [...r.replace(/^\s*\d+[.)]\s*\S+/, "").replace(/\[S\d+\]/g, "").replace(/([.!?:;]\s+|[«“"(]\s*)\p{Lu}/gu, "$1x")
        .matchAll(/\b\p{Lu}[\p{Ll}’']{2,}/gu)].map(m => normalizza(m[0]).replace(/^(l|d|all|dell|sull|nell) /, ""));
      if (nomi.some(n => n && !nomiCtx.has(n) && !g.nomiComunita?.has(n) && !/^(kolb|decalogo|indicazioni)$/.test(n))) { tolte.push(r); return null; }
    }
    return r;
  });
  // non lascio meno di 2 passi: se i controlli ne tolgono troppi, tengo solo quelli senza scrittura per i piccoli
  if (out.filter(r => r !== null && isPasso(r)).length < 2) out = righe.map(r => (inventati.has(r) || (piccoli && isPasso(r) && RE_SCRITTURA.test(normalizza(r)))) ? null : r);
  out = out.filter(r => r !== null);
  // (c) base condivisa citata almeno una volta: (1) passo che nomina Kolb o il decalogo, anche se ha già il segno di un luogo
  // (secondo segno); (2) passo senza segno che ne riprende davvero le parole; (3) altrimenti il sito chiude con il rientro
  // secondo il ciclo di Kolb all'aperto (le quattro fasi scritte nella fonte), al posto dell'ultimo passo se sono già 5.
  if (g && g.livello !== "uda" && condivise.length && out.some(isPasso)) {
    const nCond = new Set(condivise.map(x => x.n));
    const i1 = out.findIndex(r => r && /^Come vivere l['’]esperienza:/.test(r)), i2 = out.findIndex(r => r && /^Cosa si impara qui:/.test(r));
    const inParte1 = i => i1 < 0 || (i > i1 && (i2 < i1 || i < i2)); // a due livelli la base condivisa va citata nella parte pedagogica
    const citata = () => out.some((r, i) => inParte1(i) && isPasso(r) && [...r.matchAll(/\[S(\d+)\]/g)].some(m => nCond.has(m[1])));
    const titolo = c => c.b.split("\n")[0];
    if (!citata()) {
      let best = null;
      out.forEach((r, i) => {
        if (!isPasso(r) || !inParte1(i)) return;
        const nr = normalizza(r), conSegno = /\[S\d+\]/.test(r);
        for (const c of condivise) {
          const nomina = (/kolb/.test(nr) && /kolb/i.test(titolo(c))) || (/decalog/.test(nr) && /decalog/i.test(titolo(c)));
          let q = nomina ? 1 : 0;
          if (!nomina && !conSegno) { const rad = [...new Set(radiciPasso(r))].filter(w => !comune(w)); if (rad.length >= 3) { const f = new Set(radiciPasso(c.b)); q = rad.filter(w => f.has(w)).length / rad.length; } }
          if (q >= 0.5 && (!best || q > best.q)) best = { i, n: c.n, q };
        }
      });
      if (best) out[best.i] = segniInFondo(`${out[best.i].replace(/\s+([.;!?])?$/, "$1")} [S${best.n}]`);
    }
    const kolb = condivise.find(c => /kolb/i.test(titolo(c)));
    if (!citata() && kolb) {
      // nella risposta a due livelli il rientro va nella parte pedagogica («Come vivere l'esperienza»)
      const t1 = out.findIndex(r => r && /^Come vivere l['’]esperienza:/.test(r)), t2 = out.findIndex(r => r && /^Cosa si impara qui:/.test(r));
      const passi = out.map((r, i) => isPasso(r) && (t1 < 0 || (i > t1 && (t2 < t1 || i < t2))) ? i : -1).filter(i => i >= 0);
      if (!passi.length) passi.push(t1);
      const riga = `${passi.length + 1}. Al rientro, chiudete il ciclo: dopo l'esperienza fatta, tornate sui passi per osservare, legate il vissuto a parole e concetti, poi rimettete alla prova l'idea in una nuova uscita [S${kolb.n}].`;
      if (passi.length >= (t1 < 0 ? 5 : 3)) out[passi.at(-1)] = riga; else out.splice(passi.at(-1) + 1, 0, riga);
    }
  }
  // a due livelli: la parte 1 (metodo) cita solo la base condivisa, la parte 2 (contenuti) solo il territorio. Un passo di
  // contenuti finito nella parte 1 va nella parte 2; nella parte 2 un passo fuori dalla disciplina della domanda
  // (le maree per la geometria) si toglie.
  if (g?.livello === "territorio") {
    const nCond = new Set(condivise.map(x => x.n));
    const tit = re => out.findIndex(r => r && re.test(r));
    const i1 = tit(/^Come vivere l['’]esperienza:/), i2 = tit(/^Cosa si impara qui:/);
    const segni = r => [...r.matchAll(/\[S(\d+)\]/g)].map(m => m[1]);
    // parole della disciplina: i gesti tipici, le sezioni di quella disciplina nel libro km0 e le sue Indicazioni,
    // tolte le parole della base condivisa (generiche: «classe», «osservare»…)
    const disc = g.req?.discipline || [];
    const gesti = new Set(radiciPasso(disc.map(d => GESTI_DISCIPLINA[d] || "").join(" ")));
    if (gesti.size) {
      const generiche = new Set(condivise.flatMap(x => radiciPasso(x.b)));
      for (const x of blocchi) {
        const sez = normalizza((x.b.match(/^Sezione: (.*)$/m) || [])[1] || "") + " " + normalizza(x.b.split("\n")[0]);
        if (disc.some(d => sez.includes(normalizza(d).split(" ")[0]))) for (const w of radiciPasso(x.b)) if (!generiche.has(w) && !comune(w)) gesti.add(w);
      }
    }
    if (i1 >= 0 && i2 > i1) {
      const sposta = [];
      for (let i = i1 + 1; i < i2; i++) { const r = out[i]; if (r && isPasso(r) && segni(r).length && segni(r).every(n => !nCond.has(n))) { sposta.push(r); out[i] = null; } }
      if (sposta.length) { let k = i2 + 1; while (k < out.length && !(out[k] && RE_TITOLO.test(out[k]))) k++; while (k > i2 + 1 && !(out[k - 1] && isPasso(out[k - 1]))) k--; out.splice(k, 0, ...sposta); }
      const j2 = tit(/^Cosa si impara qui:/);
      for (let i = j2 + 1; i < out.length; i++) {
        const r = out[i]; if (r == null) continue; if (RE_TITOLO.test(r)) break;
        if (!isPasso(r)) continue;
        if (segni(r).length && segni(r).every(n => nCond.has(n))) { tolte.push(r); out[i] = null; continue; } // metodo nella parte dei contenuti
        if (gesti.size && !radiciPasso(r).some(w => gesti.has(w))) { tolte.push(r); out[i] = null; } // fuori disciplina
      }
    }
  }
  // a due livelli: al massimo 3 passi per parte (il passo che chiude il ciclo resta); nella parte disciplinare del
  // territorio restano solo i passi con una fonte, se almeno uno ce l'ha
  {
    const parteDi = i => { for (let k = i; k >= 0; k--) { const mt = out[k]?.match(RE_TITOLO); if (mt) return chiaveTitolo(mt[1]); } return null; };
    const p2 = out.map((r, i) => r && isPasso(r) && parteDi(i) === "cosa si impara qui" ? i : -1).filter(i => i >= 0);
    const p2conFonte = p2.some(i => /\[S\d+\]/.test(out[i]));
    const conta = {};
    out = out.filter((r, i) => {
      if (r == null || !isPasso(r)) return true;
      const pt = parteDi(i); if (!PARTI_DUE.has(pt)) return true;
      if (pt === "cosa si impara qui" && g?.livello === "territorio" && p2conFonte && !/\[S\d+\]/.test(r)) { tolte.push(r); return false; }
      conta[pt] = (conta[pt] || 0) + 1;
      if (conta[pt] > 3 && !(pt === "come vivere l'esperienza" && /kolb|ciclo/i.test(r))) { tolte.push(r); return false; }
      return true;
    });
  }
  // rinumero i passi
  let k = 0; parte = null;
  out = out.map(r => { if (RE_TITOLO.test(r)) { k = 0; return r; } return isPasso(r) ? r.replace(/^\s*\d+([.)])/, (m, p) => `${++k}${p}`) : r; });
  return out.join("\n");
}

// Risposta a due livelli: al massimo 220 parole (450 nell'approfondimento), traguardi e segni esclusi. Se il modello sfora,
// tolgo l'ultimo passo della parte più lunga, lasciando almeno 2 passi per parte e il passo che chiude il ciclo.
export function tagliaParole(testo, max = 220) {
  let righe = String(testo || "").split("\n");
  const parole = () => righe.join("\n").split(/^Traguardi a cui può concorrere:$/m)[0].replace(/\[S\d+\]/g, "").split(/\s+/).filter(w => /[\p{L}\d]/u.test(w)).length;
  for (let giro = 0; giro < 6 && parole() > max; giro++) {
    const parti = {}; let pt = null;
    righe.forEach((r, i) => { const mt = r.match(RE_TITOLO); if (mt) { pt = chiaveTitolo(mt[1]); return; } if (/^\s*\d+[.)]\s/.test(r) && PARTI_DUE.has(pt)) (parti[pt] ||= []).push(i); });
    const cand = Object.values(parti).filter(a => a.length > 2).sort((a, b) => b.length - a.length)[0];
    if (!cand) break;
    const via = [...cand].reverse().find(i => !/kolb|ciclo/i.test(righe[i]));
    if (via == null) break;
    righe.splice(via, 1);
  }
  let k = 0; return righe.map(r => RE_TITOLO.test(r) ? (k = 0, r) : /^\s*\d+[.)]\s/.test(r) ? r.replace(/^\s*\d+([.)])/, (m, p) => `${++k}${p}`) : r).join("\n");
}

// Livello 3 (base condivisa): senza materiale del territorio la parte disciplinare non c'è; tolgo «Cosa si impara qui:»
// (con i suoi traguardi) se il modello l'ha scritta lo stesso.
export function soloParti(testo, g) {
  if (g?.livello !== "condivisa") return testo;
  let via = false;
  return String(testo || "").split("\n").filter(r => {
    const mt = r.match(RE_TITOLO); if (mt) via = ["cosa si impara qui", "traguardi a cui può concorrere"].includes(chiaveTitolo(mt[1]));
    return !via;
  }).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

// Separata dal gestore (niente limiti né Blobs) per poterla provare in locale.
export async function rispondi(cfg, domanda, { approfondisci = false } = {}) {
  ix = ix || preparaIndice(dati);
  const piu = approfondisci ? 1.5 : 1; // approfondimento: un po' più di passi delle schede
  const maxPub = approfondisci ? 6 : 5;
  // pool più largo: le UDA di un'altra classe o disciplina si tolgono dopo (gerarchia delle fonti)
  let res = cerca(ix, domanda, { max: 12 });
  res.risultati = res.risultati.filter(r => !nascosto(r));
  { const req = richiestaDomanda(domanda); if (req.ordine || req.discipline.length) res.risultati = filtraUda(ix, res.risultati, req); }
  res.risultati = res.risultati.slice(0, maxPub);
  const ixP = await indicePrivato();
  let resP = ixP ? cerca(ixP, domanda, { max: approfondisci ? 5 : 4, comunitaMorbida: true }) : null;
  if (resP) resP.risultati = resP.risultati.filter(r => !nascosto(r));
  // Poche schede trovate: aggiungo fonti di metodo, il modello darà idee generali (o declinerà se fuori tema).
  const trovati = res.risultati.length + (resP?.risultati.length || 0);
  const generali = trovati === 0;
  if (trovati < 3) ({ res, resP } = fontiDiMetodo(ix, ixP, domanda, res, resP));
  ({ res, resP } = fontiMappe(ix, ixP, domanda, res, resP));
  const gerarchia = applicaGerarchia(ix, ixP, domanda, res, resP);
  ({ res, resP } = gerarchia);
  // approfondimento: dal territorio (libro km0, sintesi) più passi, per le schede e i dettagli
  if (approfondisci && resP) resP = { ...resP, risultati: resP.risultati.map(r => r.maxPassi === 4 ? { ...r, maxPassi: 7 } : r) };
  if (!res.risultati.length && !resP?.risultati.length) {
    return { risposta: aggiungiInvito("Non lo so: nelle schede del sito non ho trovato niente su questo. Prova a nominare un luogo, una classe o un tema.", domanda), fonti: [] };
  }
  // Indicazioni nazionali: dopo le schede, con un budget loro (solo se la domanda parla di curricolo)
  const ixN = indiceNormativa(), resN = cercaNormativa(ixN, domanda, { disciplineSchede: [...res.risultati, ...(resP?.risultati || [])].slice(0, 4).flatMap(r => r.discipline || []),
    sempre: gerarchia.livello === "territorio" && gerarchia.req?.discipline?.length ? { discipline: gerarchia.req.discipline, n: gerarchia.req.n } : null });
  // Letteratura di riferimento: fino a 2 testi pertinenti, dopo le schede e prima delle Indicazioni
  const ixL = indiceLetteratura();
  const resL = ixL && capisci(domanda).termini.length >= 2 ? cerca(ixL, domanda, { max: 2, comunitaMorbida: true }) : null;
  if (resL) resL.risultati = resL.risultati.filter(r => !nascosto(r));
  const conL = !!resL?.risultati.length;
  const ctx = contesto({ ix, res, budget: (resP?.risultati.length ? 8000 : 13000) * piu }, { ix: ixP, res: resP, privato: true, budget: (gerarchia.livello === "territorio" ? 14000 : gerarchia.livello === "condivisa" ? 11000 : 5500) * piu },
    { ix: ixL, res: conL ? resL : null, privato: true, budget: 3500 }, { ix: ixN, res: resN, privato: true, budget: 9000 });
  try {
    // risposta a due livelli: al modello l'elenco dei luoghi del territorio tra le FONTI, per la parte «Cosa si impara qui:»
    const luoghi = gerarchia.livello === "territorio" ? ctx.fonti.filter(f => f.tipo === "aula" || /^TERRITORIO|knowledge base territoriale|Libro di testo km0/i.test(f.titolo || "")).map(f => `${f.titolo} [S${f.n}]`) : [];
    const rigaLuoghi = luoghi.length ? `\nLUOGHI E CONTENUTI DEL TERRITORIO TRA LE FONTI (per «Cosa si impara qui:»): ${luoghi.join("; ")}.` : "";
    let grezza;
    if (gerarchia.livello === "territorio") {
      // risposta a due livelli: due chiamate in parallelo, così il metodo e i contenuti restano separati davvero.
      // 1) «Come vivere l'esperienza:» con le sole fonti della base condivisa; 2) «Cosa si impara qui:» e il traguardo
      // con le fonti del territorio e le Indicazioni. I numeri [S…] sono quelli di tutte le FONTI, quindi si possono unire.
      const blocchi = ctx.testo.split("\n\n---\n\n");
      const cond = blocchi.filter(b => RE_CONDIVISA.test(b)), terr = blocchi.filter(b => !RE_CONDIVISA.test(b) && !/^\[S\d+\] LETTERATURA/.test(b));
      const parole = approfondisci ? 210 : 100;
      const p1 = `PARTE DA SCRIVERE: SOLO il titolo «Come vivere l'esperienza:» e ${approfondisci ? "da 4 a 5" : "3"} passi (regola 16, livello 2), in tutto circa ${parole} parole (non meno di ${parole - 25}): ogni passo con un gesto, una tecnica, un materiale o una domanda guida precisi presi dalle FONTI. Non scrivere «Cosa si impara qui:» né traguardi: quella parte la scrive un altro, con le fonti del luogo. Qui sotto ci sono SOLO le fonti della base condivisa: niente luoghi della domanda, niente contenuti della disciplina.`;
      const p2 = `PARTE DA SCRIVERE: SOLO il titolo «Cosa si impara qui:» con ${approfondisci ? "da 4 a 5" : "3"} passi (regola 16, livello 2), in tutto circa ${parole + 10} parole (non meno di ${parole - 15}), ognuno con i nomi, i numeri, le date o le storie del luogo scritti nelle FONTI${approfondisci ? " (anche le schede e le attività pronte del libro km0, con i loro livelli e materiali)" : ""}, e poi la riga «Traguardi a cui può concorrere:» con UN solo codice «– [T…]». Non scrivere «Come vivere l'esperienza:»: il metodo lo scrive un altro. Ogni passo riguarda la disciplina della domanda.`;
      const [g1, g2] = await Promise.all([
        chiamaModello(cfg, domanda, `${rigaLivello(gerarchia)}\n${p1}\n\n${cond.join("\n\n---\n\n").slice(0, 14000)}`, generali, approfondisci),
        chiamaModello(cfg, domanda, `${rigaLivello(gerarchia)}${rigaLuoghi}\n${p2}\n\n${terr.join("\n\n---\n\n").slice(0, 20000 + (approfondisci ? 8000 : 0))}`, generali, approfondisci),
      ]);
      grezza = `${g1}\n\n${g2}`;
    } else grezza = await chiamaModello(cfg, domanda, rigaLivello(gerarchia) + rigaLuoghi + "\n\n" + ctx.testo.slice(0, (resN ? 30000 : gerarchia.livello === "uda" ? 15000 : 24000) + (conL ? 4000 : 0) + (approfondisci ? 8000 : 0)), generali, approfondisci);
    let risposta = aggiungiInvito(verificaCitazioni(separaLetteratura(espandiCodici(verificaLetteratura(controlliPassi(verificaPassi(soloParti(ripulisci(grezza), gerarchia), ctx.testo), ctx.testo, gerarchia), ctx.testo), ctx.codici, ctx.fonti, domanda), ctx.fonti, studiLetteratura()), ctx.fonti, ctx.testiNorm), domanda);
    // risposta di rifiuto (fuori tema): niente fonti mostrate
    let fonti = /\[S\d+\]/.test(risposta || "") ? ctx.fonti : [];
    if (risposta) risposta = risposta.replace(/^((?:Come vivere l['’]esperienza|Cosa si impara qui):)\n\s*\n/gm, "$1\n").replace(/^(\d+[.)] .*)\n\s*\n(?=\d+[.)] )/gm, "$1\n");
    if (risposta && /^(Come vivere l['’]esperienza|Cosa si impara qui):$/m.test(risposta)) risposta = tagliaParole(risposta, approfondisci ? 450 : 220);
    // risposta a due livelli: un solo traguardo, il primo scelto
    if (risposta && /^(Come vivere l['’]esperienza|Cosa si impara qui):$/m.test(risposta)) { let k = 0; risposta = risposta.split("\n").filter(r => !/^– può concorrere a /.test(r) || ++k === 1).join("\n"); }
    // livello territorio: le attività sono nella nostra comunità, il titolo è «I passi:»
    if (gerarchia.livello === "territorio" && risposta) risposta = risposta.replace(/^I passi per il tuo territorio:$/m, "I passi:");
    // la frase del sito va su ogni risposta con passi (non sui rifiuti fuori tema)
    const nota = /^\s*\d+[.)]\s/m.test(risposta || "") ? notaLivello(gerarchia) : "";
    return { risposta: risposta ? (nota ? `${nota}\n\n${risposta}` : risposta) : aggiungiInvito("Non lo so.", domanda), fonti, livello: gerarchia.livello };
  } catch (e) {
    return { errore: "Il servizio di risposta scritta non ha risposto.", status: 502 };
  }
}

export const config = { path: "/api/genius-loci" };
