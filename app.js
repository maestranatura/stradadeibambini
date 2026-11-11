'use strict';
const $=s=>document.querySelector(s), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const MAX_HTTPS_URL=500;
function parseHttpsUrl(raw, max=MAX_HTTPS_URL){
  const t=String(raw??'').trim();
  if(!t) return {ok:true,url:''};
  if(t.length>max) return {ok:false,url:'',error:'troppo lungo'};
  if(/[\s<>"']/.test(t)) return {ok:false,url:'',error:'caratteri non validi'};
  if(/^(javascript|data|blob|file|vbscript|about|mailto|intent):/i.test(t)) return {ok:false,url:'',error:'schema non consentito'};
  let candidate=t;
  if(candidate.startsWith('//')) candidate='https://'+candidate.replace(/^\/+/, '');
  else if(!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(candidate)) candidate='https://'+candidate;
  let u; try{ u=new URL(candidate); }catch{ return {ok:false,url:'',error:'url non valido'}; }
  if(u.protocol!=='https:') return {ok:false,url:'',error:'solo https'};
  if(u.username||u.password) return {ok:false,url:'',error:'credenziali non ammesse'};
  const host=u.hostname.replace(/\.$/, '').toLowerCase();
  if(!host||!host.includes('.')||host.startsWith('.')||host.includes('..')) return {ok:false,url:'',error:'host non valido'};
  if(/^(localhost|127\.0\.0\.1|0\.0\.0\.0|::1|\[::1\])$/i.test(host)) return {ok:false,url:'',error:'host non consentito'};
  if(/^(10\.|192\.168\.|169\.254\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) return {ok:false,url:'',error:'host non consentito'};
  if(/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return {ok:false,url:'',error:'indirizzo ip non consentito'};
  if(!/^[a-z0-9.-]+$/i.test(host)) return {ok:false,url:'',error:'host non valido'};
  if(u.port&&u.port!=='443') return {ok:false,url:'',error:'porta non consentita'};
  u.hostname=host;
  const href=u.href;
  if(href.length>max||!href.startsWith('https://')) return {ok:false,url:'',error:'solo https'};
  return {ok:true,url:href};
}
function extLink(href, label){
  const p=parseHttpsUrl(href);
  if(!p.ok||!p.url) return esc(label);
  return `<a href="${esc(p.url)}" rel="nofollow noopener ugc" target="_blank">${esc(label)}</a>`;
}
function raccontatoDaHtml(e){
  if(!e||!e.contributo) return '';
  const nome=e.autore||'—';
  const chi=parseHttpsUrl(e.profilo).url?extLink(e.profilo,nome):esc(nome);
  const scuolaNome=e.scuola||'';
  const sito=parseHttpsUrl(e.sito_scuola).url;
  let scuola='';
  if(sito&&scuolaNome) scuola=extLink(e.sito_scuola,scuolaNome);
  else if(sito) scuola=extLink(e.sito_scuola,'Sito della scuola');
  else if(scuolaNome) scuola=esc(scuolaNome);
  const bits=[`Raccontato da ${chi}`];
  const resto=[e.classe?esc(e.classe):'', scuola].filter(Boolean).join(' · ');
  if(resto) bits.push(resto);
  return `<p class="provenance raccontato-da">${bits.join(' · ')}</p>`;
}
const ages=['infanzia','primaria I-II','primaria III-V','secondaria'];
const groups=['piccolo gruppo fino a 10','classe','più classi'];
const groupLabels={'piccolo gruppo fino a 10':'Piccolo gruppo (fino a 10)','classe':'Una classe','più classi':'Più classi'};
function options(values, selected='', blank=''){
  return (blank?`<option value="">${esc(blank)}</option>`:'')+values.map(v=>`<option value="${esc(v)}"${v===selected?' selected':''}>${esc(groupLabels[v]||v)}</option>`).join('');
}

function videoBlocks(videos){
  if(!videos || !videos.length) return '';
  return `<div class="video-stack">${videos.map(v=>{
    const src = (v.embed || '').replace('youtube.com/embed/','youtube-nocookie.com/embed/');
    const title = v.titolo || 'Video';
    const meta = [v.canale, v.url ? `<a target="_blank" rel="noopener" href="${esc(v.url)}">Apri su YouTube ↗</a>` : ''].filter(Boolean).join(' · ');
    return `<figure class="video-card"><div class="embed"><iframe src="${esc(src)}" title="${esc(title)}" loading="lazy" allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div><figcaption><strong>${esc(title)}</strong>${meta?`<br><span class="muted">${meta}</span>`:''}</figcaption></figure>`;
  }).join('')}</div>`;
}
// --- Cantiere: le formule «da completare / da validare con i docenti» restano nei dati
// ma non si mostrano. Al pubblico basta un segno per scheda: «Scheda in lavorazione». ---
const CANTIERE_RE=/(\bda (validare|completare|verificare|confermare|recuperare|raccogliere|indicare|integrare|definire|ricostruire|trascrivere)\b|\bnon (ancora )?documentat[oaie]\b|\bin verifica\b)/i;
// Frasi oneste da tenere: dicono che una cosa NON è avvenuta, non che manca un dato.
const CANTIERE_OK_RE=/\bnon (ancora )?documentat[oaie] come (svolt|realizzat)[oaie]/gi;
function cantiereIn(s){ return CANTIERE_RE.test(String(s??'').replace(CANTIERE_OK_RE,'')); }
function spezzaFrasi(t){
  const out=[]; let depth=0, cur='';
  for(let i=0;i<t.length;i++){
    const c=t[i]; cur+=c;
    if(c==='('||c==='«') depth++;
    else if((c===')'||c==='»')&&depth>0) depth--;
    if(depth) continue;
    if(c===';'){ out.push([cur.slice(0,-1).trim(),';']); cur=''; }
    else if(/[.!?]/.test(c) && /\s/.test(t[i+1]||'')){
      const rest=t.slice(i+1).trimStart();
      if(/^[A-ZÀ-ÖØ-Ý«“"(]/.test(rest) || /^proposta di raccordo/i.test(rest)){ out.push([cur.trim(),'.']); cur=''; }
    }
  }
  if(cur.trim()) out.push([cur.trim(),'']);
  return out;
}
// Toglie il segnaposto: se la frase è fatta solo di cantiere sparisce, se è una parte si toglie quella parte.
function pulisciCantiere(s, nota){
  let t=String(s??'').trim();
  if(!t||!cantiereIn(t)) return {t, cambiato:false};
  const orig=t;
  t=t.replace(/(raccordo\s+)?(proposta di raccordo)\s*,\s*da validare con (i|le) (docenti|maestre)\s*:/gi,(m,a,p)=>p+':');
  t=t.replace(/,\s*da validare\s*:/gi,':');
  t=t.replace(/(proposta di raccordo)\s*,\s*da (validare|definire) con (i|le) (docenti|maestre)\s*,\s*/gi,'$1 ');
  t=t.replace(/\s*,\s*da (validare|definire|verificare|completare|confermare)(\s+con\s+(i|le)\s+(docenti|maestre|scuole)|\s+con una classe)?(?=\s*[,.;)]|\s*$)/gi,'');
  t=t.replace(/\s*\(([^()]*)\)/g,(m,inner)=>cantiereIn(inner)?'':m);
  const out=[];
  for(const [q0,sep] of spezzaFrasi(t)){
    const q=q0.trim(); if(!q) continue;
    if(cantiereIn(q) || (!nota && /^(raccordo\s+)?proposta di raccordo[.;]?$/i.test(q))){
      if(out.length){ const last=out[out.length-1]; if(/[.!?]$/.test(q) && !/[.!?»)]$/.test(last.q)) last.q+='.'; last.sep=sep; }
      continue;
    }
    out.push({q,sep});
  }
  let r=out.map((o,i)=>o.q+(i<out.length-1?(o.sep===';'?'; ':' '):'')).join('').trim();
  r=r.replace(/^[\s,;:]+/,'').replace(/[\s,;]+$/,'');
  if(/:$/.test(r) && !/:$/.test(orig)) r=r.replace(/[\s:]+$/,'');
  if(r && /[.]$/.test(orig) && !/[.!?»):]$/.test(r)) r+='.';
  if(r && /^[A-ZÀ-Ý«]/.test(orig)) r=r.charAt(0).toUpperCase()+r.slice(1);
  if(r.replace(/[^a-zà-ù]/gi,'').length<3) r='';
  return {t:r, cambiato:r!==orig};
}
let CANTIERE_SEGNO=false; // si accende durante il render di una scheda quando qualcosa viene nascosto
function P(s, nota){ const r=pulisciCantiere(s, nota); if(r.cambiato) CANTIERE_SEGNO=true; return r.t; }
function segnoLavorazione(){ return `<p class="scheda-lavorazione" role="note"><span class="badge lavorazione">Scheda in lavorazione</span> <span class="muted">Alcune parti aspettano ancora la conferma delle scuole: le aggiungiamo quando arrivano.</span></p>`; }

// --- Tipi di scheda: UDA (percorso o scheda completa), Tappa (sosta di un percorso), Proposta (non ancora provata) ---
function tipoScheda(e){ if(e.contributo) return 'contributo'; if(e.percorso_uda) return 'tappa'; return 'uda'; }
function etichettaScheda(e){
  const t=tipoScheda(e), prop=e.stato==='proposta';
  if(t==='contributo') return `<span class="badge vissuta">Contributo</span>`;
  if(t==='tappa') return `<span class="badge tappa${prop?' proposta':''}">${prop?'Tappa · proposta':'Tappa'}</span>`;
  return prop?`<span class="badge proposta">Proposta</span>`:`<span class="badge vissuta">UDA</span>`;
}
function metaPercorso(e){ const n=(e.tappe||[]).length; return n?` <span class="perc-meta">Percorso · ${n} tappe</span>`:''; }
// Conteggi veri, calcolati dai dati (comunità nascoste già tolte)
function contaSchede(data){
  const c={schede:data.length, uda:0, percorsi:0, tappe:0, tappe_video:0, proposte:0, proposte_tappe:0, proposte_schede:0, percorsi_proposti:0, contributi:0};
  for(const e of data){
    const t=tipoScheda(e);
    if(t==='contributo'){ c.contributi++; continue; }
    if(e.stato==='proposta'){ c.proposte++; if(t==='tappa') c.proposte_tappe++; else c.proposte_schede++; if((e.tappe||[]).length) c.percorsi_proposti++; continue; }
    if(t==='tappa'){ c.tappe++; if((e.videos||[]).length) c.tappe_video++; }
    else { c.uda++; if((e.tappe||[]).length) c.percorsi++; }
  }
  return c;
}
function frasiConteggi(c){
  const bits=[`${c.uda} UDA vissute`];
  if(c.tappe) bits.push(`${c.tappe} tappe dei percorsi${c.tappe_video?`, ${c.tappe_video} con video`:''}`);
  bits.push(`${c.proposte} proposte${c.proposte_tappe?` (di cui ${c.proposte_tappe} tappe)`:''}`);
  if(c.contributi) bits.push(`${c.contributi} contributi approvati`);
  return bits;
}

function card(e, note=''){
  const vNote = (e.videos&&e.videos.length) ? `<p class="match-note">Video documentato · ${(e.videos||[]).length} clip</p>` : '';
  const desc=P(e.descrizione);
  return `<article class="experience">${etichettaScheda(e)}${metaPercorso(e)}${e.codice?` <span class="provenance">${esc(e.codice)}</span>`:''}<h3><a href="esperienza.html?id=${encodeURIComponent(e.id)}">${esc(e.titolo)}</a></h3><p>${esc(e.aula)} · ${esc(e.community)}</p>${note?`<p class="match-note">${esc(note)}</p>`:''}${vNote}${desc?`<p>${esc(desc)}</p>`:''}<p class="tags">${esc((e.eta||[]).join(' · '))} / ${esc((e.gruppo||[]).map(g=>groupLabels[g]||g).join(' · '))}<br>${esc((e.discipline||[]).join(' · '))}</p>${e.contributo?raccontatoDaHtml(e):`<p class="provenance">${esc(P(e.provenienza||''))}</p>`}<p><a href="esperienza.html?id=${encodeURIComponent(e.id)}">Apri la scheda →</a> · <a href="aula.html?id=${encodeURIComponent(e.aula_id)}">Vai all’aula →</a></p></article>`;
}

// --- Contributi approvati (da /api/pubblicati: solo approvati, senza audio né contatti) ---
async function fetchApproved(){
  try{ const r=await fetch('/api/pubblicati',{cache:'no-store'}); if(!r.ok) return []; const d=await r.json(); return Array.isArray(d)?d:[]; }catch{ return []; }
}
function ytEmbed(u){ const m=String(u||'').match(/(?:embed\/|watch\?v=|youtu\.be\/|shorts\/)([A-Za-z0-9_-]{6,})/); return m?`https://www.youtube.com/embed/${m[1]}`:''; }
function mergeApproved(list, data, geo, communities){
  const byId=Object.fromEntries(geo.features.filter(f=>f.geometry.type==='Point').map(f=>[f.properties.id,f]));
  for(const c of list){
    let aulaId=c.aula_id, f=aulaId&&byId[aulaId];
    if(!f && c.lat!=null && c.lon!=null){
      aulaId='contrib-'+c.id;
      const com=(communities||[]).find(x=>x.name===c.community);
      f={type:'Feature',geometry:{type:'Point',coordinates:[Number(c.lon),Number(c.lat)]},properties:{id:aulaId,name:c.luogo_nome||'Luogo nuovo',community:c.community||'Altre comunità',color:(com&&com.color)||'#2F5D3A',foto:c.foto||[],nuovo:true,tipo_aula:'Da classificare',breve:'Luogo aggiunto da un contributo approvato.'}};
      geo.features.push(f); byId[aulaId]=f;
    }
    if(!f) continue;
    const p=f.properties;
    if(p.nuovo===undefined && (c.foto||[]).length) p.foto=[...(p.foto||[]), ...c.foto];
    data.push({id:'contrib-'+c.id, titolo:c.titolo||p.name, aula:p.name, aula_id:aulaId, community:p.community, percorso:'', stato:'vissuta',
      eta:[], gruppo:[], discipline:[], tipo_aula:p.tipo_aula||'Da classificare',
      descrizione:(c.racconto||'').replace(/\s+/g,' ').slice(0,220)+((c.racconto||'').length>220?'…':''),
      racconto:c.racconto||'', voci_bambini:String(c.voci||'').split(/\n+/).map(x=>x.trim()).filter(Boolean),
      videos:(c.video||[]).map(u=>({url:u, embed:ytEmbed(u), titolo:'Video del contributo'})).filter(v=>v.embed),
      provenienza:`Raccontato da ${c.autore||'—'}${[c.classe,c.scuola].filter(Boolean).length?` · ${[c.classe,c.scuola].filter(Boolean).join(', ')}`:''} · approvato`,
      foto:c.foto||[], contributo:true, quando:c.quando, autore:c.autore||'', classe:c.classe||'', scuola:c.scuola||'',
      sito_scuola:parseHttpsUrl(c.sito_scuola).url, profilo:parseHttpsUrl(c.profilo).url,
      scheda_uda:{}, da_completare:[]});
  }
}
// Comunità non ancora attivate: restano nei dati ma non si mostrano sul sito
const COMUNITA_NASCOSTE=['Siracusa'];
function nascondiComunita(data, geo, communities){
  const via=x=>COMUNITA_NASCOSTE.includes(x);
  for(let i=data.length-1;i>=0;i--) if(via(data[i].community)) data.splice(i,1);
  if(geo&&geo.features) geo.features=geo.features.filter(f=>!via(f.properties&&f.properties.community));
  if(communities) for(let i=communities.length-1;i>=0;i--) if(via(communities[i].name)) communities.splice(i,1);
}
async function init(){
  if(!$('#map') && !$('#archive-filters') && !$('#story-form')) return;
  const [data, geo, communities, approvati] = await Promise.all([...['esperienze.json','luoghi.geojson','comunita.json'].map(x=>fetch(x).then(r=>{if(!r.ok) throw Error(x); return r.json();})), $('#story-form')?Promise.resolve([]):fetchApproved()]);
  mergeApproved(approvati, data, geo, communities);
  nascondiComunita(data, geo, communities);
  const disciplines=[...new Set(data.flatMap(e=>e.discipline))].sort();

  if($('#archive-filters')){
    data.forEach(e=>{ e._tipo=tipoScheda(e); });
    const byId=Object.fromEntries(data.map(e=>[e.id,e]));
    // Legame tappa → percorso dai dati: percorso_uda.id e, all'inverso, percorso.tappe[].esperienza_id
    const tappeDi=Object.fromEntries(data.filter(e=>(e.tappe||[]).length).map(p=>[p.id, p.tappe.map(t=>byId[t.esperienza_id]).filter(x=>x && x.percorso_uda && x.percorso_uda.id===p.id)]));
    const inPercorso=new Set(Object.values(tappeDi).flat().map(x=>x.id));
    const tipoLabels={uda:'UDA', tappa:'Tappa', contributo:'Contributo'};
    const tipi=['uda','tappa',...(data.some(e=>e._tipo==='contributo')?['contributo']:[])];
    const fields=[
      ['community','Comunità',[...new Set(data.map(e=>e.community))]],
      ['tipo_aula','Tipo di aula',[...new Set(data.map(e=>e.tipo_aula))]],
      ['eta','Età',ages],
      ['discipline','Disciplina',disciplines],
      ['_tipo','Tipo di scheda',tipi],
      ['stato','Stato',['vissuta','proposta']],
      ['gruppo','Gruppo',groups],
      ['competenze_ue','Competenza UE',[...new Set(data.flatMap(e=>e.competenze_ue||[]))].sort()],
      ['documentazione','Documentazione',[...new Set(data.map(e=>e.documentazione).filter(Boolean))].sort()]
    ];
    const optLabel=(id,v)=>id==='_tipo'?tipoLabels[v]:id==='stato'?(v==='vissuta'?'Vissuta':'Proposta'):(groupLabels[v]||v);
    $('#archive-filters').innerHTML = `<div class="field grow"><label for="search">Cerca</label><input id="search" type="search" placeholder="albero, ascolto, piazza…"></div>` +
      fields.map(([id,label,vals])=>`<div class="field"><label for="f-${id}">${esc(label)}</label><select id="f-${id}"><option value="">Tutti</option>${vals.map(v=>`<option value="${esc(v)}">${esc(optLabel(id,v))}</option>`).join('')}</select></div>`).join('');
    const aperti=new Map(); // scelta esplicita di chi legge: id percorso → aperto sì/no
    const cells=(e,extra='')=>`<td class="c-tipo">${etichettaScheda(e)}</td><td class="c-titolo"><strong><a href="esperienza.html?id=${encodeURIComponent(e.id)}">${esc(e.titolo)}</a></strong>${metaPercorso(e)}${extra}<div class="provenance">${esc(P(e.descrizione||''))}</div></td><td class="c-aula">${esc(e.aula||'')}</td><td class="c-com">${esc(e.community||'')}</td><td class="c-eta">${esc((e.eta||[]).join(', '))}</td><td class="c-disc">${esc((e.discipline||[]).join(', '))}</td><td class="c-prov provenance">${e.contributo?raccontatoDaHtml(e):esc(P(e.provenienza||''))}</td>`;
    const row=e=>`<tr>${cells(e)}</tr>`;
    const render=()=>{
      const q=$('#search').value.toLocaleLowerCase().trim();
      const attivi=!!q || fields.some(([id])=>$(`#f-${id}`).value);
      const ok=new Set(data.filter(e=>fields.every(([id])=>{const v=$(`#f-${id}`).value; return !v || (Array.isArray(e[id])?e[id].includes(v):e[id]===v);}))
        .filter(e=>!q || JSON.stringify(e).toLocaleLowerCase().includes(q)).map(e=>e.id));
      const filtered=data.filter(e=>ok.has(e.id));
      $('#result-count').textContent = `${filtered.length} schede · ${frasiConteggi(contaSchede(filtered)).join(' · ')}`;
      const blocco=e=>{
        const tutte=tappeDi[e.id];
        if(!tutte) return ok.has(e.id)?row(e):'';
        const tm=tutte.filter(x=>ok.has(x.id));
        if(!ok.has(e.id) && !tm.length) return '';
        const lista=(attivi && tm.length) ? tm : (ok.has(e.id)?tutte:tm);
        const open=aperti.has(e.id) ? aperti.get(e.id) : (attivi && tm.length>0); // con ricerca o filtri attivi le tappe che corrispondono si vedono subito
        const quante=lista.length===tutte.length?`le ${tutte.length} tappe`:`${lista.length} di ${tutte.length} tappe`;
        const btn=`<button type="button" class="tappe-toggle" data-percorso="${esc(e.id)}" aria-expanded="${open}" aria-controls="${lista.map(x=>'r-'+esc(x.id)).join(' ')}"><span class="tt-icon" aria-hidden="true">${open?'▾':'▸'}</span> <span class="tt-label">${open?'Chiudi':'Mostra'} ${quante}</span></button>`;
        return `<tr class="percorso-row${ok.has(e.id)?'':' solo-tappe'}">${cells(e, btn)}</tr>` +
          lista.map(x=>`<tr class="tappa-row" id="r-${esc(x.id)}" data-percorso="${esc(e.id)}"${open?'':' hidden'}>${cells(x, `<span class="perc-meta">Tappa ${esc(x.percorso_uda.tappa||'')} di ${tutte.length}</span>`)}</tr>`).join('');
      };
      const top=filtered.filter(e=>!inPercorso.has(e.id)).concat(data.filter(e=>tappeDi[e.id] && !ok.has(e.id) && tappeDi[e.id].some(x=>ok.has(x.id))));
      const ordine=data.filter(e=>top.includes(e));
      const gruppi=[
        ['vissuta', e=>e.stato==='vissuta' && e._tipo!=='contributo', `<strong>UDA vissute</strong> · con i bambini, documentate (volume del Salento, uscite di Valdobbiadene in video). I percorsi si aprono sulle loro tappe.`],
        ['contributo', e=>e._tipo==='contributo', `<strong>Contributi</strong> · racconti approvati di chi ha vissuto un’aula`],
        ['proposta', e=>e.stato==='proposta' && e._tipo!=='contributo', `<strong>Proposte · cosa si può fare qui</strong> · non ancora provate con una classe (progetti scritti, sopralluoghi degli adulti)`]
      ];
      let html='';
      for(const [,test,titolo] of gruppi){
        const g=ordine.filter(test).map(blocco).join('');
        if(g) html+=`<tr class="group-row"><td colspan="7">${titolo}</td></tr>`+g;
      }
      $('#archive-results').innerHTML = html || `<tr><td colspan="7">Nessuna scheda con questi filtri.</td></tr>`;
    };
    $('#archive-results').addEventListener('click', ev=>{
      const b=ev.target.closest('.tappe-toggle'); if(!b) return;
      const id=b.dataset.percorso, open=b.getAttribute('aria-expanded')!=='true';
      aperti.set(id, open);
      b.setAttribute('aria-expanded', String(open));
      b.querySelector('.tt-icon').textContent=open?'▾':'▸';
      const l=b.querySelector('.tt-label'); l.textContent=l.textContent.replace(/^(Mostra|Chiudi)/, open?'Chiudi':'Mostra');
      document.querySelectorAll(`tr.tappa-row[data-percorso="${CSS.escape(id)}"]`).forEach(tr=>{ tr.hidden=!open; });
    });
    $('#archive-filters').addEventListener('input', render); render();
  }

  if($('#story-form')){
    const dove=window.initDove?window.initDove(geo, communities):null;
    window.dove=dove;
    const voice=window.initVoiceInputs?window.initVoiceInputs():null;
    { const q=$('#quando'); if(q){ const n=new Date(); q.value=`${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`; const lab=q.parentElement.querySelector('span.muted'); if(lab) lab.textContent='Oggi · '+n.toLocaleDateString('it-IT',{day:'numeric',month:'long',year:'numeric'}); } }

    $('#story-form').addEventListener('submit', async ev=>{
      ev.preventDefault();
      const v=dove?dove.value():{};
      if(!v.mode){ alert('Dove? Tocca «Sono qui», scrivi il nome del luogo oppure tocca la mappa.'); document.getElementById('dove').scrollIntoView({behavior:'smooth',block:'center'}); return; }
      const text=$('#racconto').value.trim(); if(voice) voice.sync(); const hasVoice=!!$('#f-audio-racconto').value;
      if(!text && !hasVoice){ alert('Scrivi cosa è successo oppure registra un messaggio vocale.'); return; }
      const links=$('#video').value.trim().split(/\n/).filter(Boolean);
      if(links.some(x=>{ try{ const u=new URL(x); return !['youtube.com','www.youtube.com','youtu.be','m.youtube.com'].includes(u.hostname)||u.protocol!=='https:'; }catch{return true;} })){
        alert('Inserisci link YouTube validi, uno per riga.'); return;
      }
      const sitoOk=parseHttpsUrl(($('#sito_scuola')||{}).value||'');
      if(!sitoOk.ok){ alert('«Sito o pagina della scuola»: inserisci un indirizzo https:// valido, oppure lascia il campo vuoto. Non inserire link a profili o foto di bambini.'); $('#sito_scuola').focus(); return; }
      const profOk=parseHttpsUrl(($('#profilo')||{}).value||'');
      if(!profOk.ok){ alert('«Il tuo profilo»: inserisci un indirizzo https:// valido, oppure lascia il campo vuoto. Non inserire link a profili o foto di bambini.'); $('#profilo').focus(); return; }
      if($('#sito_scuola')) $('#sito_scuola').value=sitoOk.url;
      if($('#profilo')) $('#profilo').value=profOk.url;
      if(window.fotoPending && window.fotoPending()>0){ alert('Aspetta un attimo: le foto si stanno ancora caricando.'); return; }
      if(document.querySelector('.rec-box[data-state="recording"]')){ alert('Ferma prima la registrazione in corso.'); return; }
      const audioKeys=voice?voice.keys():[];
      const aulaName = v.luogo_nome || 'Luogo nuovo';
      $('#f-comunita').value = v.community || '';
      { const np=$('#f-new-place'); if(np) np.value = (v.mode==='aula' && v.aula_id) ? '' : aulaName; } // compatibile con le submission precedenti
      $('#f-n-audio').value = String(audioKeys.length);
      $('#f-subject').value = `Nuovo contributo da approvare · ${aulaName}${$('#autore').value.trim()?` · ${$('#autore').value.trim()}`:''}`;
      const btn=$('#submit-btn'), st=$('#submit-status');
      btn.disabled=true; btn.textContent='Invio in corso…'; st.textContent='Sto inviando il contributo in privato…';
      try{
        const fd=new FormData($('#story-form'));
        const res=await fetch('/', {method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body:new URLSearchParams(fd).toString()});
        if(!res.ok) throw new Error('HTTP '+res.status);
      }catch(err){
        console.error(err); btn.disabled=false; btn.textContent='Invia il contributo →';
        st.textContent='Invio non riuscito. Controlla la connessione e riprova.'; return;
      }
      const link = v.aula_id ? `mappa.html?aula=${encodeURIComponent(v.aula_id)}` : 'mappa.html';
      const nFoto=Number($('#f-n-foto').value||0);
      $('#story-form').hidden=true; $('#thanks').hidden=false;
      $('#thanks-msg').textContent = `Il tuo racconto per ${v.aula_id?'l’aula ':''}${aulaName} è arrivato ed è in attesa di approvazione.`;
      $('#thanks-link').textContent = [aulaName, v.community, `${nFoto} foto`, `${audioKeys.length} audio`].filter(Boolean).join(' · ');
      $('#thanks-aula').href = link;
      $('#thanks').scrollIntoView({behavior:'smooth'});
    });
  }

  if($('#map')){
    if(!window.L){ $('#map').innerHTML='<p class="notice">La mappa richiede la connessione per caricare Leaflet.</p>'; return; }
    const ITALY=[42.1,12.5], ITALY_Z=innerWidth<700?5:5.5;
    const map=window.prototypeMap=L.map('map',{scrollWheelZoom:true, zoomControl:true, zoomSnap:0.5, tap:true, maxZoom:22}).setView(ITALY,ITALY_Z);
    const otm=L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',{maxZoom:17, maxNativeZoom:17, attribution:'© OpenStreetMap, SRTM | © OpenTopoMap (CC-BY-SA)'});
    otm.addTo(map);
    L.control.scale({imperial:false}).addTo(map);
    if (window.initMapTilerBasemap) window.initMapTilerBasemap(map, otm);

    const routes=L.layerGroup(); // toggled
    const shortName=n=>n.replace(' · Il paesaggio che sono io','').replace('Via Francigena · Salento','Francigena');
    const managerByName=Object.fromEntries(communities.map(c=>[c.name, c.manager||'']));
    const colorByName=Object.fromEntries(communities.map(c=>[c.name, c.color]));
    const byAula={};
    data.forEach(e=>{
      (byAula[e.aula_id]||(byAula[e.aula_id]={vissute:[],proposte:[]}))[e.stato==='vissuta'?'vissute':'proposte'].push(e);
    });
    const kindOf=p=>{
      const b=byAula[p.id]||{vissute:[],proposte:[]};
      if(b.vissute.length) return 'vissuta';
      if(b.proposte.length) return 'proposta';
      return 'neutra';
    };

    // Aule layer: clustered at low zoom (if Leaflet.markercluster loaded), always visible.
    const hasCluster=typeof L.markerClusterGroup==='function';
    const points = hasCluster ? L.markerClusterGroup({
      showCoverageOnHover:false, spiderfyOnMaxZoom:true, maxClusterRadius:z=>z<9?70:z<12?40:28,
      disableClusteringAtZoom:14, chunkedLoading:true,
      iconCreateFunction:cl=>{
        const ms=cl.getAllChildMarkers(); const cnt={};
        ms.forEach(m=>{ cnt[m.options._com]=(cnt[m.options._com]||0)+1; });
        const top=Object.entries(cnt).sort((a,b)=>b[1]-a[1])[0];
        const col=(top&&colorByName[top[0]])||'#4f6127';
        const n=cl.getChildCount(); const s=n<10?34:n<100?40:46;
        return L.divIcon({className:'aula-cluster', html:`<span style="background:${esc(col)}">${n}</span>`, iconSize:[s,s]});
      }
    }) : L.layerGroup();
    points.addTo(map);

    // Community chips (small, only at Italy-wide zoom) + community filter options
    const fCom=$('#f-community');
    const comBounds={};
    geo.features.forEach(f=>{ if(f.geometry.type!=='Point') return; const c=f.geometry.coordinates; (comBounds[f.properties.community]||(comBounds[f.properties.community]=L.latLngBounds([]))).extend([c[1],c[0]]); });
    const goCommunity=(name)=>{
      const c=communities.find(x=>x.name===name);
      const b=comBounds[name];
      if(b && b.isValid()) map.fitBounds(b.pad(0.08),{maxZoom:14});
      else if(c) map.setView(c.center,12);
      $('#crumbs').innerHTML=`<a href="mappa.html">Italia</a><span>›</span><strong>${esc(name)}</strong>`;
    };
    communities.forEach(c=>{
      const b=document.createElement('button'); b.type='button'; b.className='community-chip';
      b.innerHTML=`<i style="background:${esc(c.color)}"></i><span>${esc(shortName(c.name))}</span><small>${c.has_routes?`${c.route_count} percorsi`:'senza percorso tracciato'}${c.manager?` · ${esc(c.manager)}`:''}</small>`;
      b.onclick=()=>{ if(fCom) fCom.value=c.name; applyFilters(); goCommunity(c.name); };
      $('#community-bar').appendChild(b);
      if(fCom){
        const o=document.createElement('option'); o.value=c.name; o.textContent=shortName(c.name); fCom.appendChild(o);
      }
    });
    $('#zoom-italy').onclick=()=>{ map.setView(ITALY,ITALY_Z); $('#crumbs').innerHTML='<a href="mappa.html">Italia</a>'; if(fCom) fCom.value=''; applyFilters(); closePanelHome(); };

    const defaultPanelHTML = $('#place-panel').innerHTML;
    const closePanelHome=()=>{
      $('#place-panel').innerHTML = defaultPanelHTML;
      $('#place-panel').classList.remove('open');
      const note=$('#zoom-note'); if(note) note.textContent = zoomNoteText();
      const close=$('#panel-close'); if(close) close.hidden=true;
    };

    const zoomNoteText=()=>{
      const z=map.getZoom();
      return z<11 ? 'Punto pieno = esperienza vissuta · vuoto = solo proposte · piccolo = ancora senza schede.' : 'Tocca un’aula. Punto pieno = vissuta · vuoto = proposte · piccolo = ancora senza schede.';
    };

    const ytIdFrom=u=>{
      if(!u) return '';
      const m=String(u).match(/(?:embed\/|watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
      return m?m[1]:'';
    };
    const panelVideos=(vids)=>{
      if(!vids.length) return '';
      return `<div class="panel-videos">${vids.slice(0,3).map(v=>{
        const id=v.id||ytIdFrom(v.embed||v.url);
        const thumb=id?`https://i.ytimg.com/vi/${id}/hqdefault.jpg`:'';
        const href=v.url||(id?`https://www.youtube.com/watch?v=${id}`:(v.embed||'#'));
        const title=v.titolo||'Video';
        return `<a class="panel-video" href="${esc(href)}" target="_blank" rel="noopener" aria-label="${esc(title)}">
          ${thumb?`<img src="${esc(thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer"><span class="play">▶</span>`:`<span class="play">▶</span>`}
          <span class="panel-video-title">${esc(title)}</span>
        </a>`;
      }).join('')}${vids.length>3?`<p class="muted">+${vids.length-3} altri video nella scheda</p>`:''}</div>`;
    };

    const openPlace=(f)=>{
      const p=f.properties; window.selectedPlace=p.id;
      const bag=byAula[p.id]||{vissute:[],proposte:[]};
      const com=communities.find(c=>c.name===p.community);
      $('#crumbs').innerHTML=`<a href="mappa.html">Italia</a><span>›</span><span>${esc(shortName(p.community))}</span><span>›</span><strong>${esc(p.name)}</strong>`;
      const fotos=(p.foto||[]).map((u,i)=>`<img src="${esc(u)}" alt="${esc(p.name)}${i?` · foto ${i+1}`:''}" loading="lazy" referrerpolicy="no-referrer">`).join('');
      const vids=[...bag.vissute.flatMap(e=>e.videos||[])];
      if(!vids.length && (p.video||[]).length){
        (p.video||[]).forEach(u=>{ const id=ytIdFrom(u); vids.push({id, embed:u, url:id?`https://www.youtube.com/watch?v=${id}`:u, titolo:'Video del luogo'}); });
      }
      const list=(arr, label)=> arr.length ? `<section class="panel-group"><h3>${esc(label)}</h3><ul class="panel-esp">${arr.map(e=>`<li><a href="esperienza.html?id=${encodeURIComponent(e.id)}">${etichettaScheda(e)} ${esc(e.titolo)}</a></li>`).join('')}</ul></section>` : '';
      $('#place-panel').innerHTML = `
        <button type="button" class="panel-close" id="panel-close" aria-label="Chiudi">×</button>
        <div><p class="kicker">${esc(p.community)} · aula all’aperto</p><h2>${esc(p.name)}</h2></div>
        <div class="panel-photos">${fotos || `<div class="photo-empty"><span>Foto dell’aula ancora da caricare</span></div>`}</div>
        ${vids.length?`<section class="panel-group"><h3>Video</h3>${panelVideos(vids)}</section>`:''}
        <section class="panel-meta">
          <p><strong>Custodi dell’aula</strong><br><span class="muted">Da indicare · i nomi compaiono solo con consenso</span></p>
          <p><strong>Community manager</strong><br>${esc((com&&com.manager)||managerByName[p.community]||'Da indicare')}</p>
        </section>
        ${list(bag.vissute, 'Vissute con i bambini')}
        ${list(bag.proposte, 'Proposte · cosa si può fare qui')}
        <p><a class="btn" href="aula.html?id=${encodeURIComponent(p.id)}">Apri la scheda completa</a></p>`;
      $('#place-panel').classList.add('open');
      const closeBtn=$('#panel-close');
      if(closeBtn) closeBtn.onclick=()=>closePanelHome();
    };

    // Build markers (aule only) and routes from real geometries.
    // Each aula is a divIcon with a 28px tap area; the visible dot inside shows the kind.
    const aulaMarkers=[]; // {feature, marker, kind, community}
    geo.features.forEach(f=>{
      const p=f.properties, g=f.geometry;
      if(g.type==='Point'){
        const kind=kindOf(p);
        const col=p.color||colorByName[p.community]||'#4f6127';
        const icon=L.divIcon({className:'aula-pin aula-'+kind, html:`<span style="--c:${esc(col)}"></span>`, iconSize:[28,28], iconAnchor:[14,14]});
        const m=L.marker([g.coordinates[1], g.coordinates[0]], {icon, title:p.name, keyboard:true, riseOnHover:true, _com:p.community})
          .bindTooltip(esc(p.name),{className:'community-tip', direction:'top', offset:[0,-10]})
          .on('click',()=>openPlace(f));
        aulaMarkers.push({feature:f, marker:m, kind, community:p.community});
      } else {
        // Only real route geometries already in luoghi.geojson (from My Maps/umap)
        const layer=L.geoJSON(f,{style:{color:p.color, weight:4, opacity:.7, dashArray: null}});
        layer.bindTooltip(esc(p.name||'Percorso'));
        layer._protoCommunity=p.community;
        routes.addLayer(layer);
      }
    });

    let showRoutes=true;
    const fAule=$('#f-aule');
    const applyFilters=()=>{
      const mode=fAule?.value||'';           // '' = tutte le aule (default)
      const com=fCom?.value||'';
      showRoutes=!!$('#f-percorsi')?.checked;
      const visible=aulaMarkers.filter(({kind, community})=>{
        if(com && community!==com) return false;
        if(mode==='vissuta' && kind!=='vissuta') return false;
        if(mode==='proposta' && kind!=='proposta') return false;
        return true;
      }).map(x=>x.marker);
      points.clearLayers();
      if(points.addLayers) points.addLayers(visible); else visible.forEach(m=>points.addLayer(m));
      const cnt=$('#aule-count'); if(cnt) cnt.textContent=`${visible.length} aule`;
      if(showRoutes){
        if(!map.hasLayer(routes)) map.addLayer(routes);
        routes.eachLayer(layer=>{
          const ok=!com || layer._protoCommunity===com;
          layer.setStyle({opacity: ok?0.7:0, weight: ok?4:0});
        });
      } else if(map.hasLayer(routes)){
        map.removeLayer(routes);
      }
      updateZoomChrome();
    };

    if(fCom) fCom.addEventListener('change', ()=>{ applyFilters(); if(fCom.value) goCommunity(fCom.value); });
    ['f-aule','f-percorsi'].forEach(id=>{
      const el=document.getElementById(id); if(el) el.addEventListener('change', applyFilters);
    });

    // Community chips only at the Italy-wide view and when no community is chosen: never over a zoomed map.
    function updateZoomChrome(){
      const z=map.getZoom();
      const show = z<7 && !(fCom&&fCom.value);
      const bar=$('#community-bar');
      if(bar.hidden===show){ bar.hidden=!show; setTimeout(()=>map.invalidateSize({pan:false}),0); }
      const note=$('#zoom-note'); if(note && !$('#place-panel').classList.contains('open')) note.textContent=zoomNoteText();
    }
    map.on('zoomend', updateZoomChrome);
    applyFilters();

    const params=new URLSearchParams(location.search);
    const id=params.get('aula');
    const focus=(f)=>{
      const m=aulaMarkers.find(x=>x.feature===f)?.marker;
      const ll=[f.geometry.coordinates[1], f.geometry.coordinates[0]];
      if(m && points.zoomToShowLayer) points.zoomToShowLayer(m, ()=>map.setView(ll, Math.max(map.getZoom(),15)));
      else map.setView(ll, 15);
      openPlace(f);
    };
    if(id){
      const f=geo.features.find(f=>f.properties.id===id && f.geometry.type==='Point');
      if(f) focus(f);
    } else if(params.get('comunita')){
      const name=communities.find(c=>c.id===params.get('comunita')||c.name===params.get('comunita'))?.name;
      if(name){ if(fCom) fCom.value=name; applyFilters(); goCommunity(name); }
    }
    window.openPrototypePlace=(id)=>{
      const f=geo.features.find(f=>f.properties.id===id && f.geometry.type==='Point');
      if(f) focus(f);
    };
  }
}
init().catch(err=>{ console.error(err); const t=$('#place-panel')||$('#archive-results')||$('#file-count'); if(t) t.innerHTML='<p class="notice">Non è stato possibile caricare i dati del prototipo.</p>'; });


async function loadProtoData(){
  const [data, geo, communities, approvati] = await Promise.all([...['esperienze.json','luoghi.geojson','comunita.json'].map(x=>fetch(x).then(r=>{if(!r.ok) throw Error(x); return r.json();})), fetchApproved()]);
  mergeApproved(approvati, data, geo, communities);
  nascondiComunita(data, geo, communities);
  return {data, geo, communities};
}

window.initAulaPage = async function(){
  const root = $('#aula-root'); if(!root) return;
  const id = new URLSearchParams(location.search).get('id');
  if(!id){ root.innerHTML = '<p class="notice">Manca l’identificativo dell’aula.</p>'; return; }
  try{
    const {data, geo, communities} = await loadProtoData();
    const f = geo.features.find(x => x.properties.id === id && x.geometry.type === 'Point');
    if(!f){ root.innerHTML = '<p class="notice">Aula non trovata in questo prototipo.</p>'; return; }
    const p = f.properties;
    document.title = `${p.name} · La Strada dei Bambini`;
    const related = data.filter(e => e.aula_id === id);
    const relatedUda = data.filter(e => e.aula_id !== id && ((e.tappe||[]).some(t=>t.aula_id===id) || (e.aule_collegate||[]).some(a=>(a.id||a)===id)));
    const matBimbi = related.flatMap(e => (e.materiali_bambini||[]).filter(m=>m.immagine).map(m=>({...m, esp:e})));
    const sameTipo = data.filter(e => e.aula_id !== id && p.tipo_aula && e.tipo_aula === p.tipo_aula && p.tipo_aula !== 'Da classificare');
    const com = (communities||[]).find(c => c.name === p.community || c.id === (p.community||'').slice(0,2));
    const comSlug = ({
      'Siracusa':'siracusa',
      'Salento · Il paesaggio che sono io':'salento',
      'Valdobbiadene':'valdobbiadene',
      'Druento':'druento',
      'Via Francigena · Salento':'via-francigena'
    })[p.community] || '';
    const fotos = (p.foto||[]).map((u,i)=>`<figure class="detail-photo"><img src="${esc(u)}" alt="${esc(p.name)}${i?` · ${i+1}`:''}" loading="lazy" referrerpolicy="no-referrer"></figure>`).join('');
    const genius = ((p.tipo_aula && p.tipo_aula!=='Da classificare') ? p.tipo_aula : '') || ((p.categoria && p.categoria!=='Da classificare') ? p.categoria : '') || '';
    const bozza = p.bozza ? `<p class="bozza-banner" role="status">Bozza da correggere</p>` : '';
    const coords = f.geometry.coordinates;
    const vociList = (p.voci || []).map(v => {
      if (typeof v === 'string') return `<blockquote class="voce"><p>«${esc(v)}»</p></blockquote>`;
      return `<blockquote class="voce"><p>«${esc(v.testo || '')}»</p><cite>${esc(v.autore || '')}${v.nota ? ' · ' + esc(v.nota) : ''}</cite></blockquote>`;
    }).join('');
    const daComp = (p.da_completare || []).length > 0; // resta nei dati, in pagina solo il segno «Scheda in lavorazione»
    const attivita = p.attivita_testo || (p.scheda && p.scheda.attivita) || '';
    const luogo = P((p.scheda && p.scheda.luogo) || p.breve || '');
    root.innerHTML = `
      <nav class="crumbs" aria-label="Percorso"><a href="mappa.html">Mappa</a><span>›</span>${comSlug?`<a href="comunita/${comSlug}.html">${esc(p.community)}</a>`:`<span>${esc(p.community)}</span>`}<span>›</span><strong>${esc(p.name)}</strong></nav>
      ${bozza}
      <div class="page-head">
        <p class="kicker">${esc(p.community)} · aula all’aperto</p>
        <h1 class="page-title" style="font-weight:400;font-size:clamp(28px,4vw,42px)">${esc(p.name)}</h1>
        ${genius ? `<p>${esc(genius)}</p>` : ''}
        ${p.percorso ? `<p class="muted">${esc(p.percorso)}</p>` : ''}
        ${(daComp || !luogo) ? segnoLavorazione() : ''}
      </div>
      <div class="detail-gallery">${fotos || '<div class="photo-empty"><span>Foto dell’aula ancora da caricare</span></div>'}</div>
      ${(()=>{ const vids=related.flatMap(e=>e.videos||[]); if(vids.length) return `<section class="detail-block"><h2>Video dell’esperienza</h2>${videoBlocks(vids)}</section>`; if((p.video||[]).length){ const fallback=p.video.map((u,i)=>({embed:u,url:u.replace('/embed/','/watch?v='),titolo:`Video ${i+1}`})); return `<section class="detail-block"><h2>Video</h2>${videoBlocks(fallback)}</section>`; } return ''; })()}
      ${luogo ? `<section class="detail-block">
        <h2>Il luogo</h2>
        <p class="racconto">${esc(luogo)}</p>
      </section>` : ''}
      <section class="detail-block" id="cosa">
        <h2>Cosa si può fare qui</h2>
        ${P(attivita) ? `<p class="racconto">${esc(P(attivita))}</p>` : '<p class="muted">Nelle fonti non risultano ancora attività descritte per questa aula.</p>'}
        <p><a href="mappa.html?aula=${encodeURIComponent(id)}">Vedi il luogo sulla mappa →</a></p>
      </section>
      <section class="detail-block">
        <h2>Voci</h2>
        ${vociList || '<p class="muted">Nessuna voce raccolta ancora per questa aula.</p>'}
      </section>
      <section class="detail-block">
        <h2>Esperienze e UDA di questa aula</h2>
        ${related.length ? related.map(e=>card(e)).join('') : '<p class="muted">Non ci sono ancora esperienze documentate proprio in questa aula.</p>'}
      </section>
      ${relatedUda.length ? `<section class="detail-block"><h2>Percorsi che passano di qui</h2>${relatedUda.map(e=>card(e, (e.tappe||[]).some(t=>t.aula_id===id)?'Questa aula è una tappa del percorso':'Aula collegata all’esperienza')).join('')}</section>` : ''}
      ${matBimbi.length ? `<section class="detail-block"><h2>I materiali dei bambini</h2><div class="uda-gallery">${matBimbi.slice(0,8).map(m=>`<figure class="uda-mat"><a href="esperienza.html?id=${encodeURIComponent(m.esp.id)}#materiali-bambini"><img src="${esc(m.immagine)}" alt="${esc(m.titolo||'')}" loading="lazy"></a><figcaption><strong>${esc(m.titolo||'')}</strong><br><span class="provenance">${esc(m.esp.titolo)}</span></figcaption></figure>`).join('')}</div></section>` : ''}
      ${sameTipo.length ? `<section class="detail-block"><h2>Esperienze dello stesso tipo di aula</h2><p class="match-note">Spunti da altri luoghi dello stesso tipo: da adattare, non esperienze già svolte qui.</p>${sameTipo.slice(0,6).map(e=>card(e, 'Stesso tipo di aula')).join('')}</section>` : ''}
      <section class="detail-block">
        <h2>Contribuisci</h2>
        <p>Hai vissuto qualcosa in questa aula? Raccontalo: verrà pubblicato solo dopo approvazione.</p>
        <p><a href="racconta.html">Contribuisci →</a></p>
      </section>`;
  }catch(err){
    console.error(err);
    root.innerHTML = '<p class="notice">Non è stato possibile caricare i dati dell’aula.</p>';
  }
};



// --- Modello UDA integrato (Salento + curriculum mapping) · v1, 10 novembre 2026 ---
// v2, 11 novembre 2026: tipi UDA / Tappa / Proposta, cantiere nascosto, tre voci del manifesto.
const UDA_LIVELLI_DEFAULT=['Inizia, con guida','Prova, con qualche aiuto','Fa da sé','Spiega e trasferisce'];
// Tre voci del manifesto, facoltative: compaiono solo se compilate (campi in cima alla scheda in esperienze.json)
const MANIFESTO_VOCI=[
  ['ferita_cura','Ferita e cura'],
  ['stare_bene','Cosa fa stare bene qui'],
  ['strato_digitale','Strato digitale']
];
function udaVal(v){
  if(Array.isArray(v)) v=v.map(x=>P(x)).filter(Boolean).join(' · ');
  else v=P(v);
  if(!v){ CANTIERE_SEGNO=true; return ''; }
  return esc(v);
}
function udaNote(t){ const x=P(t,true); return x?`<span class="uda-stato">${esc(x)}</span>`:''; }
function udaList(a){ const xs=(a||[]).map(x=>P(x)).filter(Boolean); return xs.length?`<ul class="uda-ul">${xs.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''; }
function udaParagrafi(t, cls='racconto'){ return String(t||'').split(/\n\n+/).map(x=>P(x)).filter(Boolean).map(x=>`<p class="${cls}">${esc(x)}</p>`).join(''); }
function udaSintesi(e){
  const s=e.uda_sintesi||{}, n=s.note||{};
  const docenti=(s.docenti||[]).map(d=>{ const nome=P(d.nome), ruolo=P(d.ruolo); return nome?esc(nome)+(ruolo?` <span class="muted">(${esc(ruolo)})</span>`:''):''; }).filter(Boolean).join('; ');
  if(!docenti) CANTIERE_SEGNO=true;
  const rows=[
    ['Quando',udaVal(s.quando),n.quando],
    ['Dove',udaVal(s.dove),n.dove],
    ['Chi',udaVal(s.chi),n.chi],
    ['Docenti e discipline',docenti,n.docenti],
    ['Risorse esterne',udaVal(s.risorse_esterne),n.risorse_esterne],
    ['Tipologia UDA',udaVal(s.tipologia),n.tipologia],
    ['Discipline coinvolte',udaVal(s.discipline),n.discipline],
    ['Prodotti intermedi',udaVal(s.prodotti_intermedi),n.prodotti_intermedi],
    ['Prodotto finale',udaVal(s.prodotto_finale),n.prodotto_finale],
    ['Competenze chiave UE',udaVal(s.competenze_chiave),n.competenze_chiave]
  ];
  (s.extra||[]).forEach(([k,v])=>rows.splice(3,0,[k,udaVal(v),'']));
  const vis=rows.filter(([,v])=>v);
  if(!vis.length) return '';
  return `<section class="detail-block uda-sintesi" id="sintesi"><h2>L’UDA in sintesi</h2><dl class="scheda">${vis.map(([k,v,nt])=>{ const nn=udaNote(nt); return `<div><dt>${esc(k)}</dt><dd>${v}${nn?' '+nn:''}</dd></div>`; }).join('')}</dl></section>`;
}
function udaProgettazione(e){
  const p=e.progettazione; if(!p) return '';
  const dg=p.domanda_generativa;
  const dgTesto=dg?P(dg.testo||dg):'';
  const comp=(p.competenze||[]).map(c=>{ const ab=udaList(c.abilita), co=udaList(c.conoscenze), tr=udaList(c.traguardi), nome=P(c.competenza); if(!nome&&!ab&&!co&&!tr) return ''; return `<div class="uda-comp">${nome?`<h4>${esc(nome)}</h4>`:''}${ab?`<p><strong>Abilità</strong></p>${ab}`:''}${co?`<p><strong>Conoscenze</strong></p>${co}`:''}${tr?`<p><strong>Traguardi / campi d’esperienza</strong></p>${tr}`:''}</div>`; }).join('');
  const fasiOk=(p.fasi||[]).map((f,i)=>({f, i, titolo:P(f.titolo)||('Fase '+(i+1)), tempi:P(f.tempi), attivita:P(f.attivita), fonte:P(f.fonte)}));
  const fasi=fasiOk.map(({f,titolo,tempi,attivita,fonte})=>`<li class="uda-fase"><div class="uda-fase-head"><strong>${esc(titolo)}</strong>${tempi?` <span class="muted">· ${esc(tempi)}</span>`:''}</div>${attivita?`<p>${esc(attivita)}</p>`:''}${(f.discipline||[]).length?`<p class="uda-chips">${f.discipline.map(d=>`<span>${esc(d)}</span>`).join('')}</p>`:''}${fonte?`<p class="provenance">${esc(fonte)}</p>`:''}</li>`).join('');
  const gantt=(()=>{ const fs=(p.fasi||[]).filter(f=>(f.discipline||[]).length); if(fs.length<2) return ''; const ds=[...new Set(fs.flatMap(f=>f.discipline))]; return `<details class="uda-gantt"><summary>Vista sinottica: discipline per fase</summary><div class="table-scroll"><table><thead><tr><th>Disciplina</th>${fs.map((f,i)=>`<th title="${esc(P(f.titolo)||'')}">${i+1}</th>`).join('')}</tr></thead><tbody>${ds.map(d=>`<tr><td>${esc(d)}</td>${fs.map(f=>`<td>${f.discipline.includes(d)?'<span class="dot" aria-label="sì">●</span>':''}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>`; })();
  const risorse=udaList(p.risorse), sic=P(p.sicurezza);
  const compStato=udaNote(p.competenze_stato);
  if(!dgTesto && !comp && !fasi && !risorse && !sic) return '';
  return `<section class="detail-block uda-prog" id="progettazione"><h2>Progettazione</h2>
    ${dgTesto?`<div class="uda-domanda"><p class="kicker">Domanda generativa</p><p>${esc(dgTesto)}</p>${dg.stato?udaNote(dg.stato):''}</div>`:''}
    ${comp?`<details class="uda-det"${p.apri_competenze?' open':''}><summary>Competenze → abilità e conoscenze → traguardi ${compStato}</summary>${comp}</details>`:''}
    ${fasi?`<details class="uda-det" open><summary>Fasi e attività ${udaNote(p.fasi_stato)}</summary><ol class="uda-fasi">${fasi}</ol>${gantt}</details>`:''}
    ${risorse?`<details class="uda-det"><summary>Risorse e materiali</summary>${risorse}</details>`:''}
    ${sic?`<details class="uda-det"><summary>Accessibilità, sicurezza, permessi</summary><p>${esc(sic)}</p></details>`:''}
  </section>`;
}
function udaVocePubblicabile(x){
  return !!(x && x.verificata===true && x.testo);
}
function udaVoce(x){
  if(!udaVocePubblicabile(x)) return '';
  return `<blockquote class="voce${x.chi==='adulto'?' voce-adulto':''}"><p>${x.citazione===false?esc(x.testo):'«'+esc(x.testo)+'»'}</p>${(x.contesto||x.fonte)?`<cite>${esc([x.contesto,x.fonte].filter(Boolean).join(' · '))}</cite>`:''}</blockquote>`;
}

function udaImmaginiPiazzate(e){
  const u=new Set();
  for(const x of (e.movimenti||[])) for(const im of (x.immagini||[])) if(im&&im.immagine) u.add(im.immagine);
  return u;
}
function udaMovimenti(e){
  const m=e.movimenti||[];
  const cover=new Set(e.foto||[]);
  if(!m.length){
    const r=udaParagrafi(e.racconto);
    if(r) return `<section class="detail-block" id="racconto"><h2>Il racconto in movimenti</h2>${r}</section>`;
    if(e.stato==='proposta') return `<section class="detail-block" id="racconto"><h2>Il racconto in movimenti</h2><p class="muted">Proposta: il racconto si scriverà dopo la prova con la classe.</p></section>`;
    CANTIERE_SEGNO=true; return '';
  }
  const nota=P(e.racconto_nota);
  return `<section class="detail-block uda-mov" id="racconto"><h2>Il racconto in movimenti</h2>${nota?`<p class="muted">${esc(nota)}</p>`:''}${m.map((x,i)=>{const imgs=(x.immagini||[]).filter(im=>{const u=im&&im.immagine; return !(i===0 && u && cover.has(u));}); const fonte=P(x.fonte); return `<article class="uda-movimento"><h3>${esc(x.titolo)}</h3>${udaParagrafi(x.testo)}${imgs.length?`<div class="uda-gallery uda-in-mov">${udaFig(imgs)}</div>`:''}${(()=>{ const pub=(x.voci||[]).filter(udaVocePubblicabile).map(udaVoce).join(''); return pub?`<div class="uda-voci-in-mov">${pub}</div>`:''; })()}${fonte?`<p class="provenance">${esc(fonte)}</p>`:''}</article>`;}).join('')}</section>`;
}

function udaVoci(e){
  const v=e.voci||[];
  const nv=t=>String(t||'').toLowerCase().replace(/[^a-zàèéìòù]/g,'');
  const giaNelRacconto=new Set((e.movimenti||[]).flatMap(x=>(x.voci||[]).filter(udaVocePubblicabile).map(y=>nv(y.testo))));
  const bimbi=v.filter(x=>x.chi!=='adulto' && udaVocePubblicabile(x) && !giaNelRacconto.has(nv(x.testo)));
  const adulti=v.filter(x=>x.chi==='adulto' && udaVocePubblicabile(x) && !giaNelRacconto.has(nv(x.testo)));
  const pend=!!(e.voci_in_verifica || (e.movimenti||[]).some(x=>x.voci_in_verifica) || (e.voci||[]).some(x=>x&&!udaVocePubblicabile(x)));
  if(pend) CANTIERE_SEGNO=true; // le trascrizioni in verifica non si mostrano: resta il segno «Scheda in lavorazione»
  const nelRacconto=(e.movimenti||[]).some(x=>(x.voci||[]).some(udaVocePubblicabile));
  const nota=(e.voci_nota && e.voci_nota!=='Trascrizioni in verifica.') ? P(e.voci_nota) : '';
  let corpo='';
  if(bimbi.length){ if(nelRacconto) corpo+=`<p class="muted">Altre parole dei bambini sono nel racconto, accanto al movimento in cui sono nate.</p>`; corpo+=bimbi.map(udaVoce).join(''); }
  else if(nelRacconto) corpo+=`<p class="muted">Le parole dei bambini sono nel <a href="#racconto">racconto</a>, accanto al movimento in cui sono nate.</p>`;
  else if(e.stato==='proposta') corpo+=`<p class="muted">${esc(nota||'Le voci si raccoglieranno durante la prova, con il consenso delle famiglie.')}</p>`;
  else if(nota) corpo+=`<p class="muted">${esc(nota)}</p>`;
  if(nota && (bimbi.length||nelRacconto) ) corpo+=`<p class="provenance">${esc(nota)}</p>`;
  if(adulti.length) corpo+=`<h3 class="uda-sub">Le parole degli adulti</h3>`+adulti.map(udaVoce).join('');
  if(!corpo){ CANTIERE_SEGNO=true; return ''; }
  return `<section class="detail-block" id="voci"><h2>Le voci dei bambini</h2>${corpo}</section>`;
}
function udaOsservazioni(e){
  const o=(e.osservazioni_docenti||[]).map(x=>({tipo:P(x.tipo), testo:P(x.testo), fonte:P(x.fonte)})).filter(x=>x.testo);
  if(!o.length){
    if(e.stato==='proposta') return `<section class="detail-block" id="osservazioni"><h2>Osservazioni dei docenti</h2><p class="muted">Si raccoglieranno durante la prova: evento osservato, interpretazione, domanda aperta.</p></section>`;
    CANTIERE_SEGNO=true; return '';
  }
  return `<section class="detail-block" id="osservazioni"><h2>Osservazioni dei docenti</h2><ul class="uda-oss">${o.map(x=>`<li>${x.tipo?`<span class="uda-tag">${esc(x.tipo)}</span> `:''}${esc(x.testo)}${x.fonte?` <span class="provenance">${esc(x.fonte)}</span>`:''}</li>`).join('')}</ul></section>`;
}
function udaMateriali(e){
  const placed=udaImmaginiPiazzate(e);
  const rest=(list)=> (list||[]).filter(x=>!x.immagine||!placed.has(x.immagine));
  const g=(m,id,h,nota)=>m.length?`<section class="detail-block" id="${id}"><h2>${h}</h2>${nota?`<p class="provenance">${nota}</p>`:''}<div class="uda-gallery">${udaFig(m)}</div></section>`:'';
  return g(rest(e.materiali_bambini),'materiali-bambini','I materiali dei bambini','')+g(rest(e.materiali_adulti),'materiali-adulti','Materiali preparati dagli adulti','Non sono prodotti dei bambini: servono a capire come è stata condotta l’esperienza.');
}
function udaFig(m){
  return `${m.map(x=>{ const did=P(x.didascalia), fonte=P(x.fonte); return `<figure class="uda-mat">${x.immagine?`<a href="${esc(x.immagine)}" target="_blank" rel="noopener"><img src="${esc(x.immagine)}" alt="${esc(x.titolo||did||'Materiale')}" loading="lazy"></a>`:''}<figcaption><strong>${esc(x.titolo||'')}</strong>${x.tipo?` <span class="uda-tag">${esc(x.tipo)}</span>`:''}${did?`<br>${esc(did)}`:''}${fonte?`<br><span class="provenance">${esc(fonte)}</span>`:''}</figcaption></figure>`; }).join('')}`;
}
function udaValutazione(e){
  const v=e.valutazione||{};
  const r=v.rubrica;
  const livelli=(r&&r.livelli)||UDA_LIVELLI_DEFAULT;
  const rub=r&&(r.indicatori||[]).length?`<details class="uda-det"><summary>Rubrica osservativa ${udaNote(r.stato)}</summary><div class="table-scroll"><table class="uda-rubrica"><thead><tr><th>Dimensione</th>${livelli.map(l=>`<th>${esc(l)}</th>`).join('')}</tr></thead><tbody>${r.indicatori.map(i=>`<tr><th scope="row">${esc(i.dimensione)}${i.ambito?`<br><span class="muted">${esc(i.ambito)}</span>`:''}</th>${(i.descrittori||[]).map(d=>`<td>${esc(P(d))}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>`:'';
  const righe=[['Prodotto',P(v.prodotto)],['Processo',P(v.processo)],['Metacognizione e autovalutazione',P(v.metacognizione)]];
  if(righe.some(([,t])=>!t)) CANTIERE_SEGNO=true;
  const vis=righe.filter(([,t])=>t);
  const ev=udaList(v.evidenze);
  const stato=udaNote(v.stato);
  if(!vis.length && !rub && !ev) return '';
  return `<section class="detail-block uda-val" id="valutazione"><h2>Valutazione</h2>${stato?`<p>${stato}</p>`:''}
    ${vis.length?`<dl class="scheda">${vis.map(([k,t])=>`<div><dt>${k}</dt><dd>${esc(t)}</dd></div>`).join('')}</dl>`:''}
    ${rub}
    ${ev?`<p><strong>Evidenze raccolte</strong></p>${ev}`:''}
    <p class="provenance">${esc(P(v.nota)||'Griglie osservative e formative, non una pagella: nella primaria i giudizi sintetici periodici e finali seguono l’OM 3/2025 e i criteri deliberati dalla scuola.')}</p></section>`;
}
function udaManifesto(e){
  const voci=MANIFESTO_VOCI.map(([k,l])=>[l,String(e[k]||'').trim()]).filter(([,t])=>t);
  if(!voci.length) return '';
  return `<div class="uda-manifesto"><p class="kicker">Con il manifesto della Strada</p>${voci.map(([l,t])=>`<h3 class="uda-sub">${esc(l)}</h3>${udaParagrafi(t)}`).join('')}</div>`;
}
function udaLettura(e){
  const l=e.lettura||{};
  const parts=[['Ciclo di Kolb',l.kolb],['Intelligenze multiple (Gardner)',l.gardner],['Play Motifs',l.play_motifs],['Indicazioni nazionali',l.indicazioni],['Competenze UE 2018',l.ue]].map(([k,v])=>[k,P(v)]).filter(x=>x[1]);
  const testo=udaParagrafi(l.testo||e.lettura_pedagogica||'');
  const man=udaManifesto(e);
  if(!testo && !parts.length && !man){ CANTIERE_SEGNO=true; return ''; }
  const stato=udaNote(l.stato);
  return `<section class="detail-block" id="lettura"><h2>Lettura pedagogica</h2>${stato?`<p>${stato}</p>`:''}${testo}${parts.length?`<dl class="scheda">${parts.map(([k,v])=>`<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`:''}${man}</section>`;
}
function udaApparato(e){
  const a=e.apparato||{};
  const reg=(a.registro||[]).map(r=>{ const n=P(r.nota); return `<li><strong>${esc(r.versione||'')}</strong> · ${esc(r.data||'')}${n?` — ${esc(n)}`:''}</li>`; }).join('');
  const fonti=udaList(a.fonti), mat=udaList(a.materiali), repl=P(a.replicare);
  const links=(e.links||[]).length?`<p>${e.links.map(l=>`<a target="_blank" rel="noopener" href="${esc(l.url)}">${esc(l.label)} ↗</a>`).join('<br>')}</p>`:'';
  if(!fonti && !links && !mat && !repl && !reg) return '';
  return `<section class="detail-block" id="apparato"><h2>Apparato</h2>
    ${fonti?`<h3 class="uda-sub">Fonti</h3>${fonti}`:''}
    ${links}
    ${mat?`<h3 class="uda-sub">Materiali</h3>${mat}`:''}
    ${repl?`<h3 class="uda-sub">Per replicare</h3><p class="racconto">${esc(repl)}</p>`:''}
    ${reg?`<h3 class="uda-sub">Registro delle revisioni</h3><ul class="uda-ul">${reg}</ul>`:''}
  </section>`;
}
function linkTappa(t, data){ const x=data.find(d=>d.id===t.esperienza_id); return x?`esperienza.html?id=${encodeURIComponent(x.id)}`:`aula.html?id=${encodeURIComponent(t.aula_id)}`; }
function udaTappe(e, data){
  if(!(e.tappe&&e.tappe.length)) return '';
  return `<section class="detail-block" id="tappe"><h2>Le tappe del percorso</h2><ol class="uda-tappe">${e.tappe.map(t=>{const x=data.find(d=>d.id===t.esperienza_id); const nota=P(t.nota); return `<li><a href="${linkTappa(t,data)}">${esc(t.titolo||(x&&x.titolo)||t.aula_id)}</a>${nota?` <span class="muted">· ${esc(nota)}</span>`:''} · <a class="muted" href="aula.html?id=${encodeURIComponent(t.aula_id)}">aula</a></li>`;}).join('')}</ol></section>`;
}
// Rimando chiaro dalla tappa al suo percorso (UDA o proposta), con tappa precedente e successiva
function udaTappaNav(e, data){
  if(!e.percorso_uda) return '';
  const u=data.find(d=>d.id===e.percorso_uda.id);
  if(!u) return '';
  const tl=u.tappe||[]; const i=tl.findIndex(t=>t.esperienza_id===e.id);
  const n=e.percorso_uda.tappa||(i>=0?i+1:'');
  const prev=i>0?tl[i-1]:null, next=(i>=0&&i<tl.length-1)?tl[i+1]:null;
  const uUrl=`esperienza.html?id=${encodeURIComponent(u.id)}`;
  return `<nav class="tappa-nav" aria-label="Il percorso di questa tappa">
    <p class="kicker">Tappa ${esc(n)} di ${tl.length}</p>
    <p>Questa scheda è una sosta del percorso <a href="${uUrl}"><strong>${esc(u.titolo)}</strong></a> ${etichettaScheda(u)}. Progettazione, valutazione e lettura dell’uscita intera sono nella scheda del percorso.</p>
    <p class="tappa-nav-links">${prev?`<a href="${linkTappa(prev,data)}" rel="prev">← ${esc(prev.titolo)}</a>`:'<span></span>'}<a class="tappa-nav-all" href="${uUrl}#tappe">Tutte le tappe</a>${next?`<a href="${linkTappa(next,data)}" rel="next">${esc(next.titolo)} →</a>`:'<span></span>'}</p>
  </nav>`;
}
function renderUda(e, data){
  CANTIERE_SEGNO=!!((e.da_completare||[]).length || e.voci_in_verifica);
  const u=e.percorso_uda&&data.find(d=>d.id===e.percorso_uda.id);
  const descr=P(e.descrizione||'');
  const prov=[esc(P(e.provenienza||'')), e.versione?esc(e.versione):'', P(e.documentazione)?`documentazione: ${esc(P(e.documentazione))}`:''];
  const videoNota=P(e.videos_nota);
  const videos=(e.videos||[]).length?`<section class="detail-block"><h2>Video</h2>${videoNota?`<p class="muted">${esc(videoNota)}</p>`:''}${videoBlocks(e.videos)}</section>`:'';
  const intro=`<section class="detail-block">${descr?`<p class="racconto">${esc(descr)}</p>`:''}<p><a href="aula.html?id=${encodeURIComponent(e.aula_id)}">Scheda dell’aula →</a> · <a href="mappa.html?aula=${encodeURIComponent(e.aula_id)}">Vedi sulla mappa →</a></p>${(e.aule_collegate||[]).length?`<p class="muted">Aule collegate: ${e.aule_collegate.map(a=>`<a href="aula.html?id=${encodeURIComponent(a.id||a)}">${esc(a.nome||a)}</a>`).join(' · ')}</p>`:''}</section>`;
  const body=udaTappe(e,data)+intro+udaSintesi(e)+udaProgettazione(e)+videos+udaMovimenti(e)+udaMateriali(e)+udaVoci(e)+udaOsservazioni(e)+udaValutazione(e)+udaLettura(e)+udaApparato(e);
  const toc=[['tappe','Tappe'],['sintesi','Sintesi'],['progettazione','Progettazione'],['racconto','Racconto'],['voci','Voci'],['osservazioni','Osservazioni'],['valutazione','Valutazione'],['lettura','Lettura'],['apparato','Apparato']].filter(([id])=>body.includes(`id="${id}"`));
  const head=`<nav class="crumbs" aria-label="Percorso"><a href="archivio.html">Archivio</a><span>›</span>${u?`<a href="esperienza.html?id=${encodeURIComponent(u.id)}">${esc(u.titolo)}</a><span>›</span>`:''}<strong>${esc(e.titolo)}</strong></nav>
    <div class="page-head">
      <p class="kicker">${etichettaScheda(e)}${metaPercorso(e)} · ${esc(e.community)}${e.codice?` · ${esc(e.codice)}`:''}</p>
      <h1 class="page-title" style="font-weight:400;font-size:clamp(28px,4vw,42px)">${esc(e.titolo)}</h1>
      ${e.sottotitolo?`<p class="uda-sottotitolo">${esc(e.sottotitolo)}</p>`:''}
      ${udaTappaNav(e,data)}
      ${CANTIERE_SEGNO?segnoLavorazione():''}
      ${(e.foto||[]).filter(Boolean).length?`<div class="detail-gallery">${(e.foto||[]).filter(Boolean).map((u,i)=>`<figure class="detail-photo"><img src="${esc(u)}" alt="${esc(e.titolo)} · foto ${i+1}" loading="lazy"></figure>`).join('')}</div>`:''}
      <p><a href="aula.html?id=${encodeURIComponent(e.aula_id)}">${esc(e.aula)}</a>${(e.aule_collegate||[]).length?` <span class="muted">· e altre ${e.aule_collegate.length} aule collegate</span>`:''}</p>
      <p class="tags">${esc((e.eta||[]).join(' · '))}${(e.gruppo||[]).length?' / '+esc(e.gruppo.map(g=>groupLabels[g]||g).join(' · ')):''}${(e.discipline||[]).length?'<br>'+esc(e.discipline.join(' · ')):''}</p>
      <p class="provenance">${prov.filter(Boolean).join(' · ')}</p>
    </div>
    ${toc.length>1?`<nav class="uda-toc" aria-label="Sezioni della scheda">${toc.map(([id,l])=>`<a href="#${id}">${l}</a>`).join('')}</nav>`:''}`;
  return head+body;
}

window.initEspPage = async function(){
  const root = $('#esp-root'); if(!root) return;
  const id = new URLSearchParams(location.search).get('id');
  if(!id){ root.innerHTML = '<p class="notice">Manca l’identificativo dell’esperienza.</p>'; return; }
  try{
    const {data} = await loadProtoData();
    const e = data.find(x => x.id === id);
    if(!e){ root.innerHTML = '<p class="notice">Esperienza non trovata in archivio.</p>'; return; }
    document.title = `${e.titolo} · La Strada dei Bambini`;
    if (e.modello) { root.innerHTML = renderUda(e, data); return; }
    // Schede fuori dal modello integrato (contributi approvati): le sezioni vuote non si mostrano
    CANTIERE_SEGNO=!!(e.da_completare||[]).length;
    const s = e.scheda_uda || {};
    const sk = Object.entries(s).map(([k,v])=>[k,P(v)]).filter(([,v])=>v);
    const voci = (e.voci_bambini||[]).map(v=>`<blockquote class="voce"><p>«${esc(v)}»</p></blockquote>`).join('');
    const videos = e.videos || [];
    const racconto = P(e.racconto), lettura = P(e.lettura_pedagogica), descr = P(e.descrizione), materiali = P(e.materiali);
    if(!racconto && e.stato!=='proposta') CANTIERE_SEGNO=true;
    const corpo = `
      ${videos.length ? `<section class="detail-block"><h2>Video</h2>${videoBlocks(videos)}</section>` : ''}
      <section class="detail-block">
        <h2>In sintesi</h2>
        ${descr?`<p>${esc(descr)}</p>`:''}
        <p><a href="aula.html?id=${encodeURIComponent(e.aula_id)}">Scheda dell’aula →</a> · <a href="mappa.html?aula=${encodeURIComponent(e.aula_id)}">Vedi sulla mappa →</a></p>
      </section>
      ${sk.length ? `<section class="detail-block"><h2>Scheda UDA</h2><dl class="scheda">${sk.map(([k,v])=>`<div><dt>${esc(k.replace(/_/g,' '))}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl></section>` : ''}
      ${racconto ? `<section class="detail-block"><h2>Racconto</h2><p class="racconto">${esc(racconto)}</p></section>` : (e.stato==='proposta' ? '<section class="detail-block"><h2>Racconto</h2><p class="muted">Proposta: non c’è ancora un racconto di prova svolta.</p></section>' : '')}
      ${voci ? `<section class="detail-block"><h2>Voci dei bambini</h2>${voci}</section>` : ''}
      ${lettura ? `<section class="detail-block"><h2>Lettura pedagogica</h2><p class="racconto">${esc(lettura)}</p>${udaManifesto(e)}</section>` : (udaManifesto(e)?`<section class="detail-block"><h2>Lettura pedagogica</h2>${udaManifesto(e)}</section>`:'')}
      ${(materiali || e.fonte_volume || (e.links||[]).length || e.estratto_scheda) ? `<section class="detail-block">
        <h2>Materiali e fonti</h2>
        ${materiali?`<p class="racconto">${esc(materiali)}</p>`:''}
        ${e.fonte_volume ? `<p class="source">${esc(P(e.fonte_volume))}</p>` : ''}
        ${(e.links||[]).map(l=>`<p><a target="_blank" rel="noopener" href="${esc(l.url)}">${esc(l.label)} ↗</a></p>`).join('')}
        ${e.estratto_scheda ? `<details><summary>Estratto dalla scheda pubblicata</summary><p class="racconto">${esc(e.estratto_scheda)}</p></details>` : ''}
      </section>` : ''}`;
    root.innerHTML = `
      <nav class="crumbs" aria-label="Percorso"><a href="archivio.html">Archivio</a><span>›</span><strong>${esc(e.titolo)}</strong></nav>
      <div class="page-head">
        <p class="kicker">${etichettaScheda(e)} · ${esc(e.community)}</p>
        <h1 class="page-title" style="font-weight:400;font-size:clamp(28px,4vw,42px)">${esc(e.titolo)}</h1>
        <p>${esc(e.aula)}${e.percorso?` · ${esc(e.percorso)}`:''}</p>
        <p class="tags">${esc((e.eta||[]).join(' · '))} / ${esc((e.gruppo||[]).map(g=>groupLabels[g]||g).join(' · '))}<br>${esc((e.discipline||[]).join(' · '))}</p>
        ${e.contributo?raccontatoDaHtml(e):`<p class="provenance">${esc(P(e.provenienza))}</p>`}
        ${CANTIERE_SEGNO?segnoLavorazione():''}
      </div>
      ${(e.foto||[]).length ? `<div class="detail-gallery">${e.foto.map((u,i)=>`<figure class="detail-photo"><img src="${esc(u)}" alt="${esc(e.titolo)} · foto ${i+1}" loading="lazy"></figure>`).join('')}</div>` : ''}
      ${corpo}`;
  }catch(err){
    console.error(err);
    root.innerHTML = '<p class="notice">Non è stato possibile caricare i dati dell’esperienza.</p>';
  }
};
/* MapTiler Satellite/Hybrid.
   Config pubblica client: maptiler-config.json (solo key origin-restricted + style).
   Sorgente privata fuori dalla root di publish; eventuale override locale maptiler.local.json solo su localhost.
   Senza config valida il selettore non compare. Se i tile falliscono (origin, quota, errore) si torna a Topografica.
   Con L.tileLayer il traffico conta come richieste API, non come sessioni (docs MapTiler). */
window.initMapTilerBasemap = function(map, otm){
  const PLACEHOLDER=/^(INSERISCI_QUI_LA_TUA_CHIAVE|YOUR_MAPTILER_API_KEY|YOUR_API_KEY|changeme|example)?$/i;
  const parseCfg=j=>{
    if(!j || typeof j!=='object') return null;
    const key=String(j.key||j.apiKey||j.api_key||'').trim();
    if(!key || PLACEHOLDER.test(key)) return null;
    const style=String(j.style||'hybrid-v4').trim()||'hybrid-v4';
    if(!/^[a-z0-9-]+$/i.test(style)) return null;
    return {key, style};
  };
  const loadCfg=()=>{
    const host=location.hostname;
    const local=/^(localhost|127\.0\.0\.1)$/.test(host);
    const urls=local?['maptiler.local.json','maptiler-config.json']:['maptiler-config.json'];
    const tryUrl=i=>{
      if(i>=urls.length) return Promise.resolve(null);
      return fetch(urls[i],{cache:'no-store'}).then(r=>{
        if(!r.ok) return tryUrl(i+1);
        return r.json().then(parseCfg).then(cfg=>cfg||tryUrl(i+1));
      }).catch(()=>tryUrl(i+1));
    };
    return tryUrl(0);
  };

  const attach=cfg=>{
    if(!cfg || !map || !otm) return;
    const filters=$('#map-filters');
    if(!filters || filters.querySelector('.basemap-switch')) return;
    const attr='<a href="https://www.maptiler.com/copyright/" target="_blank" rel="noopener">© MapTiler</a> <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a>';
    const sat=L.tileLayer('https://api.maptiler.com/maps/'+cfg.style+'/256/{z}/{x}/{y}.jpg?key='+encodeURIComponent(cfg.key),{
      tileSize:256, minZoom:1, maxZoom:22, maxNativeZoom:22, attribution:attr, crossOrigin:true
    });
    const wrap=document.createElement('div');
    wrap.className='basemap-switch';
    wrap.setAttribute('role','group');
    wrap.setAttribute('aria-label','Sfondo della mappa');
    wrap.innerHTML='<button type="button" class="is-on" data-base="topo" aria-pressed="true">Topografica</button><button type="button" data-base="sat" aria-pressed="false">Satellite</button>';
    filters.appendChild(wrap);
    let note=filters.querySelector('.basemap-note');
    if(!note){
      note=document.createElement('p');
      note.className='basemap-note';
      note.setAttribute('role','status');
      note.hidden=true;
      filters.appendChild(note);
    }
    const showNote=msg=>{
      if(!msg){ note.hidden=true; note.textContent=''; return; }
      note.textContent=msg;
      note.hidden=false;
    };
    let logo=null;
    const showLogo=on=>{
      if(on){
        if(!logo){
          logo=document.createElement('a');
          logo.className='maptiler-logo';
          logo.href='https://www.maptiler.com/';
          logo.target='_blank';
          logo.rel='noopener';
          logo.title='MapTiler';
          logo.innerHTML='<img src="https://api.maptiler.com/resources/logo.svg" alt="MapTiler" width="68" height="16">';
          const box=document.getElementById('map');
          if(box) box.appendChild(logo);
        }
        logo.hidden=false;
      } else if(logo) logo.hidden=true;
    };
    let satOk=false, errCount=0, current='topo';
    const setBase=which=>{
      const wantSat=which==='sat';
      if(wantSat){
        errCount=0;
        satOk=false;
        showNote('');
        if(map.hasLayer(otm)) map.removeLayer(otm);
        if(!map.hasLayer(sat)) sat.addTo(map);
        sat.bringToBack();
        if(map.getZoom()>22) map.setZoom(22);
      } else {
        if(map.hasLayer(sat)) map.removeLayer(sat);
        if(!map.hasLayer(otm)) otm.addTo(map);
        otm.bringToBack();
        if(map.getZoom()>17) map.setZoom(17);
      }
      current=wantSat?'sat':'topo';
      showLogo(wantSat);
      wrap.querySelectorAll('button').forEach(b=>{
        const on=b.getAttribute('data-base')===(wantSat?'sat':'topo');
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-pressed', on?'true':'false');
      });
    };
    const fallbackTopo=()=>{
      if(current!=='sat') return;
      setBase('topo');
      showNote('Satellite non disponibile (errore o quota). Resto su Topografica.');
    };
    sat.on('tileload', ()=>{ satOk=true; errCount=0; });
    sat.on('tileerror', ()=>{
      if(current!=='sat') return;
      errCount++;
      const limit=satOk?12:6;
      if(errCount>=limit) fallbackTopo();
    });
    wrap.addEventListener('click', ev=>{
      const b=ev.target.closest('button[data-base]');
      if(b) setBase(b.getAttribute('data-base'));
    });
  };
  loadCfg().then(attach);
};

// --- Numeri veri, calcolati da esperienze.json (comunità nascoste escluse): <span data-num="uda" data-comunita="…">15</span>
// Chiavi: schede, uda, percorsi, tappe, tappe_video, proposte, proposte_tappe, proposte_schede, percorsi_proposti.
// Il numero scritto nell'HTML resta come riserva se il file non si carica.
(async function initNumeri(){
  const els=document.querySelectorAll('[data-num]'); if(!els.length) return;
  try{
    const r=await fetch('/esperienze.json'); if(!r.ok) return;
    const data=await r.json();
    nascondiComunita(data);
    const cache={};
    els.forEach(el=>{
      const com=el.dataset.comunita||'';
      const c=cache[com]||(cache[com]=contaSchede(com?data.filter(e=>e.community===com):data));
      const v=c[el.dataset.num];
      if(v!=null) el.textContent=String(v);
    });
  }catch(err){ console.error(err); }
})();
