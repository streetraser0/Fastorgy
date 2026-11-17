/* Viewed lots stay after new lots on the next render, never during a swipe. */
(()=>{
 'use strict';
 if(window.FasLotDiscovery)return;
 const KEY='fas-viewed-lots-v1',MAX_IDS=20000,DWELL=600,DOCK=84;
 const valid=id=>Number.isSafeInteger(id)&&id>0;
 const read=value=>{try{const parsed=JSON.parse(value||'null'),ids=Array.isArray(parsed)?parsed:parsed?.version===1?parsed.ids:null;return Array.isArray(ids)?ids.filter(valid).slice(-MAX_IDS):[]}catch{return[]}};
 const viewed=new Set();let storageAvailable=true;
 try{read(localStorage.getItem(KEY)).forEach(id=>viewed.add(id))}catch{storageAvailable=false}
 function trim(){while(viewed.size>MAX_IDS)viewed.delete(viewed.values().next().value)}
 function persist(){try{localStorage.setItem(KEY,JSON.stringify({version:1,ids:[...viewed]}));storageAvailable=true}catch{storageAvailable=false}}
 function hasViewed(id){return valid(id)&&viewed.has(id)}
 function markViewed(id){if(!valid(id)||viewed.has(id))return false;viewed.add(id);trim();persist();return true}
 function prioritize(lots,isSeen=hasViewed){if(!Array.isArray(lots))return[];const classify=typeof isSeen==='function'?isSeen:hasViewed,fresh=[],seen=[];for(const lot of lots)(classify(lot?.id)?seen:fresh).push(lot);return fresh.concat(seen)}

 const grid=document.querySelector('#grid'),pending=new Map(),observed=new Set();
 let observer=null,mode=null,epoch=0,pageActive=true;
 const available=()=>pageActive&&!document.hidden&&!document.querySelector('dialog[open]');
 const currentMode=()=>document.body?.classList.contains('reels')?'reels':'page';
 function cancel(card){const candidate=pending.get(card);if(candidate)clearTimeout(candidate.timer);pending.delete(card)}
 function disconnect(){epoch++;for(const card of pending.keys())cancel(card);observer?.disconnect();observer=null;observed.clear();mode=null}
 function visibleEnough(rect,visible,bounds){
  if(!rect||!visible||!(rect.height>0)||!(rect.width>0))return false;
  const height=bounds?.height>0?bounds.height:window.innerHeight||document.documentElement?.clientHeight||800;
  return visible.height>=Math.min(240,rect.height*.5,height*.6)&&visible.width>=Math.min(160,rect.width*.5);
 }
 function actualVisibility(card){
  if(typeof card.getBoundingClientRect!=='function')return false;
  const rect=card.getBoundingClientRect(),root=mode==='reels'?grid.getBoundingClientRect():{top:0,left:0,right:window.innerWidth||document.documentElement?.clientWidth||390,bottom:window.innerHeight||document.documentElement?.clientHeight||800};
  const bounds={height:Math.max(0,root.bottom-root.top-DOCK)};
  return visibleEnough(rect,{height:Math.max(0,Math.min(rect.bottom,root.bottom-DOCK)-Math.max(rect.top,root.top)),width:Math.max(0,Math.min(rect.right,root.right)-Math.max(rect.left,root.left))},bounds);
 }
 function receive(entries,version){
  if(version!==epoch||!available())return;
  for(const entry of entries){
   const card=entry.target,id=Number(card?.dataset?.lot);
   if(!observed.has(card)||!valid(id)||hasViewed(id)||!entry.isIntersecting||!visibleEnough(entry.boundingClientRect,entry.intersectionRect,entry.rootBounds)){cancel(card);continue}
   if(pending.has(card))continue;
   const timer=setTimeout(()=>{
    const candidate=pending.get(card);if(!candidate||candidate.timer!==timer)return;pending.delete(card);
    if(version!==epoch||!available()||currentMode()!==mode||card.isConnected===false||!grid.contains(card)||Number(card.dataset.lot)!==id||!actualVisibility(card))return;
    markViewed(id);
   },DWELL);
   pending.set(card,{timer,id});
  }
 }
 function sync(){
  if(!grid||!available()||typeof IntersectionObserver!=='function'){disconnect();return}
  const nextMode=currentMode();
  if(!observer||mode!==nextMode){disconnect();mode=nextMode;const version=epoch;try{observer=new IntersectionObserver(entries=>receive(entries,version),{root:mode==='reels'?grid:null,rootMargin:'0px 0px -'+DOCK+'px 0px',threshold:[0,.1,.25,.5,.75,1]})}catch{mode=null;return}}
  const cards=new Set(grid.querySelectorAll('.card[data-lot]'));
  for(const card of observed)if(!cards.has(card)){cancel(card);observer.unobserve?.(card);observed.delete(card)}
  for(const card of cards)if(!observed.has(card)){observed.add(card);observer.observe(card)}
 }
 document.addEventListener('visibilitychange',sync);
 document.addEventListener('close',sync,true);
 document.addEventListener('cancel',sync,true);
 window.addEventListener('pagehide',()=>{pageActive=false;disconnect()});
 window.addEventListener('pageshow',()=>{pageActive=true;sync()});
 window.addEventListener('storage',event=>{if(event.key!==KEY)return;read(event.newValue).forEach(id=>viewed.add(id));trim()});
 if(typeof MutationObserver==='function'){
  const watcher=new MutationObserver(records=>{if(records.some(record=>record.attributeName==='open'))disconnect();sync()});
  if(grid)watcher.observe(grid,{childList:true});
  if(document.body)watcher.observe(document.body,{attributes:true,attributeFilter:['class']});
  watcher.observe(document.documentElement,{subtree:true,attributes:true,attributeFilter:['open']});
 }
 window.FasLotDiscovery=Object.freeze({prioritize,markViewed,hasViewed,sync,state:()=>({viewedCount:viewed.size,pending:pending.size,tracking:!!observer,mode,storageAvailable})});
 sync();
})();
