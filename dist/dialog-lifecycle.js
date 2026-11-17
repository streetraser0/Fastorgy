/* Track opening order independently of DOM order, and isolate queued close events. */
(()=>{
 'use strict';
 if(window.FasDialogLifecycle)return;
 let stack=[],observer=null;
 const live=dialog=>dialog?.open===true&&dialog.isConnected!==false;
 const dialogs=()=>typeof document.querySelectorAll==='function'?Array.from(document.querySelectorAll('dialog[open]')).filter(live):[];
 const isDialog=node=>String(node?.tagName||'').toUpperCase()==='DIALOG';
 const remove=dialog=>{const index=stack.indexOf(dialog);if(index>=0)stack.splice(index,1)};
 const opened=dialog=>{remove(dialog);stack.push(dialog)};
 function reconcile(){
  const current=dialogs(),connected=new Set(current);stack=stack.filter(dialog=>live(dialog)&&connected.has(dialog));
  // Already-open dialogs from before installation (or inserted with open set)
  // have no observable opening transition, so their fallback is document order.
  for(const dialog of current)if(!stack.includes(dialog))stack.push(dialog);
 }
 function process(records){
  const after=new Map(),states=new Map();
  // An observer batch may contain close/reopen for the same element. Its live
  // .open value describes only the final state; the next record's oldValue
  // supplies the state immediately after each preceding transition.
  for(let index=records.length-1;index>=0;index--){const record=records[index];if(record.type!=='attributes'||record.attributeName!=='open'||!isDialog(record.target))continue;states.set(record,after.has(record.target)?after.get(record.target):record.target.open===true);after.set(record.target,record.oldValue!==null)}
  for(const record of records){if(!states.has(record))continue;const before=record.oldValue!==null,next=states.get(record);if(!before&&next)opened(record.target);else if(before&&!next)remove(record.target)}
  reconcile();
 }
 function flush(){if(observer)process(observer.takeRecords()||[]);else reconcile()}
 function top(){flush();return observer?stack.at(-1)||null:dialogs().at(-1)||null}
 reconcile();
 const Observer=typeof MutationObserver==='function'?MutationObserver:window.MutationObserver;
 if(typeof Observer==='function')try{
  const instance=new Observer(records=>process(records));
  if(typeof instance.takeRecords==='function'){
   instance.observe(document.documentElement||document,{subtree:true,childList:true,attributes:true,attributeFilter:['open'],attributeOldValue:true});observer=instance;
  }else instance.disconnect?.();
 }catch{/* Browsers without observation retain the existing DOM-order fallback. */}
 document.addEventListener('close',event=>{
  flush();
  const dialog=event.target;
  if(isDialog(dialog)&&dialog.open===true)event.stopImmediatePropagation();
 },{capture:true});
 window.FasDialogLifecycle=Object.freeze({version:2,top});
})();
