/* Return through each dialog's own Back action; content keeps native scrolling. */
function performFasDialogBack(dialog) {
  if (!dialog?.open) return false;
  const top=typeof window.FasDialogLifecycle?.top==='function'?window.FasDialogLifecycle.top():Array.from(document.querySelectorAll('dialog[open]')).filter(node=>node.open).at(-1);
  if(top!==dialog)return false;
  const activate = button => {
    if (!button || button.disabled || button.hidden || button.closest?.('[hidden],[inert]') || typeof button.click !== 'function') return false;
    button.click();return true;
  };
  // Inline deletion is a separate decision. Back first dismisses that decision.
  const pendingDelete=Array.from(dialog.querySelectorAll('[data-seller-delete-confirmation]')).find(panel=>!panel.hidden);
  if(pendingDelete&&activate(pendingDelete.querySelector('[data-seller-delete-cancel]')))return true;
  if (dialog.id === 'modal' && dialog.classList.contains('lot-dialog')) {
    if(!window.FasSellerStorefront?.returnFromLot?.()&&!window.FasPropertyMap?.returnFromLot?.())dialog.close();return true;
  }
  if (dialog.classList.contains('seller-dialog') && typeof window.FasSellerUI?.back === 'function') return window.FasSellerUI.back();
  if (dialog.id === 'category-picker') return activate(dialog.querySelector('[data-category-back]'));
  if (dialog.querySelector('[data-auction-history-back]') && activate(dialog.querySelector('[data-auction-history-back]'))) return true;
  if (dialog.querySelector('[data-my-bids-back]') && activate(dialog.querySelector('[data-my-bids-back]'))) return true;
  if (dialog.querySelector('[data-seller-confirm-buy]') && activate(dialog.querySelector('[data-seller-view]'))) return true;
  if (dialog.querySelector('#seller-listing-form') && activate(dialog.querySelector('[data-seller-dashboard]'))) return true;
  if (dialog.querySelector('#seller-profile-form') && typeof window.FasSellerUI?.openDashboard === 'function') {
    if(typeof window.FasSellerUI.prepareNavigation==='function'&&!window.FasSellerUI.prepareNavigation())return false;
    window.FasSellerUI.openDashboard('all');return true;
  }
  if (dialog.querySelector('#code-form') && activate(dialog.querySelector('#change-phone'))) return true;
  if (dialog.querySelector('.checkout-modal') && typeof openPlans === 'function') { openPlans();return true; }
  dialog.close();return true;
}

function fasDialogSwipeHeaders(){return '[data-dialog-swipe-header],.fas-dialog-grip,.dialog-brand,.photo-viewer-header,.payment-header,.support-header,.voice-header,.sales-analytics-header,.auction-history-heading,.my-bids-title,.category-browser-head,.category-browser-header,.property-map-header,.rating-head,.buyer-copy-heading,.buyer-recent-heading,.seller-heading,.lot-modal-header,.close,.dialog-close'}

