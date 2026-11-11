// «Parla con il Genius Loci» · motore di ricerca (fase 1, senza LLM).
// Modulo ES condiviso: lo usa la pagina /genius-loci/ nel browser e la funzione
// netlify/functions/genius-loci.mjs (fase 2) per scegliere gli stessi passi.
// Nessun testo viene generato: le risposte sono frasi-modello riempite con i metadati
// e con estratti VERI dei testi del sito.

const STOP = new Set(`a ad al allo alla ai agli alle all anche ancora avere aver abbia abbiamo ho hai ha hanno
c ce che chi ci cio come con col cosa cose cui da dal dallo dalla dai dagli dalle dell degli dei del della delle dello
di dove e ed era essere fa fare far fatto fra gli ha i il in io la le lei li lo loro lui ma me mi mia mie mio miei
ne nel nello nella nei negli nelle no noi non nostra nostro o od per perche piu po poi posso possiamo puo può quale
quali qualche quando quanto quella quelle quelli quello questa queste questi questo qui se sei si sia sono su sul sulla
sui sugli sulle sullo suo sua te ti tra tu tua tuo un una uno usare uso utilizzare vi voglio vorrei vuoi qualcosa
esempio esempi idea idee proposta proposte trovare trova cerco cercare mostrami dimmi parlami fammi sapere
aula aule uda unita attivita lavoro lavorare classe classi scuola scolastica bambini bambino bambina ragazzi alunni studenti
alunno insegnante maestra maestro docente docenti percorso percorsi luogo luoghi posto posti tema argomento
aperto aperta all fuori esterno outdoor primaria elementare elementari secondaria media medie infanzia materna asilo
prima seconda terza quarta quinta primo secondo terzo quarto quinto grado anno
detto dette detti dicono dice hanno scritto raccontato parole voci voce frasi frase
genius loci sito strada sull sullo nell nello dell dello dall dallo coll quel quei bell tutto tutti tutte
qualcuno ognuno lui fatta fatte avete hanno serve servono funziona`.split(/\s+/).filter(Boolean));

// Sinonimi semplici: la parola cercata richiama anche queste (peso ridotto).
const SINONIMI = {
  acqua: 'acque fiume fiumi torrente ruscello sorgente sorgenti fontana fontane pozzo pozzi mare lago canale acquedotto ninfeo roggia lavatoio piave greto pioggia',
  fiume: 'piave torrente greto acqua argine',
  matematica: 'geometria misura misure misurare numeri calcolo forme angoli grafico equazione',
  geometria: 'matematica forme angoli misura',
  scienze: 'natura piante animali alberi rocce osservazione insetti',
  storia: 'memoria passato antico antica archeologia guerra',
  arte: 'disegno disegni pittura colori immagine',
  musica: 'canto canzone suoni suono ascolto',
  italiano: 'scrittura racconto poesia testo lettura',
  geografia: 'mappa carta orientamento paesaggio confini',
  motoria: 'corpo movimento gioco giochi',
  alberi: 'albero bosco castagno quercia pino pini pineta foglie',
  albero: 'alberi bosco castagno quercia',
  passeggiata: 'survey camminata cammino uscita esplorazione passi sentiero',
  ferita: 'ombra ferite abbandono nonluoghi',
  metodo: 'survey passi categorie',
  memoria: 'ricordi anziani nonni racconti orale',
  nonni: 'anziani memoria',
  pietra: 'pietre roccia rocce menhir muretti',
  vino: 'vigna vigneti vendemmia prosecco',
  guerra: 'grande trincea soldati',
  cibo: 'pane olio vino orto alimentare',
  terremoto: 'sisma sismico terremoti',
  sisma: 'terremoto',
  chiesa: 'chiese duomo pieve capitello parrocchia',
  mappa: 'mappe carta cartina',
  orto: 'semina coltivare piante',
};

const COMUNITA = [
  { nome: 'Siracusa', re: /\b(siracusa|ortigia|neapolis|siracusan\w*)\b/ },
  { nome: 'Valdobbiadene', re: /\b(valdobbiadene|bigolino|saccol|santo stefano|san vito|san pietro di barbozza|barbozza)\b/ },
  { nome: 'Salento', re: /\b(salento|botrugno|nociglia|supersano|san cassiano|salentin\w*)\b/ },
];

const DISCIPLINE = ['arte','storia','italiano','geografia','educazione civica','scienze','matematica','musica','tecnologia','educazione motoria','motoria','campi di esperienza','educazione alimentare'];

