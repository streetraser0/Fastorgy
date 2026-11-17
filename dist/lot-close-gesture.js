/* Four-way header return and deliberate pulls from the lot's scroll edges. */
function createFasRightSwipeClose(options) {
  const dialog = options.dialog;
  const view = options.window || (typeof window !== 'undefined' ? window : null);
  const now = options.now || (() => Date.now());
  const root = options.document || view?.document || (typeof document !== 'undefined' ? document : null);
  const interactive = 'button,a,input,textarea,select,label,video,audio,summary,[contenteditable],[role="button"]';
  const nativeControls = 'input,textarea,select,label,video,audio,summary,[contenteditable]';
  let gesture = null, destroyed = false, clickGate = 0;
  const removers = [];
  const topDialog=()=>typeof view?.FasDialogLifecycle?.top==='function'?view.FasDialogLifecycle.top():root?.querySelectorAll?Array.from(root.querySelectorAll('dialog[open]')).filter(node=>node.open).at(-1):null;
  const available = () => !destroyed && !!dialog.open && dialog.classList.contains('lot-dialog') && (!root?.querySelectorAll&&typeof view?.FasDialogLifecycle?.top!=='function' || topDialog()===dialog);
  const time = event => Number.isFinite(event.timeStamp) ? event.timeStamp : now();
  const firstPhotoEdge = track => !!track&&Math.abs(Number(track.scrollLeft)||0)<=4;
  function selectedInsideDialog() {
    let selection;
    try{selection=view?.getSelection?.()||root?.getSelection?.()}catch{return false}
    if(selection?.isCollapsed!==false)return false;
    const inside=node=>{const target=node?.nodeType===3?node.parentElement||node.parentNode:node;return !!target&&dialog.contains(target)};
    return inside(selection.anchorNode)||inside(selection.focusNode);
  }
  function contentSnapshot() {
    const content=dialog.querySelector?.('#modal-content')||dialog;
    const body=content.querySelector?.('[data-open-lot-id]')||content.querySelector?.('#bid-form')||content.firstChild;
    return {content,body,lotId:body?.dataset?.openLotId||body?.dataset?.lotId||''};
  }
  function current(state) {
    if(!available()||selectedInsideDialog()||!dialog.contains(state.target))return false;
    if(state.photo&&state.axis==='right'&&(!state.firstPhoto||!dialog.contains(state.track)||!firstPhotoEdge(state.track)))return false;
    const snapshot=contentSnapshot();
    return snapshot.content===state.content&&snapshot.body===state.body&&snapshot.lotId===state.lotId;
  }
  function direction(state,dx,dy) {
    const x=Math.abs(dx),y=Math.abs(dy);
    if(state.header){if(x>y*1.3)return dx>0?'right':'left';if(y>x*1.3)return dy>0?'down':'up';return 'native'}
    // The first photo has no previous frame: a right pull returns one level.
    // A gesture starting on later frames always remains native pagination.
    if(state.photo){if(state.firstPhoto&&dx>0&&x>y*1.3)return 'right';return state.top&&dy>0&&y>x*1.3?'down':'native'}
    if(dx>0&&x>y*1.3)return 'right';
    return state.bottom&&dy<0&&y>x*1.3?'up':'native';
  }
  function restore(state) {
    if (!state?.visual) return;
    dialog.style.transform = state.transform;
    dialog.style.opacity = state.opacity;
  }
  function cancel() { const state = gesture; gesture = null; restore(state); }
  function start(event) {
    clickGate=0;cancel();
    if (!available() || selectedInsideDialog() || event.touches?.length !== 1 || (view?.visualViewport?.scale||1)>1.05) return;
    const target = event.target;
    if (!target?.closest || !dialog.contains(target) || target.closest(nativeControls)) return;
    // The real toolbar is almost entirely buttons and a clickable brand logo.
    // A tap still belongs to the control; only a deliberate swipe returns.
    const header=!!target.closest('.dialog-brand,.lot-quick-access,.lot-modal-header,.fas-dialog-grip,[data-dialog-swipe-header]');
    const track = target.closest('.gallery-track') || target.closest('.lot-gallery')?.querySelector('.gallery-track');
    const photo=!!(track||target.closest('.lot-swipe-surface,.car-photo'));
    if(!header&&!photo&&target.closest(interactive)||photo&&dialog.scrollTop>4)return;
    const firstPhoto=photo&&firstPhotoEdge(track)&&!target.closest('button,a,input,textarea,select,video,audio,summary,[contenteditable]');
    const touch = event.touches[0];
    if (!Number.isFinite(touch.clientX) || !Number.isFinite(touch.clientY)) return;
    const rect = dialog.getBoundingClientRect?.();
    if (rect && (touch.clientX < rect.left || touch.clientX > rect.right || touch.clientY < rect.top || touch.clientY > rect.bottom)) return;
    const bottom=Number.isFinite(dialog.scrollHeight)&&dialog.clientHeight>0&&dialog.scrollTop+dialog.clientHeight>=dialog.scrollHeight-4;
    gesture = { id: touch.identifier, x: touch.clientX, y: touch.clientY, time: time(event), axis: null, dx: 0, dy: 0, header, photo, track, firstPhoto, top:dialog.scrollTop<=4, bottom, target, claimed:false, visual: false,...contentSnapshot() };
  }
  function move(event) {
    const state = gesture;
    if (!state) return;
    if (!current(state) || event.touches?.length !== 1) { cancel(); return; }
    const touch = event.touches[0];
    if (touch.identifier !== state.id) { cancel(); return; }
    state.dx = touch.clientX - state.x; state.dy = touch.clientY - state.y;
    const x = Math.abs(state.dx), y = Math.abs(state.dy);
    const candidate=direction(state,state.dx,state.dy);let prevented=false;
    // WebKit can commit native scrolling after the very first small move.
    // Reserve our single-finger surface before the recognition threshold;
    // a stationary tap and gallery/reading directions remain untouched.
    if(Math.max(x,y)>0&&state.axis!=='native'&&(state.header||candidate!=='native')&&event.cancelable!==false){
      event.preventDefault?.();state.claimed=true;prevented=true;
    }
    if (!state.axis && Math.max(x, y) >= 10) state.axis=candidate;
    if (!state.axis || state.axis === 'native') return;
    const vertical = state.axis === 'down' || state.axis === 'up',delta=vertical?state.dy:state.dx,positive=state.axis==='down'||state.axis==='right';
    if ((positive ? delta<=0 : delta>=0) || event.cancelable===false&&!state.header&&!state.claimed) { cancel(); return; }
    if (event.cancelable===false) return;
    if(!prevented)event.preventDefault?.();
    if (view?.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    if (!state.visual) {
      state.transform = dialog.style.transform || ''; state.opacity = dialog.style.opacity || ''; state.visual = true;
    }
    const offset = Math.max(-180, Math.min(180, delta));
    dialog.style.transform = (vertical ? 'translateY(' : 'translateX(') + offset + 'px)';
    dialog.style.opacity = String(1 - Math.min(Math.abs(offset) / 700, 0.2));
  }
  function end(event) {
    const state = gesture;
    if (!state) return;
    if (!current(state) || event.touches?.length || event.cancelable === false&&!state.header&&!state.claimed) { cancel(); return; }
    const touch = Array.from(event.changedTouches || []).find(item => item.identifier === state.id);
    if (!touch) { cancel(); return; }
    const dx = touch.clientX - state.x, dy = touch.clientY - state.y, elapsed = time(event) - state.time;
    const axis=state.axis||direction(state,dx,dy),distance=axis==='right'?dx:axis==='left'?-dx:axis==='down'?dy:axis==='up'?-dy:0,vertical=axis==='down'||axis==='up';
    const close=axis&&axis!=='native'&&elapsed>=0&&distance>(vertical?Math.abs(dx):Math.abs(dy))*1.3&&(distance>=90||distance>=55&&distance/Math.max(1,elapsed)>=0.55);
    cancel();
    if (close) { if(event.cancelable!==false)event.preventDefault?.(); clickGate=now()+450;if(!view?.FasSellerStorefront?.returnFromLot?.()&&!view?.FasPropertyMap?.returnFromLot?.())dialog.close(); }
  }
  function suppressClick(event){if(!clickGate||now()>clickGate||event.detail===0||event.pointerType==='mouse')return;clickGate=0;event.preventDefault?.();event.stopImmediatePropagation?.();event.stopPropagation?.()}
  function listen(type, callback, settings) {
    dialog.addEventListener(type, callback, settings);
    removers.push(() => dialog.removeEventListener(type, callback, settings));
  }
  listen('touchstart', start, { passive: true });
  listen('touchmove', move, { passive: false });
  listen('touchend', end, { passive: false });
  listen('touchcancel', cancel, { passive: true });
  listen('close', cancel);
  if(root?.addEventListener){const clearGate=()=>{clickGate=0};root.addEventListener('touchstart',clearGate,{passive:true,capture:true});root.addEventListener('click',suppressClick,{capture:true});removers.push(()=>root.removeEventListener?.('touchstart',clearGate,{capture:true}),()=>root.removeEventListener?.('click',suppressClick,{capture:true}))}
  if(root?.addEventListener){
    const cancelSelection=()=>{if(gesture&&selectedInsideDialog())cancel()};
    root.addEventListener('selectionchange',cancelSelection);root.addEventListener('contextmenu',cancelSelection,{capture:true});
    removers.push(()=>root.removeEventListener?.('selectionchange',cancelSelection),()=>root.removeEventListener?.('contextmenu',cancelSelection,{capture:true}));
  }
  const Observer = options.MutationObserver || (typeof MutationObserver !== 'undefined' ? MutationObserver : null);
  // Price, gallery counters and toolbar icons may update during a drag. Their
  // text does not change which lot is open; replacing the body or an overlay does.
  const observer = Observer ? new Observer(() => {if(!available()||gesture&&!current(gesture))cancel()}) : null;
  observer?.observe(dialog, { attributes: true, attributeFilter: ['open', 'class'], childList: true, subtree: true });
  return { start, move, end, cancel, suppressClick, destroy() { cancel(); clickGate=0;destroyed = true; removers.forEach(remove => remove()); observer?.disconnect(); } };
}

function installFasRightSwipeClose() {
  const dialog = document.querySelector('#modal');
  if (!dialog || dialog.dataset.rightSwipeClose === 'ready') return null;
  dialog.dataset.rightSwipeClose = 'ready';
  return createFasRightSwipeClose({ dialog, document, window });
}
if (typeof document !== 'undefined') installFasRightSwipeClose();