/* A tap on actual dialog whitespace uses the same guarded Back as its header. */
function createFasDialogBlankBack(options) {
  const root=options.document,view=options.window,back=options.back||performFasDialogBack,clock=options.now||(()=>Date.now()),removers=[];
  const surfaces=new Set(['DIALOG','DIV','SECTION','ARTICLE','MAIN','HEADER','FOOTER','ASIDE','NAV','FORM','FIELDSET','UL','OL','DL']);
  const native='button,a,input,textarea,select,label,summary,details,option,img,svg,canvas,picture,iframe,object,embed,video,audio,[contenteditable],[onclick],[role="button"],[role="link"],[role="checkbox"],[role="radio"],[role="switch"],[role="tab"],[role="slider"],[role="spinbutton"],[role="combobox"],[role="textbox"],[role="listbox"],[role="option"],[role="menuitem"],[role="treeitem"],[role="img"],.gallery-track,.lot-gallery,.photo-viewer-stage,.photo-viewer-canvas,.lot-swipe-surface,.car-photo,.seller-media-grid,.seller-tabs,.seller-progress,.seller-editor-nav,.leaflet-container,.property-map-canvas,.property-map-maparea,[data-swipe-native],[data-no-swipe],[data-no-blank-back]';
  let tap=null,destroyed=false,mouseAfterTouch=0,observer=null;
  const top=()=>typeof view?.FasDialogLifecycle?.top==='function'?view.FasDialogLifecycle.top():Array.from(root.querySelectorAll('dialog[open]')).filter(dialog=>dialog.open).at(-1)||null;
  const element=event=>event.target?.nodeType===3?event.target.parentElement:event.target;
  function selected(dialog){try{const value=view?.getSelection?.()||root.getSelection?.();if(!value||value.isCollapsed!==false)return false;const inside=node=>dialog.contains(node?.nodeType===3?node.parentElement:node);return inside(value.anchorNode)||inside(value.focusNode)}catch{return false}}
  function cancel(){tap=null;observer?.disconnect()}
  function snapshot(dialog){return {first:dialog.firstChild,heading:dialog.querySelector('h2'),title:dialog.querySelector('h2')?.textContent,content:dialog.querySelector('#modal-content')?.firstChild}}
  function ownTextHit(target,x,y){
    const nodes=target.childNodes;
    if(!nodes)return !!target.textContent?.trim();
    for(const node of nodes){
      if(node.nodeType!==3||!String(node.nodeValue||'').trim())continue;
      if(typeof root.createRange!=='function')return true;
      try{const range=root.createRange();range.selectNodeContents(node);const rects=Array.from(range.getClientRects());range.detach?.();if(rects.some(rect=>x>=rect.left&&x<=rect.right&&y>=rect.top&&y<=rect.bottom))return true}catch{return true}
    }
    return false;
  }
  function scrollState(target,dialog,x,y){
    const result=[];
    for(let node=target;node;node=node.parentElement){
      const rect=node.getBoundingClientRect?.(),gx=Math.max(0,(node.offsetWidth||rect?.width||0)-(node.clientWidth||rect?.width||0)),gy=Math.max(0,(node.offsetHeight||rect?.height||0)-(node.clientHeight||rect?.height||0));
      if(rect&&(gx>0&&x>=rect.right-gx||gy>0&&y>=rect.bottom-gy))return null;
      result.push({node,top:node.scrollTop||0,left:node.scrollLeft||0});if(node===dialog)return result;
    }
    return null;
  }
  function blank(target,dialog,x,y){
    if(!target||target.shadowRoot||!surfaces.has(String(target.tagName).toUpperCase())||target.closest?.(native)||target.closest?.('[hidden],[inert]'))return false;
    for(let node=target;node&&node!==dialog;node=node.parentElement)if(typeof node.onclick==='function')return false;
    const rect=dialog.getBoundingClientRect?.();
    return (!rect||x>=rect.left&&x<=rect.right&&y>=rect.top&&y<=rect.bottom)&&!ownTextHit(target,x,y);
  }
  function current(state){
    if(observer?.takeRecords?.().length){cancel();return false}
    if(destroyed||root.hidden||view.document?.hidden||!state.dialog.open||state.dialog!==top()||state.target.isConnected===false||!state.dialog.contains(state.target)||selected(state.dialog)||state.scroll.some(item=>(item.node.scrollTop||0)!==item.top||(item.node.scrollLeft||0)!==item.left))return false;
    const value=snapshot(state.dialog);return value.first===state.first&&value.heading===state.heading&&value.title===state.title&&value.content===state.content;
  }
  function begin(event,point,id,kind){
    cancel();if(destroyed||event.defaultPrevented||!point||!Number.isFinite(point.clientX)||!Number.isFinite(point.clientY))return;
    const target=element(event),dialog=target?.closest?.('dialog');
    // Categories already own their blank dismissal, including group-level views.
    if(!dialog||dialog.id==='category-picker'||dialog!==top()||selected(dialog)||!blank(target,dialog,point.clientX,point.clientY))return;
    const scroll=scrollState(target,dialog,point.clientX,point.clientY);if(!scroll)return;
    tap={target,dialog,x:point.clientX,y:point.clientY,id,kind,ready:false,scroll,...snapshot(dialog)};
    observer?.observe(dialog,{attributes:true,attributeFilter:['open']});
  }
  function move(point,id){if(!tap)return;if(!point||!Number.isFinite(point.clientX)||!Number.isFinite(point.clientY)||tap.id!==id||Math.hypot(point.clientX-tap.x,point.clientY-tap.y)>8||!current(tap))cancel()}
  function end(event,point,id){const state=tap;if(!state)return;move(point,id);if(tap!==state||event.defaultPrevented||element(event)!==state.target){cancel();return}state.ready=true}
  function click(event){
    const state=tap,valid=state?.ready&&!event.defaultPrevented&&event.detail>0&&!(event.button>0)&&Number.isFinite(event.clientX)&&Number.isFinite(event.clientY)&&Math.hypot(event.clientX-state.x,event.clientY-state.y)<=8&&element(event)===state.target&&current(state)&&blank(state.target,state.dialog,event.clientX,event.clientY);cancel();
    if(!valid)return;
    // Capture confirmed whitespace before older backdrop-close handlers. A refused
    // form Back is consumed too, so it cannot fall through to an unguarded close.
    event.preventDefault?.();event.stopImmediatePropagation?.();event.stopPropagation?.();back(state.dialog);
  }
  function listen(target,type,handler,settings){if(!target?.addEventListener)return;target.addEventListener(type,handler,settings);removers.push(()=>target.removeEventListener?.(type,handler,settings))}
  const Observer=view?.MutationObserver;
  if(typeof Observer==='function')try{observer=new Observer(records=>{if(records.length)cancel()})}catch{}
  if(typeof view?.PointerEvent==='function'){
    listen(root,'pointerdown',event=>{if(event.isPrimary===false||event.button>0){cancel();return}begin(event,event,event.pointerId,'pointer')},{passive:true,capture:true});
    listen(root,'pointermove',event=>move(event,event.pointerId),{passive:true,capture:true});
    listen(root,'pointerup',event=>end(event,event,event.pointerId),{passive:true,capture:true});
    listen(root,'pointercancel',cancel,{passive:true,capture:true});
  }else{
    listen(root,'touchstart',event=>{mouseAfterTouch=clock()+800;if(event.touches?.length!==1){cancel();return}begin(event,event.touches[0],event.touches[0].identifier,'touch')},{passive:true,capture:true});
    listen(root,'touchmove',event=>{if(event.touches?.length!==1){cancel();return}move(event.touches[0],event.touches[0].identifier)},{passive:true,capture:true});
    listen(root,'touchend',event=>{if(event.touches?.length){cancel();return}const point=Array.from(event.changedTouches||[]).find(item=>item.identifier===tap?.id);end(event,point,point?.identifier)},{passive:true,capture:true});
    listen(root,'touchcancel',cancel,{passive:true,capture:true});
    listen(root,'mousedown',event=>{if(clock()<mouseAfterTouch)return;if(event.button>0){cancel();return}begin(event,event,'mouse','mouse')},{passive:true,capture:true});
    listen(root,'mousemove',event=>{if(tap?.kind==='mouse')move(event,'mouse')},{passive:true,capture:true});
    listen(root,'mouseup',event=>{if(tap?.kind==='mouse')end(event,event,'mouse')},{passive:true,capture:true});
  }
  listen(root,'click',click,{capture:true});
  for(const type of ['scroll','contextmenu','dragstart','visibilitychange','close','cancel'])listen(root,type,cancel,{capture:true});
  listen(root,'selectionchange',()=>{if(tap&&selected(tap.dialog))cancel()});listen(view,'blur',cancel);listen(view,'resize',cancel);
  return {cancel,destroy(){destroyed=true;cancel();removers.forEach(remove=>remove())}};
}

