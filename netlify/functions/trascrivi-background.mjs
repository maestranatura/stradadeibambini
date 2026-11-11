// Dopo l'invio del modulo: trascrive gli audio indicati e salva il testo accanto all'audio.
// Se manca TRANSCRIBE_API_KEY, l'audio resta archiviato e la trascrizione è segnata "da trascrivere".
// Funzione in background: risponde subito 202, lavora fino a 15 minuti.
import { getStore } from "@netlify/blobs";
import { who } from "../lib/auth.mjs";

const KEY_RE = /^\d{4}-\d{2}-\d{2}\/[0-9a-f-]{36}\.(m4a|webm|ogg|mp3|wav)$/;

export default async (req) => {
  if (req.method !== "POST") return;
  // Solo chiamate interne (submission-created) o del responsabile: evita trascrizioni a pagamento abusive.
  if (!who(req) || who(req).community) return;
  let body = {};
  try { body = await req.json(); } catch { return; }
  const keys = [...new Set((body.keys || []).filter(k => typeof k === "string" && KEY_RE.test(k)))].slice(0, 20);
  const store = getStore({ name: "audio-contributi", consistency: "strong" });
  const apiKey = process.env.TRANSCRIBE_API_KEY;
  const endpoint = process.env.TRANSCRIBE_URL || "https://api.openai.com/v1/audio/transcriptions";
  const model = process.env.TRANSCRIBE_MODEL || "gpt-4o-transcribe";

  for (const key of keys) {
    const metaKey = `meta/${key}.json`;
    const meta = (await store.get(metaKey, { type: "json" })) || {};
    if (meta.trascrizione === "fatta") continue;
    meta.contributo = { id: body.contributo || "", aula_id: body.aula_id || "", luogo_nome: body.luogo_nome || "", inviato: new Date().toISOString() };
    if (body.community) meta.community = String(body.community).slice(0, 80);
    if (!apiKey) {
      meta.trascrizione = "da trascrivere";
      await store.setJSON(metaKey, meta);
      continue;
    }
    try {
      const audio = await store.getWithMetadata(key, { type: "arrayBuffer" });
      if (!audio) { meta.trascrizione = "audio non trovato"; await store.setJSON(metaKey, meta); continue; }
      const type = audio.metadata?.contentType || meta.contentType || "audio/webm";
      const ext = key.split(".").pop();
      const fd = new FormData();
      fd.append("file", new Blob([audio.data], { type }), `audio.${ext}`);
      fd.append("model", model);
      fd.append("language", "it");
      fd.append("response_format", "json");
      const r = await fetch(endpoint, { method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: fd });
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`);
      const out = await r.json();
      await store.set(`${key}.txt`, String(out.text || ""));
      meta.trascrizione = "fatta";
      meta.modello = model;
      meta.trascritto = new Date().toISOString();
      delete meta.errore;
    } catch (e) {
      meta.trascrizione = "da trascrivere";
      meta.errore = String(e.message || e).slice(0, 400);
    }
    await store.setJSON(metaKey, meta);
  }
};

export const config = { path: "/api/trascrivi", background: true };
