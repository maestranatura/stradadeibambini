// «Parla con il Genius Loci» · FASE 2 (LLM) — DISATTIVATA finché non si impostano le variabili d'ambiente.
//
// GET  /api/genius-loci  → { abilitato: false }  (oppure true, con i limiti)  — il frontend usa l'LLM solo se true
// POST /api/genius-loci  { domanda }  → { risposta, fonti:[{n,titolo,url,stato,tipo}] }
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
//
// Variabili d'ambiente (solo nomi; i valori si mettono nel pannello Netlify, mai nel codice):
//   GENIUS_LOCI_ABILITATO          "true" per accendere (qualsiasi altro valore = spento)
//   GENIUS_LOCI_PROVIDER           "openai-compatibile" (OpenAI, Gemini, Mistral, Groq, OpenRouter…) | "anthropic"
//   GENIUS_LOCI_API_KEY            chiave del provider scelto
//   GENIUS_LOCI_MODELLO            nome del modello (predefinito mistral-small-2603, Mistral Small 4)
//   GENIUS_LOCI_BASE_URL           solo per openai-compatibile: base dell'API (predefinito https://api.mistral.ai/v1)
//   GENIUS_LOCI_MAX_TOKENS         token massimi di risposta (predefinito 700)
//   GENIUS_LOCI_LIMITE_GIORNALIERO domande al giorno su tutto il sito (predefinito 200)
//   GENIUS_LOCI_LIMITE_IP          domande al giorno per indirizzo IP (predefinito 15)
//   GENIUS_LOCI_PASSI              quanti passi passare al modello (predefinito 8)
//   GENIUS_LOCI_CORPUS_CHIAVE      chiave (base64, 32 byte) per decifrare la base privata; senza, solo indice pubblico
import { getStore } from "@netlify/blobs";
import { createHash, createDecipheriv } from "node:crypto";
import { inflateSync } from "node:zlib";
import dati from "../../genius-loci/indice.json" with { type: "json" };
import corpusCifrato from "../genius-loci-dati/corpus.cifrato.json" with { type: "json" };
import NASCOSTE from "../../genius-loci/comunita-nascoste.json" with { type: "json" };
import { preparaIndice, cerca, capisci, normalizza, COMUNITA } from "../../genius-loci/cerca.mjs";

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
    limiteGiorno: num("GENIUS_LOCI_LIMITE_GIORNALIERO", 200),
    limiteIp: num("GENIUS_LOCI_LIMITE_IP", 15),
    passi: Math.min(num("GENIUS_LOCI_PASSI", 8), 12),
  };
  cfg.pronto = cfg.acceso && !!cfg.chiave && !!cfg.modello && (provider === "anthropic" || (provider === "openai-compatibile" && !!cfg.baseUrl));
  return cfg;
}

// Comunità citate nel prompt: quelle nascoste si tolgono da sole (svuotare comunita-nascoste.json per riattivarle).
const COMUNITA_PROMPT = ["Valdobbiadene", "Salento", "Druento", "Siracusa"].filter(c => !NASCOSTE.includes(c));
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
Se la domanda è fuori da questi temi (ricette, attualità, sport, compiti o argomenti generici…), declina con gentilezza in una o due frasi, senza rispondere nel merito e senza le due parti qui sotto, e ricorda su cosa puoi aiutare. Non citare fonti in quel caso.

Regole che non puoi mai violare:
1. Tieni separate due cose, sempre in questo ordine.
   (a) «Dalle nostre schede:» — un paragrafo con ciò che dicono le FONTI; ogni frase porta subito dopo il segno [S1], [S2]… della scheda da cui viene.
   (b) «Idee per il tuo territorio:» (oppure «Idee generali:» se non si parla di un luogo preciso) — i tuoi suggerimenti generali, al massimo 4 righe che iniziano con «– ». In questa parte NON scrivere MAI [S…] e non nominare le nostre schede: è conoscenza generale, non viene dalle fonti.
   Metti la parte (b) solo se chi scrive chiede come fare, cosa fare o insegna altrove; per una domanda su una nostra esperienza basta la parte (a). Non attribuire mai alle FONTI ciò che non c'è scritto.
2. Sulle nostre comunità, scuole ed esperienze usa SOLO le FONTI: non inventare MAI docenti, date, nomi di scuole, prodotti, risultati o fatti attribuiti a loro. Se un dato nelle fonti è incerto o «da completare», dillo.
3. Non inventare fatti specifici su luoghi che non conosci (nomi di parchi, fiumi, monumenti, associazioni, storia locale). Suggerisci invece COSA cercare o osservare: il torrente o il parco vicino alla scuola, un custode o un anziano del paese, l'archivio del comune, la biblioteca, il museo locale, le mappe storiche.
4. Non inventare MAI parole dei bambini. Puoi riportare una frase dei bambini solo se nella fonte è marcata «VOCE VERIFICATA», tra «caporali», identica, con la sua citazione. Non parafrasarla come se l'avessero detta. Se ti chiedono che cosa hanno detto i bambini e non ci sono voci verificate, dillo chiaramente, senza citare fonti per questa frase. Nelle idee non scrivere frasi tra virgolette messe in bocca a bambini o persone.
5. Distingui sempre: «vissuta» = esperienza fatta davvero con una classe; «proposta» = idea ancora da provare. Non scrivere mai che una proposta «è stata fatta» o che «i bambini hanno scoperto».
6. Se la domanda chiede un fatto preciso sulle nostre comunità e le fonti non lo contengono, dillo («Non lo so: nelle schede del sito non c'è») e suggerisci come riformulare la domanda (un luogo, una classe, un tema). Se le fonti sono parziali, dillo.
7. Non descrivere né identificare bambini. Niente dati personali.
8. Al massimo 220 parole. Testo semplice, senza markdown: niente asterischi, grassetti o titoli con #. Chiudi, se serve, con una riga che rimanda alle schede citate.
9. Ogni fonte ha un'etichetta. «UDA», «AULA» e «METODO (estratto)» sono pagine del sito. «MATERIALE DEL TEAM», «METODO (testo completo)», «RIELABORAZIONE» e «PROGRAMMA» sono documenti interni: citali con [S1]… come le altre, nominando titolo e autore se serve, ma senza link e senza inventare indirizzi.
10. «PROGRAMMA» dice che cosa si studia in una classe e in quale periodo dell'anno: usalo per collegare aule e UDA al curricolo, ma non è un'esperienza fatta. Gli «Agganci» del programma sono proposte.
11. Le «RIELABORAZIONI» riassumono opere di altri autori: riporta le idee con parole tue e indica l'opera; mai citazioni lunghe, esercizi o attività copiate. Anche dalle altre fonti non copiare brani lunghi.
12. Se le FONTI sono marcate «FONTI DI METODO GENERALI», la ricerca non ha trovato schede sul tema preciso: usale solo come ispirazione per il metodo, senza dire che parlano del luogo o della classe della domanda.
13. «INDICAZIONI NAZIONALI 2012» e «INDICAZIONI NAZIONALI 2025» sono i testi ufficiali del Ministero (nel 2025 i traguardi si chiamano «competenze attese»); ogni traguardo o obiettivo ha un codice [T1], [T2]… Se la domanda chiede traguardi, obiettivi o collegamenti al curricolo, dopo la parte (a) e prima delle idee scrivi la riga «Traguardi a cui può concorrere:» e sotto da 2 a 4 righe fatte SOLO di «– » e di un codice, per esempio «– [T3]»: il testo ufficiale parola per parola, la versione, la disciplina e la classe li aggiunge il sito. Scegli i codici più legati all'esperienza della domanda. Non riscrivere mai di tua mano il testo di un traguardo, non inventarne, e nella parte (a) non usare le fonti INDICAZIONI NAZIONALI. Se nessun codice è adatto, dillo. Quale versione vale: fino al 2025/26 il 2012 per tutti; nel 2026/27 il 2025 per tutta l'infanzia e per le classi prime di primaria e secondaria di primo grado, il 2012 per le altre classi; poi il 2025 sale di una classe all'anno (il 2012 vale per l'ultima volta nel 2027/28 nella secondaria e nel 2029/30 nella primaria); nel 2027/28 la terza primaria usa già il 2025 per la sola storia. Se la domanda non dice anno scolastico e classe, scegli codici di entrambe le versioni e dillo in una frase.
14. Il «MANIFESTO della Strada dei Bambini» è il testo pubblico della home: citalo con [S…] come le altre fonti.`;

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

function etichetta(r) {
  if (r.tipo === "uda") return `UDA ${r.stato === "vissuta" ? "VISSUTA" : "PROPOSTA"}`;
  if (r.tipo === "aula") return "AULA";
  if (!r.privato) return "METODO Mappe Genius Loci (estratto)";
  if (r.tipo === "metodo") return "METODO Mappe Genius Loci (testo completo)";
  if (r.tipo === "normativa") return `INDICAZIONI NAZIONALI ${r.versione} (testo ufficiale, ${r.decreto})`;
  if (r.tipo_fonte === "manifesto") return "MANIFESTO della Strada dei Bambini (testo pubblico della home)";
  if (r.tipo_fonte === "libro di testo") return "PROGRAMMA (dai libri di testo, rielaborato)";
  if (r.tipo_fonte === "rielaborato") return "RIELABORAZIONE (sintesi con parole nostre)";
  return `MATERIALE DEL TEAM${r.stato === "vissuta" ? " — VISSUTA" : r.stato === "proposta" ? " — PROPOSTA" : ""}`;
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
      const ids = [...(r.passi || [])];
      const breve = r.tipo === "uda" && ix.passi.find(x => x.ref === r.ref && x.sezione === "In breve");
      if (breve && !ids.includes(breve.id)) ids.push(breve.id);
      for (const id of ids.slice(0, privato ? 2 : 3)) {
        const p = ix.passi.find(x => x.id === id); if (!p) continue;
        if (usati + p.testo.length > budget) break;
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
          : [r.comunita, (r.eta || []).join(", "), r.classi, (r.discipline || []).join(", "), privato && r.autore ? `autore: ${r.autore}` : ""].filter(Boolean).join(" · ");
        let testo = p.testo;
        if (r.tipo === "normativa" && p.sezione_tipo !== "premessa") { // un codice [T…] per ogni traguardo o obiettivo
          testo = p.testo.split("\n").map(l => {
            if (!/^[–-]\s/.test(l) && (l.length < 60 && !/[.;:]$/.test(l))) return l; // titoletto (Orientamento, Paesaggio…)
            codici.push({ testo: l.replace(/^[–-]\s*/, "").trim(), n, versione: p.versione, disciplina: p.disciplina, sezione: p.sezione });
            return `[T${codici.length}] ${l.replace(/^[–-]\s*/, "")}`;
          }).join("\n");
        }
        blocchi.push(`[S${n}] ${etichetta(r)} — «${r.titolo}»${meta ? ` (${meta})` : ""}\nSezione: ${p.sezione || ""}${p.voce ? " — VOCE VERIFICATA" : ""}\n${testo}`);
      }
    }
  }
  return { fonti, testo: blocchi.join("\n\n---\n\n"), testiNorm, codici };
}

// «– [T3]» → può concorrere a «testo ufficiale» (Indicazioni 2012, geografia, traguardi al termine della scuola primaria) [S8]
const sezioneBreve = s => String(s || "").replace(/^Traguardi (per lo sviluppo|di sviluppo) dell[ae] competenz[ae]/i, "traguardi")
  .replace(/^Competenze attese/i, "competenze attese").replace(/^Obiettivi specifici di apprendimento/i, "obiettivi specifici")
  .replace(/^Obiettivi di apprendimento/i, "obiettivi").replace(/^Obiettivi specifici/i, "obiettivi specifici").replace(/\s*\(.*$/, "").trim();
export function espandiCodici(testo, codici, fonti = []) {
  const cita = c => `può concorrere a «${c.testo.replace(/[.;]$/, "")}» (Indicazioni ${c.versione}, ${c.disciplina || "indicazioni generali"}, ${sezioneBreve(c.sezione)}) [S${c.n}]`;
  const norm = k => fonti[Number(k) - 1]?.tipo === "normativa";
  const out = []; let parte = "a"; const scelti = [];
  for (const riga of testo.split("\n")) {
    if (/^\s*Traguardi a cui può concorrere\s*:/i.test(riga)) { parte = "t"; out.push("Traguardi a cui può concorrere:"); continue; }
    if (/^\s*Idee (per il tuo territorio|generali)\s*:/i.test(riga)) parte = "i";
    const ks = [...riga.matchAll(/\[T(\d+)\]/g)].map(m => codici?.[Number(m[1]) - 1]).filter(Boolean);
    if (parte === "t") { // solo codici, al massimo 4 (2 per versione), espansi con il testo ufficiale
      for (const c of ks) if (!scelti.includes(c) && scelti.length < 4 && scelti.filter(x => x.versione === c.versione).length < 2) scelti.push(c);
      if (!ks.length && riga.trim() && !/^\s*[–-]/.test(riga)) out.push(riga); // eventuale frase («nessun traguardo adatto…»)
      continue;
    }
    if (ks.length || /\[T\d+\]/.test(riga)) continue; // codici fuori posto: la riga si toglie (niente testi ufficiali riscritti)
    if (parte === "a" && codici?.length) { // nella parte (a) via le frasi che citano solo le Indicazioni
      const frasi = riga.split(/(?<=[.!?])\s+/).filter(f => { const ss = [...f.matchAll(/\[S(\d+)\]/g)].map(m => m[1]); return !ss.length || !ss.every(norm); });
      out.push(frasi.join(" "));
      continue;
    }
    out.push(riga);
  }
  // inserisco le righe scelte subito dopo il titolo «Traguardi a cui può concorrere:»
  const k = out.indexOf("Traguardi a cui può concorrere:");
  if (k >= 0) {
    if (scelti.length) out.splice(k + 1, 0, ...scelti.map(c => `– ${cita(c)}.`));
    else if (!out[k + 1]?.trim() || /^\s*Idee/i.test(out[k + 1])) out.splice(k, 1);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").replace(/^Dalle nostre schede:\s*\n+(?=Traguardi a cui)/, "");
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

let ixPrivato, ixNormativa; // undefined = non ancora provato, null = non disponibile
// Restituisce l'indice dei materiali (team, metodo, manifesto…); quello delle Indicazioni nazionali va in ixNormativa.
export function indiceDaCifrato(cifrato, chiave) {
  ixNormativa = null;
  try {
    const corpus = chiave && cifrato ? decifraCorpus(cifrato, chiave) : null;
    const tutti = (corpus?.passi || []).filter(p => p.tipo === "normativa" || !nascosto(p)); // comunità nascoste: fuori dal recupero
    const passi = tutti.filter(p => p.tipo !== "normativa"), norm = tutti.filter(p => p.tipo === "normativa");
    if (norm.length) ixNormativa = preparaIndice({ passi: norm, schede: [], aule: [] });
    return passi.length ? preparaIndice({ passi, schede: [], aule: [] }) : null;
  } catch { return null; } // chiave sbagliata o file alterato: solo indice pubblico
}
export async function indicePrivato() {
  if (ixPrivato === undefined) ixPrivato = indiceDaCifrato(corpusCifrato, env("GENIUS_LOCI_CORPUS_CHIAVE", ""));
  return ixPrivato;
}
export const indiceNormativa = () => ixNormativa || null;

// ---------- Indicazioni nazionali: solo se la domanda parla di curricolo ----------
const RE_CURRICOLO = /\b(traguard\w*|obiettiv\w* (di apprendimento|specific\w*)|competenze attese|indicazioni( nazionali| 20(12|25)| ministerial\w*)|curricol\w*|campi? di esperienza|programmi ministeriali|puo concorrere|concorr\w*)\b/;
export function chiedeCurricolo(domanda) { return RE_CURRICOLO.test(" " + normalizza(domanda) + " "); }
const DISC_NORM = { "educazione motoria": "educazione motoria", motoria: "educazione motoria", "educazione fisica": "educazione motoria", inglese: "inglese", tecnologia: "tecnologia", arte: "arte", musica: "musica",
  italiano: "italiano", storia: "storia", geografia: "geografia", matematica: "matematica", scienze: "scienze" };
// Sceglie i passi ufficiali per disciplina, ordine e classe (testo intero di traguardi/competenze attese e obiettivi).
export function cercaNormativa(ixN, domanda, { max = 4 } = {}) {
  if (!ixN || !chiedeCurricolo(domanda)) return null;
  const cap = capisci(domanda), q = " " + normalizza(domanda) + " ";
  const versioni = /\b2012\b/.test(q) && !/\b2025\b/.test(q) ? ["2012"] : /\b(2025|nuove indicazioni)\b/.test(q) && !/\b2012\b/.test(q) ? ["2025"] : ["2012", "2025"];
  const disc = [...new Set([...cap.discipline, ...Object.keys(DISC_NORM).filter(d => q.includes(" " + d + " "))].map(d => DISC_NORM[d]).filter(Boolean))];
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
  for (const v of versioni) {
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
  for (const p of scelti.slice(0, max * 2)) {
    const k = `${p.titolo} · ${p.sezione}`;
    if (!gruppi.has(k)) gruppi.set(k, { tipo: "normativa", titolo: k, versione: p.versione, decreto: p.decreto, autore: p.autore, tipo_fonte: "normativa", passi: [] });
    gruppi.get(k).passi.push(p.id);
  }
  return { risultati: [...gruppi.values()] };
}

export async function chiamaModello(cfg, domanda, ctx, generali = false) {
  const utente = `${generali ? "FONTI DI METODO GENERALI (la ricerca non ha trovato schede sul tema preciso della domanda)" : "FONTI"}\n\n${ctx}\n\nDOMANDA\n${domanda}`;
  const ctrl = AbortSignal.timeout(20000);
  if (cfg.provider === "anthropic") {
    const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", signal: ctrl,
      headers: { "content-type": "application/json", "x-api-key": cfg.chiave, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: cfg.modello, max_tokens: cfg.maxTokens, temperature: 0.2, system: PROMPT_SISTEMA, messages: [{ role: "user", content: utente }] }) });
    if (!r.ok) throw new Error(`provider ${r.status}`);
    const j = await r.json();
    return (j.content || []).map(c => c.text || "").join("").trim();
  }
  const r = await fetch(`${cfg.baseUrl}/chat/completions`, { method: "POST", signal: ctrl,
    headers: { "content-type": "application/json", authorization: `Bearer ${cfg.chiave}` },
    body: JSON.stringify({ model: cfg.modello, max_tokens: cfg.maxTokens, temperature: 0.2,
      messages: [{ role: "system", content: PROMPT_SISTEMA }, { role: "user", content: utente }] }) });
  if (!r.ok) throw new Error(`provider ${r.status}`);
  const j = await r.json();
  const c = j.choices?.[0]?.message?.content;
  // Mistral Small 4 con ragionamento attivo restituisce una lista di blocchi: teniamo solo il testo
  return (Array.isArray(c) ? c.filter(b => b.type === "text").map(b => b.text || "").join("") : c || "").trim();
}

// [S1, S2] o [S1,S3] → [S1][S2] (il sito collega solo [S1]); nella parte «Idee…» (suggerimenti generali) niente citazioni.
export function ripulisci(testo) {
  let t = String(testo || "").replace(/\[S(\d+(?:\s*[,;]\s*S?\d+)+)\]/g, (m, g) => g.split(/\s*[,;]\s*/).map(x => `[S${x.replace(/^S/, "")}]`).join(""));
  t = t.replace(/\*\*([^*]+)\*\*/g, "$1");
  const i = t.search(/Idee (per il tuo territorio|generali)\s*:/i);
  if (i >= 0) t = t.slice(0, i) + t.slice(i).replace(/\s*\[S\d+\]/g, "");
  return t.trim();
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
  return { ok: true };
}

let ix = null;
export default async (req, context) => {
  const cfg = configurazione();
  if (req.method === "GET") return json(cfg.pronto ? { abilitato: true, limiteIp: cfg.limiteIp } : { abilitato: false });
  if (req.method !== "POST") return json({ errore: "metodo non ammesso" }, 405);
  if (!cfg.pronto) return json({ abilitato: false, errore: "La risposta scritta non è attiva." }, 503);
  let domanda = "";
  try { domanda = String((await req.json()).domanda || "").trim().slice(0, 300); } catch {}
  if (domanda.length < 3) return json({ errore: "Domanda vuota." }, 400);
  const lim = await controllaLimiti(cfg, req, context);
  if (!lim.ok) return json({ errore: lim.motivo }, 429);
  const out = await rispondi(cfg, domanda);
  return out.errore ? json({ errore: out.errore }, out.status || 500) : json(out);
};

// Separata dal gestore (niente limiti né Blobs) per poterla provare in locale.
export async function rispondi(cfg, domanda) {
  if (NASCOSTE.includes(capisci(domanda).comunita))
    return { risposta: "Non lo so: questa comunità non è ancora attiva sul sito. Prova con un altro luogo, una classe o un tema.", fonti: [] };
  ix = ix || preparaIndice(dati);
  let res = cerca(ix, domanda, { max: 5 });
  res.risultati = res.risultati.filter(r => !nascosto(r));
  const ixP = await indicePrivato();
  let resP = ixP ? cerca(ixP, domanda, { max: 4, comunitaMorbida: true }) : null;
  if (resP) resP.risultati = resP.risultati.filter(r => !nascosto(r));
  // Poche schede trovate: aggiungo fonti di metodo, il modello darà idee generali (o declinerà se fuori tema).
  const trovati = res.risultati.length + (resP?.risultati.length || 0);
  const generali = trovati === 0;
  if (trovati < 3) ({ res, resP } = fontiDiMetodo(ix, ixP, domanda, res, resP));
  if (!res.risultati.length && !resP?.risultati.length) return { risposta: "Non lo so: nelle schede del sito non ho trovato niente su questo. Prova a nominare un luogo, una classe o un tema.", fonti: [] };
  // Indicazioni nazionali: dopo le schede, con un budget loro (solo se la domanda parla di curricolo)
  const ixN = indiceNormativa(), resN = cercaNormativa(ixN, domanda);
  const ctx = contesto({ ix, res, budget: resP?.risultati.length ? 8000 : 13000 }, { ix: ixP, res: resP, privato: true, budget: 5500 },
    { ix: ixN, res: resN, privato: true, budget: 7000 });
  try {
    const grezza = await chiamaModello(cfg, domanda, ctx.testo.slice(0, resN ? 22000 : 15000), generali);
    const risposta = verificaCitazioni(espandiCodici(ripulisci(grezza), ctx.codici, ctx.fonti), ctx.fonti, ctx.testiNorm);
    // risposta di rifiuto (fuori tema): niente fonti mostrate
    const fonti = /\[S\d+\]/.test(risposta || "") ? ctx.fonti : [];
    return { risposta: risposta || "Non lo so.", fonti };
  } catch (e) {
    return { errore: "Il servizio di risposta scritta non ha risposto.", status: 502 };
  }
}

export const config = { path: "/api/genius-loci" };