export function normalizza(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[’'`]/g, ' ').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function radice(t) { // stemmer leggerissimo per l'italiano
  if (t.length <= 3 || /^\d+$/.test(t)) return t;
  for (const suf of ['amente','mente','azioni','azione','zioni','zione','ita','ismo','iste','ista']) {
    if (t.length - suf.length >= 4 && t.endsWith(suf)) { t = t.slice(0, -suf.length); break; }
  }
  if (t.length >= 4) t = t.replace(/(he|hi|e|i|a|o)$/, '');
  return t;
}

function parole(s) { return normalizza(s).split(' ').filter(Boolean); }
function radici(s, stop = true) { return parole(s).filter(w => !(stop && STOP.has(w)) && w.length > 1).map(radice); }

// ---------- capire la domanda ----------
export function capisci(domanda) {
  const q = ' ' + normalizza(domanda) + ' ';
  const out = { domanda, comunita: null, classe: null, classeEtichetta: null, intento: 'generale', discipline: [] };
  for (const c of COMUNITA) if (c.re.test(q)) { out.comunita = c.nome; break; }
  // classe
  let m;
  if ((m = q.match(/\b(prima|seconda|terza|1a|2a|3a)\s+(media|medie|secondaria)\b/)) || /\b(medie|media|secondaria)\b/.test(q)) {
    out.classe = 'secondaria'; out.classeEtichetta = m ? `${m[1].replace(/a$/, 'a')} media` : 'secondaria di primo grado';
    out.numeroClasse = m ? m[1] : null;
  } else if ((m = q.match(/\b(terza|quarta|quinta|3a|4a|5a)\b/))) {
    out.classe = 'primaria III-V'; out.classeEtichetta = `${m[1]} primaria`; out.numeroClasse = m[1];
  } else if ((m = q.match(/\b(prima|seconda|1a|2a)\s+(primaria|elementare|classe)\b/)) || (m = q.match(/\bclasse\s+(prima|seconda)\b/))) {
    out.classe = 'primaria I-II'; out.classeEtichetta = `${m[1]} primaria`;
  } else if (/\b(primaria|elementare|elementari)\b/.test(q)) {
    out.classe = 'primaria'; out.classeEtichetta = 'primaria';
  } else if (/\b(infanzia|materna|asilo|sezione|5 anni|cinque anni)\b/.test(q)) {
    out.classe = 'infanzia'; out.classeEtichetta = 'scuola dell’infanzia';
  }
  for (const d of DISCIPLINE) if (q.includes(' ' + d + ' ') || q.includes(' ' + d.slice(0, -1))) out.discipline.push(d === 'motoria' ? 'educazione motoria' : d);
  if (/\b(hanno detto|ha detto|dicono|dice|hanno scritto|parole dei bambini|voci|voce dei bambini|frasi dei bambini|cosa pensano)\b/.test(q)) out.intento = 'voci';
  else if (/\b(come si fa|metodo|survey|ferita|sette passi|7 passi|passi del|categorie|categoria|cos e il genius|che cos e|ruskin|terzo paesaggio|non luogh)/.test(q) || /passeggiata genius/.test(q)) out.intento = 'metodo';
  else if (/\b(aula|aule|luogo|luoghi|dove posso|dove andare|posto)\b/.test(q)) out.intento = 'aula';
  // parole di contenuto: tolgo luoghi-filtro e numeri di classe
  let contenuto = q;
  for (const c of COMUNITA) contenuto = contenuto.replace(c.re, ' ');
  out.termini = [...new Set(radici(contenuto))].filter(t => !/^\d{1,2}$/.test(t)); // «16 categorie», «7 passi»: conta la parola, non il numero
  out.espansioni = {};
  for (const w of parole(contenuto)) {
    const syn = SINONIMI[w] || SINONIMI[w.replace(/e$/, 'a')];
    if (syn) out.espansioni[radice(w)] = [...new Set(radici(syn, false))].filter(s => s !== radice(w));
  }
  return out;
}

// ---------- indice BM25 ----------
export function preparaIndice(dati) {
  const passi = dati.passi;
  const df = new Map(); let tot = 0;
  for (const p of passi) {
    const campi = [p.titolo, p.titolo, p.sezione, p.testo, (p.discipline || []).join(' '), (p.discipline || []).join(' '), p.luogo, p.aula, p.categoria, p.classi].filter(Boolean).join(' ');
    const toks = radici(campi);
    p._len = toks.length; tot += toks.length;
    const tf = new Map(); for (const t of toks) tf.set(t, (tf.get(t) || 0) + 1);
    p._tf = tf;
    for (const t of tf.keys()) df.set(t, (df.get(t) || 0) + 1);
  }
  const schede = new Map(dati.schede.map(s => [s.ref, s]));
  const aule = new Map(dati.aule.map(a => [a.ref, a]));
  return { passi, df, N: passi.length, avg: tot / passi.length, schede, aule };
}

function bm25(ix, p, t) {
  const f = p._tf.get(t); if (!f) return 0;
  const n = ix.df.get(t) || 0;
  const idf = Math.log(1 + (ix.N - n + 0.5) / (n + 0.5));
  const k1 = 1.2, b = 0.5;
  return idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * p._len / ix.avg));
}

