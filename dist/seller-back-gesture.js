/* Seller headers return in four directions; dashboard content also pulls down at its top. */
function createFasSellerBackGesture(options) {
 const root=options.document,view=options.window,clock=options.now||(()=>Date.now()),removers=[];
 const back=options.back||(dialog=>typeof performFasDialogBack==='function'?performFasDialogBack(dialog):view.FasSellerUI?.back?.());
 const native='input,textarea,select,label,details,summary,video,audio,[contenteditable],[role="slider"],[role="checkbox"],.gallery-track,.lot-gallery,.photo-viewer-stage,.seller-media-grid,.seller-tabs,.seller-progress,.seller-editor-nav,.leaflet-container,.property-map-canvas,.property-map-maparea,[data-swipe-native],[data-no-swipe]';
 let gesture=null,clickGate=0,destroyed=false,observer=null;
 const topDialog=()=>typeof view?.FasDialogLifecycle?.top==='function'?view.FasDialogLifecycle.top():Array.from(root.querySelectorAll('dialog[open]')).filter(dialog=>dialog.open).at(-1)||null;
 const stamp=event=>Number.isFinite(event.timeStamp)?event.timeStamp:clock();
 const selected=dialog=>{try{const value=view?.getSelection?.()||root.getSelection?.();if(!value||value.isCollapsed===true)return false;const anchor=value.anchorNode?.nodeType===3?value.anchorNode.parentElement:value.anchorNode,focus=value.focusNode?.nodeType===3?value.focusNode.parentElement:value.focusNode;return (value.isCollapsed===false||String(value).trim().length>0)&&(!anchor&&!focus||dialog.contains(anchor)||dialog.contains(focus))}catch{return false}};
 function cancel(){gesture=null;observer?.disconnect()}
 function snapshot(dialog){const content=dialog.querySelector('#modal-content');return {first:content?.firstChild,heading:dialog.querySelector('h2'),title:dialog.querySelector('h2')?.textContent}}
 function scrollState(target,dialog){const result=[];for(let node=target;node;node=node.parentElement){result.push({node,top:node.scrollTop||0,left:node.scrollLeft||0});if(node===dialog)return result}return null}
 function current(state){
  if(observer?.takeRecords?.()?.length){cancel();return false}
  if(destroyed||root.hidden||!state.dialog.open||!state.dialog.classList.contains('seller-dialog')||topDialog()!==state.dialog||!state.dialog.contains(state.target)||state.target.isConnected===false||selected(state.dialog)||!state.header&&state.scroll.some(item=>(item.node.scrollTop||0)!==item.top||(item.node.scrollLeft||0)!==item.left))return false;
  const value=snapshot(state.dialog);return value.first===state.first&&value.heading===state.heading&&value.title===state.title;
 }
 function axis(state,dx,dy){const x=Math.abs(dx),y=Math.abs(dy);if(x>y*1.35)return dx>0?'right':'left';if(y>x*1.35){if(state.header)return dy>0?'down':'up';if(state.pull&&dy>0)return 'down'}return null}
 function start(event){
  clickGate=0;cancel();if(destroyed||event.touches?.length!==1)return;
  const target=event.target?.nodeType===3?event.target.parentElement:event.target,dialog=target?.closest?.('dialog');if(root.hidden||dialog?.id!=='modal'||dialog!==topDialog()||!dialog.classList.contains('seller-dialog')||selected(dialog)||target.closest(native)||target.closest('[hidden],[inert]'))return;
  const header=!!target.closest('[data-dialog-swipe-header],.fas-dialog-grip,.dialog-brand,.seller-heading,.close,.dialog-close');
  if(!header&&target.closest('button,a,[role="button"]'))return;
  const touch=event.touches[0];if(!Number.isFinite(touch.clientX)||!Number.isFinite(touch.clientY))return;
  const rect=dialog.getBoundingClientRect?.(),gutter=Math.max(0,(dialog.offsetWidth||rect?.width||0)-(dialog.clientWidth||rect?.width||0));if(rect&&gutter>0&&touch.clientX>=rect.right-gutter)return;
  const scroll=scrollState(target,dialog);if(!scroll)return;
  // Only a dashboard already at its upper boundary may consume a downward pull.
  // Reading upwards and any gesture begun lower down retain native scrolling.
  const pull=!header&&!!dialog.querySelector('.seller-dashboard-heading')&&scroll.every(item=>item.top<=1);
  gesture={dialog,target,...snapshot(dialog),header,pull,scroll,id:touch.identifier,x:touch.clientX,y:touch.clientY,time:stamp(event),axis:null};
  observer?.observe(dialog,{attributes:true,attributeFilter:['open']});
 }
 function move(event){
  const state=gesture;if(!state)return;
  if(!current(state)||event.touches?.length!==1){cancel();return}
  const touch=event.touches[0];if(touch.identifier!==state.id){cancel();return}
  const dx=touch.clientX-state.x,dy=touch.clientY-state.y;
  const reserved=state.header&&(dx!==0||dy!==0)||state.pull&&dy>0&&Math.abs(dy)>Math.abs(dx)*1.35;
  if(reserved&&event.cancelable!==false)event.preventDefault?.();
  if(Math.max(Math.abs(dx),Math.abs(dy))<12)return;
  const direction=axis(state,dx,dy);if(!direction||state.axis&&state.axis!==direction){cancel();return}state.axis=direction;
  if(!reserved&&event.cancelable!==false)event.preventDefault?.();
 }
 function end(event){
  const state=gesture;if(!state)return;
  if(!current(state)||event.touches?.length){cancel();return}
  const touch=Array.from(event.changedTouches||[]).find(item=>item.identifier===state.id);if(!touch){cancel();return}
  const dx=touch.clientX-state.x,dy=touch.clientY-state.y,direction=axis(state,dx,dy),elapsed=stamp(event)-state.time;
  const distance=direction==='left'||direction==='right'?Math.abs(dx):Math.abs(dy);
  const deliberate=direction&&(!state.axis||state.axis===direction)&&elapsed>=0&&(distance>=90||distance>=55&&distance/Math.max(1,elapsed)>=0.55);
  cancel();if(!deliberate)return;if(event.cancelable!==false)event.preventDefault?.();
  // Saving may refuse Back. The completed touch must still not become a tap.
  try{back(state.dialog)}finally{clickGate=clock()+450}
 }
 function suppressClick(event){if(!clickGate||clock()>clickGate||event.detail===0||event.pointerType==='mouse')return;clickGate=0;event.preventDefault?.();event.stopImmediatePropagation?.();event.stopPropagation?.()}
 function listen(target,type,handler,settings){if(!target?.addEventListener)return;target.addEventListener(type,handler,settings);removers.push(()=>target.removeEventListener?.(type,handler,settings))}
 if(typeof view?.MutationObserver==='function')try{observer=new view.MutationObserver(records=>{if(records.length)cancel()})}catch{}
 listen(root,'touchstart',start,{passive:true,capture:true});listen(root,'touchmove',move,{passive:false,capture:true});listen(root,'touchend',end,{passive:false,capture:true});listen(root,'touchcancel',cancel,{passive:true,capture:true});listen(root,'click',suppressClick,{capture:true});listen(root,'visibilitychange',cancel);listen(root,'selectionchange',()=>{if(gesture&&selected(gesture.dialog))cancel()});listen(root,'contextmenu',cancel,{capture:true});listen(root,'close',cancel,{capture:true});listen(root,'cancel',cancel,{capture:true});listen(view,'blur',cancel);listen(view,'resize',cancel);
 return {start,move,end,cancel,suppressClick,destroy(){cancel();clickGate=0;destroyed=true;removers.forEach(remove=>remove())}};
}
function installFasSellerBackGesture(){if(window.FasSellerBackGesture)return window.FasSellerBackGesture;const controller=createFasSellerBackGesture({document,window});window.FasSellerBackGesture=Object.freeze({cancel:controller.cancel});return window.FasSellerBackGesture}
if(typeof document!=='undefined'&&typeof window!=='undefined')installFasSellerBackGesture();
