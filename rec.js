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
      if(opts.kind==='voce' && !(opts.getNome&&opts.getNome())){ render('idle','<p class="rec-err">Scrivi prima il nome di battesimo.</p>'); box.closest('.voce-row')?.querySelector('input')?.focus(); return; }
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

  window.initVoiceInputs=function(){
    const out={racconto:null, voci:[]};
    const hidR=document.getElementById('f-audio-racconto'), hidV=document.getElementById('f-audio-voci');
    const sync=()=>{
      hidR.value=out.racconto||'';
      const list=[...document.querySelectorAll('.voce-row')].map(r=>({nome:(r.querySelector('input').value.trim().split(/\s+/)[0]||''), key:r._rec&&r._rec.key})).filter(x=>x.key);
      hidV.value=list.length?JSON.stringify(list):'';
    };
    const rb=document.getElementById('rec-racconto');
    if(rb) window.recRacconto=Recorder(rb,{kind:'racconto',label:'Registra a voce',draftInto:document.getElementById('racconto'),onKey:k=>{ out.racconto=k; sync(); }});
    const list=document.getElementById('voci-list');
    const addRow=()=>{
      const row=document.createElement('div'); row.className='voce-row';
      row.innerHTML=`<input type="text" placeholder="Nome di battesimo" aria-label="Nome di battesimo del bambino o della bambina" autocomplete="off" maxlength="30"><div class="rec-slot"></div>`;
      list.appendChild(row);
      const inp=row.querySelector('input');
      inp.addEventListener('input',sync);
      inp.addEventListener('blur',()=>{ const v=inp.value.trim(); if(/\s/.test(v)){ inp.value=v.split(/\s+/)[0]; row.querySelector('.voce-note')||inp.insertAdjacentHTML('afterend','<p class="rec-hint voce-note">Teniamo solo il nome di battesimo.</p>'); } sync(); });
      row._rec=Recorder(row.querySelector('.rec-slot'),{kind:'voce',label:'Registra',getNome:()=>inp.value.trim().split(/\s+/)[0],onKey:()=>sync()});
      return row;
    };
    if(list){ addRow(); document.getElementById('voci-add').onclick=()=>addRow().querySelector('input').focus(); }
    window.voiceAddRow=addRow;
    return {keys:()=>[out.racconto,...[...document.querySelectorAll('.voce-row')].map(r=>r._rec&&r._rec.key)].filter(Boolean), sync};
  };
})();
