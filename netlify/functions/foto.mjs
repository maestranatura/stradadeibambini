// Foto e disegni del modulo Contribuisci. Store privato "foto-contributi".
// Una foto diventa visibile al pubblico SOLO quando il contributo che la contiene è approvato (marcatore pub/<key>).
import { getStore } from "@netlify/blobs";
import { randomUUID } from "node:crypto";
import { who, json } from "../lib/auth.mjs";

const MAX_BYTES = 4.4 * 1024 * 1024; // limite delle funzioni; il browser ridimensiona prima (≈ 300-600 KB)
const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
export const FOTO_RE = /^\d{4}-\d{2}-\d{2}\/[0-9a-f-]{36}\.(jpg|png|webp)$/;

export default async (req) => {
  const store = getStore({ name: "foto-contributi", consistency: "strong" });
  const url = new URL(req.url);
  if (req.method === "POST") {
    const type = (req.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!EXT[type]) return json({ error: "Formato immagine non accettato" }, 415);
    const buf = await req.arrayBuffer();
    if (!buf.byteLength) return json({ error: "Immagine vuota" }, 400);
    if (buf.byteLength > MAX_BYTES) return json({ error: "Immagine troppo grande" }, 413);
    const key = `${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${EXT[type]}`;
    await store.set(key, buf, { metadata: { contentType: type, size: buf.byteLength, caricato: new Date().toISOString() } });
    return json({ key, size: buf.byteLength });
  }
  if (req.method === "GET") {
    const key = url.searchParams.get("key") || "";
    if (!FOTO_RE.test(key)) return json({ error: "Chiave non valida" }, 400);
    const isPublic = !!(await store.getMetadata(`pub/${key}`));
    if (!isPublic && !who(req)) return json({ error: "Accesso riservato" }, 403);
    const r = await store.getWithMetadata(key, { type: "arrayBuffer" });
    if (!r) return json({ error: "Non trovata" }, 404);
    return new Response(r.data, { headers: { "content-type": r.metadata?.contentType || "image/jpeg", "cache-control": isPublic ? "public, max-age=300" : "private, no-store" } });
  }
  return json({ error: "Metodo non consentito" }, 405);
};

export const config = { path: "/api/foto" };
