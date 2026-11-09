// Chi sta chiamando? Token in "Authorization: Bearer …" (o ?token= per compatibilità).
// ADMIN_TOKEN  → coordinatrice, tutte le comunità.
// COMMUNITY_TOKENS (JSON {"Valdobbiadene":"…"}) → community manager, solo la sua comunità (pronto, non ancora usato).
import { timingSafeEqual } from "node:crypto";

const eq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };

export function tokenFrom(req) {
  const h = req.headers.get("authorization") || "";
  if (h.toLowerCase().startsWith("bearer ")) return h.slice(7).trim();
  return new URL(req.url).searchParams.get("token") || "";
}

export function who(req, { allowAudioToken = false } = {}) {
  const t = tokenFrom(req);
  if (!t) return null;
  if (process.env.ADMIN_TOKEN && eq(t, process.env.ADMIN_TOKEN)) return { role: "coordinatrice", community: null };
  if (allowAudioToken && process.env.AUDIO_READ_TOKEN && eq(t, process.env.AUDIO_READ_TOKEN)) return { role: "ascolto", community: null };
  let map = {};
  try { map = JSON.parse(process.env.COMMUNITY_TOKENS || "{}"); } catch {}
  for (const [community, tok] of Object.entries(map)) if (tok && eq(t, tok)) return { role: "community", community };
  return null;
}

export const canSee = (user, community) => !!user && (user.community === null || user.community === community);

export const json = (o, status = 200, extra = {}) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra } });
