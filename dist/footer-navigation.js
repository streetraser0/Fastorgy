/* Reuse the guarded home route; all other footer actions use their existing modules. */
(()=>{
 'use strict';
 const footer=document.querySelector('#footer');if(!footer)return;
 footer.addEventListener('click',event=>{
  if(event.defaultPrevented||event.ctrlKey||event.metaKey||event.altKey||event.shiftKey||event.button!==undefined&&event.button!==0)return;
  const link=event.target.closest?.('[data-footer-home]');
  if(!link||!footer.contains(link)||typeof window.FasHomeNavigation?.goHome!=='function')return;
  event.preventDefault();window.FasHomeNavigation.goHome();
 });
})();
