/* Every FAS logo is a guarded shortcut to the main catalog, including dialog headers. */
(()=>{
 'use strict';
 if(window.FasHomeNavigation)return;
 const doc=document,mark='data-fas-home-navigation',label='На главную страницу ФАС торги';
 const base=doc.baseURI||(typeof location!=='undefined'?location.href:'');
 let navigating=false;
 function isLogo(image){
  if(image?.tagName?.toLowerCase()!=='img')return false;
  try{
   const raw=image.getAttribute('src')||image.src||'';if(!/(?:^|\/)fas-torgi-logo\.png(?:[?#]|$)/.test(raw))return false;
   const source=new URL(raw,base),expected=new URL('assets/brand/fas-torgi-logo.png',base);
   return source.protocol===expected.protocol&&source.host===expected.host&&source.pathname===expected.pathname;
  }catch{return false}
 }
 function decorate(image){
  if(!isLogo(image))return;
  const native=image.closest('a,button'),control=native||image;
  control.setAttribute(mark,'');control.setAttribute('aria-label',label);control.setAttribute('title',label);
  if(native?.tagName==='A'){native.setAttribute('href','#home');native.removeAttribute('target')}
  if(!native){control.setAttribute('role','button');control.setAttribute('tabindex','0')}
  // Old presentation-only lot logos disabled hit testing. This logo now acts as a control.
  image.style.pointerEvents='auto';image.style.cursor='pointer';control.style.cursor='pointer';
 }
 function refresh(root=doc){
  if(isLogo(root))decorate(root);
  root.querySelectorAll?.('img[src]').forEach(decorate);
 }
 function controlFor(target){
  const control=target?.closest?.('['+mark+']');if(!control)return null;
  return isLogo(control)||Array.from(control.querySelectorAll?.('img[src]')||[]).some(isLogo)?control:null;
 }
 const dialogs=()=>Array.from(doc.querySelectorAll('dialog[open]')).filter(dialog=>dialog.open);
 function closeDialog(dialog){
  const api={
   'payment-dialog':window.FasPayments,'support-dialog':window.FasSupport,
   'voice-dialog':window.FasVoiceAssistant,'property-map-dialog':window.FasPropertyMap,
   'sales-analytics-dialog':window.FasSalesAnalytics
  }[dialog.id];
  try{if(typeof api?.close==='function')api.close();else dialog.close();return !dialog.open}catch{return false}
 }
 function closeOthers(except){
  for(const dialog of dialogs().reverse())if(dialog!==except&&!closeDialog(dialog))return false;
  return true;
 }
 function leaveSeller(){
  const main=doc.querySelector('#modal');
  if(!main?.open||!main.classList.contains('seller-dialog'))return true;
  // Category and other nested windows must close first for the seller's top-dialog guard.
  if(!closeOthers(main))return false;
  if(typeof window.FasSellerUI?.back!=='function'){
   if(typeof toast==='function')toast('Сначала сохраните изменения в кабинете продавца.');return false;
  }
  // Editor → profile → dashboard can require three guarded steps. A failed save never closes it.
  for(let step=0;step<4&&main.open&&main.classList.contains('seller-dialog');step++){
   if(window.FasSellerUI.back()!==true)return false;
  }
  return !main.open||!main.classList.contains('seller-dialog');
 }
 function closePopovers(){
  try{doc.querySelectorAll('[popover]').forEach(node=>{try{node.hidePopover?.()}catch{}})}catch{}
  // Existing suggestion/menu handlers keep ownership of their Escape behavior.
  const Keyboard=window.KeyboardEvent||(typeof KeyboardEvent==='function'?KeyboardEvent:null);
  if(Keyboard&&typeof doc.dispatchEvent==='function')doc.dispatchEvent(new Keyboard('keydown',{key:'Escape',bubbles:true}));
 }
 function clearSearch(){
  if(typeof tab!=='undefined')tab='all';
  doc.querySelectorAll('[data-tab]').forEach(button=>button.classList.toggle('on',button.dataset.tab==='all'));
  const reset=doc.querySelector('#advanced-reset');
  if(typeof reset?.click==='function')reset.click();
  else if(typeof reset?.onclick==='function')reset.onclick({preventDefault(){}});
  else{
   ['search','category','brand','budget','city'].forEach(id=>{const input=doc.getElementById(id);if(input)input.value=''});
   if(typeof render==='function')render();
  }
  const advanced=doc.querySelector('#advanced-search');if(advanced)advanced.open=false;
  window.FasCategoryUI?.sync?.();
 }
 function homeURL(){
  try{
   const current=typeof location!=='undefined'?location:window.location,history=window.history;
   if(!current?.href||typeof history?.replaceState!=='function')return;
   const url=new URL(current.href);url.searchParams.delete('lot');url.searchParams.delete('view');url.hash='home';
   history.replaceState(history.state,'',url.pathname+url.search+url.hash);
  }catch{}
 }
 function goHome(){
  if(navigating)return false;navigating=true;
  try{
   if(!leaveSeller()||!closeOthers(null))return false;
   window.FasBackSwipe?.cancel?.();window.FasSellerBackGesture?.cancel?.();
   if(typeof reelsMode!=='undefined'&&reelsMode&&typeof setReels==='function')setReels(false);
   closePopovers();clearSearch();homeURL();
   const home=doc.querySelector('#home');
   if(home){const heading=home.querySelector('h1')||home;heading.setAttribute('tabindex','-1');heading.focus?.({preventScroll:true});home.scrollIntoView?.({block:'start',behavior:'auto'})}
   window.scrollTo?.({top:0,left:0,behavior:'auto'});return true;
  }catch{
   if(typeof toast==='function')toast('Не удалось перейти на главную. Сохраните изменения и попробуйте ещё раз.');return false;
  }finally{navigating=false}
 }
 // Bubble listeners intentionally follow existing capture-phase swipe click guards.
 doc.addEventListener('click',event=>{
  if(event.defaultPrevented||!controlFor(event.target))return;
  event.preventDefault();goHome();
 });
 doc.addEventListener('keydown',event=>{
  if(event.defaultPrevented||!['Enter',' ','Spacebar'].includes(event.key))return;
  const control=controlFor(event.target);if(!control||['A','BUTTON'].includes(control.tagName))return;
  event.preventDefault();goHome();
 });
 const Observer=window.MutationObserver||(typeof MutationObserver==='function'?MutationObserver:null);
 if(Observer)new Observer(records=>{
  if(!records?.length){refresh();return}
  for(const record of records){if(record.type==='attributes')decorate(record.target);for(const node of record.addedNodes||[])refresh(node)}
 }).observe(doc.body,{childList:true,subtree:true,attributes:true,attributeFilter:['src']});
 refresh();window.FasHomeNavigation=Object.freeze({goHome,refresh});
})();
