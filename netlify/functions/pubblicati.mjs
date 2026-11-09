// Endpoint pubblico: SOLO i contributi approvati, già ripuliti (niente audio, niente contatti).
import { getStore } from "@netlify/blobs";

export default async () => {
  const store = getStore({ name: "contributi", consistency: "strong" });
  const { blobs } = await store.list({ prefix: "pub/" });
  const out = [];
  for (const b of blobs) { const r = await store.get(b.key, { type: "json" }); if (r) out.push(r); }
  out.sort((x, y) => String(y.approvato).localeCompare(String(x.approvato)));
  return new Response(JSON.stringify(out), { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=30", "access-control-allow-origin": "*" } });
};

export const config = { path: "/api/pubblicati" };
