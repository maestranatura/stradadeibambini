// «Parla con il Genius Loci» · FASE 2 (LLM) — DISATTIVATA finché non si impostano le variabili d'ambiente.
//
// GET  /api/genius-loci  → { abilitato: false }  (oppure true, con i limiti)  — il frontend usa l'LLM solo se true
// POST /api/genius-loci  { domanda }  → { risposta, fonti:[{n,titolo,url,stato,tipo}] }
//
// RAG: il server NON si fida dei testi mandati dal browser. Rifà la stessa ricerca della fase 1
// (genius-loci/cerca.mjs sull'indice PUBBLICO genius-loci/indice.json: UDA, aule, estratti del metodo)
// e, se c'è la chiave, anche sulla base PRIVATA (materiali del team, metodo completo, rielaborazioni
// di opere e libri di testo). La base privata NON è nel repository: sta cifrata (AES-256-GCM) in
// Netlify Blobs (store «genius-loci-privato», chiave «corpus», caricata con
// genius-loci/strumenti/attiva_fase2.mjs) e viene decifrata solo in memoria. Al modello vanno solo i
// passi trovati. Le fonti private si citano con titolo e autore, mai con link a Drive.
// Comunità non ancora attivate (genius-loci/comunita-nascoste.json): né cercate né citate.
//
// Variabili d'ambiente (solo nomi; i valori si mettono nel pannello Netlify, mai nel codice):
//   GENIUS_LOCI_ABILITATO          "true" per accendere (qualsiasi altro valore = spento)
//   GENIUS_LOCI_PROVIDER           "openai-compatibile" (OpenAI, Gemini, Mistral, Groq, OpenRouter…) | "anthropic"
//   GENIUS_LOCI_API_KEY            chiave del provider scelto
//   GENIUS_LOCI_MODELLO            nome del modello (predefinito mistral-small-2603, Mistral Small 4)
//   GENIUS_LOCI_BASE_URL           solo per openai-compatibile: base dell'API (predefinito https://api.mistral.ai/v1)
//   GENIUS_LOCI_MAX_TOKENS         token massimi di risposta (predefinito 500)
//   GENIUS_LOCI_LIMITE_GIORNALIERO domande al giorno su tutto il sito (predefinito 200)
//   GENIUS_LOCI_LIMITE_IP          domande al giorno per indirizzo IP (predefinito 15)
//   GENIUS_LOCI_PASSI              quanti passi passare al modello (predefinito 8)
//   GENIUS_LOCI_CORPUS_CHIAVE      chiave (base64, 32 byte) per decifrare la base privata; senza, solo indice pubblico
import { getStore } from "@netlify/blobs";
import { createHash, createDecipheriv } from "node:crypto";
import { inflateSync } from "node:zlib";
import dati from "../../genius-loci/indice.json" with { type: "json" };
import NASCOSTE from "../../genius-loci/comunita-nascoste.json" with { type: "json" };
import { preparaIndice, cerca, capisci, COMUNITA } from "../../genius-loci/cerca.mjs";

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
    maxTokens: Math.min(num("GENIUS_LOCI_MAX_TOKENS", 500), 1500),
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

Regole che non puoi mai violare:
1. Rispondi SOLO usando le FONTI qui sotto. Non usare conoscenze esterne su luoghi, persone, date o fatti.
2. Cita sempre la scheda da cui prendi un'informazione con il segno [S1], [S2]… subito dopo la frase.
3. Se le fonti non contengono la risposta, dillo chiaramente: «Non lo so: nelle schede del sito non c'è» e suggerisci come riformulare la domanda (un luogo, una classe, un tema).
4. Non inventare MAI parole dei bambini. Puoi riportare una frase dei bambini solo se nella fonte è marcata «VOCE VERIFICATA», tra «caporali», identica, con la sua citazione. Non parafrasarla come se l'avessero detta.
5. Distingui sempre: «vissuta» = esperienza fatta davvero con una classe; «proposta» = idea ancora da provare. Non scrivere mai che una proposta «è stata fatta» o che «i bambini hanno scoperto».
6. Non inventare docenti, date, nomi di scuole, prodotti o risultati. Se un dato nelle fonti è incerto o «da completare», dillo.
7. Ammetti l'incertezza: se le fonti sono parziali, dillo («le schede ne parlano solo in parte»).
8. Non descrivere né identificare bambini. Niente dati personali.
9. Al massimo 180 parole. Niente elenchi lunghi: rimanda alle schede.
10. Ogni fonte ha un'etichetta. «UDA», «AULA» e «METODO (estratto)» sono pagine del sito. «MATERIALE DEL TEAM», «METODO (testo completo)», «RIELABORAZIONE» e «PROGRAMMA» sono documenti interni: citali con [S1]… come le altre, nominando titolo e autore se serve, ma senza link e senza inventare indirizzi.
11. «PROGRAMMA» dice che cosa si studia in una classe e in quale periodo dell'anno: usalo per collegare aule e UDA al curricolo, ma non è un'esperienza fatta. Gli «Agganci» del programma sono proposte.
12. Le «RIELABORAZIONI» riassumono opere di altri autori: riporta le idee con parole tue e indica l'opera; mai citazioni lunghe, esercizi o attività copiate.`;