function classeCompatibile(p, ix, classe) {
  if (!classe) return true;
  let eta = p.eta;
  if (p.tipo === 'aula') {
    if (p.classi) {
      const c = normalizza(p.classi);
      if (classe === 'secondaria') return c.includes('secondaria');
      if (classe === 'infanzia') return c.includes('infanzia');
      return c.includes('primaria');
    }
    const a = ix.aule.get(p.ref);
    eta = (a?.uda || []).flatMap(id => ix.schede.get(id)?.eta || []);
    if (!eta.length) return null; // non dichiarato
  }
  if (!eta || !eta.length) return p.tipo === 'metodo' ? true : null;
  if (classe === 'primaria') return eta.some(e => e.startsWith('primaria'));
  return eta.includes(classe);
}

function classeAulaPrecisa(p, cap) { // quarta → "Quarta primaria" nelle aule di Siracusa
  if (!cap.numeroClasse || !p.classi) return true;
  const n = { '3a': 'terza', '4a': 'quarta', '5a': 'quinta', '1a': 'prima', '2a': 'seconda' }[cap.numeroClasse] || cap.numeroClasse;
  const c = normalizza(p.classi);
  return cap.classe === 'secondaria' ? c.includes(n + ' secondaria') : c.includes(n + ' primaria');
}

function codiceClassePreciso(sc, cap) { // SR-UDA-3P-01 → terza primaria
  if (!sc || !cap.numeroClasse || !sc.codice) return true;
  const m = sc.codice.match(/-(\d)([PS])-/); if (!m) return true;
  const n = { terza: '3', quarta: '4', quinta: '5', prima: '1', seconda: '2' }[cap.numeroClasse] || cap.numeroClasse[0];
  return m[1] === n;
}

