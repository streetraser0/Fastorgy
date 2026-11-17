/* Two taps add a lot once; native scrolling and explicit controls keep priority. */
function createLotGestureController(options) {
  const grid = options.grid;
  const delay = options.delay || 320;
  const now = options.now || (() => Date.now());
  const schedule = options.setTimeout || setTimeout;
  const unschedule = options.clearTimeout || clearTimeout;
  let pending = null, lastTap = null, press = null, blockedUntil = 0, destroyed = false;
  const listeners = [];
  const interactive = 'button,a,input,textarea,select,video,summary,[contenteditable],[role="button"]';
  const point = event => ({ x: Number(event.clientX) || 0, y: Number(event.clientY) || 0 });
  const closeEnough = (a, b, distance) => Math.hypot(a.x - b.x, a.y - b.y) <= distance;
  function surface(target) {
    if (!target || typeof target.closest !== 'function' || target.closest(interactive)) return null;
    const card = target.closest('.card[data-lot]');
    return card && grid.contains(card) ? card : null;
  }
  function clearPending() { if (pending !== null) unschedule(pending); pending = null; }
  function cancel(blockGhost = false) {
    clearPending(); lastTap = null; press = null;
    if (blockGhost) blockedUntil = now() + 450;
  }
  function pointerDown(event) {
    if (destroyed) return;
    if (event.isPrimary === false || (event.pointerType === 'mouse' && event.button !== 0)) { cancel(true); return; }
    const card = surface(event.target);
    if (!card) { cancel(); return; }
    const p = point(event);
    if (lastTap && (lastTap.card !== card || !closeEnough(lastTap, p, 32))) cancel();
    // Do not open the first tap's card underneath the user's second finger hold.
    if (lastTap && lastTap.card === card && now() - lastTap.time <= delay) clearPending();
    press = { card, id: event.pointerId, x: p.x, y: p.y, time: now(), moved: false };
  }
  function pointerMove(event) {
    if (!press || (event.pointerId !== undefined && press.id !== undefined && event.pointerId !== press.id)) return;
    if (!closeEnough(press, point(event), 12)) {
      clearPending(); lastTap = null; press.moved = true; blockedUntil = now() + 450;
    }
  }
  function pointerUp(event) {
    if (!press) return;
    if ((event.pointerId !== undefined && press.id !== undefined && event.pointerId !== press.id) ||
        press.moved || now() - press.time > 400 || !closeEnough(press, point(event), 12)) {
      cancel(true); return;
    }
    press = null;
  }
  function click(event) {
    if (destroyed || (event.button !== undefined && event.button !== 0)) return;
    const card = surface(event.target);
    if (!card) {
      // Hearts, CTA buttons, gallery arrows and form controls remain immediate.
      cancel(); if (options.onImmediate) options.onImmediate(event); return;
    }
    if (options.isModalOpen && options.isModalOpen()) { cancel(); return; }
    if (event.detail === 0 && !event.pointerType) {
      cancel(); if (options.onImmediate) options.onImmediate(event); return;
    }
    if (now() < blockedUntil) return;
    const p = point(event), time = now(), id = Number(card.dataset.lot);
    if (!Number.isFinite(id)) return;
    if (lastTap && lastTap.card === card && lastTap.id === id && time - lastTap.time <= delay && closeEnough(lastTap, p, 32)) {
      clearPending(); lastTap = null; press = null;
      if (event.cancelable && event.preventDefault) event.preventDefault();
      const added = options.addFavorite(id, card);
      if (added !== null && options.feedback) options.feedback(card, id, added);
      return;
    }
    clearPending(); lastTap = { card, id, x: p.x, y: p.y, time };
    pending = schedule(() => {
      pending = null; lastTap = null;
      if (destroyed || !grid.contains(card) || (options.isModalOpen && options.isModalOpen())) return;
      if (options.onSingleTap) options.onSingleTap(event, card, id);
    }, delay);
  }
  function listen(target, type, handler, config) {
    if (!target || !target.addEventListener) return;
    target.addEventListener(type, handler, config);
    listeners.push(() => target.removeEventListener(type, handler, config));
  }
  const root = options.document || (typeof document !== 'undefined' ? document : null);
  const view = options.window || (typeof window !== 'undefined' ? window : null);
  if (view && view.PointerEvent) {
    listen(grid, 'pointerdown', pointerDown, { passive: true });
    listen(grid, 'pointermove', pointerMove, { passive: true });
    listen(grid, 'pointerup', pointerUp, { passive: true });
    listen(grid, 'pointercancel', () => cancel(true), { passive: true });
  } else {
    const touchPointer = (event, touch) => ({ target: event.target, pointerId: touch.identifier, pointerType: 'touch', isPrimary: true, button: 0, clientX: touch.clientX, clientY: touch.clientY });
    listen(grid, 'touchstart', event => {
      if (event.touches.length !== 1) { cancel(true); return; }
      pointerDown(touchPointer(event, event.touches[0]));
    }, { passive: true });
    listen(grid, 'touchmove', event => {
      if (event.touches.length !== 1) { cancel(true); return; }
      pointerMove(touchPointer(event, event.touches[0]));
    }, { passive: true });
    listen(grid, 'touchend', event => {
      if (event.touches.length || !event.changedTouches.length) { cancel(true); return; }
      pointerUp(touchPointer(event, event.changedTouches[0]));
    }, { passive: true });
    listen(grid, 'touchcancel', () => cancel(true), { passive: true });
    listen(grid, 'mousedown', event => pointerDown({ target: event.target, pointerType: 'mouse', isPrimary: true, button: event.button, clientX: event.clientX, clientY: event.clientY }), { passive: true });
    listen(grid, 'mousemove', pointerMove, { passive: true });
    listen(grid, 'mouseup', pointerUp, { passive: true });
  }
  listen(grid, 'scroll', () => cancel(), { passive: true });
  // In the regular mobile catalogue, native scrolling belongs to the page.
  // Cancel delayed taps there too, so a scrolling finger never opens a lot.
  listen(view, 'scroll', () => cancel(), { passive: true });
  listen(grid, 'contextmenu', () => cancel(true));
  listen(grid, 'dblclick', event => { if (surface(event.target) && event.preventDefault) event.preventDefault(); });
  listen(root, 'pointerdown', event => { if (!grid.contains(event.target)) cancel(); }, { passive: true, capture: true });
  const Observer = options.MutationObserver || (typeof MutationObserver !== 'undefined' ? MutationObserver : null);
  const observers = [];
  if (Observer) {
    // Only direct lot-list replacements matter; countdown text changes must not cancel taps.
    const listObserver = new Observer(() => cancel()); listObserver.observe(grid, { childList: true }); observers.push(listObserver);
    if (root && root.body) { const modeObserver = new Observer(() => cancel()); modeObserver.observe(root.body, { attributes: true, attributeFilter: ['class'] }); observers.push(modeObserver); }
    const modal = options.modal;
    if (modal) { const modalObserver = new Observer(() => cancel()); modalObserver.observe(modal, { attributes: true, attributeFilter: ['open'] }); observers.push(modalObserver); }
  }
  return {
    click, pointerDown, pointerMove, pointerUp, cancel,
    destroy() { destroyed = true; cancel(); listeners.forEach(remove => remove()); observers.forEach(observer => observer.disconnect()); }
  };
}

