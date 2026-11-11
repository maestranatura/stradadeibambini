// «Parla con il Genius Loci» · FASE 2 (LLM) — DISATTIVATA finché non si impostano le variabili d'ambiente.
//
// GET  /api/genius-loci  → { abilitato: false }  (oppure true, con i limiti)  — il frontend usa l'LLM solo se true
// POST /api/genius-loci  { domanda }  → { risposta, fonti:[{n,titolo,url,stato,tipo}] }
//
// RAG: il server NON si fida dei testi mandati dal browser. Rifà la stessa ricerca della fase 1
// (genius-loci/cerca.mjs sull'indice genius-loci/indice.json) e passa al modello solo quei passi.
//
// Variabili d'ambiente (solo nomi; i valori si mettono nel pannello Netlify, mai nel codice):
//   GENIUS_LOCI_ABILITATO          "true" per accendere (qualsiasi altro valore = spento)
//   GENIUS_LOCI_PROVIDER           "openai-compatibile" (OpenAI, Gemini, Mistral, Groq, OpenRouter…) | "anthropic"
//   GENIUS_LOCI_API_KEY            chiave del provider scelto
//   GENIUS_LOCI_MODELLO            nome del modello (es. quello indicato dal provider)
//   GENIUS_LOCI_BASE_URL           solo per openai-compatibile: base dell'API, es. https://api.openai.com/v1
//   GENIUS_LOCI_MAX_TOKENS         token massimi di risposta (predefinito 500)
//   GENIUS_LOCI_LIMITE_GIORNALIERO domande al giorno su tutto il sito (predefinito 200)
//   GENIUS_LOCI_LIMITE_IP          domande al giorno per indirizzo IP (predefinito 15)
//   GENIUS_LOCI_PASSI              quanti passi passare al modello (predefinito 8)
import { getStore } from "@netlify/blobs";
import { createHash } from "node:crypto";
import dati from "../../genius-loci/indice.json" with { type: "json" };
import { preparaIndice, cerca } from "../../genius-loci/cerca.mjs";

const env = (k, d) => (globalThis.Netlify?.env?.get?.(k) ?? process.env[k] ?? d);
const num = (k, d) => { const v = parseInt(env(k, ""), 10); return Number.isFinite(v) && v > 0 ? v : d; };
const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } });

function configurazione() {
  const provider = env("GENIUS_LOCI_PROVIDER", "openai-compatibile");
  const cfg = {
    acceso: env("GENIUS_LOCI_ABILITATO", "") === "true",
    provider, chiave: env("GENIUS_LOCI_API_KEY", ""), modello: env("GENIUS_LOCI_MODELLO", ""),
    baseUrl: (env("GENIUS_LOCI_BASE_URL", "") || "").replace(/\/+$/, ""),
    maxTokens: Math.min(num("GENIUS_LOCI_MAX_TOKENS", 500), 1500),
    limiteGiorno: num("GENIUS_LOCI_LIMITE_GIORNALIERO", 200),
    limiteIp: num("GENIUS_LOCI_LIMITE_IP", 15),
    passi: Math.min(num("GENIUS_LOCI_PASSI", 8), 12),
  };
  cfg.pronto = cfg.acceso && !!cfg.chiave && !!cfg.modello && (provider === "anthropic" || (provider === "openai-compatibile" && !!cfg.baseUrl));
  return cfg;
}

export const PROMPT_SISTEMA = `Sei il Genius Loci della Strada dei Bambini, un sussidiario vivo di aule all'aperto e unità di apprendimento (UDA) costruite con le comunità educanti di Siracusa, del Salento e di Valdobbiadene.
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
9. Al massimo 180 parole. Niente elenchi lunghi: rimanda alle schede.`;

export function contesto(ix, res) {
  const fonti = []; const blocchi = [];
  const passi = [];
  for (const r of res.risultati) {
    const ids = [...(r.passi || [])];
    const breve = r.tipo === "uda" && ix.passi.find(x => x.ref === r.ref && x.sezione === "In breve");
    if (breve && !ids.includes(breve.id)) ids.push(breve.id);
    for (const id of ids) { const p = ix.passi.find(x => x.id === id); if (p) passi.push({ r, p }); }
  }
  for (const { r, p } of passi) {
    let n = fonti.findIndex(f => f.titolo === r.titolo) + 1;
    if (!n) { fonti.push({ n: fonti.length + 1, titolo: r.titolo, url: r.url || null, stato: r.stato || null, tipo: r.tipo }); n = fonti.length; }
    const etichetta = r.tipo === "uda" ? `UDA ${r.stato === "vissuta" ? "VISSUTA" : "PROPOSTA"}` : r.tipo === "aula" ? "AULA" : "METODO Mappe Genius Loci";
    const meta = [r.comunita, (r.eta || []).join(", "), r.classi, (r.discipline || []).join(", ")].filter(Boolean).join(" · ");
    blocchi.push(`[S${n}] ${etichetta} — «${r.titolo}»${meta ? ` (${meta})` : ""}\nSezione: ${p.sezione || ""}${p.voce ? " — VOCE VERIFICATA" : ""}\n${p.testo}`);
  }
  return { fonti, testo: blocchi.join("\n\n---\n\n") };
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
  return (j.choices?.[0]?.message?.content || "").trim();
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
  ix = ix || preparaIndice(dati);
  const res = cerca(ix, domanda, { max: 5 });
  if (!res.risultati.length) return json({ risposta: "Non lo so: nelle schede del sito non ho trovato niente su questo. Prova a nominare un luogo, una classe o un tema.", fonti: [] });
  const ctx = contesto(ix, res);
  try {
    const risposta = await chiamaModello(cfg, domanda, ctx.testo.slice(0, 14000));
    return json({ risposta: risposta || "Non lo so.", fonti: ctx.fonti });
  } catch (e) {
    return json({ errore: "Il servizio di risposta scritta non ha risposto." }, 502);
  }
};

export const config = { path: "/api/genius-loci" };