function createFasBackSwipe(options) {
  const root=options.document,view=options.window,clock=options.now||(()=>Date.now());
  const back=options.back||performFasDialogBack,removers=[];
  let gesture=null,clickGate=0,destroyed=false;
  const topDialog=()=>typeof view?.FasDialogLifecycle?.top==='function'?view.FasDialogLifecycle.top():Array.from(root.querySelectorAll('dialog[open]')).filter(dialog=>dialog.open).at(-1)||null;
  const native='input,textarea,select,label,details,summary,video,audio,[contenteditable],[role="slider"],[role="checkbox"],.gallery-track,.lot-gallery,.photo-viewer-stage,.photo-viewer-canvas,.seller-media-grid,.seller-tabs,.seller-progress,.seller-editor-nav,.leaflet-container,.property-map-canvas,.property-map-maparea,[data-swipe-native],[data-no-swipe]';
  const routeButtons='.category-browser-row,[data-category-node],[data-category-use],[data-category-choose-group],.buyer-recent-item,[data-buyer-open]';
  const stamp=event=>Number.isFinite(event.timeStamp)?event.timeStamp:clock();
  const selected=dialog=>{try{const value=view?.getSelection?.()||root.getSelection?.();if(!value||value.isCollapsed===true)return false;const anchor=value.anchorNode?.nodeType===3?value.anchorNode.parentElement:value.anchorNode,focus=value.focusNode?.nodeType===3?value.focusNode.parentElement:value.focusNode;return (value.isCollapsed===false||String(value).trim().length>0)&&(!anchor&&!focus||dialog.contains(anchor)||dialog.contains(focus))}catch{return false}};
  function cancel(){gesture=null}
  function snapshot(dialog){return {first:dialog.firstChild,heading:dialog.querySelector('h2'),title:dialog.querySelector('h2')?.textContent,content:dialog.querySelector('#modal-content')?.firstChild}}
  function current(state){
    if(destroyed||!state.dialog.open||topDialog()!==state.dialog||!state.dialog.contains(state.target)||state.target.isConnected===false||selected(state.dialog)||!state.header&&state.dialog.scrollTop!==state.scrollTop)return false;
    const value=snapshot(state.dialog);
    return value.first===state.first&&value.heading===state.heading&&value.title===state.title&&value.content===state.content;
  }
  function direction(state,dx,dy){const x=Math.abs(dx),y=Math.abs(dy);if(x>y*1.35)return dx>0?'right':state.header?'left':null;if(state.header&&y>x*1.35)return dy>0?'down':'up';return null}
  function start(event){
    clickGate=0;cancel();
    if(destroyed||event.touches?.length!==1)return;
    const target=event.target,dialog=target?.closest?.('dialog');
    if(!dialog||dialog!==topDialog()||selected(dialog)||dialog.id==='modal'&&(dialog.classList.contains('lot-dialog')||dialog.classList.contains('seller-dialog')&&typeof view.FasSellerBackGesture?.cancel==='function')||target.closest(native))return;
    const header=!!target.closest(fasDialogSwipeHeaders()),button=target.closest('button,a,[role="button"]');
    if(button&&!header&&!button.matches(routeButtons)&&!button.closest('.feed-menu'))return;
    const touch=event.touches[0];if(!Number.isFinite(touch.clientX)||!Number.isFinite(touch.clientY))return;
    const rect=dialog.getBoundingClientRect?.(),gutter=Math.max(0,(dialog.offsetWidth||rect?.width||0)-(dialog.clientWidth||rect?.width||0));
    if(rect&&gutter>0&&touch.clientX>=rect.right-gutter)return;
    gesture={dialog,target,header,scrollTop:dialog.scrollTop,...snapshot(dialog),id:touch.identifier,x:touch.clientX,y:touch.clientY,time:stamp(event),axis:null};
  }
  function move(event){
    const state=gesture;if(!state)return;
    if(!current(state)||event.touches?.length!==1){cancel();return}
    const touch=event.touches[0];if(touch.identifier!==state.id){cancel();return}
    const dx=touch.clientX-state.x,dy=touch.clientY-state.y;
    // WebKit may claim native scrolling before the former 12px threshold.
    // Reserve a header's very first motion, while taps and two-finger zoom stay native.
    if(state.header&&(dx!==0||dy!==0)&&event.cancelable!==false)event.preventDefault?.();
    if(Math.max(Math.abs(dx),Math.abs(dy))<12)return;
    const axis=direction(state,dx,dy);if(!axis||state.axis&&state.axis!==axis){cancel();return}state.axis=axis;
    if(!state.header&&event.cancelable!==false)event.preventDefault?.();
  }
  function end(event){
    const state=gesture;if(!state)return;
    if(!current(state)||event.touches?.length){cancel();return}
    const touch=Array.from(event.changedTouches||[]).find(item=>item.identifier===state.id);
    if(!touch){cancel();return}
    const dx=touch.clientX-state.x,dy=touch.clientY-state.y,elapsed=stamp(event)-state.time,axis=direction(state,dx,dy);
    const distance=axis==='left'||axis==='right'?Math.abs(dx):Math.abs(dy);
    const close=axis&&(!state.axis||state.axis===axis)&&elapsed>=0&&(distance>=90||distance>=55&&distance/Math.max(1,elapsed)>=0.55);
    cancel();if(!close)return;
    if(event.cancelable!==false)event.preventDefault?.();
    // Programmatic Back clicks must reach their handlers before the touch-click guard.
    try{back(state.dialog)}finally{clickGate=clock()+450}
  }
  function suppressClick(event){
    if(!clickGate||clock()>clickGate||event.detail===0||event.pointerType==='mouse')return;
    clickGate=0;event.preventDefault?.();event.stopImmediatePropagation?.();event.stopPropagation?.();
  }
  function listen(target,type,handler,settings){if(!target?.addEventListener)return;target.addEventListener(type,handler,settings);removers.push(()=>target.removeEventListener?.(type,handler,settings))}
  listen(root,'touchstart',start,{passive:true,capture:true});
  listen(root,'touchmove',move,{passive:false,capture:true});
  listen(root,'touchend',end,{passive:false,capture:true});
  listen(root,'touchcancel',cancel,{passive:true,capture:true});
  listen(root,'click',suppressClick,{capture:true});
  listen(root,'visibilitychange',cancel);
  listen(root,'selectionchange',()=>{if(gesture&&selected(gesture.dialog))cancel()});listen(root,'contextmenu',cancel,{capture:true});
  listen(view,'blur',cancel);listen(view,'resize',cancel);
  return {start,move,end,cancel,suppressClick,destroy(){cancel();clickGate=0;destroyed=true;removers.forEach(remove=>remove())}};
}

