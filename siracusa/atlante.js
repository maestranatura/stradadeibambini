'use strict';
const filters=[...document.querySelectorAll('[data-filter]')];
function update(){
 let count=0;
 document.querySelectorAll('[data-filter-card]').forEach(card=>{
  const visible=filters.every(input=>{
   const v=input.value.trim().toLocaleLowerCase('it');
   if(!v)return true;
   const value=card.dataset[input.dataset.filter]||'';
   return input.dataset.filter==='search'?value.includes(v):value.split('|').includes(v);
  });
  card.hidden=!visible;if(visible)count++;
 });
 const status=document.querySelector('[data-count]');if(status)status.textContent=count+' '+status.dataset.count+' nella selezione';
}
filters.forEach(input=>input.addEventListener(input.tagName==='INPUT'?'input':'change',update));
if(filters.length)update();
function revealHash(){const target=document.getElementById(decodeURIComponent(location.hash.slice(1)));if(target){const box=target.closest('details');if(box)box.open=true;}}
window.addEventListener('hashchange',revealHash);revealHash();
