/* Mouse-only desktop backdrop navigation, through the existing guarded Back routes. */
function createFasDesktopDialogs(options) {
 'use strict';
 const root=options.document,view=options.window,removers=[];
 const active=options.active||(()=>view.FasDesktopWeb?.active?.()===true);
 const top=()=>view.FasDialogLifecycle?.top?.()||Array.from(root.querySelectorAll('dialog[open]')).filter(node=>node.open).at(-1)||null;
 const back=options.back||(()=>view.FasBackSwipe?.back?.());
 const feedOpen=options.feedOpen||(()=>root.body.classList.contains('reels'));
 const feedContext=options.feedContext||(()=>typeof setReels==='function'?setReels.returnPosition:null);
 const closeFeed=options.closeFeed||(()=>root.querySelector('#close-reels')?.click());
 let gesture=null,lastPointer='',destroyed=false,pending=null,backdrop=null,observer=null,mouseAfterTouch=0;
 const point=event=>Number.isFinite(event.clientX)&&Number.isFinite(event.clientY);
 const outside=(node,event)=>{const r=node?.getBoundingClientRect?.();return !!r&&point(event)&&(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)};
 const selected=()=>{try{return view.getSelection?.()?.isCollapsed===false}catch{return false}};
 const snapshot=dialog=>({first:dialog?.firstChild,content:dialog?.querySelector?.('#modal-content')?.firstChild,title:dialog?.querySelector?.('h2')?.textContent});
 function cancel(){gesture=null}
 function stopAnimation(){if(!pending)return;const value=pending;pending=null;view.clearTimeout?.(value.timer);value.animation?.cancel?.()}
 function reset(){cancel();stopAnimation()}
 function refresh(){if(backdrop)backdrop.hidden=!(active()&&feedOpen())}
 function hit(event) {
  const dialog=top(),target=event.target;
  if(dialog)return target===dialog&&outside(dialog,event)?{kind:'dialog',dialog}:null;
  const grid=root.querySelector('#grid');
  return feedOpen()&&target===backdrop&&outside(grid,event)?{kind:'feed',grid,context:feedContext()}:null;
 }
 function current(state) {
  if(observer?.takeRecords?.().some(record=>record.type==='attributes'&&record.attributeName==='open')){reset();return false}
  if(destroyed||!active()||root.hidden||selected())return false;
  if(state.xWindow!==(view.scrollX||0)||state.yWindow!==(view.scrollY||0))return false;
  if(state.kind==='feed')return !top()&&feedOpen()&&state.grid===root.querySelector('#grid')&&state.context===feedContext()&&(state.grid.scrollTop||0)===state.scrollTop;
  if(!state.dialog.open||state.dialog.isConnected===false||state.dialog!==top()||(state.dialog.scrollTop||0)!==state.scrollTop)return false;
  const now=snapshot(state.dialog);return now.first===state.first&&now.content===state.content&&now.title===state.title;
 }
 function down(event) {
  lastPointer=event.pointerType||'mouse';cancel();
  if(destroyed||!active()||pending||lastPointer!=='mouse'||event.button!==0||event.isPrimary===false||event.defaultPrevented||selected())return;
  const surface=hit(event);if(!surface)return;
  gesture={...surface,id:event.pointerId,target:event.target,x:event.clientX,y:event.clientY,xWindow:view.scrollX||0,yWindow:view.scrollY||0,scrollTop:(surface.dialog||surface.grid).scrollTop||0,ready:false,...snapshot(surface.dialog)};
 }
 function move(event){if(gesture&&(event.pointerId!==gesture.id||!point(event)||Math.hypot(event.clientX-gesture.x,event.clientY-gesture.y)>8||!current(gesture)))cancel()}
 function up(event){const state=gesture;if(!state)return;move(event);if(gesture!==state||event.button!==0||event.target!==state.target||!hit(event)||event.defaultPrevented){cancel();return}state.ready=true}
 function returnFeed(state) {
  if(!current(state))return;
  const reduced=view.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if(reduced||typeof state.grid.animate!=='function'){closeFeed();refresh();return}
  // Animate only the visual feed; setReels(false) owns restoration of filters and scroll.
  const value={state,animation:state.grid.animate([{opacity:1,scale:'1'},{opacity:0,scale:'.98'}],{duration:120,easing:'ease-out',fill:'forwards'}),timer:null};
  pending=value;
  function finish(){if(pending!==value)return;pending=null;view.clearTimeout?.(value.timer);value.animation?.cancel?.();if(current(state))closeFeed();refresh()}
  value.animation.finished?.then(finish,()=>{});
  value.timer=view.setTimeout(finish,180);
 }
 function click(event) {
  if(destroyed||!active())return;
  const pointer=event.pointerType||lastPointer;
  if(pointer!=='mouse'||event.sourceCapabilities?.firesTouchEvents)return;
  const surface=hit(event),targetDialog=String(event.target?.tagName||'').toUpperCase()==='DIALOG'?event.target:null;
  // Consume failed outside mouse gestures too: old per-dialog click handlers
  // must not turn a drag from content to backdrop into an unguarded dismissal.
  if(!surface&&!(targetDialog&&outside(targetDialog,event)))return;
  const state=gesture,valid=surface&&state?.ready&&event.detail>0&&event.button===0&&!event.defaultPrevented&&event.target===state.target&&point(event)&&Math.hypot(event.clientX-state.x,event.clientY-state.y)<=8&&current(state);
  cancel();event.preventDefault?.();event.stopImmediatePropagation?.();event.stopPropagation?.();
  if(!valid||pending)return;
  if(state.kind==='dialog')back();else returnFeed(state);
 }
 function listen(target,type,handler,config){if(!target?.addEventListener)return;target.addEventListener(type,handler,config);removers.push(()=>target.removeEventListener?.(type,handler,config))}
 if(typeof view.PointerEvent==='function'){
  listen(view,'pointerdown',down,{capture:true,passive:true});
  listen(view,'pointermove',move,{capture:true,passive:true});
  listen(view,'pointerup',up,{capture:true,passive:true});
  listen(view,'pointercancel',cancel,{capture:true,passive:true});
 }else{
  listen(view,'mousedown',event=>{if(Date.now()>=mouseAfterTouch)down(event)},{capture:true,passive:true});
  listen(view,'mousemove',move,{capture:true,passive:true});
  listen(view,'mouseup',up,{capture:true,passive:true});
  listen(view,'touchstart',()=>{mouseAfterTouch=Date.now()+800;lastPointer='touch';cancel()},{capture:true,passive:true});
 }
 listen(view,'click',click,{capture:true});
 for(const type of ['scroll','contextmenu','dragstart','visibilitychange','close','cancel'])listen(root,type,reset,{capture:true});
 // A normal click also emits selectionchange with an empty selection.
 listen(root,'selectionchange',()=>{if(selected())reset()},{capture:true});
 listen(view,'blur',reset);listen(view,'resize',()=>{reset();refresh()});
 const Observer=view.MutationObserver;
 if(typeof Observer==='function'){
  observer=new Observer(records=>{
   if(records.some(record=>record.type==='attributes'&&record.attributeName==='open'))reset();
   if(gesture&&!current(gesture))cancel();
   if(pending&&!current(pending.state))stopAnimation();
   refresh();
  });
  observer.observe(root.documentElement,{subtree:true,attributes:true,attributeFilter:['open','class'],childList:true});
  removers.push(()=>observer.disconnect());
 }
 if(root.body&&typeof root.createElement==='function'){
  backdrop=root.createElement('div');backdrop.className='desktop-feed-backdrop';backdrop.hidden=true;backdrop.setAttribute('aria-hidden','true');root.body.appendChild(backdrop);refresh();
 }
 return {refresh,cancel:reset,destroy(){destroyed=true;reset();removers.forEach(remove=>remove());backdrop?.remove()}};
}
if(typeof window!=='undefined'&&typeof document!=='undefined'&&!window.FasDesktopDialogs){
 window.FasDesktopDialogs=createFasDesktopDialogs({document,window});
}
