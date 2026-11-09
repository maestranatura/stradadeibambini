// Evento Netlify Forms: a ogni invio del modulo «contribuisci» copia il contributo nello store
// privato "contributi" con stato «da approvare», avvia la trascrizione degli audio e invia l'email.
// Nulla viene pubblicato: la pubblicazione avviene solo da /approva/.
import { getStore } from "@netlify/blobs";

const AUDIO_RE = /^\d{4}-\d{2}-\d{2}\/[0-9a-f-]{36}\.(m4a|webm|ogg|mp3|wav)$/;
const FOTO_RE = /^\d{4}-\d{2}-\d{2}\/[0-9a-f-]{36}\.(jpg|png|webp)$/;
const s = (v, n = 4000) => String(v ?? "").trim().slice(0, n);
const parseJSON = (v, d) => { try { return JSON.parse(v); } catch { return d; } };
const on = v => ["on", "true", "1", "si", "sì", "yes"].includes(String(v || "").toLowerCase());

export default async (req, context) => {
  const body = await req.json().catch(() => ({}));
  const p = body.payload || {};
  if ((p.form_name || p.data?.["form-name"]) !== "contribuisci") return new Response("ignorato");
  const d = p.data || {};
  const id = s(p.id || crypto.randomUUID(), 40).replace(/[^a-zA-Z0-9-]/g, "");
  const audioVoci = (parseJSON(d.audio_voci, []) || []).filter(x => x && AUDIO_RE.test(x.key)).slice(0, 30)
    .map(x => ({ nome: s(x.nome, 30).split(/\s+/)[0], key: x.key }));
  const audioRacconto = AUDIO_RE.test(d.audio_racconto || "") ? d.audio_racconto : "";
  const foto = (parseJSON(d.foto_keys, []) || []).filter(k => FOTO_RE.test(k)).slice(0, 60);
  const lat = Number(d.lat), lon = Number(d.lon);
  const rec = {
    id, stato: "da approvare", ricevuto: p.created_at || new Date().toISOString(),
    community: s(d.comunita, 80), aula_id: s(d.aula_id, 80), luogo_nome: s(d.luogo_nome, 160),
    lat: Number.isFinite(lat) ? lat : null, lon: Number.isFinite(lon) ? lon : null, fonte_posizione: s(d.fonte_posizione, 20),
    quando: s(d.quando, 20), tempo: s(d.tempo, 120), classe: s(d.classe, 60), scuola: s(d.scuola, 160),
    numero: s(d.numero, 10), accompagnatori: s(d.accompagnatori, 300),
    racconto: s(d.racconto, 8000), voci: s(d.voci, 4000), video: s(d.video, 2000).split(/\s+/).filter(u => /^https:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\//.test(u)).slice(0, 10),
    audio_racconto: audioRacconto, audio_voci: audioVoci, foto,
    consensi: { genitori: on(d.consenso_genitori), volti_non_riconoscibili: on(d.volti_non_riconoscibili), licenza_aperta: on(d.licenza_aperta) },
    autore: s(d.autore, 120), email: s(d.email, 160),
    netlify_submission_id: s(p.id, 40), notifica: { stato: "in corso" }, storia: [{ quando: new Date().toISOString(), cosa: "ricevuto" }],
  };
  const store = getStore({ name: "contributi", consistency: "strong" });
  await store.setJSON(`c/${id}.json`, rec);

  const site = context?.site?.url || process.env.URL || "";
  // Trascrizione in background (se TRANSCRIBE_API_KEY è impostata; altrimenti «da trascrivere»).
  const keys = [audioRacconto, ...audioVoci.map(x => x.key)].filter(Boolean);
  if (keys.length && site) {
    try { await fetch(`${site}/api/trascrivi`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${process.env.ADMIN_TOKEN || ""}` }, body: JSON.stringify({ keys, aula_id: rec.aula_id, luogo_nome: rec.luogo_nome, community: rec.community, contributo: id }) }); } catch {}
  }

  // Email alla coordinatrice: riepilogo + link alla revisione. Nessun allegato (niente audio né foto).
  const to = process.env.NOTIFY_TO || "info@scuolenaturali.it";
  const link = `${site}/approva/#${id}`;
  const prime = rec.racconto ? rec.racconto.split(/\n+/).join(" ").slice(0, 280) + (rec.racconto.length > 280 ? "…" : "") : (audioRacconto ? "(racconto a voce)" : "(nessun testo)");
  const subject = `Nuovo contributo da approvare · ${rec.luogo_nome || "luogo nuovo"}`;
  const text = [
    "È arrivato un nuovo contributo alla Strada dei Bambini. Non è pubblicato: aspetta la tua approvazione.",
    "",
    `Chi: ${rec.autore || "—"}${rec.classe || rec.scuola ? ` · ${[rec.classe, rec.scuola].filter(Boolean).join(", ")}` : ""}`,
    `Dove: ${rec.luogo_nome || "luogo nuovo"}${rec.community ? ` (${rec.community})` : ""}${rec.aula_id ? "" : " · luogo nuovo"}`,
    `Quando: ${rec.quando || "—"}${rec.tempo ? ` · ${rec.tempo}` : ""}`,
    `Racconto: ${prime}`,
    `Foto: ${foto.length} · Audio: ${keys.length}${rec.video.length ? ` · Video: ${rec.video.length}` : ""}`,
    "",
    `Rivedi e approva: ${link}`,
  ].join("\n");
  rec.notifica = { a: to, oggetto: subject };
  if (process.env.RESEND_API_KEY && process.env.MAIL_FROM) {
    try {
      const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" }, body: JSON.stringify({ from: process.env.MAIL_FROM, to: [to], subject, text }) });
      rec.notifica.stato = r.ok ? "inviata" : `errore ${r.status}`;
      if (!r.ok) rec.notifica.errore = (await r.text()).slice(0, 300);
    } catch (e) { rec.notifica.stato = "errore"; rec.notifica.errore = String(e.message || e).slice(0, 300); }
  } else {
    rec.notifica.stato = "non inviata dalla funzione: mancano RESEND_API_KEY e MAIL_FROM (vale la notifica email di Netlify Forms, se attiva)";
  }
  rec.notifica.testo = text;
  rec.notifica.quando = new Date().toISOString();
  await store.setJSON(`c/${id}.json`, rec);
  console.log(`contributo ${id} salvato · notifica: ${rec.notifica.stato}`);
  return new Response("ok");
};
