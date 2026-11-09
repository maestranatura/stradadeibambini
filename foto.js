'use strict';
/* Foto e disegni: ridimensionate nel telefono (lato lungo 1600 px, JPEG) e caricate una per una
   nell'archivio privato (/api/foto). Il modulo porta solo le chiavi. Nulla è pubblico finché non è approvato. */
(function(){
  const input=document.getElementById('files'); if(!input) return;
  const thumbs=document.getElementById('foto-thumbs'), count=document.getElementById('file-count');
  const hid=document.getElementById('f-foto-keys'), hidN=document.getElementById('f-n-foto');
  const items=[]; // {id, key, url, state}
  let pending=0;
  const sync=()=>{
    const keys=items.filter(x=>x.key).map(x=>x.key);
    hid.value=keys.length?JSON.stringify(keys):''; hidN.value=String(keys.length);
    const err=items.filter(x=>x.state==='errore').length;
    count.textContent = items.length ? `${keys.length} foto caricate${pending?` · ${pending} in caricamento…`:''}${err?` · ${err} non riuscite`:''}` : '';
  };
  window.fotoPending=()=>pending;
  const resize=async(file)=>{
    const max=1600;
    let bmp;
    try{ bmp=await createImageBitmap(file,{imageOrientation:'from-image'}); }
    catch{ bmp=await new Promise((res,rej)=>{ const i=new Image(); i.onload=()=>res(i); i.onerror=rej; i.src=URL.createObjectURL(file); }); }
    const w=bmp.width, h=bmp.height, k=Math.min(1, max/Math.max(w,h));
    const c=document.createElement('canvas'); c.width=Math.round(w*k); c.height=Math.round(h*k);
    c.getContext('2d').drawImage(bmp,0,0,c.width,c.height);
    return await new Promise(r=>c.toBlob(r,'image/jpeg',0.82));
  };
  const render=()=>{
    thumbs.innerHTML=items.map(x=>`<figure class="foto-thumb ${x.state}" data-id="${x.id}"><img src="${x.url}" alt=""><figcaption>${x.state==='ok'?'✓':x.state==='errore'?'!':'…'}</figcaption><button type="button" aria-label="Togli questa foto">×</button></figure>`).join('');
    thumbs.querySelectorAll('button').forEach(b=>b.onclick=()=>{ const id=b.parentElement.dataset.id; const i=items.findIndex(x=>String(x.id)===id); if(i>=0){ URL.revokeObjectURL(items[i].url); items.splice(i,1); render(); sync(); } });
  };
  let n=0;
  input.addEventListener('change',async()=>{
    const files=[...input.files]; input.value='';
    for(const f of files){
      if(!/^image\//.test(f.type) && !/\.(jpe?g|png|heic|webp)$/i.test(f.name)) continue;
      const it={id:++n, key:null, url:URL.createObjectURL(f), state:'carico'}; items.push(it); pending++; render(); sync();
      try{
        const blob=await resize(f);
        const r=await fetch('/api/foto',{method:'POST',headers:{'content-type':'image/jpeg'},body:blob});
        const d=await r.json().catch(()=>({}));
        if(!r.ok||!d.key) throw new Error(d.error||r.status);
        it.key=d.key; it.state='ok';
      }catch(e){ it.state='errore'; }
      pending--; render(); sync();
    }
  });
})();
