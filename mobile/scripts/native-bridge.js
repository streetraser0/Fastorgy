import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Geolocation } from '@capacitor/geolocation';
import { Share } from '@capacitor/share';
import { StatusBar, Style } from '@capacitor/status-bar';

if (Capacitor.isNativePlatform()) {
  // Expose only the receipt's text and optional web link, never filesystem paths.
  window.FasNativeShare = Object.freeze({
    async share(options = {}) {
      const payload = { dialogTitle: 'Поделиться' };
      if (typeof options?.title === 'string' && options.title.trim()) payload.title = options.title;
      if (typeof options?.text === 'string' && options.text.trim()) payload.text = options.text;
      if (typeof options?.url === 'string') {
        try {
          const url = new URL(options.url);
          if (url.protocol === 'https:' || url.protocol === 'http:') payload.url = url.href;
        } catch { /* Invalid or non-web links are omitted from native shares. */ }
      }
      if (!payload.text && !payload.url) throw new TypeError('Share text or a web link is required.');
      return Share.share(payload);
    }
  });
  document.documentElement.classList.add('native-app');
  // Install promotion belongs to the website, not inside an already installed app.
  document.querySelectorAll('[data-install-app], [data-pwa-install], #install-app, #pwa-install').forEach(el => { el.hidden = true; });
  StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
  // Android controls its system bar with a light surface; iOS follows its native safe area.
  if (Capacitor.getPlatform() === 'android') {
    StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {});
    StatusBar.setBackgroundColor({ color: '#FFFFFF' }).catch(() => {});
  }
  App.addListener('backButton', ({ canGoBack }) => {
    const dialog = typeof window.FasDialogLifecycle?.top === 'function' ? window.FasDialogLifecycle.top() : [...document.querySelectorAll('dialog[open]')].filter(node => node?.open).at(-1);
    if (dialog?.open) {
      if (dialog.id === 'lot-photo-viewer') { dialog.close(); return; }
      // A rejected seller Back action means the unsaved draft must stay open.
      if (dialog.classList?.contains('seller-dialog') && typeof window.FasSellerUI?.back === 'function') {
        window.FasSellerUI.back(); return;
      }
      if (typeof window.FasBackSwipe?.back === 'function') {
        if (window.FasBackSwipe.back() === true || dialog.id === 'category-picker') return;
      } else if (typeof performFasDialogBack === 'function' && !(dialog.id === 'modal' && dialog.classList?.contains('lot-dialog'))) {
        performFasDialogBack(dialog); return;
      }
      if (dialog.id === 'modal' && dialog.classList?.contains('lot-dialog') &&
          (window.FasSellerStorefront?.returnFromLot?.() || window.FasPropertyMap?.returnFromLot?.())) return;
      dialog.close(); return;
    }
    if (typeof reelsMode !== 'undefined' && reelsMode && typeof setReels === 'function') { setReels(false); return; }
    if (canGoBack) window.history.back();
    else App.minimizeApp().catch(() => {});
  });
  App.addListener('appStateChange', ({ isActive }) => {
    if (!isActive) document.querySelectorAll('video').forEach(video => video.pause());
  });
  document.addEventListener('click', event => {
    const anchor = event.target.closest?.('a[href]');
    if (!anchor || anchor.hasAttribute('download')) return;
    let url;
    try { url = new URL(anchor.href, location.href); } catch { return; }
    if (['https:', 'http:'].includes(url.protocol) && url.origin !== location.origin) {
      event.preventDefault();
      Browser.open({ url: url.href }).catch(() => {});
    }
  }, true);
  const nativeGetPosition = async (success, failure, options = {}) => {
    try {
      const permission = await Geolocation.requestPermissions({ permissions: ['location', 'coarseLocation'] });
      if (permission.location === 'denied' && permission.coarseLocation === 'denied') {
        failure?.({ code: 1, message: 'Location permission denied' }); return;
      }
      success(await Geolocation.getCurrentPosition({ enableHighAccuracy: Boolean(options.enableHighAccuracy), timeout: options.timeout || 15000, maximumAge: options.maximumAge || 300000 }));
    } catch (error) {
      const denied = /denied|permission/i.test(String(error?.message || ''));
      failure?.({ code: denied ? 1 : 2, message: denied ? 'Location permission denied' : 'Location unavailable' });
    }
  };
  try {
    Object.defineProperty(navigator.geolocation, 'getCurrentPosition', { configurable: true, value: nativeGetPosition });
  } catch { /* Native WebView geolocation remains available as its fallback. */ }
}