// ---------- ricerca ----------
export function cerca(ix, domanda, { max = 5 } = {}) {
  const cap = capisci(domanda);
  const termini = cap.termini;
  const pesati = [];
  for (const t of termini) pesati.push([t, 1, t]);
  for (const [t, syn] of Object.entries(cap.espansioni)) for (const s of syn) if (!termini.includes(s)) pesati.push([s, 0.35, t]);
  for (const d of cap.discipline) for (const t of radici(d)) if (!termini.includes(t)) pesati.push([t, 0.8, t]);

  const candidati = [];
  for (const p of ix.passi) {
    if (cap.comunita && p.tipo !== 'metodo' && p.comunita !== cap.comunita) continue;
    if (cap.comunita && p.tipo === 'metodo') continue;
    if (p.voce && cap.intento !== 'voci') continue;
    let s = 0; const coperti = new Set(); const trovati = new Set();
    for (const [t, w, origine] of pesati) {
      const v = bm25(ix, p, t);
      if (v > 0) { s += v * w; coperti.add(origine); trovati.add(t); }
    }
    // domande «solo filtri» (es. aule a Valdobbiadene per la primaria): punteggio base
    const soloFiltri = !termini.length && !cap.discipline.length;
    if (soloFiltri) s = (0.5 + Math.min(p.testo.length, 600) / 1200) * (p.sezione === 'In breve' || p.tipo === 'aula' ? 1 : 0.5) * (cap.intento === 'aula' && p.tipo === 'aula' ? (ix.aule.get(p.ref)?.uda?.length ? 2.2 : 1.6) : 1);
    if (s <= 0) continue;
    if (cap.discipline.length && p.tipo === 'uda') s *= (p.discipline || []).some(d => cap.discipline.includes(d)) ? 1.5 : 0.5;
    if (cap.intento === 'aula') s *= p.tipo === 'aula' ? 1.8 : (p.tipo === 'uda' ? 1 : 0.3);
    if (cap.intento === 'metodo') s *= p.tipo === 'metodo' ? 2.2 : 0.6;
    if (cap.intento === 'voci') s *= p.voce ? 2 : (p.tipo === 'uda' ? 1 : 0.2);
    if (cap.intento === 'generale' && p.tipo === 'metodo') s *= (cap.classe || cap.comunita) ? 0.3 : 0.6;
    if (cap.intento !== 'aula' && cap.intento !== 'generale' && p.tipo === 'aula') s *= 0.5;
    const cc = classeCompatibile(p, ix, cap.classe);
    if (cc === false) s *= 0.25; else if (cc === null) s *= 0.6;
    if (cc && p.tipo === 'aula' && !classeAulaPrecisa(p, cap)) s *= 0.4;
    if (cc && p.tipo === 'uda' && !codiceClassePreciso(ix.schede.get(p.ref), cap)) s *= 0.4;
    candidati.push({ p, s, coperti, trovati, classeOk: cc });
  }
  // raggruppo per scheda / aula / capitolo del metodo
  const gruppi = new Map();
  for (const c of candidati) {
    const k = c.p.tipo + ':' + (c.p.tipo === 'metodo' ? c.p.titolo : c.p.ref);
    const g = gruppi.get(k);
    if (!g) gruppi.set(k, { chiave: k, migliore: c, punteggio: c.s, coperti: new Set(c.coperti), trovati: new Set(c.trovati), voci: c.p.voce ? [c] : [], passi: [c] });
    else {
      g.punteggio += c.s * 0.25; g.passi.push(c);
      c.coperti.forEach(x => g.coperti.add(x)); c.trovati.forEach(x => g.trovati.add(x));
      if (c.p.voce) g.voci.push(c);
      if (c.s > g.migliore.s) { g.punteggio += g.migliore.s * 0.75 - c.s * 0.25 + c.s - g.migliore.s; g.migliore = c; }
    }
  }
  let lista = [...gruppi.values()];
  const nTermini = new Set([...termini, ...cap.discipline.flatMap(d => radici(d))]).size;
  const soglia = nTermini <= 2 ? nTermini : Math.ceil(nTermini * 0.67);
  lista = lista.filter(g => !nTermini || g.coperti.size >= soglia);
  lista.sort((a, b) => b.punteggio - a.punteggio);
  if (lista.length) { const top = lista[0].punteggio; lista = lista.filter(g => g.punteggio >= top * 0.22); }
  const classeMancante = cap.classe && lista.length && !lista.slice(0, max).some(g => g.migliore.classeOk === true);
  const risultati = lista.slice(0, max).map(g => scheda(ix, g, cap));
  return { capito: cap, risultati, classeMancante, totale: lista.length, intro: introduzione(ix, cap, risultati, lista, classeMancante) };
}

function scheda(ix, g, cap) {
  const p = g.migliore.p;
  const base = { tipo: p.tipo, titolo: p.titolo, comunita: p.comunita, sezione: p.sezione, passoId: p.id, trovati: [...g.trovati], fonte: p.fonte };
  const passiId = g.passi.sort((a, b) => b.s - a.s).slice(0, 3).map(c => c.p.id);
  if (p.tipo === 'uda') {
    const s = ix.schede.get(p.ref) || {};
    const voce = cap.intento === 'voci' && g.voci.length ? g.voci.sort((a, b) => b.s - a.s)[0].p : null;
    const estrattoDa = voce ? (g.passi.filter(c => !c.p.voce).sort((a, b) => b.s - a.s)[0]?.p || ix.passi.find(x => x.ref === p.ref && x.sezione === 'In breve') || p) : p;
    return { ...base, ref: p.ref, stato: s.stato, eta: s.eta, discipline: s.discipline, aula: s.aula, sottotitolo: s.sottotitolo,
      sezione: estrattoDa.sezione, estratto: estratto(estrattoDa.testo, g.trovati), voce: voce ? { testo: voce.testo, fonte: voce.fonte } : null,
      vociInVerifica: s.voci_in_verifica, classeDiversa: g.migliore.classeOk === false || (cap.classe && !codiceClassePreciso(s, cap)), url: `/esperienza.html?id=${encodeURIComponent(p.ref)}`,
      mappa: s.aula_id ? `/mappa.html?aula=${encodeURIComponent(s.aula_id)}` : null, passi: passiId };
  }
  if (p.tipo === 'aula') {
    const a = ix.aule.get(p.ref) || {};
    const uda = (a.uda || []).map(id => ix.schede.get(id)).filter(Boolean).map(s => ({ titolo: s.titolo, stato: s.stato, url: `/esperienza.html?id=${encodeURIComponent(s.ref)}` }));
    return { ...base, ref: p.ref, classi: a.classi, categoria: a.categoria, area: a.area, uda, classeDiversa: g.migliore.classeOk === false || (cap.classe && !classeAulaPrecisa(p, cap)),
      estratto: estratto(p.testo.split('\n').filter(l => !/^(Categoria|Classi|Area):/.test(l)).join('\n') || p.testo, g.trovati),
      url: `/aula.html?id=${encodeURIComponent(p.ref)}`, mappa: `/mappa.html?aula=${encodeURIComponent(p.ref)}`, passi: passiId };
  }
  return { ...base, estratto: estratto(p.testo, g.trovati), passi: passiId };
}