function etichetta(r) {
  if (r.tipo === "uda") return `UDA ${r.stato === "vissuta" ? "VISSUTA" : "PROPOSTA"}`;
  if (r.tipo === "aula") return "AULA";
  if (!r.privato) return "METODO Mappe Genius Loci (estratto)";
  if (r.tipo === "metodo") return "METODO Mappe Genius Loci (testo completo)";
  if (r.tipo_fonte === "libro di testo") return "PROGRAMMA (dai libri di testo, rielaborato)";
  if (r.tipo_fonte === "rielaborato") return "RIELABORAZIONE (sintesi con parole nostre)";
  return `MATERIALE DEL TEAM${r.stato === "vissuta" ? " — VISSUTA" : r.stato === "proposta" ? " — PROPOSTA" : ""}`;
}

// gruppi = [{ ix, res, privato }]
export function contesto(...gruppi) {
  if (gruppi.length === 2 && gruppi[0]?.passi && gruppi[1]?.risultati) gruppi = [{ ix: gruppi[0], res: gruppi[1] }]; // firma vecchia (ix, res)
  const fonti = []; const blocchi = [];
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
        let n = fonti.findIndex(f => f.titolo === r.titolo) + 1;
        if (!n) {
          fonti.push(privato
            ? { n: fonti.length + 1, titolo: r.titolo, autore: r.autore || null, url: null, stato: r.stato || null, tipo: "documento", tipo_fonte: r.tipo_fonte || (r.tipo === "metodo" ? "team" : null) }
            : { n: fonti.length + 1, titolo: r.titolo, url: r.url || null, stato: r.stato || null, tipo: r.tipo });
          n = fonti.length;
        }
        const meta = [r.comunita, (r.eta || []).join(", "), r.classi, (r.discipline || []).join(", "), privato && r.autore ? `autore: ${r.autore}` : ""].filter(Boolean).join(" · ");
        blocchi.push(`[S${n}] ${etichetta(r)} — «${r.titolo}»${meta ? ` (${meta})` : ""}\nSezione: ${p.sezione || ""}${p.voce ? " — VOCE VERIFICATA" : ""}\n${p.testo}`);
      }
    }
  }
  return { fonti, testo: blocchi.join("\n\n---\n\n") };
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

let ixPrivato; // undefined = non ancora provato, null = non disponibile
export function indiceDaCifrato(cifrato, chiave) {
  try {
    const corpus = chiave && cifrato ? decifraCorpus(cifrato, chiave) : null;
    const passi = (corpus?.passi || []).filter(p => !nascosto(p)); // comunità nascoste: fuori dal recupero
    return passi.length ? preparaIndice({ passi, schede: [], aule: [] }) : null;
  } catch { return null; } // chiave sbagliata o file alterato: solo indice pubblico
}
export async function indicePrivato() {
  if (ixPrivato !== undefined) return ixPrivato;
  const chiave = env("GENIUS_LOCI_CORPUS_CHIAVE", "");
  let cifrato = null;
  if (chiave) {
    try { cifrato = await getStore({ name: "genius-loci-privato", consistency: "strong" }).get("corpus", { type: "json" }); } catch { cifrato = null; }
  }
  ixPrivato = indiceDaCifrato(cifrato, chiave);
  if (!ixPrivato) setTimeout(() => { ixPrivato = undefined; }, 60000).unref?.(); // riprova fra un minuto
  return ixPrivato;
}

export async function chiamaModello(cfg, domanda, ctx) {
  const utente = `FONTI\n\n${ctx}\n\nDOMANDA\n${domanda}`;
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
  if (NASCOSTE.includes(capisci(domanda).comunita))
    return json({ risposta: "Non lo so: questa comunità non è ancora attiva sul sito. Prova con un altro luogo, una classe o un tema.", fonti: [] });
  ix = ix || preparaIndice(dati);
  const res = cerca(ix, domanda, { max: 5 });
  res.risultati = res.risultati.filter(r => !nascosto(r));
  const ixP = await indicePrivato();
  const resP = ixP ? cerca(ixP, domanda, { max: 4, comunitaMorbida: true }) : null;
  if (!res.risultati.length && !resP?.risultati.length) return json({ risposta: "Non lo so: nelle schede del sito non ho trovato niente su questo. Prova a nominare un luogo, una classe o un tema.", fonti: [] });
  const ctx = contesto({ ix, res, budget: resP?.risultati.length ? 8000 : 13000 }, { ix: ixP, res: resP, privato: true, budget: 5500 });
  try {
    const risposta = await chiamaModello(cfg, domanda, ctx.testo.slice(0, 15000));
    return json({ risposta: risposta || "Non lo so.", fonti: ctx.fonti });
  } catch (e) {
    return json({ errore: "Il servizio di risposta scritta non ha risposto." }, 502);
  }
};

export const config = { path: "/api/genius-loci" };
