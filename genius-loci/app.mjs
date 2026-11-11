// «Parla con il Genius Loci» · interfaccia (fase 1 locale, fase 2 LLM solo se il server dice abilitato=true)
import { preparaIndice, cerca, evidenzia } from './cerca.mjs?v=1';

const $ = s => document.querySelector(s);
const thread = $('#gl-thread'), form = $('#gl-form'), campo = $('#gl-domanda');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ETA = { 'infanzia': 'Infanzia', 'primaria I-II': 'Primaria, classi I–II', 'primaria III-V': 'Primaria, classi III–V', 'secondaria': 'Secondaria di primo grado' };
const SUGGERIMENTI = ['Aule a Valdobbiadene per la primaria', 'UDA di matematica all’aperto', 'La ferita del luogo', 'Alberi e bosco per l’infanzia'];

let indice = null, llm = { abilitato: false };
const pronto = fetch('/genius-loci/indice.json?v=1').then(r => r.json()).then(d => { indice = preparaIndice(d); });
// Fase 2: il motore LLM si attiva solo se l'endpoint risponde {abilitato:true}. In locale o spento: si resta in fase 1.
fetch('/api/genius-loci', { headers: { accept: 'application/json' } })
  .then(r => r.ok ? r.json() : null).then(j => { if (j && j.abilitato === true) llm = j; }).catch(() => {});

function marcato(testo, trovati) {
  return evidenzia(testo, trovati).map(x => x.mark ? `<mark>${esc(x.t)}</mark>` : esc(x.t)).join('');
}

function card(r, i) {
  const n = i + 1;
  const badges = [];
  if (r.tipo === 'uda') badges.push(`<span class="badge ${r.stato === 'vissuta' ? 'vissuta' : 'proposta'}">${r.stato === 'vissuta' ? 'Vissuta' : 'Proposta'}</span>`);
  if (r.tipo === 'aula') badges.push('<span class="badge aula">Aula</span>');
  if (r.tipo === 'metodo') badges.push('<span class="badge metodo">Metodo</span>');
  const meta = r.tipo === 'uda'
    ? [r.comunita, (r.eta || []).map(e => ETA[e] || e).join(', '), (r.discipline || []).join(', ')].filter(Boolean).join(' · ')
    : r.tipo === 'aula' ? [r.comunita, r.area, r.classi ? 'Classi: ' + r.classi : '', r.categoria].filter(Boolean).join(' · ')
    : 'Mappe Genius Loci · D. Casertano, A. Rossetto';
  const titolo = r.url ? `<a href="${esc(r.url)}">${esc(r.titolo)}</a>` : esc(r.titolo);
  const voce = r.voce ? `<blockquote class="gl-voce">«${marcato(r.voce.testo, r.trovati)}»<footer>Voce dei bambini, verificata · ${esc(r.voce.fonte || 'fonte nella scheda')}</footer></blockquote>` : '';
  const avvisi = [];
  if (r.classeDiversa) avvisi.push('<p class="gl-avviso">Pensata per un’altra classe: da adattare.</p>');
  if (r.tipo === 'uda' && r.stato === 'proposta') avvisi.push('');
  const uda = r.tipo === 'aula' && r.uda && r.uda.length ? `<ul class="gl-uda">${r.uda.slice(0, 3).map(u => `<li><span class="badge ${u.stato === 'vissuta' ? 'vissuta' : 'proposta'}">${u.stato === 'vissuta' ? 'Vissuta' : 'Proposta'}</span> <a href="${esc(u.url)}">${esc(u.titolo)}</a></li>`).join('')}</ul>` : '';
  const links = [];
  if (r.url) links.push(`<a href="${esc(r.url)}">${r.tipo === 'aula' ? 'Scheda dell’aula' : 'Apri la scheda'} →</a>`);
  if (r.mappa) links.push(`<a href="${esc(r.mappa)}">Vedi sulla mappa →</a>`);
  return `<li class="gl-card" id="fonte-${n}">
    <div class="gl-badges"><span class="gl-num" aria-hidden="true">${n}</span>${badges.join('')}</div>
    <h3>${titolo}</h3>
    <p class="gl-meta">${esc(meta)}</p>
    ${voce}
    ${r.sezione && r.tipo !== 'aula' ? `<p class="gl-sez">${esc(r.sezione)}</p>` : ''}
    ${r.voce && r.estratto === r.voce.testo ? '' : `<p class="gl-estratto">${marcato(r.estratto, r.trovati)}</p>`}
    ${avvisi.join('')}${uda}
    ${links.length ? `<p class="gl-links">${links.join('')}</p>` : ''}
    ${r.tipo === 'metodo' && r.fonte ? `<p class="gl-fonte">${esc(r.fonte)}</p>` : ''}
  </li>`;
}

