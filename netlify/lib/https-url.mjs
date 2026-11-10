// URL https pubblici: campi facoltativi del modulo Contribuisci (sito scuola, profilo).
// Accetta solo https://, senza javascript:/data:/http:, senza credenziali, lunghezza limitata.
// Vuoto → ok (campo facoltativo). Host senza schema «www.esempio.it» viene normalizzato in https://.

export const MAX_HTTPS_URL = 500;

const SCHEMI_VIETATI = /^(javascript|data|blob|file|vbscript|about|mailto|intent):/i;
const HOST_VIETATI = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|::1|\[::1\])$/i;
const HOST_PRIVATI = /^(10\.|192\.168\.|169\.254\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|172\.(1[6-9]|2\d|3[01])\.)/;

export function parseHttpsUrl(raw, max = MAX_HTTPS_URL) {
  const t = String(raw ?? "").trim();
  if (!t) return { ok: true, url: "" };
  if (t.length > max) return { ok: false, url: "", error: "troppo lungo" };
  if (/[\s<>"']/.test(t)) return { ok: false, url: "", error: "caratteri non validi" };
  if (SCHEMI_VIETATI.test(t)) return { ok: false, url: "", error: "schema non consentito" };

  let candidate = t;
  if (candidate.startsWith("//")) candidate = "https://" + candidate.replace(/^\/+/, "");
  else if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(candidate)) candidate = "https://" + candidate;

  let u;
  try { u = new URL(candidate); } catch { return { ok: false, url: "", error: "url non valido" }; }
  if (u.protocol !== "https:") return { ok: false, url: "", error: "solo https" };
  if (u.username || u.password) return { ok: false, url: "", error: "credenziali non ammesse" };
  const host = u.hostname.replace(/\.$/, "").toLowerCase();
  if (!host || !host.includes(".") || host.startsWith(".") || host.includes("..")) return { ok: false, url: "", error: "host non valido" };
  if (HOST_VIETATI.test(host) || HOST_PRIVATI.test(host)) return { ok: false, url: "", error: "host non consentito" };
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return { ok: false, url: "", error: "indirizzo ip non consentito" };
  if (!/^[a-z0-9.-]+$/i.test(host)) return { ok: false, url: "", error: "host non valido" };
  if (u.port && u.port !== "443") return { ok: false, url: "", error: "porta non consentita" };
  u.hostname = host;
  const href = u.href;
  if (href.length > max) return { ok: false, url: "", error: "troppo lungo" };
  if (!href.startsWith("https://")) return { ok: false, url: "", error: "solo https" };
  return { ok: true, url: href };
}

export function normalizeHttpsUrl(raw, max = MAX_HTTPS_URL) {
  const r = parseHttpsUrl(raw, max);
  return r.ok ? r.url : "";
}

export const MSG_HTTPS_URL = "Inserisci un indirizzo https:// valido, oppure lascia il campo vuoto.";
