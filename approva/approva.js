'use strict';
(function(){
  const $=s=>document.querySelector(s);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const KEY='sdb_revisione_token';
  let token=localStorage.getItem(KEY)||'', stato='da approvare', user=null;
  const api=async(path,opts={})=>{
    const r=await fetch(path,{...opts,headers:{...(opts.headers||{}),Authorization:'Bearer '+token}});
    if(r.status===401||r.status===403){ const e=new Error('auth'); e.status=r.status; throw e; }
    return r;
  };
  const blobUrl=async path=>{ const r=await api(path); if(!r.ok) throw new Error(r.status); return URL.createObjectURL(await r.blob()); };
  const fmtDate=d=>{ if(!d) return '—'; try{ return new Date(d.length<=10?d+'T12:00:00':d).toLocaleString('it-IT',d.length<=10?{day:'numeric',month:'long',year:'numeric'}:{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Rome'}); }catch{return d;} };

  const showLogin=(msg='')=>{ $('#ap-login').hidden=false; $('#ap-app').hidden=true; $('#ap-out').hidden=true; $('#ap-who').textContent=''; $('#ap-login-err').textContent=msg; };
  $('#ap-login-form').onsubmit=async e=>{ e.preventDefault(); token=$('#ap-token').value.trim(); await start(); };
  $('#ap-out').onclick=()=>{ localStorage.removeItem(KEY); token=''; showLogin(); };

  async function start(){
    if(!token) return showLogin();
    try{
      const r=await api('/api/approva?whoami=1'); user=await r.json();
      localStorage.setItem(KEY,token);
      $('#ap-login').hidden=true; $('#ap-app').hidden=false; $('#ap-out').hidden=false;
      $('#ap-who').textContent = user.community ? `Community manager · ${user.community}` : 'Coordinatrice';
      $('#ap-tools').hidden = !!user.community;
      load();
    }catch(e){ localStorage.removeItem(KEY); showLogin(e.status?'Chiave non valida.':'Non riesco a collegarmi. Riprova.'); }
  }

  document.querySelectorAll('.ap-tabs button').forEach(b=>b.onclick=()=>{ document.querySelectorAll('.ap-tabs button').forEach(x=>x.classList.toggle('on',x===b)); stato=b.dataset.stato; load(); });

  async function load(){
    const list=$('#ap-list'); list.innerHTML='<p class="muted">Carico…</p>';
    let d;
    try{ d=await (await api('/api/approva?stato='+encodeURIComponent(stato))).json(); }
    catch(e){ if(e.status) return showLogin('Chiave non più valida.'); list.innerHTML='<p class="rec-err">Errore di caricamento.</p>'; return; }
    const items=d.contributi||[];
    if(stato==='da approvare') $('#n-da').textContent=items.length?`(${items.length})`:'';
    if(!items.length){ list.innerHTML=`<div class="ap-empty">${stato==='da approvare'?'Nessun contributo in attesa. 🌿':'Niente qui.'}</div>`; return; }
    list.innerHTML=''; items.forEach(it=>list.appendChild(card(it)));
    const h=location.hash.slice(1); if(h){ const el=document.getElementById('c-'+h); if(el){ el.classList.add('flash'); el.scrollIntoView({block:'start'}); } }
  }

  function card(it){
    const el=document.createElement('article'); el.className='ap-card'; el.id='c-'+it.id;
    const c=it.consensi||{};
    const okAll=c.genitori&&c.volti_non_riconoscibili&&c.licenza_aperta;
    const tick=(v,l)=>`<label><input type="checkbox" disabled ${v?'checked':''}> <span class="${v?'':'no'}">${esc(l)}${v?'':' — manca'}</span></label>`;
    const racconto=it.racconto_pubblico ?? it.racconto ?? '';
    const voci=it.voci_pubbliche ?? it.voci ?? '';
    el.innerHTML=`
      <div><p class="kicker">${esc(it.community||'Comunità da assegnare')} · ${it.aula_id?'aula della mappa':'luogo nuovo'} · ricevuto ${esc(fmtDate(it.ricevuto))}</p>
      <h2 class="t-view">${esc(it.titolo||it.titolo_proposto)}</h2><input class="ap-title t-edit" hidden value="${esc(it.titolo||it.titolo_proposto)}" aria-label="Titolo"></div>
      <div class="ap-meta">
        <div><span>Chi scrive</span>${esc(it.autore||'—')}</div>
        <div><span>Classe · scuola</span>${esc([it.classe,it.scuola].filter(Boolean).join(' · ')||'—')}</div>
        <div><span>Bambini · accompagnatori</span>${esc([it.numero,it.accompagnatori].filter(Boolean).join(' · ')||'—')}</div>
        <div><span>Quando · tempo</span>${esc(fmtDate(it.quando))}${it.tempo?` · ${esc(it.tempo)}`:''}</div>
        <div><span>Dove</span>${esc(it.luogo_nome||'Luogo nuovo')}${it.aula_id?` · <a href="/mappa.html?aula=${encodeURIComponent(it.aula_id)}" target="_blank" rel="noopener">aula ↗</a>`:''}<br><small class="muted">${it.lat!=null?`${Number(it.lat).toFixed(5)}, ${Number(it.lon).toFixed(5)}`:'senza coordinate'} · ${esc(it.fonte_posizione||'')}</small></div>
        <div><span>Notifica email</span><small>${esc(it.notifica?.stato||'—')}</small></div>
      </div>
      ${it.lat!=null?'<div class="ap-map"></div>':''}
      <section class="ap-sec"><h3>Racconto</h3><p class="ap-text t-view">${esc(racconto)||'<span class="muted">(nessun testo scritto)</span>'}</p><textarea class="t-edit r-edit" hidden>${esc(racconto)}</textarea></section>
      <section class="ap-sec"><h3>Voci dei bambini (scritte)</h3><p class="ap-text t-view">${esc(voci)||'<span class="muted">—</span>'}</p><textarea class="t-edit v-edit" hidden>${esc(voci)}</textarea></section>
      ${(it.audio||[]).length?`<section class="ap-sec"><h3>Audio · solo per te, mai pubblicati</h3>${it.audio.map((a,i)=>`<div class="ap-audio" data-i="${i}"><strong>${a.tipo==='voce'?`Voce di ${esc(a.nome||'—')}`:'Racconto a voce'}${a.durata?` · ${Math.floor(a.durata/60)}:${String(a.durata%60).padStart(2,'0')}`:''}</strong><audio controls preload="none"></audio>${a.trascrizione?`<p class="tr">${esc(a.trascrizione)}</p><button type="button" class="use-tr" data-i="${i}">Usa la trascrizione nel testo</button>`:`<p class="tr da">${esc(a.stato_trascrizione==='fatta'?'':a.stato_trascrizione||'da trascrivere')}</p>`}</div>`).join('')}</section>`:''}
      ${(it.foto||[]).length?`<section class="ap-sec"><h3>Foto · ${it.foto.length}</h3><div class="ap-photos">${it.foto.map(()=>'<img alt="">').join('')}</div></section>`:''}
      ${(it.video||[]).length?`<section class="ap-sec"><h3>Video</h3>${it.video.map(u=>`<p><a href="${esc(u)}" target="_blank" rel="noopener">${esc(u)}</a></p>`).join('')}</section>`:''}
      <section class="ap-sec ap-consensi"><h3>Consensi</h3>${tick(c.genitori,'Ho il consenso dei genitori')}${tick(c.volti_non_riconoscibili,'I volti non sono riconoscibili')}${tick(c.licenza_aperta,'Licenza aperta, citando il nome')}</section>
      <div class="ap-actions"></div>
      <p class="ap-note">${(it.storia||[]).map(s=>`${esc(fmtDate(s.quando))} ${esc(s.cosa)}`).join(' · ')}</p>`;
    // map
    if(it.lat!=null && window.L){ setTimeout(()=>{ const m=L.map(el.querySelector('.ap-map'),{scrollWheelZoom:false}).setView([it.lat,it.lon],15); L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',{maxZoom:17,attribution:'© OpenStreetMap · OpenTopoMap'}).addTo(m); L.marker([it.lat,it.lon]).addTo(m); },30); }
    // private media through the token
    (it.audio||[]).forEach((a,i)=>{ const au=el.querySelector(`.ap-audio[data-i="${i}"] audio`); blobUrl('/api/audio?key='+encodeURIComponent(a.key)).then(u=>au.src=u).catch(()=>au.replaceWith(Object.assign(document.createElement('p'),{className:'rec-err',textContent:'Audio non disponibile'}))); });
    el.querySelectorAll('.ap-photos img').forEach((img,i)=>blobUrl('/api/foto?key='+encodeURIComponent(it.foto[i])).then(u=>img.src=u).catch(()=>img.alt='non disponibile'));
    el.querySelectorAll('.use-tr').forEach(b=>b.onclick=()=>{ setEdit(true); const a=it.audio[+b.dataset.i]; const ta=a.tipo==='voce'?el.querySelector('.v-edit'):el.querySelector('.r-edit'); ta.value=(ta.value?ta.value+'\n':'')+(a.tipo==='voce'?`${a.nome}: «${a.trascrizione}»`:a.trascrizione); });
    // actions
    let editing=false;
    const setEdit=on=>{ editing=on; el.querySelectorAll('.t-view').forEach(x=>x.hidden=on); el.querySelectorAll('.t-edit').forEach(x=>x.hidden=!on); renderActions(); };
    const send=async(azione,extra={})=>{
      const body={azione,id:it.id,...extra};
      if(editing){ body.racconto=el.querySelector('.r-edit').value; body.voci=el.querySelector('.v-edit').value; body.titolo=el.querySelector('.ap-title').value; }
      el.querySelectorAll('.ap-actions button').forEach(b=>b.disabled=true);
      try{ const r=await api('/api/approva',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}); const d=await r.json(); if(!r.ok) throw new Error(d.error||r.status); load(); }
      catch(e){ alert('Non riuscito: '+e.message); renderActions(); }
    };
    function renderActions(){
      const box=el.querySelector('.ap-actions'); const b=[];
      if(editing){ b.push('<button type="button" class="ok" data-a="approva">Salva e approva</button>','<button type="button" data-a="modifica">Salva modifiche</button>','<button type="button" data-a="annulla">Annulla</button>'); }
      else if(it.stato==='da approvare'){ b.push(`<button type="button" class="ok" data-a="approva" ${okAll?'':'disabled title="Mancano i consensi"'}>✓ Approva</button>`,'<button type="button" data-a="edit">Modifica testo</button>','<button type="button" class="ko" data-a="scarta">Scarta</button>'); }
      else if(it.stato==='approvato'){ b.push(`<a class="btn" style="min-height:44px" href="/esperienza.html?id=contrib-${encodeURIComponent(it.id)}" target="_blank" rel="noopener">Vedi sul sito ↗</a>`,'<button type="button" data-a="edit">Modifica testo</button>','<button type="button" class="ko" data-a="ritira">Ritira dal sito</button>'); }
      else { b.push('<button type="button" data-a="ritira">Rimetti da approvare</button>'); }
      if(!user.community) b.push('<button type="button" class="del" data-a="elimina">Elimina definitivamente</button>');
      box.innerHTML=b.join('');
      box.querySelectorAll('button').forEach(x=>x.onclick=()=>{
        const a=x.dataset.a;
        if(a==='edit') return setEdit(true);
        if(a==='annulla') return setEdit(false);
        if(a==='approva' && !confirm('Pubblicare questo contributo sul sito? (Gli audio restano privati.)')) return;
        if(a==='scarta' && !confirm('Scartare questo contributo? Non verrà pubblicato.')) return;
        if(a==='elimina' && !confirm('Eliminare per sempre contributo, audio e foto?')) return;
        send(a);
      });
    }
    renderActions();
    return el;
  }

  $('#ap-clean').onclick=async()=>{
    if(!confirm('Eliminare audio e foto non collegati a nessun contributo?')) return;
    try{ const d=await (await api('/api/approva',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({azione:'pulisci_orfani'})})).json(); $('#ap-clean-out').textContent=`Tolti ${d.tolti?.audio||0} audio e ${d.tolti?.foto||0} foto.`; }
    catch(e){ $('#ap-clean-out').textContent='Non riuscito.'; }
  };
  start();
})();