function installFasDialogSwipeHeaders(root,view){
  let queued=false,observer=null;
  function refresh(){
    queued=false;
    for(const dialog of Array.from(root.querySelectorAll('dialog[open]')).filter(node=>node.open&&!node.classList.contains('lot-dialog'))){
      const grip=Array.from(dialog.children||[]).find(node=>node.hasAttribute?.('data-dialog-back'));
      const headers=Array.from(dialog.querySelectorAll(fasDialogSwipeHeaders())).filter(node=>node!==grip&&!node.hidden&&!node.closest('[hidden]'));
      for(const header of headers){if(!header.hasAttribute('data-dialog-swipe-header'))header.setAttribute('data-dialog-swipe-header','');if(!header.hasAttribute('title'))header.setAttribute('title','Свайп в любую сторону — назад')}
      if(headers.some(node=>!node.matches('.close,.dialog-close'))){grip?.remove();continue}if(grip)continue;
      const handle=root.createElement('button');handle.type='button';handle.className='fas-dialog-grip';handle.setAttribute('data-dialog-back','');handle.setAttribute('data-dialog-swipe-header','');handle.setAttribute('aria-label','Назад. Можно смахнуть в любую сторону');handle.setAttribute('title','Назад: свайп в любую сторону');handle.innerHTML='<span aria-hidden="true"></span>';dialog.insertBefore(handle,dialog.firstChild);
    }
  }
  function schedule(){if(queued)return;queued=true;Promise.resolve().then(refresh)}
  const Observer=view?.MutationObserver||(typeof MutationObserver==='function'?MutationObserver:null);
  if(Observer){observer=new Observer(records=>{if(records.some(record=>record.type==='attributes'&&record.attributeName==='open'||record.type==='childList'&&(record.target?.closest?.('dialog')||Array.from(record.addedNodes||[]).some(node=>String(node.tagName).toUpperCase()==='DIALOG'))))schedule()});observer.observe(root.documentElement||root,{subtree:true,childList:true,attributes:true,attributeFilter:['open']})}
  root.addEventListener('click',event=>{const handle=event.target.closest?.('[data-dialog-back]');if(!handle)return;const dialog=handle.closest('dialog');event.preventDefault?.();performFasDialogBack(dialog)});
  refresh();return {refresh,destroy(){observer?.disconnect()}};
}

function installFasBackSwipe(){
  if(window.FasBackSwipe)return window.FasBackSwipe;
  const blank=createFasDialogBlankBack({document,window}),controller=createFasBackSwipe({document,window}),headers=installFasDialogSwipeHeaders(document,window);
  const api=Object.freeze({back(){const dialog=typeof window.FasDialogLifecycle?.top==='function'?window.FasDialogLifecycle.top():Array.from(document.querySelectorAll('dialog[open]')).filter(node=>node.open).at(-1);return dialog?performFasDialogBack(dialog):false},cancel(){controller.cancel();blank.cancel()},refreshHeaders:headers.refresh});
  window.FasBackSwipe=api;return api;
}
if(typeof document!=='undefined'&&typeof window!=='undefined')installFasBackSwipe();
