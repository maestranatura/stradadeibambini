#!/usr/bin/env node
// Prepara l'accensione della fase 2 del Genius Loci (Mistral) sul sito Netlify.
// NON stampa mai chiavi o token: mostra solo nomi delle variabili ed esiti.
//
// Cosa fa (solo con --esegui; senza, è una prova a secco che dice cosa farebbe):
//   1. carica in Netlify Blobs (store «genius-loci-privato») il corpus cifrato e il backup cifrato
//      delle sorgenti private, presi dalla cartella privata (mai dal repository);
//   2. imposta le variabili d'ambiente della funzione (scope "functions"; i segreti come "secret").
//
// Valori letti SOLO da ambiente e file, mai da riga di comando:
//   NETLIFY_AUTH_TOKEN   token personale Netlify (User settings → Applications → Personal access tokens)
//   MISTRAL_API_KEY      chiave API Mistral (console.mistral.ai)
//   chiave del corpus    file <privato>/CHIAVE_CORPUS (base64, 32 byte)
//
// Uso:
//   NETLIFY_AUTH_TOKEN=… MISTRAL_API_KEY=… node genius-loci/strumenti/attiva_fase2.mjs [--esegui]
//       [--privato /workspace/genius-loci-privato] [--sito 46109271-a10f-421b-8328-65a0e7fa0831]
//       [--contesti production[,deploy-preview,branch-deploy]] [--spento] [--solo-blobs] [--solo-env]
//       [--prova-mistral]
//   --spento        imposta tutto ma GENIUS_LOCI_ABILITATO=false (accensione dopo, dal pannello)
//   --prova-mistral una sola chiamata minima a Mistral (max 1 token) per verificare chiave e modello
import { readFileSync, existsSync } from "node:fs";
import { getStore } from "@netlify/blobs";

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const flag = n => process.argv.includes(n);
const SITO = arg("--sito", "46109271-a10f-421b-8328-65a0e7fa0831");
const PRIVATO = arg("--privato", "/workspace/genius-loci-privato");
const CONTESTI = arg("--contesti", "production").split(",").map(s => s.trim()).filter(Boolean);
const ESEGUI = flag("--esegui");
const MODELLO = "mistral-small-2603";
const API = "https://api.netlify.com/api/v1";

const token = process.env.NETLIFY_AUTH_TOKEN || "";
const mistral = process.env.MISTRAL_API_KEY || "";
const fileChiave = `${PRIVATO}/CHIAVE_CORPUS`;
const chiaveCorpus = existsSync(fileChiave) ? readFileSync(fileChiave, "utf8").trim() : "";
const ok = v => (v ? "presente" : "MANCANTE");

const VARIABILI = [
  { key: "GENIUS_LOCI_ABILITATO", value: flag("--spento") ? "false" : "true" },
  { key: "GENIUS_LOCI_PROVIDER", value: "openai-compatibile" },
  { key: "GENIUS_LOCI_BASE_URL", value: "https://api.mistral.ai/v1" },
  { key: "GENIUS_LOCI_MODELLO", value: MODELLO },
  { key: "GENIUS_LOCI_LIMITE_GIORNALIERO", value: "200" },
  { key: "GENIUS_LOCI_LIMITE_IP", value: "15" },
  { key: "GENIUS_LOCI_API_KEY", value: mistral, segreto: true },
  { key: "GENIUS_LOCI_CORPUS_CHIAVE", value: chiaveCorpus, segreto: true },
];
const BLOBS = [
  { chiave: "corpus", file: `${PRIVATO}/corpus.cifrato.json` },
  { chiave: "sorgenti-private", file: `${PRIVATO}/sorgenti-private.cifrato.json` },
];

async function netlify(metodo, percorso, corpo) {
  const r = await fetch(API + percorso, { method: metodo,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: corpo ? JSON.stringify(corpo) : undefined });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`${metodo} ${percorso.split("?")[0]} → HTTP ${r.status}`);
  return r.status === 204 ? {} : r.json();
}

async function provaMistral() {
  if (!mistral) return console.log("prova Mistral: MISTRAL_API_KEY assente, salto");
  const r = await fetch("https://api.mistral.ai/v1/chat/completions", { method: "POST",
    headers: { authorization: `Bearer ${mistral}`, "content-type": "application/json" },
    body: JSON.stringify({ model: MODELLO, max_tokens: 1, messages: [{ role: "user", content: "Ciao" }] }) });
  const j = await r.json().catch(() => ({}));
  console.log(`prova Mistral: HTTP ${r.status}${r.ok ? `, modello ${j.model}, token usati ${j.usage?.total_tokens}` : `, ${j.message || j.object || "errore"}`}`);
}

async function main() {
  console.log(`sito ${SITO} · contesti ${CONTESTI.join(",")} · ${ESEGUI ? "ESECUZIONE" : "prova a secco (aggiungi --esegui)"}`);
  console.log(`NETLIFY_AUTH_TOKEN ${ok(token)} · MISTRAL_API_KEY ${ok(mistral)} · CHIAVE_CORPUS ${ok(chiaveCorpus)}`);
  if (flag("--prova-mistral")) await provaMistral();
  const mancanti = [];
  if (!flag("--solo-blobs")) for (const v of VARIABILI) if (!v.value) mancanti.push(v.key);
  if (!flag("--solo-env")) for (const b of BLOBS) if (!existsSync(b.file)) mancanti.push(b.file);
  if (ESEGUI && !token) mancanti.push("NETLIFY_AUTH_TOKEN");
  if (mancanti.length) { console.log("mancano:", mancanti.join(", ")); if (ESEGUI) process.exit(1); }

  if (!flag("--solo-env")) for (const b of BLOBS) {
    console.log(`blob genius-loci-privato/${b.chiave} ← ${b.file.split("/").pop()}`);
    if (ESEGUI) {
      const store = getStore({ name: "genius-loci-privato", siteID: SITO, token });
      await store.set(b.chiave, readFileSync(b.file, "utf8"));
      const letto = await store.get(b.chiave, { type: "text" });
      console.log(`  caricato e riletto (${letto?.length === readFileSync(b.file, "utf8").length ? "identico" : "DIVERSO!"})`);
    }
  }
  if (flag("--solo-blobs")) return;

  const sito = ESEGUI ? await netlify("GET", `/sites/${SITO}`) : null;
  if (ESEGUI && !sito) throw new Error("sito non trovato o token senza accesso");
  const account = sito?.account_id;
  for (const v of VARIABILI) {
    console.log(`env ${v.key}${v.segreto ? " (segreto, valore non mostrato)" : ` = ${v.value}`}`);
    if (!ESEGUI) continue;
    const corpo = { key: v.key, scopes: ["functions"], is_secret: !!v.segreto,
      values: CONTESTI.map(context => ({ context, value: v.value })) };
    const q = `?site_id=${SITO}`;
    const esiste = await netlify("GET", `/accounts/${account}/env/${v.key}${q}`);
    if (esiste) await netlify("PUT", `/accounts/${account}/env/${v.key}${q}`, corpo);
    else await netlify("POST", `/accounts/${account}/env${q}`, [corpo]);
    console.log(`  ${esiste ? "aggiornata" : "creata"}`);
  }
  if (ESEGUI) console.log("Fatto. Le variabili valgono dal prossimo deploy: rilanciare il deploy del sito.");
}
main().catch(e => { console.error("errore:", e.message); process.exit(1); });
