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
function daCompletareBox(items){
  if(!items || !items.length) return '';
  return `<section class="detail-block editor-box" aria-label="Da completare"><h2>Da completare</h2><p class="muted">Parti ancora da riempire con fonti reali (non inventiamo contenuti).</p><ul>${items.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></section>`;
}

function card(e, note=''){
  const vNote = (e.videos&&e.videos.length) ? `<p class="match-note">Video documentato · ${(e.videos||[]).length} clip</p>` : '';
  return `<article class="experience"><span class="badge ${e.stato}">${e.stato==='vissuta'?'Vissuta':'Proposta'}</span>${e.modello?` <span class="badge uda">${(e.tappe||[]).length?'UDA · percorso':'Scheda UDA'}</span>`:''}${e.codice?` <span class="provenance">${esc(e.codice)}</span>`:''}<h3><a href="esperienza.html?id=${encodeURIComponent(e.id)}">${esc(e.titolo)}</a></h3><p>${esc(e.aula)} · ${esc(e.community)}</p>${note?`<p class="match-note">${esc(note)}</p>`:''}${vNote}<p>${esc(e.descrizione)}</p><p class="tags">${esc((e.eta||[]).join(' · '))} / ${esc((e.gruppo||[]).map(g=>groupLabels[g]||g).join(' · '))}<br>${esc((e.discipline||[]).join(' · '))}</p>${e.contributo?raccontatoDaHtml(e):`<p class="provenance">${esc(e.provenienza||'')}</p>`}<p><a href="esperienza.html?id=${encodeURIComponent(e.id)}">Apri la scheda →</a> · <a href="aula.html?id=${encodeURIComponent(e.aula_id)}">Vai all’aula →</a></p></article>`;
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
async function init(){
  if(!$('#map') && !$('#archive-filters') && !$('#story-form')) return;
  const [data, geo, communities, approvati] = await Promise.all([...['esperienze.json','luoghi.geojson','comunita.json'].map(x=>fetch(x).then(r=>{if(!r.ok) throw Error(x); return r.json();})), $('#story-form')?Promise.resolve([]):fetchApproved()]);
  mergeApproved(approvati, data, geo, communities);
  const disciplines=[...new Set(data.flatMap(e=>e.discipline))].sort();

  if($('#archive-filters')){
    const fields=[
      ['community','Comunità',[...new Set(data.map(e=>e.community))]],
      ['tipo_aula','Tipo di aula',[...new Set(data.map(e=>e.tipo_aula))]],
      ['eta','Età',ages],
      ['discipline','Disciplina',disciplines],
      ['stato','Stato',['vissuta','proposta']],
      ['gruppo','Gruppo',groups],
      ['competenze_ue','Competenza UE',[...new Set(data.flatMap(e=>e.competenze_ue||[]))].sort()],
      ['documentazione','Documentazione',[...new Set(data.map(e=>e.documentazione).filter(Boolean))].sort()]
    ];
    $('#archive-filters').innerHTML = `<div class="field grow"><label for="search">Cerca</label><input id="search" type="search" placeholder="albero, ascolto, piazza…"></div>` +
      fields.map(([id,label,vals])=>`<div class="field"><label for="f-${id}">${esc(label)}</label><select id="f-${id}">${options(vals,'','Tutti')}</select></div>`).join('');
    const row=e=>`<tr><td><span class="badge ${e.stato}">${e.stato==='vissuta'?'Vissuta':'Proposta'}</span></td><td><strong><a href="esperienza.html?id=${encodeURIComponent(e.id)}">${esc(e.titolo)}</a></strong>${e.modello?` <span class="badge uda">${(e.tappe||[]).length?'UDA · percorso':'Scheda UDA'}</span>`:''}<div class="provenance">${esc(e.descrizione||'')}</div></td><td>${esc(e.aula||'')}</td><td>${esc(e.community||'')}</td><td>${esc((e.eta||[]).join(', '))}</td><td>${esc((e.discipline||[]).join(', '))}</td><td class="provenance">${e.contributo?raccontatoDaHtml(e):esc(e.provenienza||'')}</td></tr>`;
    const render=()=>{
      let filtered=data.filter(e=>fields.every(([id])=>{const v=$(`#f-${id}`).value; return !v || (Array.isArray(e[id])?e[id].includes(v):e[id]===v);}));
      const q=$('#search').value.toLocaleLowerCase();
      filtered=filtered.filter(e=>JSON.stringify(e).toLocaleLowerCase().includes(q));
      const vissute=filtered.filter(e=>e.stato==='vissuta');
      const proposte=filtered.filter(e=>e.stato==='proposta');
      $('#result-count').textContent = `${filtered.length} esperienze · ${vissute.length} vissute · ${proposte.length} proposte`;
      let html='';
      if(vissute.length){ html += `<tr class="group-row"><td colspan="7"><strong>Esperienze vissute</strong> · con i bambini, documentate (volume del Salento, uscite di Valdobbiadene in video, contributi approvati)</td></tr>` + vissute.map(row).join(''); }
      if(proposte.length){ html += `<tr class="group-row"><td colspan="7"><strong>Proposte · cosa si può fare qui</strong> · non ancora svolte con una classe (progetti scritti, sopralluoghi degli adulti)</td></tr>` + proposte.map(row).join(''); }
      $('#archive-results').innerHTML = html || `<tr><td colspan="7">Nessuna esperienza con questi filtri.</td></tr>`;
    };
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
      const list=(arr, label)=> arr.length ? `<section class="panel-group"><h3>${esc(label)}</h3><ul class="panel-esp">${arr.map(e=>`<li><a href="esperienza.html?id=${encodeURIComponent(e.id)}"><span class="badge ${e.stato}">${e.stato==='vissuta'?'Vissuta':'Proposta'}</span> ${esc(e.titolo)}</a></li>`).join('')}</ul></section>` : '';
      $('#place-panel').innerHTML = `
        <button type="button" class="panel-close" id="panel-close" aria-label="Chiudi">×</button>
        <div><p class="kicker">${esc(p.community)} · aula all’aperto</p><h2>${esc(p.name)}</h2></div>
        <div class="panel-photos">${fotos || `<div class="photo-empty"><span>Foto dell’aula ancora da caricare</span></div>`}</div>
        ${vids.length?`<section class="panel-group"><h3>Video</h3>${panelVideos(vids)}</section>`:''}
        <section class="panel-meta">
          <p><strong>Custodi dell’aula</strong><br><span class="muted">Da indicare · i nomi compaiono solo con consenso</span></p>
          <p><strong>Community manager</strong><br>${esc((com&&com.manager)||managerByName[p.community]||'Da indicare')}</p>
        </section>
        ${list(bag.vissute, 'Esperienze vissute')}
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
    const daComp = (p.da_completare || []).map(x => `<li>${esc(x)}</li>`).join('');
    const attivita = p.attivita_testo || (p.scheda && p.scheda.attivita) || '';
    const luogo = (p.scheda && p.scheda.luogo) || p.breve || 'Testo del luogo ancora da completare.';
    root.innerHTML = `
      <nav class="crumbs" aria-label="Percorso"><a href="mappa.html">Mappa</a><span>›</span>${comSlug?`<a href="comunita/${comSlug}.html">${esc(p.community)}</a>`:`<span>${esc(p.community)}</span>`}<span>›</span><strong>${esc(p.name)}</strong></nav>
      ${bozza}
      <div class="page-head">
        <p class="kicker">${esc(p.community)} · aula all’aperto</p>
        <h1 class="page-title" style="font-weight:400;font-size:clamp(28px,4vw,42px)">${esc(p.name)}</h1>
        ${genius ? `<p>${esc(genius)}</p>` : ''}
        ${p.percorso ? `<p class="muted">${esc(p.percorso)}</p>` : ''}
      </div>
      <div class="detail-gallery">${fotos || '<div class="photo-empty"><span>Foto dell’aula ancora da caricare</span></div>'}</div>
      ${(()=>{ const vids=related.flatMap(e=>e.videos||[]); if(vids.length) return `<section class="detail-block"><h2>Video dell’esperienza</h2>${videoBlocks(vids)}</section>`; if((p.video||[]).length){ const fallback=p.video.map((u,i)=>({embed:u,url:u.replace('/embed/','/watch?v='),titolo:`Video ${i+1}`})); return `<section class="detail-block"><h2>Video</h2>${videoBlocks(fallback)}</section>`; } return ''; })()}
      <section class="detail-block">
        <h2>Il luogo</h2>
        <p class="racconto">${esc(luogo)}</p>
      </section>
      <section class="detail-block" id="cosa">
        <h2>Cosa si può fare qui</h2>
        ${attivita ? `<p class="racconto">${esc(attivita)}</p>` : '<p class="muted">Nelle fonti non risultano ancora attività descritte per questa aula.</p>'}
        <p><a href="mappa.html?aula=${encodeURIComponent(id)}">Vedi il luogo sulla mappa →</a></p>
      </section>
      <section class="detail-block">
        <h2>Voci</h2>
        ${vociList || '<p class="muted">Nessuna voce raccolta ancora per questa aula.</p>'}
      </section>
      ${daComp ? `<section class="detail-block editor-box" aria-label="Da completare"><h2>Da completare</h2><p class="muted">Appunti per chi corregge la scheda (non sono esperienze inventate).</p><ul>${daComp}</ul></section>` : ''}
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
const UDA_LIVELLI_DEFAULT=['Inizia, con guida','Prova, con qualche aiuto','Fa da sé','Spiega e trasferisce'];
function udaVal(v){
  if(v==null||v==='') return '<span class="uda-gap">Da completare con i docenti</span>';
  if(Array.isArray(v)) return v.length?v.map(esc).join(' · '):'<span class="uda-gap">Da completare con i docenti</span>';
  return esc(v);
}
function udaNote(t){ return t?`<span class="uda-stato">${esc(t)}</span>`:''; }
function udaList(a){ return (a&&a.length)?`<ul class="uda-ul">${a.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''; }
function udaSintesi(e){
  const s=e.uda_sintesi||{}, n=s.note||{};
  const docenti=(s.docenti||[]).map(d=>esc(d.nome)+(d.ruolo?` <span class="muted">(${esc(d.ruolo)})</span>`:'')).join('; ');
  const rows=[
    ['Quando',udaVal(s.quando),n.quando],
    ['Dove',udaVal(s.dove),n.dove],
    ['Chi',udaVal(s.chi),n.chi],
    ['Docenti e discipline',docenti||udaVal(''),n.docenti],
    ['Risorse esterne',udaVal(s.risorse_esterne),n.risorse_esterne],
    ['Tipologia UDA',udaVal(s.tipologia),n.tipologia],
    ['Discipline coinvolte',udaVal(s.discipline),n.discipline],
    ['Prodotti intermedi',udaVal(s.prodotti_intermedi),n.prodotti_intermedi],
    ['Prodotto finale',udaVal(s.prodotto_finale),n.prodotto_finale],
    ['Competenze chiave UE',udaVal(s.competenze_chiave),n.competenze_chiave]
  ];
  (s.extra||[]).forEach(([k,v])=>rows.splice(3,0,[k,udaVal(v),'']));
  return `<section class="detail-block uda-sintesi" id="sintesi"><h2>L’UDA in sintesi</h2><dl class="scheda">${rows.map(([k,v,nt])=>`<div><dt>${esc(k)}</dt><dd>${v}${nt?' '+udaNote(nt):''}</dd></div>`).join('')}</dl></section>`;
}
function udaProgettazione(e){
  const p=e.progettazione; if(!p) return '';
  const dg=p.domanda_generativa;
  const comp=(p.competenze||[]).map(c=>`<div class="uda-comp"><h4>${esc(c.competenza)}</h4>${c.abilita&&c.abilita.length?`<p><strong>Abilità</strong></p>${udaList(c.abilita)}`:''}${c.conoscenze&&c.conoscenze.length?`<p><strong>Conoscenze</strong></p>${udaList(c.conoscenze)}`:''}${c.traguardi&&c.traguardi.length?`<p><strong>Traguardi / campi d’esperienza</strong></p>${udaList(c.traguardi)}`:''}</div>`).join('');
  const fasi=(p.fasi||[]).map((f,i)=>`<li class="uda-fase"><div class="uda-fase-head"><strong>${esc(f.titolo||('Fase '+(i+1)))}</strong>${f.tempi?` <span class="muted">· ${esc(f.tempi)}</span>`:''}</div>${f.attivita?`<p>${esc(f.attivita)}</p>`:''}${(f.discipline||[]).length?`<p class="uda-chips">${f.discipline.map(d=>`<span>${esc(d)}</span>`).join('')}</p>`:''}${f.fonte?`<p class="provenance">${esc(f.fonte)}</p>`:''}</li>`).join('');
  const gantt=(()=>{ const fs=(p.fasi||[]).filter(f=>(f.discipline||[]).length); if(fs.length<2) return ''; const ds=[...new Set(fs.flatMap(f=>f.discipline))]; return `<details class="uda-gantt"><summary>Vista sinottica: discipline per fase</summary><div class="table-scroll"><table><thead><tr><th>Disciplina</th>${fs.map((f,i)=>`<th title="${esc(f.titolo||'')}">${i+1}</th>`).join('')}</tr></thead><tbody>${ds.map(d=>`<tr><td>${esc(d)}</td>${fs.map(f=>`<td>${f.discipline.includes(d)?'<span class="dot" aria-label="sì">●</span>':''}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>`; })();
  return `<section class="detail-block uda-prog" id="progettazione"><h2>Progettazione</h2>
    ${dg?`<div class="uda-domanda"><p class="kicker">Domanda generativa</p><p>${esc(dg.testo||dg)}</p>${dg.stato?udaNote(dg.stato):''}</div>`:''}
    ${comp?`<details class="uda-det"${p.apri_competenze?' open':''}><summary>Competenze → abilità e conoscenze → traguardi ${p.competenze_stato?udaNote(p.competenze_stato):''}</summary>${comp}</details>`:(p.competenze_stato?`<p class="muted">Competenze: ${esc(p.competenze_stato)}</p>`:'')}
    ${fasi?`<details class="uda-det" open><summary>Fasi e attività ${p.fasi_stato?udaNote(p.fasi_stato):''}</summary><ol class="uda-fasi">${fasi}</ol>${gantt}</details>`:''}
    ${(p.risorse||[]).length?`<details class="uda-det"><summary>Risorse e materiali</summary>${udaList(p.risorse)}</details>`:''}
    ${p.sicurezza?`<details class="uda-det"><summary>Accessibilità, sicurezza, permessi</summary><p>${esc(p.sicurezza)}</p></details>`:''}
  </section>`;
}
function udaVocePubblicabile(x){
  return !!(x && x.verificata===true && x.testo);
}
function udaVoce(x){
  if(!udaVocePubblicabile(x)) return '';
  return `<blockquote class="voce${x.chi==='adulto'?' voce-adulto':''}"><p>${x.citazione===false?esc(x.testo):'«'+esc(x.testo)+'»'}</p>${(x.contesto||x.fonte)?`<cite>${esc([x.contesto,x.fonte].filter(Boolean).join(' · '))}</cite>`:''}</blockquote>`;
}
function udaNotaTrascrizioni(cond){
  return cond ? '<p class="muted">Trascrizioni in verifica</p>' : '';
}

function udaImmaginiPiazzate(e){
  const u=new Set();
  for(const x of (e.movimenti||[])) for(const im of (x.immagini||[])) if(im&&im.immagine) u.add(im.immagine);
  return u;
}
function udaMovimenti(e){
  const m=e.movimenti||[];
  const cover=new Set(e.foto||[]);
  if(!m.length) return `<section class="detail-block" id="racconto"><h2>Il racconto in movimenti</h2>${e.racconto?`<p class="racconto">${esc(e.racconto)}</p>`:`<p class="muted">${e.stato==='proposta'?'Proposta: il racconto si scriverà dopo la prova con la classe.':'Racconto da completare con i docenti.'}</p>`}</section>`;
  return `<section class="detail-block uda-mov" id="racconto"><h2>Il racconto in movimenti</h2>${e.racconto_nota?`<p class="muted">${esc(e.racconto_nota)}</p>`:''}${m.map((x,i)=>{const imgs=(x.immagini||[]).filter(im=>{const u=im&&im.immagine; return !(i===0 && u && cover.has(u));}); return `<article class="uda-movimento"><h3>${esc(x.titolo)}</h3>${String(x.testo||'').split(/\n\n+/).map(t=>`<p class="racconto">${esc(t)}</p>`).join('')}${imgs.length?`<div class="uda-gallery uda-in-mov">${udaFig(imgs)}</div>`:''}${(()=>{ const pub=(x.voci||[]).filter(udaVocePubblicabile).map(udaVoce).join(''); return pub?`<div class="uda-voci-in-mov">${pub}</div>`:''; })()}${x.fonte?`<p class="provenance">${esc(x.fonte)}</p>`:''}</article>`;}).join('')}</section>`;
}

function udaVoci(e){
  const v=e.voci||[];
  const nv=t=>String(t||'').toLowerCase().replace(/[^a-zàèéìòù]/g,'');
  const giaNelRacconto=new Set((e.movimenti||[]).flatMap(x=>(x.voci||[]).filter(udaVocePubblicabile).map(y=>nv(y.testo))));
  const bimbi=v.filter(x=>x.chi!=='adulto' && udaVocePubblicabile(x) && !giaNelRacconto.has(nv(x.testo)));
  const adulti=v.filter(x=>x.chi==='adulto' && udaVocePubblicabile(x) && !giaNelRacconto.has(nv(x.testo)));
  const pend=!!(e.voci_in_verifica || (e.movimenti||[]).some(x=>x.voci_in_verifica) || (e.voci||[]).some(x=>x&&!udaVocePubblicabile(x)));
  const nelRacconto=(e.movimenti||[]).some(x=>(x.voci||[]).some(udaVocePubblicabile));
  let html=`<section class="detail-block" id="voci"><h2>Le voci dei bambini</h2>`;
  if(bimbi.length){ if(nelRacconto) html+=`<p class="muted">Altre parole dei bambini sono nel racconto, accanto al movimento in cui sono nate.</p>`; html+=bimbi.map(udaVoce).join(''); }
  else if(nelRacconto) html+=`<p class="muted">Le parole dei bambini sono nel <a href="#racconto">racconto</a>, accanto al movimento in cui sono nate.</p>`;
  else if(!pend) html+=`<p class="muted">${esc((e.voci_nota && e.voci_nota!=='Trascrizioni in verifica.')?e.voci_nota:(e.stato==='proposta'?'Da raccogliere durante la prova, con il consenso delle famiglie.':'Non trascritte nelle fonti: da raccogliere con i docenti.'))}</p>`;
  html+=udaNotaTrascrizioni(pend);
  if(e.voci_nota && e.voci_nota!=='Trascrizioni in verifica.' && (bimbi.length||pend||adulti.length)) html+=`<p class="provenance">${esc(e.voci_nota)}</p>`;
  if(adulti.length) html+=`<h3 class="uda-sub">Le parole degli adulti</h3>`+adulti.map(udaVoce).join('');
  return html+`</section>`;
}
function udaOsservazioni(e){
  const o=e.osservazioni_docenti||[];
  return `<section class="detail-block" id="osservazioni"><h2>Osservazioni dei docenti</h2>${o.length?`<ul class="uda-oss">${o.map(x=>`<li>${x.tipo?`<span class="uda-tag">${esc(x.tipo)}</span> `:''}${esc(x.testo)}${x.fonte?` <span class="provenance">${esc(x.fonte)}</span>`:''}</li>`).join('')}</ul>`:`<p class="muted">${e.stato==='proposta'?'Da raccogliere durante la prova: evento osservato, interpretazione, domanda aperta.':'Non documentate nelle fonti: da completare con i docenti.'}</p>`}</section>`;
}
function udaMateriali(e){
  const placed=udaImmaginiPiazzate(e);
  const rest=(list)=> (list||[]).filter(x=>!x.immagine||!placed.has(x.immagine));
  const g=(m,id,h,nota)=>m.length?`<section class="detail-block" id="${id}"><h2>${h}</h2>${nota?`<p class="provenance">${nota}</p>`:''}<div class="uda-gallery">${udaFig(m)}</div></section>`:'';
  return g(rest(e.materiali_bambini),'materiali-bambini','I materiali dei bambini','')+g(rest(e.materiali_adulti),'materiali-adulti','Materiali preparati dagli adulti','Non sono prodotti dei bambini: servono a capire come è stata condotta l’esperienza.');
}
function udaFig(m){
  return `${m.map(x=>`<figure class="uda-mat">${x.immagine?`<a href="${esc(x.immagine)}" target="_blank" rel="noopener"><img src="${esc(x.immagine)}" alt="${esc(x.titolo||x.didascalia||'Materiale')}" loading="lazy"></a>`:''}<figcaption><strong>${esc(x.titolo||'')}</strong>${x.tipo?` <span class="uda-tag">${esc(x.tipo)}</span>`:''}${x.didascalia?`<br>${esc(x.didascalia)}`:''}${x.fonte?`<br><span class="provenance">${esc(x.fonte)}</span>`:''}</figcaption></figure>`).join('')}`;
}
function udaValutazione(e){
  const v=e.valutazione||{};
  const r=v.rubrica;
  const livelli=(r&&r.livelli)||UDA_LIVELLI_DEFAULT;
  const rub=r&&(r.indicatori||[]).length?`<details class="uda-det"><summary>Rubrica osservativa ${r.stato?udaNote(r.stato):''}</summary><div class="table-scroll"><table class="uda-rubrica"><thead><tr><th>Dimensione</th>${livelli.map(l=>`<th>${esc(l)}</th>`).join('')}</tr></thead><tbody>${r.indicatori.map(i=>`<tr><th scope="row">${esc(i.dimensione)}${i.ambito?`<br><span class="muted">${esc(i.ambito)}</span>`:''}</th>${(i.descrittori||[]).map(d=>`<td>${esc(d)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>`:'';
  const row=(k,t)=>`<div><dt>${k}</dt><dd>${t?esc(t):'<span class="uda-gap">Non documentato</span>'}</dd></div>`;
  return `<section class="detail-block uda-val" id="valutazione"><h2>Valutazione</h2>${v.stato?`<p>${udaNote(v.stato)}</p>`:''}
    <dl class="scheda">${row('Prodotto',v.prodotto)}${row('Processo',v.processo)}${row('Metacognizione e autovalutazione',v.metacognizione)}</dl>
    ${rub}
    ${(v.evidenze||[]).length?`<p><strong>Evidenze raccolte</strong></p>${udaList(v.evidenze)}`:''}
    <p class="provenance">${esc(v.nota||'Griglie osservative e formative, non una pagella: nella primaria i giudizi sintetici periodici e finali seguono l’OM 3/2025 e i criteri deliberati dalla scuola.')}</p></section>`;
}
function udaLettura(e){
  const l=e.lettura||{};
  const parts=[['Ciclo di Kolb',l.kolb],['Intelligenze multiple (Gardner)',l.gardner],['Play Motifs',l.play_motifs],['Indicazioni nazionali',l.indicazioni],['Competenze UE 2018',l.ue]].filter(x=>x[1]);
  const testo=l.testo||e.lettura_pedagogica||'';
  return `<section class="detail-block" id="lettura"><h2>Lettura pedagogica</h2>${l.stato?`<p>${udaNote(l.stato)}</p>`:''}${testo?String(testo).split(/\n\n+/).map(t=>`<p class="racconto">${esc(t)}</p>`).join(''):''}${parts.length?`<dl class="scheda">${parts.map(([k,v])=>`<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`:''}${(!testo&&!parts.length)?'<p class="muted">Da completare.</p>':''}</section>`;
}
function udaApparato(e){
  const a=e.apparato||{};
  const reg=(a.registro||[]).map(r=>`<li><strong>${esc(r.versione||'')}</strong> · ${esc(r.data||'')} — ${esc(r.nota||'')}</li>`).join('');
  return `<section class="detail-block" id="apparato"><h2>Apparato</h2>
    ${(a.fonti||[]).length?`<h3 class="uda-sub">Fonti</h3>${udaList(a.fonti)}`:''}
    ${(e.links||[]).length?`<p>${e.links.map(l=>`<a target="_blank" rel="noopener" href="${esc(l.url)}">${esc(l.label)} ↗</a>`).join('<br>')}</p>`:''}
    ${(a.materiali||[]).length?`<h3 class="uda-sub">Materiali</h3>${udaList(a.materiali)}`:''}
    ${a.replicare?`<h3 class="uda-sub">Per replicare</h3><p class="racconto">${esc(a.replicare)}</p>`:''}
    ${reg?`<h3 class="uda-sub">Registro delle revisioni</h3><ul class="uda-ul">${reg}</ul>`:''}
  </section>`;
}
function udaTappe(e, data){
  const parts=[];
  if(e.tappe&&e.tappe.length){
    parts.push(`<section class="detail-block" id="tappe"><h2>Le tappe del percorso</h2><ol class="uda-tappe">${e.tappe.map(t=>{const x=data.find(d=>d.id===t.esperienza_id); return `<li><a href="${x?`esperienza.html?id=${encodeURIComponent(x.id)}`:`aula.html?id=${encodeURIComponent(t.aula_id)}`}">${esc(t.titolo||(x&&x.titolo)||t.aula_id)}</a>${t.nota?` <span class="muted">· ${esc(t.nota)}</span>`:''} · <a class="muted" href="aula.html?id=${encodeURIComponent(t.aula_id)}">aula</a></li>`;}).join('')}</ol></section>`);
  }
  if(e.percorso_uda){ const u=data.find(d=>d.id===e.percorso_uda.id); if(u) parts.push(`<p class="match-note">Questa scheda è la tappa ${esc(e.percorso_uda.tappa||'')} dell’UDA <a href="esperienza.html?id=${encodeURIComponent(u.id)}">${esc(u.titolo)}</a>.</p>`); }
  return parts.join('');
}
function renderUda(e, data){
  const toc=[['sintesi','Sintesi'],['progettazione','Progettazione'],['racconto','Racconto'],['voci','Voci'],['osservazioni','Osservazioni'],['valutazione','Valutazione'],['lettura','Lettura'],['apparato','Apparato']];
  const head=`<nav class="crumbs" aria-label="Percorso"><a href="archivio.html">Archivio</a><span>›</span><strong>${esc(e.titolo)}</strong></nav>
    <div class="page-head">
      <p class="kicker"><span class="badge ${esc(e.stato)}">${e.stato==='vissuta'?'Vissuta':'Proposta'}</span> · ${esc(e.community)}${e.codice?` · ${esc(e.codice)}`:''}</p>
      <h1 class="page-title" style="font-weight:400;font-size:clamp(28px,4vw,42px)">${esc(e.titolo)}</h1>
      ${e.sottotitolo?`<p class="uda-sottotitolo">${esc(e.sottotitolo)}</p>`:''}
      ${(e.foto||[]).filter(Boolean).length?`<div class="detail-gallery">${(e.foto||[]).filter(Boolean).map((u,i)=>`<figure class="detail-photo"><img src="${esc(u)}" alt="${esc(e.titolo)} · foto ${i+1}" loading="lazy"></figure>`).join('')}</div>`:''}
      <p><a href="aula.html?id=${encodeURIComponent(e.aula_id)}">${esc(e.aula)}</a>${(e.aule_collegate||[]).length?` <span class="muted">· e altre ${e.aule_collegate.length} aule collegate</span>`:''}</p>
      <p class="tags">${esc((e.eta||[]).join(' · '))}${(e.gruppo||[]).length?' / '+esc(e.gruppo.map(g=>groupLabels[g]||g).join(' · ')):''}${(e.discipline||[]).length?'<br>'+esc(e.discipline.join(' · ')):''}</p>
      <p class="provenance">${esc(e.provenienza||'')}${e.versione?` · ${esc(e.versione)}`:''}${e.documentazione?` · documentazione: ${esc(e.documentazione)}`:''}</p>
    </div>
    <nav class="uda-toc" aria-label="Sezioni della scheda">${toc.map(([id,l])=>`<a href="#${id}">${l}</a>`).join('')}</nav>`;
  const videos=(e.videos||[]).length?`<section class="detail-block"><h2>Video</h2>${e.videos_nota?`<p class="muted">${esc(e.videos_nota)}</p>`:''}${videoBlocks(e.videos)}</section>`:'';
  const intro=`<section class="detail-block"><p class="racconto">${esc(e.descrizione||'')}</p><p><a href="aula.html?id=${encodeURIComponent(e.aula_id)}">Scheda dell’aula →</a> · <a href="mappa.html?aula=${encodeURIComponent(e.aula_id)}">Vedi sulla mappa →</a></p>${(e.aule_collegate||[]).length?`<p class="muted">Aule collegate: ${e.aule_collegate.map(a=>`<a href="aula.html?id=${encodeURIComponent(a.id||a)}">${esc(a.nome||a)}</a>`).join(' · ')}</p>`:''}</section>`;
  return head+udaTappe(e,data)+intro+udaSintesi(e)+udaProgettazione(e)+videos+udaMovimenti(e)+udaMateriali(e)+udaVoci(e)+udaOsservazioni(e)+udaValutazione(e)+udaLettura(e)+udaApparato(e)+daCompletareBox(e.da_completare||[]);
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
    const s = e.scheda_uda || {};
    const voci = (e.voci_bambini||[]).map(v=>`<blockquote class="voce"><p>«${esc(v)}»</p></blockquote>`).join('');
    const videos = e.videos || [];
    const daCompItems = e.da_completare || [];
    const missingRacconto = !e.racconto;
    const missingVoci = !(e.voci_bambini||[]).length;
    const missingLettura = !e.lettura_pedagogica;
    const missingScheda = !Object.keys(s).length || (!s.sintesi && !s.titolo_uda && e.community==='Valdobbiadene' && daCompItems.some(x=>x.startsWith('Scheda UDA')));
    root.innerHTML = `
      <nav class="crumbs" aria-label="Percorso"><a href="archivio.html">Archivio</a><span>›</span><strong>${esc(e.titolo)}</strong></nav>
      <div class="page-head">
        <p class="kicker"><span class="badge ${e.stato}">${e.stato==='vissuta'?'Vissuta':'Proposta'}</span> · ${esc(e.community)}</p>
        <h1 class="page-title" style="font-weight:400;font-size:clamp(28px,4vw,42px)">${esc(e.titolo)}</h1>
        <p>${esc(e.aula)} · ${esc(e.percorso||'')}</p>
        <p class="tags">${esc((e.eta||[]).join(' · '))} / ${esc((e.gruppo||[]).map(g=>groupLabels[g]||g).join(' · '))}<br>${esc((e.discipline||[]).join(' · '))}</p>
        ${e.contributo?raccontatoDaHtml(e):`<p class="provenance">${esc(e.provenienza)}</p>`}
      </div>
      ${(e.foto||[]).length ? `<div class="detail-gallery">${e.foto.map((u,i)=>`<figure class="detail-photo"><img src="${esc(u)}" alt="${esc(e.titolo)} · foto ${i+1}" loading="lazy"></figure>`).join('')}</div>` : ''}
      ${videos.length ? `<section class="detail-block"><h2>Video</h2>${videoBlocks(videos)}</section>` : ''}
      <section class="detail-block">
        <h2>In sintesi</h2>
        <p>${esc(e.descrizione)}</p>
        <p><a href="aula.html?id=${encodeURIComponent(e.aula_id)}">Scheda dell’aula →</a> · <a href="mappa.html?aula=${encodeURIComponent(e.aula_id)}">Vedi sulla mappa →</a></p>
      </section>
      <section class="detail-block">
        <h2>Scheda UDA</h2>
        ${Object.keys(s).length ? `<dl class="scheda">${Object.entries(s).map(([k,v])=>`<div><dt>${esc(k.replace(/_/g,' '))}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>` : '<p class="muted">Scheda non disponibile per questa esperienza.</p>'}
        ${missingScheda && !Object.keys(s).filter(k=>k!=='dove').length ? '<p class="muted">Da completare: testo di progetto oltre al video.</p>' : ''}
      </section>
      <section class="detail-block">
        <h2>Racconto</h2>
        ${e.racconto ? `<p class="racconto">${esc(e.racconto)}</p>` : (e.stato==='proposta' ? '<p class="muted">Proposta: non c’è ancora un racconto di prova svolta.</p>' : '<p class="muted">Da completare: il video documenta l’uscita; manca ancora un racconto scritto.</p>')}
      </section>
      <section class="detail-block">
        <h2>Voci dei bambini</h2>
        ${voci || '<p class="muted">Da completare: nessuna voce raccolta nelle fonti scritte (eventualmente solo nel video).</p>'}
      </section>
      <section class="detail-block">
        <h2>Lettura pedagogica</h2>
        ${e.lettura_pedagogica ? `<p class="racconto">${esc(e.lettura_pedagogica)}</p>` : '<p class="muted">Da completare: lettura pedagogica non estratta per questa scheda.</p>'}
      </section>
      <section class="detail-block">
        <h2>Materiali e fonti</h2>
        <p class="racconto">${esc(e.materiali||'')}</p>
        ${e.fonte_volume ? `<p class="source">${esc(e.fonte_volume)}</p>` : ''}
        ${(e.links||[]).map(l=>`<p><a target="_blank" rel="noopener" href="${esc(l.url)}">${esc(l.label)} ↗</a></p>`).join('')}
        ${e.estratto_scheda ? `<details><summary>Estratto dalla scheda pubblicata</summary><p class="racconto">${esc(e.estratto_scheda)}</p></details>` : ''}
      </section>
      ${daCompletareBox(daCompItems)}`;
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