// estratto vero (~260 caratteri) attorno alla zona con più parole trovate
export function estratto(testo, trovati, lung = 280) {
  const t = String(testo || '').replace(/\s*\n\s*/g, ' ');
  if (t.length <= lung) return t;
  const set = new Set(trovati); const pos = [];
  for (const m of t.matchAll(/[\p{L}\p{N}]+/gu)) if (set.has(radice(normalizza(m[0])))) pos.push(m.index);
  let start = 0;
  if (pos.length) {
    let best = pos[0], bestN = 0;
    for (const a of pos) { const n = pos.filter(b => b >= a && b < a + lung * 0.8).length; if (n > bestN) { bestN = n; best = a; } }
    start = Math.max(0, best - 60);
    const dot = t.lastIndexOf('. ', best); if (dot >= 0 && best - dot < 140) start = dot + 2;
  }
  let fine = Math.min(t.length, start + lung);
  const sp = t.lastIndexOf(' ', fine); if (fine < t.length && sp > start + 100) fine = sp;
  return (start > 0 ? '… ' : '') + t.slice(start, fine).trim() + (fine < t.length ? ' …' : '');
}

// segna le parole trovate: restituisce pezzi [{t, mark}] (l'HTML lo fa chi disegna)
export function evidenzia(testo, trovati) {
  const set = new Set(trovati); const out = []; let last = 0;
  for (const m of String(testo).matchAll(/[\p{L}\p{N}]+/gu)) {
    const n = normalizza(m[0]);
    if (n.length > 2 && !STOP.has(n) && set.has(radice(n))) {
      if (m.index > last) out.push({ t: testo.slice(last, m.index) });
      out.push({ t: m[0], mark: true }); last = m.index + m[0].length;
    }
  }
  if (last < testo.length) out.push({ t: testo.slice(last) });
  return out;
}

function plur(n, s, p) { return n === 1 ? `${n} ${s}` : `${n} ${p}`; }
function tema(cap) {
  const parole = parole_tema(cap);
  return parole ? `«${parole}»` : '';
}
function parole_tema(cap) {
  const q = normalizza(cap.domanda).split(' ').filter(w => !STOP.has(w) && w.length > 2 && !COMUNITA.some(c => c.re.test(' ' + w + ' ')));
  return q.slice(0, 4).join(' ');
}

