// API privata della pagina /approva/: elenco dei contributi, Approva / Scarta / Modifica testo / Ritira / Elimina.
// Solo con token (ADMIN_TOKEN = coordinatrice; COMMUNITY_TOKENS = community manager limitati alla loro comunità).
import { getStore } from "@netlify/blobs";
import { who, canSee, json } from "../lib/auth.mjs";
import { parseHttpsUrl } from "../lib/https-url.mjs";

const stores = () => ({
  c: getStore({ name: "contributi", consistency: "strong" }),
  a: getStore({ name: "audio-contributi", consistency: "strong" }),
  f: getStore({ name: "foto-contributi", consistency: "strong" }),
});
const STATI = ["da approvare", "approvato", "scartato"];
const titoloDi = r => r.titolo || [r.luogo_nome || "Luogo nuovo", r.quando ? new Date(r.quando + "T12:00:00").toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" }) : ""].filter(Boolean).join(" · ");

export function pubblico(r) {
  // Solo ciò che può stare online: niente audio, niente email/contatti, niente trascrizioni grezze.
  return {
    id: r.id, titolo: titoloDi(r), community: r.community, aula_id: r.aula_id || "", luogo_nome: r.luogo_nome || "",
    lat: r.lat, lon: r.lon, nuovo_luogo: !r.aula_id, quando: r.quando, tempo: r.tempo, classe: r.classe, scuola: r.scuola,
    sito_scuola: parseHttpsUrl(r.sito_scuola).url, profilo: parseHttpsUrl(r.profilo).url,
    racconto: r.racconto_pubblico ?? r.racconto, voci: r.voci_pubbliche ?? r.voci,
    foto: (r.foto || []).map(k => `/api/foto?key=${encodeURIComponent(k)}`), video: r.video || [],
    autore: r.autore, approvato: r.approvato,
  };
}

async function arricchisci(st, r) {
  const audio = [];
  const add = async (key, tipo, nome) => {
    const meta = await st.a.get(`meta/${key}.json`, { type: "json" });
    const testo = await st.a.get(`${key}.txt`, { type: "text" });
    audio.push({ key, tipo, nome: nome || "", durata: meta?.durata || null, trascrizione: testo || null, stato_trascrizione: meta?.trascrizione || "da trascrivere", errore: meta?.errore || null });
  };
  if (r.audio_racconto) await add(r.audio_racconto, "racconto");
  for (const v of r.audio_voci || []) await add(v.key, "voce", v.nome);
  return { ...r, titolo_proposto: titoloDi(r), audio };
}

async function setPubblico(st, r, on) {
  if (on) {
    await st.c.setJSON(`pub/${r.id}.json`, pubblico(r));
    for (const k of r.foto || []) await st.f.set(`pub/${k}`, "1");
  } else {
    await st.c.delete(`pub/${r.id}.json`);
    for (const k of r.foto || []) await st.f.delete(`pub/${k}`);
  }
}

export default async (req) => {
  const user = who(req);
  if (!user) return json({ error: "Accesso riservato" }, 401);
  const st = stores();
  const url = new URL(req.url);

  if (req.method === "GET") {
    if (url.searchParams.get("whoami")) return json(user);
    const filtro = url.searchParams.get("stato") || "da approvare";
    const { blobs } = await st.c.list({ prefix: "c/" });
    const out = [];
    for (const b of blobs) {
      const r = await st.c.get(b.key, { type: "json" });
      if (!r || !canSee(user, r.community)) continue;
      if (filtro !== "tutti" && r.stato !== filtro) continue;
      out.push(await arricchisci(st, r));
    }
    out.sort((x, y) => String(y.ricevuto).localeCompare(String(x.ricevuto)));
    return json({ utente: user, contributi: out });
  }

  if (req.method !== "POST") return json({ error: "Metodo non consentito" }, 405);
  const body = await req.json().catch(() => ({}));
  const azione = body.azione;

  if (azione === "pulisci_orfani") {
    if (user.community) return json({ error: "Solo la coordinatrice" }, 403);
    const minAge = Math.max(0, Number(body.minAgeMinutes ?? 60)) * 60000;
    const usati = new Set();
    for (const b of (await st.c.list({ prefix: "c/" })).blobs) {
      const r = await st.c.get(b.key, { type: "json" }); if (!r) continue;
      if (r.audio_racconto) usati.add(r.audio_racconto);
      (r.audio_voci || []).forEach(v => usati.add(v.key));
      (r.foto || []).forEach(k => usati.add(k));
    }
    const now = Date.now(); const tolti = { audio: 0, foto: 0 };
    for (const b of (await st.a.list({ prefix: "meta/" })).blobs) {
      const key = b.key.replace(/^meta\//, "").replace(/\.json$/, "");
      if (usati.has(key)) continue;
      const meta = await st.a.get(b.key, { type: "json" });
      if (meta?.caricato && now - Date.parse(meta.caricato) < minAge) continue;
      await st.a.delete(key); await st.a.delete(b.key); await st.a.delete(`${key}.txt`); tolti.audio++;
    }
    for (const b of (await st.f.list()).blobs) {
      if (b.key.startsWith("pub/") || usati.has(b.key)) continue;
      const m = await st.f.getMetadata(b.key);
      if (m?.metadata?.caricato && now - Date.parse(m.metadata.caricato) < minAge) continue;
      await st.f.delete(b.key); tolti.foto++;
    }
    return json({ ok: true, tolti });
  }

  const id = String(body.id || "").replace(/[^a-zA-Z0-9-]/g, "");
  const key = `c/${id}.json`;
  const r = await st.c.get(key, { type: "json" });
  if (!r) return json({ error: "Contributo non trovato" }, 404);
  if (!canSee(user, r.community)) return json({ error: "Non è della tua comunità" }, 403);
  const log = cosa => (r.storia = [...(r.storia || []), { quando: new Date().toISOString(), cosa, chi: user.role + (user.community ? ` · ${user.community}` : "") }]);
  const applicaLink = (campo) => {
    if (typeof body[campo] !== "string") return null;
    const p = parseHttpsUrl(body[campo]);
    if (body[campo].trim() && !p.ok) return campo;
    r[campo] = p.url;
    return null;
  };
  const applicaTesti = () => {
    if (typeof body.racconto === "string") r.racconto_pubblico = body.racconto.slice(0, 8000);
    if (typeof body.voci === "string") r.voci_pubbliche = body.voci.slice(0, 4000);
    if (typeof body.titolo === "string" && body.titolo.trim()) r.titolo = body.titolo.trim().slice(0, 160);
    const bad = applicaLink("sito_scuola") || applicaLink("profilo");
    if (bad) return bad;
    return null;
  };

  if (azione === "modifica") {
    const badLink = applicaTesti();
    if (badLink) return json({ error: "Link non valido: usa solo un indirizzo https://, oppure lascia vuoto", campo: badLink }, 400);
    log("testo modificato");
  }
  else if (azione === "approva") {
    const badLink = applicaTesti();
    if (badLink) return json({ error: "Link non valido: usa solo un indirizzo https://, oppure lascia vuoto", campo: badLink }, 400);
    if (!(r.consensi?.genitori && r.consensi?.volti_non_riconoscibili && r.consensi?.licenza_aperta)) return json({ error: "Mancano i consensi: non si può pubblicare" }, 409);
    r.stato = "approvato"; r.approvato = new Date().toISOString(); log("approvato");
    await setPubblico(st, r, true);
  }
  else if (azione === "scarta") { r.stato = "scartato"; log("scartato"); await setPubblico(st, r, false); }
  else if (azione === "ritira") { r.stato = "da approvare"; delete r.approvato; log("ritirato dal sito"); await setPubblico(st, r, false); }
  else if (azione === "elimina") {
    if (user.community) return json({ error: "Solo la coordinatrice" }, 403);
    await setPubblico(st, r, false);
    for (const k of [r.audio_racconto, ...(r.audio_voci || []).map(v => v.key)].filter(Boolean)) { await st.a.delete(k); await st.a.delete(`meta/${k}.json`); await st.a.delete(`${k}.txt`); }
    for (const k of r.foto || []) await st.f.delete(k);
    await st.c.delete(key);
    return json({ ok: true, eliminato: id, netlify_submission_id: r.netlify_submission_id });
  }
  else return json({ error: "Azione sconosciuta" }, 400);

  if (!STATI.includes(r.stato)) r.stato = "da approvare";
  await st.c.setJSON(key, r);
  return json({ ok: true, contributo: await arricchisci(st, r) });
};

export const config = { path: "/api/approva" };