function installFasLotGestures() {
  const grid = document.querySelector('#grid');
  if (!grid || grid.dataset.lotGestures === 'ready') return null;
  grid.dataset.lotGestures = 'ready';
  const original = grid.onclick;
  const modal = document.querySelector('#modal');
  const controller = createLotGestureController({
    grid, modal,
    isModalOpen: () => Boolean(modal && modal.open),
    onImmediate: event => { if (original) original.call(grid, event); },
    onSingleTap: event => { if (original) original.call(grid, event); },
    addFavorite(id) {
      if (typeof cars !== 'undefined' && !cars.some(lot => lot.id === id)) return null;
      const added = !saved.includes(id);
      if (added) {
        if (typeof toggleLotFavorite === 'function') { if (toggleLotFavorite(id) === false) return null; }
        else {
          const previous = saved; saved = [...saved, id];
          try { const result = persist(['fas-favs']); if (result && result['fas-favs'] === false) throw Error('Favorite storage unavailable'); }
          catch { saved = previous; toast('Избранное не сохранено. Проверьте доступ к памяти браузера.'); return null; }
        }
      }
      grid.querySelectorAll('[data-fav="' + id + '"]').forEach(button => {
        button.classList.add('saved'); button.setAttribute('aria-pressed', 'true');
        button.setAttribute('aria-label', 'Убрать из избранного'); button.innerHTML = uiIcon('heart', true);
      });
      const count = document.querySelector('#fav-count'); if (count) count.textContent = String(saved.length);
      return added;
    },
    feedback(card, id, added) {
      const photo = card.querySelector('.car-photo') || card;
      photo.querySelectorAll('.lot-like-pulse').forEach(pulse => pulse.remove());
      const pulse = document.createElement('span'); pulse.className = 'lot-like-pulse';
      pulse.setAttribute('aria-hidden', 'true'); pulse.innerHTML = uiIcon('heart', true); photo.appendChild(pulse);
      setTimeout(() => pulse.remove(), 700);
      toast(added ? 'Лот добавлен в избранное' : 'Лот уже в избранном');
    }
  });
  grid.onclick = controller.click;
  return controller;
}
