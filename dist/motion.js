/* Small, cancellable effects. Native scrolling and dialog state stay synchronous. */
(()=>{
 const preference=window.matchMedia('(prefers-reduced-motion: reduce)'),running=new Map(),exits=new Map(),registered=new WeakSet();
 const discrete=!!window.CSS?.supports?.('transition-behavior','allow-discrete')&&!!window.CSS?.supports?.('overlay','auto');
 const duration={dialog:210,list:170,search:110,exit:160};
 function cancel(element){const animation=running.get(element);if(animation){running.delete(element);animation.cancel()}}
 function cancelWithin(root){for(const element of [...running.keys()])if(element===root||root?.contains?.(element))cancel(element)}
 function play(element,frames,ms){
  if(!element||preference.matches||document.hidden||typeof element.animate!=='function')return;
  cancel(element);let animation;try{animation=element.animate(frames,{duration:ms,easing:'cubic-bezier(.2,.75,.25,1)',fill:'none'})}catch{return}
  running.set(element,animation);const done=()=>{if(running.get(element)===animation)running.delete(element)};
  if(animation.finished?.then)animation.finished.then(done,done);else{animation.onfinish=done;animation.oncancel=done}
 }
 const variables=['top','left','width','height','background','color','radius','shadow','border'];
 function clearExit(dialog){const timer=exits.get(dialog);if(timer!==undefined){window.clearTimeout(timer);exits.delete(dialog)}if(dialog.classList.contains('fas-motion-exit'))dialog.classList.remove('fas-motion-exit');for(const name of variables)dialog.style.removeProperty('--fas-exit-'+name)}
 function register(dialog){
  if(!dialog||registered.has(dialog)||typeof dialog.close!=='function')return;registered.add(dialog);
  const nativeClose=dialog.close;
  dialog.close=function(...args){
   cancelWithin(dialog);clearExit(dialog);
   // Lot swipes already follow the finger. They close immediately at their threshold.
   if(!dialog.open||preference.matches||!discrete||dialog.classList.contains('lot-dialog'))return nativeClose.apply(this,args);
   const rect=dialog.getBoundingClientRect?.();if(!rect||rect.width<=0||rect.height<=0)return nativeClose.apply(this,args);
   const style=window.getComputedStyle(dialog),values={top:rect.top+'px',left:rect.left+'px',width:rect.width+'px',height:rect.height+'px',background:style.backgroundColor,color:style.color,radius:style.borderRadius,shadow:style.boxShadow,border:style.border};
   for(const [name,value] of Object.entries(values))dialog.style.setProperty('--fas-exit-'+name,value);dialog.classList.add('fas-motion-exit');
   let result;try{result=nativeClose.apply(this,args)}catch(error){clearExit(dialog);throw error}
   const timer=window.setTimeout(()=>{if(exits.get(dialog)===timer)clearExit(dialog)},duration.exit+40);exits.set(dialog,timer);return result;
  };
 }
 function dialogEnter(dialog){if(!dialog)return;register(dialog);clearExit(dialog);const content=dialog.querySelector('#modal-content')||dialog.querySelector('.category-browser');play(content,[{opacity:0,transform:'translateY(9px)'},{opacity:1,transform:'translateY(0)'}],duration.dialog)}
 function categoryEnter(list,direction='forward'){if(direction==='none'||direction==='search'&&running.has(list))return;const x=direction==='back'?-12:12;play(list,direction==='search'?[{opacity:.45},{opacity:1}]:[{opacity:0,transform:'translateX('+x+'px)'},{opacity:1,transform:'translateX(0)'}],direction==='search'?duration.search:duration.list)}
 function catalogEnter(grid){
  if(document.body.classList.contains('reels')||document.querySelector('dialog[open]')||preference.matches||document.activeElement?.matches?.('input,textarea'))return;
  const cards=[...grid.querySelectorAll('.card')].slice(0,6),height=window.innerHeight||1000;
  for(const card of cards){const rect=card.getBoundingClientRect?.();if(!rect||rect.bottom<0||rect.top>height)continue;play(card,[{opacity:.55,transform:'translateY(4px)'},{opacity:1,transform:'translateY(0)'}],duration.list)}
 }
 function userInteraction(event){const dialog=event.target.closest?.('dialog');if(dialog)cancelWithin(dialog);const card=event.target.closest?.('.card');if(card)cancel(card)}
 document.addEventListener('pointerdown',userInteraction,{capture:true,passive:true});document.addEventListener('touchstart',userInteraction,{capture:true,passive:true});
 document.addEventListener('visibilitychange',()=>{if(document.hidden){for(const element of [...running.keys()])cancel(element);for(const dialog of [...exits.keys()])clearExit(dialog)}});
 preference.addEventListener?.('change',()=>{if(preference.matches){for(const element of [...running.keys()])cancel(element);for(const dialog of [...exits.keys()])clearExit(dialog)}});
 window.FasMotion=Object.freeze({dialogEnter,categoryEnter,catalogEnter,cancelWithin});register(document.querySelector('#modal'));
})();
