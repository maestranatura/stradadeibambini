'use strict';
const $=s=>document.querySelector(s), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
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
  return `<article class="experience"><span class="badge ${e.stato}">${e.stato==='vissuta'?'Vissuta':'Proposta'}</span><h3><a href="esperienza.html?id=${encodeURIComponent(e.id)}">${esc(e.titolo)}</a></h3><p>${esc(e.aula)} · ${esc(e.community)}</p>${note?`<p class="match-note">${esc(note)}</p>`:''}${vNote}<p>${esc(e.descrizione)}</p><p class="tags">${esc(e.eta.join(' · '))} / ${esc(e.gruppo.map(g=>groupLabels[g]||g).join(' · '))}<br>${esc(e.discipline.join(' · '))}</p><p class="provenance">${esc(e.provenienza)}</p><p><a href="esperienza.html?id=${encodeURIComponent(e.id)}">Apri la scheda →</a> · <a href="aula.html?id=${encodeURIComponent(e.aula_id)}">Vai all’aula →</a></p></article>`;
}
async function init(){
  if(!$('#map') && !$('#archive-filters') && !$('#story-form')) return;
  const [data, geo, communities] = await Promise.all(['esperienze.json','luoghi.geojson','comunita.json'].map(x=>fetch(x).then(r=>{if(!r.ok) throw Error(x); return r.json();})));
  const disciplines=[...new Set(data.flatMap(e=>e.discipline))].sort();

  if($('#archive-filters')){
    const fields=[
      ['community','Comunità',[...new Set(data.map(e=>e.community))]],
      ['tipo_aula','Tipo di aula',[...new Set(data.map(e=>e.tipo_aula))]],
      ['eta','Età',ages],
      ['discipline','Disciplina',disciplines],
      ['stato','Stato',['vissuta','proposta']]
    ];
    $('#archive-filters').innerHTML = `<div class="field grow"><label for="search">Cerca</label><input id="search" type="search" placeholder="albero, ascolto, piazza…"></div>` +
      fields.map(([id,label,vals])=>`<div class="field"><label for="f-${id}">${esc(label)}</label><select id="f-${id}">${options(vals,'','Tutti')}</select></div>`).join('');
    const row=e=>`<tr><td><span class="badge ${e.stato}">${e.stato==='vissuta'?'Vissuta':'Proposta'}</span></td><td><strong><a href="esperienza.html?id=${encodeURIComponent(e.id)}">${esc(e.titolo)}</a></strong><div class="provenance">${esc(e.descrizione)}</div></td><td>${esc(e.aula)}</td><td>${esc(e.community)}</td><td>${esc(e.eta.join(', '))}</td><td>${esc(e.discipline.join(', '))}</td><td class="provenance">${esc(e.provenienza)}</td></tr>`;
    const render=()=>{
      let filtered=data.filter(e=>fields.every(([id])=>{const v=$(`#f-${id}`).value; return !v || (Array.isArray(e[id])?e[id].includes(v):e[id]===v);}));
      const q=$('#search').value.toLocaleLowerCase();
      filtered=filtered.filter(e=>JSON.stringify(e).toLocaleLowerCase().includes(q));
      const vissute=filtered.filter(e=>e.stato==='vissuta');
      const proposte=filtered.filter(e=>e.stato==='proposta');
      $('#result-count').textContent = `${filtered.length} esperienze · ${vissute.length} vissute · ${proposte.length} proposte`;
      let html='';
      if(vissute.length){ html += `<tr class="group-row"><td colspan="7"><strong>Esperienze vissute</strong> · documentate (Salento volume + Valdobbiadene con video)</td></tr>` + vissute.map(row).join(''); }
      if(proposte.length){ html += `<tr class="group-row"><td colspan="7"><strong>Proposte · cosa si può fare qui</strong> · non ancora svolte</td></tr>` + proposte.map(row).join(''); }
      $('#archive-results').innerHTML = html || `<tr><td colspan="7">Nessuna esperienza con questi filtri.</td></tr>`;
    };
    $('#archive-filters').addEventListener('input', render); render();
  }

  if($('#story-form')){
    const places=[...geo.features].filter(f=>f.geometry.type==='Point').sort((a,b)=>a.properties.name.localeCompare(b.properties.name,'it'));
    const placeById=Object.fromEntries(places.map(f=>[f.properties.id,f]));
    $('#place-picker').innerHTML += places.map(f=>`<option value="${esc(f.properties.id)}">${esc(f.properties.name)} · ${esc(f.properties.community)}</option>`).join('');
        // Messaggio vocale: non attivo in produzione (in arrivo).
    if($('#files')){
      $('#files').addEventListener('change', ()=>{
        const n=$('#files').files.length; let bytes=0; for(const f of $('#files').files) bytes+=f.size;
        $('#file-count').textContent = n ? `${n} file · ${(bytes/1024/1024).toFixed(1)} MB (limite circa 10 MB)` : '';
      });
    }
    // Prefill "Quando?" with today (Europe/Rome label already on page via JS)
    const q=$('#quando');
    if(q && !q.value){
      const now=new Date();
      const y=now.getFullYear(), m=String(now.getMonth()+1).padStart(2,'0'), d=String(now.getDate()).padStart(2,'0');
      q.value=`${y}-${m}-${d}`;
      const lab=$('#quando-label');
      if(lab){
        try{ lab.textContent='Oggi · '+now.toLocaleDateString('it-IT',{day:'numeric',month:'long',year:'numeric'}); }
        catch{ lab.textContent=`Oggi · ${d}/${m}/${y}`; }
      }
    }

    // --- Geolocation for new places (Leaflet + OpenTopoMap / Nominatim) ---
    const geoBox=$('#geo-box'), geoMsg=$('#geo-msg'), geoCoords=$('#geo-coords'), geoLat=$('#geo-lat'), geoLon=$('#geo-lon'), geoResults=$('#geo-results');
    let geoMap=null, geoMarker=null, geoReadonly=false;
    const VALDO=[45.8992, 12.0117];
    const fmt=(lat,lon)=>`Lat ${Number(lat).toFixed(5)} · Lon ${Number(lon).toFixed(5)}`;
    const setFields=(lat,lon)=>{ geoLat.value=lat!=null?Number(lat).toFixed(6):''; geoLon.value=lon!=null?Number(lon).toFixed(6):'';
      geoCoords.textContent = (lat!=null && lon!=null) ? fmt(lat,lon) : 'Nessuna posizione scelta.'; };
    const placePin=(lat,lon, opts={})=>{
      if(!geoMap) return;
      const ll=[lat,lon];
      if(!geoMarker){
        geoMarker=L.marker(ll,{draggable:!geoReadonly, autoPan:true}).addTo(geoMap);
        geoMarker.on('dragend',()=>{ if(geoReadonly) return; const p=geoMarker.getLatLng(); setFields(p.lat,p.lng); geoMsg.textContent='Posizione aggiornata spostando il segnalino.'; });
      } else {
        geoMarker.setLatLng(ll);
        if(geoMarker.dragging){ geoReadonly ? geoMarker.dragging.disable() : geoMarker.dragging.enable(); }
      }
      geoMarker.dragging && (geoReadonly ? geoMarker.dragging.disable() : geoMarker.dragging.enable());
      setFields(lat,lon);
      if(opts.fly!==false) geoMap.setView(ll, opts.zoom||15);
    };
    const setReadonly=(on, label)=>{
      geoReadonly=!!on;
      geoBox.classList.toggle('is-readonly', geoReadonly);
      $('#geo-label').textContent = label || (geoReadonly ? 'Posizione dell’aula scelta (sola lettura)' : 'Posizione del luogo nuovo');
      if(geoMarker && geoMarker.dragging){ geoReadonly ? geoMarker.dragging.disable() : geoMarker.dragging.enable(); }
      if(geoMap){
        if(geoReadonly){ geoMap.dragging.disable(); geoMap.touchZoom.disable(); geoMap.doubleClickZoom.disable(); geoMap.scrollWheelZoom.disable(); geoMap.boxZoom.disable(); geoMap.keyboard.disable(); }
        else { geoMap.dragging.enable(); geoMap.touchZoom.enable(); geoMap.doubleClickZoom.enable(); geoMap.scrollWheelZoom.enable(); geoMap.boxZoom.enable(); geoMap.keyboard.enable(); }
      }
    };
    const ensureGeoMap=()=>{
      if(geoMap || !window.L || !$('#geo-map')) return;
      geoMap=L.map('geo-map',{scrollWheelZoom:true, zoomControl:true}).setView(VALDO, 13);
      L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',{maxZoom:17, attribution:'© OpenStreetMap, SRTM | © OpenTopoMap (CC-BY-SA)'}).addTo(geoMap);
      geoMap.on('click', e=>{
        if(geoReadonly){ geoMsg.textContent='Per spostare il segnalino scegli «luogo nuovo» oppure cancella l’aula selezionata.'; return; }
        placePin(e.latlng.lat, e.latlng.lng, {fly:false});
        geoMsg.textContent='Posizione impostata toccando la mappa.';
      });
      setTimeout(()=>geoMap.invalidateSize(), 80);
    };
    const syncGeoMode=()=>{
      ensureGeoMap();
      const placeId=$('#place-picker').value;
      const newName=$('#new-place').value.trim();
      geoResults.hidden=true; geoResults.innerHTML='';
      if(placeId && placeById[placeId]){
        const f=placeById[placeId]; const c=f.geometry.coordinates;
        setReadonly(true, `Posizione di ${f.properties.name} (sola lettura)`);
        placePin(c[1], c[0], {zoom:15});
        geoMsg.textContent='Aula esistente: la posizione è quella già presente sulla mappa.';
      } else {
        setReadonly(false, 'Posizione del luogo nuovo');
        if(geoLat.value && geoLon.value){
          placePin(Number(geoLat.value), Number(geoLon.value), {zoom:15, fly:false});
          geoMsg.textContent= newName ? 'Puoi spostare il segnalino, usare «Sono qui» o cercare un luogo.' : 'Scrivi il nome del luogo nuovo e collocalo sulla mappa.';
        } else {
          if(geoMarker){ geoMap.removeLayer(geoMarker); geoMarker=null; }
          setFields(null,null);
          geoMap.setView(VALDO, 13);
          geoMsg.textContent='Usa «Sono qui», cerca un luogo (Invio) oppure tocca la mappa per piazzare il segnalino.';
        }
      }
      setTimeout(()=>geoMap && geoMap.invalidateSize(), 60);
    };
    $('#place-picker').addEventListener('change', syncGeoMode);
    $('#new-place').addEventListener('input', ()=>{
      if($('#place-picker').value && $('#new-place').value.trim()){
        // Prefer new place if user starts typing a new name
        $('#place-picker').value='';
      }
      syncGeoMode();
    });
    $('#geo-here').onclick=()=>{
      if(geoReadonly){ geoMsg.textContent='Deseleziona l’aula per collocare un luogo nuovo.'; return; }
      if(!navigator.geolocation){ geoMsg.textContent='Questo dispositivo non offre la geolocalizzazione.'; return; }
      geoMsg.textContent='Cerco la tua posizione…';
      navigator.geolocation.getCurrentPosition(
        pos=>{ placePin(pos.coords.latitude, pos.coords.longitude, {zoom:16}); geoMsg.textContent='Posizione rilevata dal dispositivo.'; },
        err=>{
          const map={1:'Permesso di geolocalizzazione negato.',2:'Posizione non disponibile.',3:'Richiesta di posizione scaduta.'};
          geoMsg.textContent=(map[err.code]||'Non sono riuscito a leggere la posizione.')+' Puoi cercare un luogo o toccare la mappa.';
        },
        {enableHighAccuracy:true, timeout:12000, maximumAge:60000}
      );
    };
    const runGeoSearch=async()=>{
      if(geoReadonly){ geoMsg.textContent='Deseleziona l’aula per cercare un luogo nuovo.'; return; }
      const q=$('#geo-q').value.trim();
      if(q.length<3){ geoMsg.textContent='Scrivi almeno tre lettere e premi Cerca.'; return; }
      geoMsg.textContent='Cerco su OpenStreetMap…';
      geoResults.hidden=true; geoResults.innerHTML='';
      try{
        const url='https://nominatim.openstreetmap.org/search?format=json&q='+encodeURIComponent(q)+'&countrycodes=it&limit=5&addressdetails=0';
        const res=await fetch(url,{headers:{'Accept':'application/json'}});
        if(!res.ok) throw new Error('HTTP '+res.status);
        const list=await res.json();
        if(!list.length){ geoMsg.textContent='Nessun risultato in Italia per questa ricerca.'; return; }
        geoResults.innerHTML=list.map((item,i)=>`<li><button type="button" data-i="${i}">${esc(item.display_name)}</button></li>`).join('');
        geoResults.hidden=false;
        geoMsg.textContent='Scegli un risultato dall’elenco.';
        geoResults.querySelectorAll('button').forEach(btn=>{
          btn.onclick=()=>{
            const item=list[Number(btn.dataset.i)];
            placePin(Number(item.lat), Number(item.lon), {zoom:15});
            geoResults.hidden=true;
            geoMsg.textContent='Posizione impostata dalla ricerca.';
            if(!$('#new-place').value.trim()){
              $('#new-place').value=(item.display_name||'').split(',')[0].trim();
            }
          };
        });
      }catch(e){
        console.error(e);
        geoMsg.textContent='Ricerca non riuscita. Riprova tra poco o tocca la mappa.';
      }
    };
    $('#geo-search-btn').addEventListener('click', runGeoSearch);
    $('#geo-q').addEventListener('keydown', ev=>{ if(ev.key==='Enter'){ ev.preventDefault(); runGeoSearch(); } });

    // demo=geo → Valdobbiadene pin for screenshots
    const params=new URLSearchParams(location.search);
    ensureGeoMap();
    if(params.get('demo')==='geo'){
      $('#place-picker').value='';
      if(!$('#new-place').value) $('#new-place').value='Luogo nuovo · Valdobbiadene (demo)';
      setReadonly(false);
      placePin(VALDO[0], VALDO[1], {zoom:14});
      geoMsg.textContent='Demo: segnalino su Valdobbiadene. Puoi spostarlo.';
      setTimeout(()=>{ const el=$('#geo-map'); if(el) el.scrollIntoView({behavior:'instant', block:'center'}); }, 200);
    } else {
      syncGeoMode();
    }

    $('#story-form').addEventListener('submit', async ev=>{
      ev.preventDefault();
      const placeId=$('#place-picker').value; const newPlace=$('#new-place').value.trim();
      if(!placeId && !newPlace){ alert('Scegli un’aula o scrivi il nome del luogo nuovo.'); return; }
      if(!placeId && (!geoLat.value || !geoLon.value)){ alert('Colloca il luogo nuovo sulla mappa (Sono qui, cerca, o tocca la mappa).'); return; }
      const text=$('#racconto').value.trim();
      if(!text){ alert('Scrivi cosa è successo.'); return; }
      const links=$('#video').value.trim().split(/\n/).filter(Boolean);
      if(links.some(x=>{ try{ const u=new URL(x); return !['youtube.com','www.youtube.com','youtu.be','m.youtube.com'].includes(u.hostname)||u.protocol!=='https:'; }catch{return true;} })){
        alert('Inserisci link YouTube validi, uno per riga.'); return;
      }
      const filesEl=$('#files');
      if(filesEl && filesEl.files && filesEl.files.length){
        let total=0; for(const f of filesEl.files) total+=f.size;
        if(total > 9.5*1024*1024){ alert('Le foto superano circa 10 MB totali (limite di Netlify Forms). Riduci o comprimi le immagini.'); return; }
      }
      const place = placeId ? places.find(f=>f.properties.id===placeId)?.properties : {id:'nuovo', name:newPlace};
      const aulaName = place?.name || newPlace;
      const link = placeId ? `mappa.html?aula=${encodeURIComponent(placeId)}` : 'mappa.html';
      const coordsTxt = (geoLat.value && geoLon.value) ? ` · ${fmt(geoLat.value, geoLon.value)}` : '';
      const btn=$('#submit-btn'); const st=$('#submit-status');
      if(btn){ btn.disabled=true; btn.textContent='Invio in corso…'; }
      if(st) st.textContent='Sto inviando il contributo in privato…';
      try{
        const fd=new FormData($('#story-form'));
        if(!fd.get('form-name')) fd.set('form-name','contribuisci');
        fd.set('aula_nome', aulaName);
        const res=await fetch('/', { method:'POST', body:fd, headers:{ 'Accept':'application/json' } });
        if(!res.ok && res.status!==200){
          // Some Netlify setups return 200 HTML; treat network/4xx as error
          throw new Error('HTTP '+res.status);
        }
        $('#story-form').hidden=true; $('#thanks').hidden=false;
        $('#thanks-msg').textContent = `Il tuo racconto per l’aula ${aulaName} è arrivato in privato ed è in attesa di approvazione.`;
        $('#thanks-link').textContent = link + coordsTxt;
        $('#thanks-aula').href = link;
        $('#thanks').scrollIntoView({behavior:'smooth'});
      }catch(err){
        console.error(err);
        if(st) st.textContent='Invio non riuscito. Controlla la connessione e riprova, oppure scrivi a chi cura il sito.';
        if(btn){ btn.disabled=false; btn.textContent='Invia il contributo →'; }
        alert('Non è stato possibile inviare il contributo. Riprova tra poco.');
      }
    });
  }

  if($('#map')){
    if(!window.L){ $('#map').innerHTML='<p class="notice">La mappa richiede la connessione per caricare Leaflet.</p>'; return; }
    const ITALY=[42.1,12.5], ITALY_Z=innerWidth<700?5:5.5;
    const map=window.prototypeMap=L.map('map',{scrollWheelZoom:true, zoomControl:true, zoomSnap:0.5, tap:true}).setView(ITALY,ITALY_Z);
    L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',{maxZoom:17, attribution:'© OpenStreetMap, SRTM | © OpenTopoMap (CC-BY-SA)'}).addTo(map);
    L.control.scale({imperial:false}).addTo(map);

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
  const [data, geo, communities] = await Promise.all(['esperienze.json','luoghi.geojson','comunita.json'].map(x=>fetch(x).then(r=>{if(!r.ok) throw Error(x); return r.json();})));
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
        <h2>Esperienze collegate</h2>
        ${related.length ? related.map(e=>card(e)).join('') : '<p class="muted">Non ci sono ancora esperienze documentate proprio in questa aula.</p>'}
      </section>
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

window.initEspPage = async function(){
  const root = $('#esp-root'); if(!root) return;
  const id = new URLSearchParams(location.search).get('id');
  if(!id){ root.innerHTML = '<p class="notice">Manca l’identificativo dell’esperienza.</p>'; return; }
  try{
    const {data} = await loadProtoData();
    const e = data.find(x => x.id === id);
    if(!e){ root.innerHTML = '<p class="notice">Esperienza non trovata in questo prototipo.</p>'; return; }
    document.title = `${e.titolo} · La Strada dei Bambini`;
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
        <p class="provenance">${esc(e.provenienza)}</p>
      </div>
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