function introduzione(ix, cap, risultati, lista, classeMancante) {
  const dove = cap.comunita ? ` a ${cap.comunita}` : '';
  const perChi = cap.classeEtichetta ? ` per la ${cap.classeEtichetta}` : '';
  if (!risultati.length) {
    if (cap.comunita && cap.classe) return { tipo: 'vuoto', testo: `Non ho trovato nulla${dove}${perChi} che risponda davvero alla domanda. Non voglio inventare: prova a togliere la classe o il luogo, oppure a usare un tema più semplice (acqua, alberi, memoria, confini).` };
    return { tipo: 'vuoto', testo: 'Su questo nei testi del sito non ho trovato niente di pertinente, e preferisco non inventare. Prova a nominare un luogo (Valdobbiadene, Botrugno, Druento), una classe (quarta, seconda media) o un tema (acqua, alberi, memoria, la ferita del luogo).' };
  }
  const uda = risultati.filter(r => r.tipo === 'uda');
  const v = uda.filter(r => r.stato === 'vissuta').length, pr = uda.filter(r => r.stato === 'proposta').length;
  const statoFrase = !uda.length ? '' : (pr && !v ? (uda.length === 1 ? ' È una proposta: un’idea da provare, non ancora vissuta con una classe.' : ' Sono tutte proposte: idee da provare, non ancora vissute con una classe.')
    : (v && !pr ? ` ${uda.length === 1 ? 'È un’esperienza vissuta' : 'Sono tutte esperienze vissute'} da una classe.` : ` ${plur(v, 'è vissuta', 'sono vissute')} da una classe, ${plur(pr, 'è una proposta', 'sono proposte')} ancora da provare.`));
  const altre = risultati.filter(r => r.classeDiversa).length;
  const scusaClasse = classeMancante ? ` Per la ${cap.classeEtichetta} non ho trovato schede proprio su questo: ti mostro le più vicine, pensate per altre classi, da adattare.` : (altre ? ` ${altre === 1 ? 'Una è pensata' : `${altre} sono pensate`} per un’altra classe: è segnato sulla scheda.` : '');
  if (cap.intento === 'voci') {
    const conVoce = risultati.filter(r => r.voce).length;
    if (conVoce) return { tipo: 'voci', testo: `Ecco ${conVoce === 1 ? 'una frase' : 'alcune frasi'} dei bambini, così come sono trascritte e verificate nella fonte${dove}. Sotto ogni frase trovi la scheda da cui viene.${scusaClasse}` };
    const inVerifica = risultati.some(r => r.vociInVerifica);
    if (inVerifica) return { tipo: 'voci', testo: `Le parole dei bambini su ${tema(cap) || 'questo tema'} sono ancora in verifica: le trascrizioni non sono state controllate, quindi non le cito. Ti mostro le schede in cui se ne parla; lì potrai leggerle quando saranno verificate.` };
    return { tipo: 'voci', testo: `Non ho trovato parole dei bambini verificate su ${tema(cap) || 'questo tema'}. Queste sono le schede che ne parlano.${statoFrase}` };
  }
  if (cap.intento === 'metodo') return { tipo: 'metodo', testo: `Lo racconta il metodo Mappe Genius Loci${risultati.some(r => r.tipo === 'uda') ? ', e ci sono schede che lo mettono in pratica' : ''}. Ecco i passi più vicini alla tua domanda.` };
  if (cap.intento === 'aula') {
    const aule = risultati.filter(r => r.tipo === 'aula');
    if (cap.comunita) {
      const tutte = [...ix.aule.values()].filter(a => a.comunita === cap.comunita);
      const adatte = cap.classe ? tutte.filter(a => classeCompatibile({ tipo: 'aula', ref: a.ref, classi: a.classi }, ix, cap.classe) === true && classeAulaPrecisa({ classi: a.classi }, cap)) : tutte;
      const conUda = adatte.filter(a => a.uda && a.uda.length).length;
      const quante = adatte.length === 1 ? 'c’è 1 aula' : `ci sono ${adatte.length} aule`;
      const descr = cap.classe ? (adatte.some(a => a.classi) ? ` indicate${perChi}` : ` con schede UDA${perChi}`) : ' con una descrizione o una scheda';
      const udaFrase = conUda && adatte.some(a => a.classi) ? ` ${conUda === 1 ? 'Per una di queste c’è già una scheda UDA.' : `Per ${conUda} di queste ci sono già schede UDA.`}` : '';
      return { tipo: 'aula', testo: `Nella mappa di ${cap.comunita} ${quante}${descr}.${udaFrase} Ti mostro ${risultati.length === 1 ? 'il risultato più pertinente' : `i ${risultati.length} risultati più pertinenti`}.${scusaClasse}` };
    }
    return { tipo: 'aula', testo: `Ho trovato ${plur(risultati.length, 'luogo o scheda', 'luoghi e schede')} vicini alla tua domanda.${statoFrase}${scusaClasse}` };
  }
  const t = tema(cap);
  return { tipo: 'generale', testo: `Ho trovato ${lista.length === 1 ? `un risultato che parla` : `${lista.length} risultati che parlano`}${t ? ` di ${t}` : ''}${dove}${perChi}${lista.length > 1 ? (risultati.length === 1 ? '; ti mostro il più pertinente' : `; ti mostro i ${risultati.length} più pertinenti`) : ''}.${statoFrase}${scusaClasse}` };
}
