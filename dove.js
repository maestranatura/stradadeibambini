'use strict';
/* «Dove?» del modulo Contribuisci: Sono qui · Scrivi il nome · Tocca la mappa.
   Solo servizi liberi OpenStreetMap (Photon, Nominatim come riserva, tile OpenTopoMap). */
window.initDove = function(geo, communities){
  const $=s=>document.querySelector(s);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const root=$('#dove'); if(!root) return null;
  const shortCom=n=>String(n||'').replace(' · Il paesaggio che sono io','').replace('Via Francigena · Salento','Via Francigena');
  const colorByName=Object.fromEntries((communities||[]).map(c=>[c.name,c.color]));
  const aule=geo.features.filter(f=>f.geometry.type==='Point').map(f=>{
    const p=f.properties, c=f.geometry.coordinates;
    return {id:p.id, name:p.name, community:p.community, lat:c[1], lon:c[0], color:p.color||colorByName[p.community]||'#4f6127',
      extra:[p.area, p.percorso].filter(Boolean).join(' ')};
  });
  const byId=Object.fromEntries(aule.map(a=>[a.id,a]));

  // hidden fields
  const F={aula:$('#f-aula-id'), nome:$('#f-luogo-nome'), lat:$('#f-lat'), lon:$('#f-lon'), fonte:$('#f-fonte')};
  const el={here:$('#dove-here'), q:$('#dove-q'), sugg:$('#dove-sugg'), msg:$('#dove-msg'), near:$('#dove-near'),
    mapBtn:$('#dove-map-btn'), mapWrap:$('#dove-map-wrap'), chosen:$('#dove-chosen'), nameWrap:$('#dove-name-wrap'), name:$('#dove-name'), ways:$('#dove-ways')};
  const state={mode:null}; // null | 'aula' | 'nuovo'

  // ---------- text matching (accent-insensitive, prefix + 1 typo) ----------
  const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const STOP=new Set(['di','del','della','dei','degli','delle','da','la','il','lo','le','gli','i','l','e','a','al','alla','in']);
  const GENERIC=new Set(['piazza','piazzetta','via','viale','strada','parco','giardino','giardini','scuola','chiesa','villa','campo','area','bosco','prato','fiume','torrente','monte','colle','castello','fontana','sentiero','percorso','luogo','aula','comune','paese','centro','zona','largo','corte','casa','palazzo']);
  const lev1=(a,b)=>{ // true if edit distance <=1
    if(a===b) return true; const la=a.length, lb=b.length; if(Math.abs(la-lb)>1) return false;
    let i=0,j=0,d=0; while(i<la&&j<lb){ if(a[i]===b[j]){i++;j++;continue;} if(++d>1) return false; if(la>lb) i++; else if(lb>la) j++; else {i++;j++;} }
    return d+(la-i)+(lb-j)<=1;
  };
  aule.forEach(a=>{ a._n=norm(a.name).split(' '); a._o=norm(shortCom(a.community)+' '+a.community+' '+a.extra).split(' '); });
  const tokMatch=(t,words)=>{
    for(const w of words){ if(w.startsWith(t)) return 2; }
    if(t.length>=4) for(const w of words){ if(lev1(t,w.slice(0,t.length)) || lev1(t,w)) return 1; }
    return 0;
  };
  const searchAule=q=>{
    const toks=norm(q).split(' ').filter(t=>t && !STOP.has(t));
    if(!toks.length) return [];
    const out=[];
    for(const a of aule){
      let score=0, hit=0, inName=0;
      for(const t of toks){
        const n=tokMatch(t,a._n); if(n){ score+=3*n; hit++; inName++; continue; }
        const o=tokMatch(t,a._o); if(o){ score+=o; hit++; }
      }
      if(!inName) continue;
      // every distinctive word must match; only a generic word (piazza, scuola…) may be missing
      const missing=toks.filter(t=>!tokMatch(t,a._n)&&!tokMatch(t,a._o));
      if(missing.length>1 || (missing.length===1 && (toks.length<2 || !GENERIC.has(missing[0])))) continue;
      score+=inName*4;
      if(norm(a.name).startsWith(norm(q))) score+=4;
      out.push({a,score:score+hit*2});
    }
    return out.sort((x,y)=>y.score-x.score||x.a.name.localeCompare(y.a.name,'it')).slice(0,6).map(x=>x.a);
  };

  // ---------- distance ----------
  const dist=(la1,lo1,la2,lo2)=>{const R=6371000,r=Math.PI/180,dl=(la2-la1)*r,dn=(lo2-lo1)*r;const h=Math.sin(dl/2)**2+Math.cos(la1*r)*Math.cos(la2*r)*Math.sin(dn/2)**2;return 2*R*Math.asin(Math.sqrt(h));};
  const fmtD=m=>m<1000?`${Math.round(m/10)*10||10} m`:`${(m/1000).toFixed(1).replace('.',',')} km`;
  let lastGps=null;

  // ---------- OSM search (Photon, fallback Nominatim) ----------
  const IT_BBOX='6.6,35.4,18.6,47.1';
  const osmSearch=async(q, signal)=>{
    const bias=lastGps?`&lat=${lastGps.lat}&lon=${lastGps.lon}`:'&lat=42.5&lon=12.5';
    try{
      const r=await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=5&lang=default&bbox=${IT_BBOX}${bias}`,{signal});
      if(!r.ok) throw Error('photon '+r.status);
      const d=await r.json();
      const list=(d.features||[]).filter(f=>!f.properties.countrycode||f.properties.countrycode==='IT').map(f=>{
        const p=f.properties; const c=f.geometry.coordinates;
        const where=[p.street&&p.name!==p.street?p.street:'', p.city||p.town||p.village||p.county, p.state].filter(Boolean);
        return {name:p.name||p.street||q, where:[...new Set(where)].join(', '), lat:c[1], lon:c[0]};
      });
      if(list.length) return list;
    }catch(e){ if(e.name==='AbortError') throw e; }
    const r=await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&countrycodes=it&limit=5`,{signal,headers:{'Accept':'application/json'}});
    if(!r.ok) return [];
    const d=await r.json();
    return d.map(x=>{ const parts=(x.display_name||'').split(',').map(s=>s.trim()); return {name:parts[0]||q, where:parts.slice(1,4).join(', '), lat:+x.lat, lon:+x.lon}; });
  };

  // ---------- map ----------
  let map=null, pin=null, aulaLayer=null;
  const ensureMap=()=>{
    if(map||!window.L) return;
    el.mapWrap.hidden=false;
    map=L.map('dove-map',{zoomControl:true, tap:true}).setView([42.3,12.5],5);
    L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',{maxZoom:17, attribution:'© OpenStreetMap, SRTM | © OpenTopoMap'}).addTo(map);
    aulaLayer=L.layerGroup().addTo(map);
    aule.forEach(a=>{
      L.circleMarker([a.lat,a.lon],{radius:6,color:a.color,weight:2,fillColor:'#fff',fillOpacity:.9,bubblingMouseEvents:false})
        .bindTooltip(esc(a.name)).on('click',()=>chooseAula(a,'mappa')).addTo(aulaLayer);
    });
    map.on('click',e=>{ chooseNew({lat:e.latlng.lat, lon:e.latlng.lng, fonte:'mappa', name:el.name.value.trim()}); el.msg.textContent='Segnalino messo. Puoi trascinarlo per precisare.'; });
    setTimeout(()=>map.invalidateSize(),60);
  };
  const showMapAt=(lat,lon,z)=>{ ensureMap(); el.mapWrap.hidden=false; setTimeout(()=>{ map.invalidateSize(); map.setView([lat,lon],z); },60); };
  const setPin=(lat,lon,draggable)=>{
    ensureMap();
    if(!pin){ pin=L.marker([lat,lon],{draggable,autoPan:true}).addTo(map);
      pin.on('dragend',()=>{ const p=pin.getLatLng(); F.lat.value=p.lat.toFixed(6); F.lon.value=p.lng.toFixed(6); renderChosen(); el.msg.textContent='Posizione precisata.'; }); }
    else pin.setLatLng([lat,lon]);
    if(pin.dragging) draggable?pin.dragging.enable():pin.dragging.disable();
  };

  // ---------- choosing ----------
  const renderChosen=()=>{
    if(!state.mode){ el.chosen.hidden=true; return; }
    const lat=+F.lat.value, lon=+F.lon.value;
    const fonteTxt={gps:'dalla tua posizione',ricerca:'dalla ricerca',mappa:'dalla mappa'}[F.fonte.value]||'';
    if(state.mode==='aula'){
      const a=byId[F.aula.value];
      el.chosen.innerHTML=`<span class="dove-ok">✓</span><div><strong>${esc(a.name)}</strong><span>${esc(shortCom(a.community))} · aula già sulla mappa</span></div><button type="button" class="dove-change">Cambia</button>`;
    } else {
      el.chosen.innerHTML=`<span class="dove-ok">✓</span><div><strong>${esc(F.nome.value||'Luogo nuovo')}</strong><span>Luogo nuovo ${esc(fonteTxt)} · ${lat.toFixed(5)}, ${lon.toFixed(5)}</span></div><button type="button" class="dove-change">Cambia</button>`;
    }
    el.chosen.hidden=false;
    el.chosen.querySelector('.dove-change').onclick=reset;
  };
  const chooseAula=(a,fonte)=>{
    state.mode='aula';
    F.aula.value=a.id; F.nome.value=a.name; F.lat.value=a.lat.toFixed(6); F.lon.value=a.lon.toFixed(6); F.fonte.value=fonte;
    el.nameWrap.hidden=true; el.near.hidden=true; hideSugg(); el.ways.hidden=true;
    setPin(a.lat,a.lon,false); showMapAt(a.lat,a.lon,16);
    el.msg.textContent='';
    renderChosen();
  };
  const chooseNew=({lat,lon,fonte,name})=>{
    state.mode='nuovo';
    F.aula.value=''; F.lat.value=lat.toFixed(6); F.lon.value=lon.toFixed(6); F.fonte.value=fonte;
    if(name!=null && name!==undefined){ el.name.value=name; }
    F.nome.value=el.name.value.trim();
    el.nameWrap.hidden=false; el.near.hidden=true; hideSugg(); el.ways.hidden=true;
    setPin(lat,lon,true);
    if(fonte!=='mappa') showMapAt(lat,lon,17); else el.mapWrap.hidden=false;
    renderChosen();
  };
  function reset(){
    state.mode=null; Object.values(F).forEach(i=>i.value='');
    el.chosen.hidden=true; el.nameWrap.hidden=true; el.name.value=''; el.ways.hidden=false;
    el.mapWrap.hidden=true; el.near.hidden=true; el.msg.textContent=''; el.q.value='';
    if(pin&&map){ map.removeLayer(pin); pin=null; }
  }
  el.name.addEventListener('input',()=>{ F.nome.value=el.name.value.trim(); renderChosen(); });

  // ---------- 1. Sono qui ----------
  const showNearby=(lat,lon,acc)=>{
    lastGps={lat,lon};
    const near=aule.map(a=>({a,d:dist(lat,lon,a.lat,a.lon)})).filter(x=>x.d<=1200).sort((x,y)=>x.d-y.d).slice(0,5);
    el.near.innerHTML=(near.length?`<p class="dove-near-h">Sei vicino a ${near.length===1?'questa aula':'queste aule'}:</p>`:`<p class="dove-near-h">Nessuna aula della mappa entro 1 km.</p>`)+
      near.map((x,i)=>`<button type="button" class="dove-card" data-i="${i}"><i style="background:${esc(x.a.color)}"></i><span><strong>${esc(x.a.name)}</strong><small>${esc(shortCom(x.a.community))}</small></span><em>${fmtD(x.d)}</em></button>`).join('')+
      `<button type="button" class="dove-card dove-card-new" id="dove-new-here"><i>+</i><span><strong>${near.length?'Nessuna di queste: è un luogo nuovo qui':'È un luogo nuovo qui'}</strong><small>Salvo la tua posizione${acc?` (precisione ${fmtD(acc)})`:''}</small></span></button>`;
    el.near.hidden=false;
    el.near.querySelectorAll('.dove-card[data-i]').forEach(b=>b.onclick=()=>chooseAula(near[+b.dataset.i].a,'gps'));
    $('#dove-new-here').onclick=()=>{ chooseNew({lat,lon,fonte:'gps',name:''}); el.msg.textContent='Posizione salvata. Puoi trascinare il segnalino e dare un nome al luogo.'; };
  };
  el.here.onclick=()=>{
    hideSugg();
    if(!navigator.geolocation){ el.msg.textContent='Questo telefono non offre la posizione: scrivi il nome o tocca la mappa.'; return; }
    el.msg.textContent='Cerco dove sei…'; el.here.disabled=true;
    navigator.geolocation.getCurrentPosition(pos=>{
      el.here.disabled=false; el.msg.textContent='';
      showNearby(pos.coords.latitude,pos.coords.longitude,pos.coords.accuracy);
    },err=>{
      el.here.disabled=false;
      el.msg.textContent=({1:'Permesso di posizione negato.',2:'Posizione non disponibile.',3:'Ci sta mettendo troppo.'}[err.code]||'Non riesco a leggere la posizione.')+' Scrivi il nome o tocca la mappa.';
    },{enableHighAccuracy:true,timeout:12000,maximumAge:60000});
  };

  // ---------- 2. Scrivi il nome ----------
  let timer=null, ctrl=null, seq=0;
  function hideSugg(){ el.sugg.hidden=true; el.sugg.innerHTML=''; }
  const renderSugg=(q,local,osm,loading)=>{
    let h='';
    if(local.length) h+=`<li class="dove-sugg-h">Aule già sulla mappa</li>`+local.map((a,i)=>`<li><button type="button" data-k="a${i}"><i style="background:${esc(a.color)}"></i><span><strong>${esc(a.name)}</strong><small>${esc(shortCom(a.community))}</small></span></button></li>`).join('');
    h+=`<li class="dove-sugg-h">Altri luoghi · OpenStreetMap</li>`;
    if(loading) h+=`<li class="dove-sugg-wait">Cerco…</li>`;
    else if(osm.length) h+=osm.map((o,i)=>`<li><button type="button" data-k="o${i}"><i class="osm"></i><span><strong>${esc(o.name)}</strong><small>${esc(o.where)}</small></span></button></li>`).join('');
    else h+=`<li class="dove-sugg-wait">Nessun altro luogo trovato. Puoi toccare la mappa.</li>`;
    el.sugg.innerHTML=h; el.sugg.hidden=false;
    el.sugg.querySelectorAll('button[data-k]').forEach(b=>b.onclick=()=>{
      const k=b.dataset.k, i=+k.slice(1);
      if(k[0]==='a') chooseAula(local[i],'ricerca');
      else { const o=osm[i]; chooseNew({lat:o.lat,lon:o.lon,fonte:'ricerca',name:o.name}); el.msg.textContent='Luogo nuovo dalla ricerca. Controlla il segnalino e trascinalo se serve.'; }
    });
  };
  el.q.addEventListener('input',()=>{
    const q=el.q.value.trim(); clearTimeout(timer); if(ctrl) ctrl.abort();
    el.near.hidden=true;
    if(q.length<2){ hideSugg(); return; }
    const local=searchAule(q);
    renderSugg(q,local,[],true);
    timer=setTimeout(async()=>{
      const my=++seq; ctrl=new AbortController();
      try{ const osm=q.length>=3?await osmSearch(q,ctrl.signal):[]; if(my===seq) renderSugg(q,local,osm,false); }
      catch(e){ if(e.name!=='AbortError' && my===seq) renderSugg(q,local,[],false); }
    },350);
  });
  el.q.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); const b=el.sugg.querySelector('button[data-k]'); if(b) b.click(); } if(e.key==='Escape') hideSugg(); });

  // ---------- 3. Tocca la mappa ----------
  el.mapBtn.onclick=()=>{
    hideSugg(); el.near.hidden=true;
    ensureMap(); el.mapWrap.hidden=false;
    setTimeout(()=>{ map.invalidateSize(); if(lastGps) map.setView([lastGps.lat,lastGps.lon],16); },60);
    el.msg.textContent='Avvicinati e tocca il punto: un pallino è un’aula già sulla mappa, altrove metti un luogo nuovo.';
    el.mapWrap.scrollIntoView({behavior:'smooth',block:'center'});
  };

  return {
    search:searchAule, osmSearch, showNearby, chooseAula, chooseNew, reset,
    value:()=>{
      let community='';
      if(F.aula.value && byId[F.aula.value]) community=byId[F.aula.value].community;
      else if(F.lat.value){ const la=+F.lat.value, lo=+F.lon.value; let best=null; for(const a of aule){ const d=dist(la,lo,a.lat,a.lon); if(!best||d<best.d) best={d,a}; } if(best&&best.d<40000) community=best.a.community; }
      return {mode:state.mode, aula_id:F.aula.value, luogo_nome:F.nome.value, lat:F.lat.value, lon:F.lon.value, fonte_posizione:F.fonte.value, community};
    },
    aulaById:id=>byId[id]
  };
};
