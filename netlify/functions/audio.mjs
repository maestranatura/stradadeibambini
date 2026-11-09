// Carica e (solo con token) rilegge i messaggi vocali del modulo Contribuisci.
// Archivio privato: Netlify Blobs, store "audio-contributi". Niente viene pubblicato.
import { getStore } from "@netlify/blobs";
import { randomUUID } from "node:crypto";
import { who, canSee } from "../lib/auth.mjs";

const MAX_BYTES = 4.4 * 1024 * 1024; // limite delle funzioni Netlify; 3 min a 64 kbps ≈ 1,5 MB
const EXT = { "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/aac": "m4a", "audio/webm": "webm", "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/wav": "wav", "audio/x-wav": "wav" };
export const KEY_RE = /^\d{4}-\d{2}-\d{2}\/[0-9a-f-]{36}\.(m4a|webm|ogg|mp3|wav)$/;
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export default async (req) => {
  const store = getStore({ name: "audio-contributi", consistency: "strong" });
  const url = new URL(req.url);

  if (req.method === "POST") {
    const type = (req.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    const ext = EXT[type];
    if (!ext) return json({ error: "Formato audio non accettato: " + type }, 415);
    const kind = (req.headers.get("x-kind") || "racconto") === "voce" ? "voce" : "racconto";
    let nome = "";
    try { nome = decodeURIComponent(req.headers.get("x-nome") || "").trim().slice(0, 40); } catch {}
    if (kind === "voce") nome = nome.split(/\s+/)[0] || ""; // solo nome di battesimo
    const buf = await req.arrayBuffer();
    if (!buf.byteLength) return json({ error: "Audio vuoto" }, 400);
    if (buf.byteLength > MAX_BYTES) return json({ error: "Audio troppo lungo (max circa 3 minuti)" }, 413);
    const day = new Date().toISOString().slice(0, 10);
    const key = `${day}/${randomUUID()}.${ext}`;
    const durata = Number(req.headers.get("x-durata") || 0) || null;
    const meta = { contentType: type, kind, nome, size: buf.byteLength, durata, caricato: new Date().toISOString(), trascrizione: "in attesa dell'invio del modulo" };
    await store.set(key, buf, { metadata: meta });
    await store.setJSON(`meta/${key}.json`, meta);
    return json({ key, size: buf.byteLength, type });
  }

  if (req.method === "GET") {
    // Lettura privata: coordinatrice (ADMIN_TOKEN), AUDIO_READ_TOKEN, o community manager per la sua comunità.
    const user = who(req, { allowAudioToken: true });
    if (!user) return json({ error: "Accesso riservato" }, 403);
    const key = url.searchParams.get("key") || "";
    if (url.searchParams.get("list")) {
      if (user.community) return json({ error: "Solo la coordinatrice" }, 403);
      const { blobs } = await store.list({ prefix: "meta/" });
      return json(blobs.map(b => b.key.replace(/^meta\//, "").replace(/\.json$/, "")));
    }
    if (!KEY_RE.test(key)) return json({ error: "Chiave non valida" }, 400);
    const meta = await store.get(`meta/${key}.json`, { type: "json" });
    if (user.community && !canSee(user, meta?.community)) return json({ error: "Non è della tua comunità" }, 403);
    if (url.searchParams.get("info")) {
      const testo = await store.get(`${key}.txt`, { type: "text" });
      return json({ key, meta, trascrizione: testo });
    }
    const r = await store.getWithMetadata(key, { type: "arrayBuffer" });
    if (!r) return json({ error: "Non trovato" }, 404);
    return new Response(r.data, { headers: { "content-type": r.metadata?.contentType || "application/octet-stream", "cache-control": "private, no-store" } });
  }
  return json({ error: "Metodo non consentito" }, 405);
};

export const config = { path: "/api/audio" };
