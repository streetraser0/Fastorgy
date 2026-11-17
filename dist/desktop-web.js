/* Desktop browser presentation only. Shared mobile markup and stored data stay intact. */
(()=>{
 'use strict';
 if(window.FasDesktopWeb)return;
 const root=document.documentElement;
 const media=window.matchMedia('(min-width: 1025px) and (hover: hover) and (pointer: fine)');
 function active(){
  const nav=window.navigator||{};
  return media.matches&&!nav.userAgentData?.mobile&&!/Android|iPhone|iPad|iPod|Mobile/i.test(nav.userAgent||'')&&
   !(nav.platform==='MacIntel'&&nav.maxTouchPoints>1)&&!root.classList.contains('native-app')&&!window.Capacitor?.isNativePlatform?.();
 }
 const originals=new WeakMap();
 function label(selector,text){
  document.querySelectorAll(selector).forEach(node=>{
   if(!originals.has(node))originals.set(node,node.textContent);
   const next=active()?text:originals.get(node);
   if(node.textContent!==next)node.textContent=next;
  });
 }
 const attrs=new WeakMap();
 function attribute(selector,name,value){
  document.querySelectorAll(selector).forEach(node=>{
   if(!attrs.has(node))attrs.set(node,new Map());
   const saved=attrs.get(node);if(!saved.has(name))saved.set(name,node.getAttribute(name));
   const next=active()?value:saved.get(name);
   if(next===null){if(node.hasAttribute(name))node.removeAttribute(name)}
   else if(node.getAttribute(name)!==next)node.setAttribute(name,next);
  });
 }
 function labels(){
  label('#admin','Организациям-партнёрам');
  label('[data-open-seller-directory]','Организации-партнёры');
  label('#seller-directory-title','Организации-партнёры');
  attribute('[data-open-seller-directory]','aria-label','Открыть каталог организаций-партнёров');
  attribute('#fav-link','aria-label','Избранное');
  attribute('#fav-link','title','Избранное');
 }
 function refresh(){const on=active();if(root.classList.contains('desktop-web')!==on)root.classList.toggle('desktop-web',on);labels()}
 window.FasDesktopWeb=Object.freeze({active,refresh});
 root.classList.toggle('desktop-web',active());
 media.addEventListener?.('change',refresh);
 window.addEventListener('pageshow',refresh);
 const nativeObserver=new MutationObserver(()=>{if(root.classList.contains('desktop-web')!==active())refresh()});
 nativeObserver.observe(root,{attributes:true,attributeFilter:['class']});
 function ready(){
  refresh();
  const directory=document.querySelector('#seller-directory-dialog');
  if(directory)new MutationObserver(labels).observe(directory,{childList:true,subtree:true});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready,{once:true});else ready();
})();
