'use strict';
/* Messaggi vocali del modulo Contribuisci: MediaRecorder (iPhone audio/mp4, Android audio/webm),
   massimo 3 minuti, timer, stop, ascolto, «Rifai». Ogni audio va subito a /api/audio (Netlify Blobs, privato). */
(function(){
  const MAX_S=180;
  const pickType=()=>{
    if(!window.MediaRecorder) return null;
    const c=['audio/mp4;codecs=mp4a.40.2','audio/mp4','audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus'];
    for(const t of c){ try{ if(MediaRecorder.isTypeSupported(t)) return t; }catch{} }
    return '';
  };
  const mm=s=>`${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;

  // A recorder widget bound to a container element.
  // opts: {kind:'racconto'|'voce', label, getNome:()=>string, onKey:(key|null)=>void, draftInto:textarea|null}
  function Recorder(box, opts){
    const st={stream:null, rec:null, chunks:[], t0:0, timer:null, url:null, key:null, secs:0, sr:null, srBase:''};
    box.classList.add('rec-box');
    const render=(state, extra='')=>{
      box.dataset.state=state;
      if(state==='idle') box.innerHTML=`<button type="button" class="rec-start"><span aria-hidden="true">🎤</span> ${esc(opts.label||'Registra a voce')}</button>${extra}`;
      if(state==='recording') box.innerHTML=`<div class="rec-live"><span class="rec-dot" aria-hidden="true"></span><span class="rec-time" aria-live="off">0:00</span><span class="rec-max">/ 3:00</span><button type="button" class="rec-stop">■ Stop</button></div>${opts.draftInto&&SR?'<p class="rec-hint">Sto scrivendo una bozza nel riquadro mentre parli.</p>':''}`;
      if(state==='done') box.innerHTML=`<div class="rec-done"><audio controls preload="metadata" src="${st.url}"></audio><div class="rec-row"><span class="rec-status">${extra}</span><button type="button" class="rec-redo">↺ Rifai</button><button type="button" class="rec-del" aria-label="Elimina la registrazione">Elimina</button></div></div>`;
      const q=s=>box.querySelector(s);
      if(q('.rec-start')) q('.rec-start').onclick=start;
      if(q('.rec-stop')) q('.rec-stop').onclick=stop;
      if(q('.rec-redo')) q('.rec-redo').onclick=()=>{ clear(); start(); };
      if(q('.rec-del')) q('.rec-del').onclick=()=>{ clear(); render('idle'); };
    };
    const setStatus=t=>{ const s=box.querySelector('.rec-status'); if(s) s.innerHTML=t; };
    const clear=()=>{ if(st.url) URL.revokeObjectURL(st.url); st.url=null; st.key=null; opts.onKey&&opts.onKey(null); };
    async function start(){
      if(opts.kind==='voce' && (!opts.serveNome || opts.serveNome()) && !(opts.getNome&&opts.getNome())){ render('idle','<p class="rec-err">Scrivi prima il nome di battesimo.</p>'); box.closest('.voce-row')?.querySelector('.voce-nome')?.focus(); return; }
      const type=pickType();
      if(type===null || !navigator.mediaDevices?.getUserMedia){ render('idle','<p class="rec-err">Questo browser non registra audio. Prova con Safari o Chrome aggiornati.</p>'); return; }
      try{ st.stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}}); }
      catch(e){ render('idle','<p class="rec-err">Serve il permesso del microfono (Impostazioni del browser).</p>'); return; }
      st.chunks=[];
      try{ st.rec=type?new MediaRecorder(st.stream,{mimeType:type, audioBitsPerSecond:64000}):new MediaRecorder(st.stream); }
      catch{ st.rec=new MediaRecorder(st.stream); }
      st.rec.ondataavailable=e=>{ if(e.data&&e.data.size) st.chunks.push(e.data); };
      st.rec.onstop=finish;
      st.rec.start(1000);
      st.t0=Date.now(); render('recording');
      st.timer=setInterval(()=>{ st.secs=(Date.now()-st.t0)/1000; const t=box.querySelector('.rec-time'); if(t) t.textContent=mm(st.secs); if(st.secs>=MAX_S) stop(); },250);
      if(opts.draftInto && SR){ try{
        const r=new SR(); r.lang='it-IT'; r.continuous=true; r.interimResults=true; st.sr=r;
        st.srBase=opts.draftInto.value ? opts.draftInto.value.replace(/\s*$/,' ') : '';
        r.onresult=ev=>{ let txt=''; for(let i=0;i<ev.results.length;i++) txt+=ev.results[i][0].transcript; opts.draftInto.value=st.srBase+txt; opts.draftInto.dispatchEvent(new Event('input')); };
        r.onerror=()=>{}; r.start();
      }catch{} }
    }
    function stop(){
      clearInterval(st.timer);
      try{ st.sr&&st.sr.stop(); }catch{} st.sr=null;
      if(st.rec && st.rec.state!=='inactive') st.rec.stop();
      st.stream && st.stream.getTracks().forEach(t=>t.stop());
    }
    async function finish(){
      const type=(st.rec.mimeType||st.chunks[0]?.type||'audio/webm').split(';')[0];
      const blob=new Blob(st.chunks,{type});
      st.secs=Math.min(MAX_S,(Date.now()-st.t0)/1000);
      st.url=URL.createObjectURL(blob);
      render('done',`Carico… ${mm(st.secs)}`);
      await upload(blob,type);
    }
    async function upload(blob,type){
      try{
        const r=await fetch('/api/audio',{method:'POST',body:blob,headers:{'content-type':type,'x-kind':opts.kind,'x-nome':encodeURIComponent(opts.getNome?opts.getNome():''),'x-durata':String(Math.round(st.secs))}});
        const d=await r.json().catch(()=>({}));
        if(!r.ok||!d.key) throw new Error(d.error||('HTTP '+r.status));
        st.key=d.key; opts.onKey&&opts.onKey(d.key);
        setStatus(`✓ Audio salvato · ${mm(st.secs)}`);
      }catch(e){
        setStatus(`<span class="rec-err">Audio non salvato (${esc(e.message)}).</span> <button type="button" class="rec-retry">Riprova</button>`);
        const b=box.querySelector('.rec-retry'); if(b) b.onclick=()=>{ setStatus('Carico…'); upload(blob,type); };
      }
    }
    render('idle');
    return {get key(){return st.key;}, _test:{upload, finishWith:(blob,secs)=>{ st.secs=secs; st.url=URL.createObjectURL(blob); render('done','Carico…'); return upload(blob,blob.type); }, render}};
  }
  window.RecorderWidget=Recorder;

  // Voci: per ogni voce chi parla (bambino o bambina, docente, abitante, custode), il nome e la frase scritta o registrata.
  // Bambini: solo il nome di battesimo. Adulti: nome e cognome facoltativi, solo con il loro consenso.
  const RUOLI=[['bambino o bambina','Bambino o bambina'],['docente','Docente'],['abitante','Abitante'],['custode','Custode']];
  const BIMBO='bambino o bambina';
  const AVVISO={bimbo:'Solo il nome di battesimo, mai il cognome.', adulto:'Nome e cognome solo con il suo consenso: chiediglielo prima di scriverli.'};
  window.initVoiceInputs=function(){
    const out={racconto:null};
    const hidR=document.getElementById('f-audio-racconto'), hidV=document.getElementById('f-audio-voci');
    const hidT=document.getElementById('voci'), hidE=document.getElementById('f-voci-elenco');
    const leggi=r=>{
      const ruolo=r.querySelector('.voce-ruolo-sel').value;
      let nome=r.querySelector('.voce-nome').value.trim().replace(/\s+/g,' ');
      if(ruolo===BIMBO) nome=nome.split(' ')[0]||'';
      const testo=r.querySelector('.voce-testo').value.trim().replace(/\s+/g,' ').replace(/^[«"“]\s*/,'').replace(/\s*[»"”]$/,'');
      return {ruolo, nome:nome.slice(0,ruolo===BIMBO?30:80), testo:testo.slice(0,600), key:(r._rec&&r._rec.key)||''};
    };
    const sync=()=>{
      if(hidR) hidR.value=out.racconto||'';
      const rows=[...document.querySelectorAll('.voce-row')].map(leggi);
      const conAudio=rows.filter(x=>x.key).map(x=>({nome:x.nome, ruolo:x.ruolo, key:x.key}));
      if(hidV) hidV.value=conAudio.length?JSON.stringify(conAudio):'';
      // Testo moderabile (lo rivede il responsabile prima della pubblicazione): «Nome, ruolo: «frase»»
      const chi=x=>x.nome?`${x.nome}, ${x.ruolo}`:(x.ruolo.charAt(0).toUpperCase()+x.ruolo.slice(1));
      if(hidT) hidT.value=rows.filter(x=>x.testo).map(x=>`${chi(x)}: «${x.testo}»`).join('\n');
      const elenco=rows.filter(x=>x.testo||x.key).map(x=>({ruolo:x.ruolo, nome:x.nome, testo:x.testo, audio:!!x.key}));
      if(hidE) hidE.value=elenco.length?JSON.stringify(elenco):'';
    };
    const rb=document.getElementById('rec-racconto');
    if(rb) window.recRacconto=Recorder(rb,{kind:'racconto',label:'Registra a voce',draftInto:document.getElementById('racconto'),onKey:k=>{ out.racconto=k; sync(); }});
    const list=document.getElementById('voci-list');
    let n=0;
    const addRow=()=>{
      const i=++n;
      const row=document.createElement('div'); row.className='voce-row';
      row.innerHTML=`<div class="voce-top"><div class="voce-campo"><label for="voce-ruolo-${i}">Chi parla</label><select id="voce-ruolo-${i}" class="voce-ruolo-sel">${RUOLI.map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select></div><div class="voce-campo voce-campo-nome"><label for="voce-nome-${i}" class="voce-nome-l">Nome di battesimo</label><input id="voce-nome-${i}" class="voce-nome" type="text" autocomplete="off" maxlength="30" aria-describedby="voce-avviso-${i}"></div></div><p class="rec-hint voce-avviso" id="voce-avviso-${i}">${AVVISO.bimbo}</p><div class="voce-campo"><label for="voce-testo-${i}">Cosa ha detto <span class="muted">(con le sue parole)</span></label><textarea id="voce-testo-${i}" class="voce-testo" rows="2" maxlength="600"></textarea></div><div class="rec-slot"></div>`;
      list.appendChild(row);
      const sel=row.querySelector('.voce-ruolo-sel'), inp=row.querySelector('.voce-nome'), lab=row.querySelector('.voce-nome-l'), avv=row.querySelector('.voce-avviso');
      const bimbo=()=>sel.value===BIMBO;
      const aggiornaRuolo=()=>{
        if(bimbo()){ lab.innerHTML='Nome di battesimo'; inp.maxLength=30; avv.textContent=AVVISO.bimbo; const v=inp.value.trim(); if(/\s/.test(v)) inp.value=v.split(/\s+/)[0]; }
        else { lab.innerHTML='Nome e cognome <span class="muted">(facoltativo)</span>'; inp.maxLength=80; avv.textContent=AVVISO.adulto; }
        sync();
      };
      sel.addEventListener('change',aggiornaRuolo);
      inp.addEventListener('input',sync);
      row.querySelector('.voce-testo').addEventListener('input',sync);
      inp.addEventListener('blur',()=>{ const v=inp.value.trim(); if(bimbo() && /\s/.test(v)){ inp.value=v.split(/\s+/)[0]; avv.textContent='Teniamo solo il nome di battesimo.'; } sync(); });
      row._rec=Recorder(row.querySelector('.rec-slot'),{kind:'voce',label:'Registra la voce',serveNome:bimbo,getNome:()=>bimbo()?inp.value.trim().split(/\s+/)[0]:inp.value.trim(),onKey:()=>sync()});
      return row;
    };
    if(list){ addRow(); document.getElementById('voci-add').onclick=()=>addRow().querySelector('select').focus(); }
    window.voiceAddRow=addRow;
    return {keys:()=>[out.racconto,...[...document.querySelectorAll('.voce-row')].map(r=>r._rec&&r._rec.key)].filter(Boolean), sync};
  };
})();
