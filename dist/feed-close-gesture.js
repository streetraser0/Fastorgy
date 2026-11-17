/* Header/free-area return and a first-lot pull down; photo paging stays native. */
function createFasFeedSwipeClose(options) {
  const root = options.document;
  const grid = options.grid;
  const header = options.header;
  const view = options.window || (typeof window !== 'undefined' ? window : null);
  const now = options.now || (() => Date.now());
  const interactive = 'button,a,input,textarea,select,label,video,audio,summary,[contenteditable],[role="button"],.car-photo,.gallery-track,.lot-gallery,.lot-swipe-surface';
  const nativeControls = 'input,textarea,select,label,video,audio,summary,[contenteditable]';
  const photoSurface = '.car-photo,.gallery-track,.lot-gallery,.lot-swipe-surface';
  const removers = [];
  let gesture = null, destroyed = false, clickGate = 0;
  const available = () => !destroyed && root.hidden !== true && options.isFeedOpen() && !options.isBlocked();
  const time = event => Number.isFinite(event.timeStamp) ? event.timeStamp : now();
  const within = (container, target) => !!container && (container === target || container.contains(target));
  const atStart = () => options.isAtStart?.() === true;
  const context = () => options.getContext?.();
  function selected() {
    try {
      const selection = view?.getSelection?.() || root.getSelection?.();
      if (!selection || selection.isCollapsed !== false) return false;
      const inside = node => within(header, node?.nodeType === 3 ? node.parentElement : node) || within(grid, node?.nodeType === 3 ? node.parentElement : node);
      return inside(selection.anchorNode) || inside(selection.focusNode);
    } catch { return false; }
  }
  function cancel() { gesture = null; }
  function connected(state) {
    return state.context === context() && !selected() &&
      (state.header ? within(header, state.target) : within(grid, state.target)) &&
      (!state.pull || atStart());
  }
  function direction(dx, dy, state) {
    if (!state.photo && dx > 0 && dx > Math.abs(dy) * 1.35) return 'right';
    if (!state.photo && dx < 0 && -dx > Math.abs(dy) * 1.35) return 'left';
    if (state.header && dy < 0 && -dy > Math.abs(dx) * 1.35) return 'up';
    if ((state.header || state.pull) && dy > 0 && dy > Math.abs(dx) * 1.35) return 'down';
    return null;
  }
  function start(event) {
    clickGate = 0;cancel();
    if (!available() || event.defaultPrevented || selected() || event.touches?.length !== 1) return;
    const target = event.target;
    if (!target?.closest || target.closest(nativeControls)) return;
    const onHeader = within(header, target);
    const onPhoto = !onHeader && !!target.closest(photoSurface);
    const pull = !onHeader && atStart();
    if (!onHeader && target.closest(interactive)) {
      const control = target.closest('button,a,[role="button"]');
      const imageControl = control && !target.closest('button,a') && (String(control.tagName).toUpperCase() === 'IMG' || control.matches?.('.car-photo') || control.matches?.('.lot-swipe-surface'));
      if (!pull || !onPhoto || control && !imageControl) return;
    }
    if (!onHeader && !within(grid, target)) return;
    // Compact screens scroll the lot details independently. A downward gesture
    // there belongs to that native scroller, even while the first lot is open.
    const details = !onHeader && target.closest('.card-body');
    if (details && details.scrollHeight > details.clientHeight + 1 &&
        /^(auto|scroll)$/.test(view?.getComputedStyle?.(details)?.overflowY || '')) return;
    const touch = event.touches[0];
    if (!Number.isFinite(touch.clientX) || !Number.isFinite(touch.clientY)) return;
    gesture = { id: touch.identifier, x: touch.clientX, y: touch.clientY, time: time(event), target, header: onHeader, photo: onPhoto, pull, context: context(), axis: null };
  }
  function move(event) {
    const state = gesture;
    if (!state) return;
    if (!available() || !connected(state) || event.touches?.length !== 1) { cancel(); return; }
    const touch = event.touches[0];
    if (touch.identifier !== state.id) { cancel(); return; }
    const dx = touch.clientX - state.x, dy = touch.clientY - state.y;
    const x = Math.abs(dx), y = Math.abs(dy);
    // Claim a header's first movement, or a downward pull at the true first lot,
    // before WebKit commits it to native scrolling. Pinch and photo paging stay native.
    if ((state.header && (x || y) || state.pull && dy > 0 && dy > x * 1.35) && event.cancelable !== false) event.preventDefault?.();
    if (!state.axis && Math.max(x, y) >= 12) {
      state.axis = direction(dx, dy, state);
      if (!state.axis && (state.photo || dx < 0 || y > x * 1.1)) { cancel(); return; }
    }
    // Only the first lot's downward pull is a vertical return from the content.
    if (!state.axis) return;
    if (direction(dx, dy, state) !== state.axis) { cancel(); return; }
    if (event.cancelable !== false && !(state.header || state.pull && state.axis === 'down')) event.preventDefault?.();
  }
  function end(event) {
    const state = gesture;
    if (!state) return;
    if (!available() || !connected(state) || event.touches?.length) { cancel(); return; }
    const touch = Array.from(event.changedTouches || []).find(item => item.identifier === state.id);
    if (!touch) { cancel(); return; }
    const dx = touch.clientX - state.x, dy = touch.clientY - state.y, elapsed = time(event) - state.time;
    // Browsers can coalesce a fast swipe or mark its final events as
    // noncancelable after native scrolling. Neither invalidates its direction.
    const axis = state.axis || direction(dx, dy, state);
    const fast = distance => distance >= 55 && distance / Math.max(1, elapsed) >= 0.55;
    const distance = axis === 'left' ? -dx : dx;
    const horizontal = (axis === 'right' || axis === 'left') && distance > Math.abs(dy) * 1.35 && (distance >= 90 || fast(distance));
    const verticalDistance = axis === 'up' ? -dy : dy;
    const vertical = (state.header || state.pull && axis === 'down') && (axis === 'up' || axis === 'down') && verticalDistance > Math.abs(dx) * 1.35 && (verticalDistance >= 75 || fast(verticalDistance));
    const close = elapsed >= 0 && (horizontal || vertical);
    cancel();
    if (close) { if (event.cancelable !== false) event.preventDefault?.(); clickGate=now()+450;options.closeFeed(); }
  }
  function suppressClick(event){if(!clickGate||now()>clickGate||event.detail===0||event.pointerType==='mouse')return;clickGate=0;event.preventDefault?.();event.stopImmediatePropagation?.();event.stopPropagation?.()}
  function listen(target, type, handler, settings) {
    if (!target?.addEventListener) return;
    target.addEventListener(type, handler, settings);
    removers.push(() => target.removeEventListener(type, handler, settings));
  }
  listen(root, 'touchstart', start, { passive: true, capture: true });
  listen(root, 'touchmove', move, { passive: false, capture: true });
  listen(root, 'touchend', end, { passive: false, capture: true });
  listen(root, 'touchcancel', cancel, { passive: true, capture: true });
  listen(root, 'click', suppressClick, { capture: true });
  listen(root, 'visibilitychange', cancel);
  listen(root, 'contextmenu', cancel, { capture: true });
  listen(root, 'selectionchange', () => { if (selected()) cancel(); });
  listen(root, 'close', cancel, { capture: true });
  listen(root, 'cancel', cancel, { capture: true });
  listen(view, 'blur', cancel);
  listen(view, 'resize', cancel);
  return { start, move, end, cancel, suppressClick, destroy() { cancel(); clickGate=0;destroyed = true; removers.forEach(remove => remove()); } };
}

function installFasFeedSwipeClose() {
  const header = document.querySelector('.reels-header'), grid = document.querySelector('#grid');
  if (!header || !grid || header.dataset.feedSwipeClose === 'ready') return null;
  header.dataset.feedSwipeClose = 'ready';
  const hint = document.createElement('span');
  hint.className = 'feed-close-hint';
  hint.textContent = 'Свайп по верхней панели в любую сторону — назад';
  header.appendChild(hint);
  return createFasFeedSwipeClose({
    document, window, header, grid,
    isFeedOpen: () => typeof reelsMode !== 'undefined' && reelsMode,
    isBlocked: () => !!document.querySelector('dialog[open]'),
    isAtStart: () => typeof activeFeedIndex === 'function' && activeFeedIndex() === 0 && grid.scrollTop <= 1,
    getContext: () => setReels.returnPosition,
    closeFeed: () => setReels(false)
  });
}
if (typeof document !== 'undefined') installFasFeedSwipeClose();