function rispostaHtml(res) {
  const intro = `<p class="gl-intro ${res.intro.tipo === 'vuoto' ? 'vuoto' : ''}">${esc(res.intro.testo)}</p>`;
  if (!res.risultati.length) {
    return (llm.abilitato ? '<div class="gl-llm" hidden></div>' : '') + intro + `<ul class="gl-suggerimenti" aria-label="Prova con">${SUGGERIMENTI.map(s => `<li><button type="button">${esc(s)}</button></li>`).join('')}</ul>`;
  }
  return intro + `<div class="gl-llm" hidden></div><ol class="gl-cards">${res.risultati.map(card).join('')}</ol>`;
}

async function chiedi(domanda) {
  domanda = domanda.trim().slice(0, 300);
  if (!domanda) return;
  document.body.classList.add('gl-chat');
  const q = document.createElement('div'); q.className = 'gl-q'; q.textContent = domanda;
  const a = document.createElement('div'); a.className = 'gl-a';
  a.innerHTML = `<img src="/favicon.svg?v=1" alt=""><div class="gl-a-body"><p class="gl-attesa">Cerco nelle schede…</p></div>`;
  thread.append(q, a);
  const url = new URL(location.href); url.searchParams.set('q', domanda); history.replaceState(null, '', url);
  await pronto;
  const res = cerca(indice, domanda, { max: 5 });
  const body = a.querySelector('.gl-a-body');
  body.innerHTML = rispostaHtml(res);
  body.querySelectorAll('.gl-suggerimenti button').forEach(b => b.addEventListener('click', () => chiedi(b.textContent)));
  q.scrollIntoView({ behavior: 'smooth', block: 'start' });
  if (llm.abilitato) faseDue(domanda, res, body); // il server cerca anche nei documenti interni
}

// ---------- fase 2 (spenta finché il server non risponde abilitato=true) ----------
async function faseDue(domanda, res, body) {
  const box = body.querySelector('.gl-llm');
  box.hidden = false; box.innerHTML = '<p class="gl-attesa">Il Genius Loci sta leggendo le schede…</p>';
  try {
    const r = await fetch('/api/genius-loci', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ domanda }) });
    const j = await r.json();
    if (!r.ok || !j.risposta) throw new Error(j.errore || 'non disponibile');
    // [S1] → rimando alla scheda numero 1 se è fra quelle mostrate; il testo è sempre escapato.
    const ids = new Map(res.risultati.map((x, i) => [x.titolo, i + 1]));
    const interne = []; // documenti interni del team: citati con titolo e autore, senza link
    const html = esc(j.risposta).replace(/\[S(\d+)\]/g, (m, k) => {
      const f = (j.fonti || [])[Number(k) - 1]; const n = f && ids.get(f.titolo);
      if (n) return `<a class="cita" href="#fonte-${n}">[${n}]</a>`;
      if (f && f.url) return `<a class="cita" href="${esc(f.url)}">[${esc(k)}]</a>`;
      if (f && f.tipo === 'documento') {
        let i = interne.indexOf(f) + 1; if (!i) { interne.push(f); i = interne.length; }
        return `<span class="cita" title="${esc(f.titolo)}">[d${i}]</span>`;
      }
      return '';
    }).split(/\n{2,}/).map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
    const doc = interne.length ? `<p class="gl-fonte">Documenti del team consultati (non pubblicati sul sito): ${interne.map((f, i) => `[d${i + 1}] ${esc(f.titolo)}${f.autore ? ` — ${esc(f.autore)}` : ''}`).join('; ')}.</p>` : '';
    box.innerHTML = html + doc + '<p class="gl-fonte">Risposta scritta da un modello linguistico. Le frasi con il numero [n] vengono dalle schede e dai documenti indicati; le «Idee» sono suggerimenti generali, da verificare sul tuo territorio. Controlla sempre la scheda.</p>';
  } catch (e) {
    box.innerHTML = '<p class="gl-fonte">La risposta scritta non è disponibile adesso: qui sotto trovi le schede pertinenti.</p>';
  }
}

form.addEventListener('submit', e => { e.preventDefault(); const v = campo.value; campo.value = ''; grow(); chiedi(v); });
campo.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); } });
function grow() { campo.style.height = 'auto'; campo.style.height = Math.min(campo.scrollHeight, 160) + 'px'; }
campo.addEventListener('input', grow);
document.querySelectorAll('#gl-esempi button').forEach(b => b.addEventListener('click', () => chiedi(b.textContent)));
const iniziale = new URLSearchParams(location.search).get('q');
if (iniziale) chiedi(iniziale); else campo.focus({ preventScroll: true });
