// Email di chi scrive un contributo: obbligatoria, mai pubblicata.
const EMAIL_RE = /^[A-Z0-9._%+'’-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;

export function emailValida(v) {
  const e = String(v ?? "").trim();
  if (e.length < 5 || e.length > 160) return "";
  if (e.includes(" ") || e.includes("\n") || e.includes("\r")) return "";
  if (!EMAIL_RE.test(e)) return "";
  return e;
}
