/* One contextual introduction per browser; the feed keeps ownership of its gestures. */
(()=>{
 'use strict';
 if(window.FasFeedTutorial||!document.body)return;
 const KEY='fas-feed-tutorial-v1';
 let seen=false;
 try{seen=localStorage.getItem(KEY)==='1'}catch{}
 const root=document.createElement('aside');root.id='feed-tutorial';root.className='feed-tutorial';root.hidden=true;
 root.setAttribute('aria-labelledby','feed-tutorial-title');
 root.innerHTML=`<div class="feed-tutorial-card"><div class="feed-tutorial-top"><span>Знакомство с лентой</span><span id="feed-tutorial-progress" aria-hidden="true">1 / 2</span></div><svg class="feed-tutorial-demo" viewBox="0 0 320 180" fill="none" aria-hidden="true"><rect class="feed-tutorial-phone" x="110" y="10" width="100" height="160" rx="19"/><rect class="feed-tutorial-screen" x="118" y="18" width="84" height="144" rx="12"/><rect class="feed-tutorial-target" x="122" y="22" width="76" height="28" rx="7"/><path class="feed-tutorial-phone-line" d="M150 27h20M145 153h30"/><g class="feed-tutorial-browse"><rect class="feed-tutorial-lot" x="128" y="60" width="64" height="39" rx="7"/><path class="feed-tutorial-phone-line" d="M136 73h38M136 82h26"/><path class="feed-tutorial-arrow" d="M82 131V67m-8 8 8-8 8 8m-16 48 8 8 8-8"/><g class="feed-tutorial-touch-vertical"><circle class="feed-tutorial-touch-halo" cx="166" cy="124" r="17"/><circle class="feed-tutorial-touch" cx="166" cy="124" r="8"/></g></g><g class="feed-tutorial-exit"><path class="feed-tutorial-arrow" d="M71 38h-34m8-8-8 8 8 8m238-8h-34m26-8 8 8-8 8"/><g class="feed-tutorial-touch-horizontal"><circle class="feed-tutorial-touch-halo" cx="160" cy="38" r="17"/><circle class="feed-tutorial-touch" cx="160" cy="38" r="8"/></g></g></svg><div class="feed-tutorial-copy" role="status" aria-live="polite"><h2 id="feed-tutorial-title"></h2><p id="feed-tutorial-description"></p></div><button type="button" class="feed-tutorial-dismiss" aria-label="Понятно, закрыть обучение">Понятно</button></div>`;
 document.body.appendChild(root);
 const title=root.querySelector('#feed-tutorial-title'),description=root.querySelector('#feed-tutorial-description'),progress=root.querySelector('#feed-tutorial-progress'),button=root.querySelector('button');
 let active=false,stage=null,epoch=0,origin=null;
 const timers=new Set();
 const reduced=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)').matches===true;
 const available=()=>document.body.classList.contains('reels')&&!document.hidden&&!document.querySelector('dialog[open]');
 function clearTimers(){for(const id of timers)clearTimeout(id);timers.clear();epoch++}
 function later(fn,delay){const version=epoch,id=setTimeout(()=>{timers.delete(id);if(active&&epoch===version&&available())fn()},delay);timers.add(id)}
 function setStage(value){
  stage=value;root.dataset.step=value;
  if(value==='static'){progress.textContent='';title.textContent='Свайпы в ленте';description.textContent='Вверх и вниз по карточке — листать лоты. Влево или вправо по свободной части верхней панели — закрыть ленту.'}
  else if(value==='close'){progress.textContent='2 / 2';title.textContent='Вернитесь к каталогу';description.textContent='Смахните влево или вправо по свободной части верхней панели.'}
  else{progress.textContent='1 / 2';title.textContent='Листайте лоты вверх и вниз';description.textContent='Проведите пальцем по карточке, чтобы увидеть следующий или предыдущий лот.'}
 }
 function dismiss(){
  if(!active)return;
  active=false;clearTimers();root.hidden=true;
  if(document.activeElement===button&&origin?.isConnected!==false)origin?.focus?.({preventScroll:true});
 }
 function sync(){
  if(active){if(!available())dismiss();return}
  if(seen||!available())return;
  seen=true;try{localStorage.setItem(KEY,'1')}catch{/* In-memory state still prevents repeated introductions. */}
  active=true;origin=document.activeElement;clearTimers();setStage(reduced()?'static':'browse');root.hidden=false;
  if(stage!=='static')later(()=>setStage('close'),3600);
  later(dismiss,7800);
 }
 button.onclick=dismiss;
 document.addEventListener('visibilitychange',sync);
 document.addEventListener('close',sync,true);
 document.addEventListener('cancel',sync,true);
 window.addEventListener('pagehide',dismiss);
 if(typeof MutationObserver==='function'){
  const observer=new MutationObserver(sync);
  observer.observe(document.body,{attributes:true,attributeFilter:['class']});
  observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['open']});
 }
 window.FasFeedTutorial=Object.freeze({sync,dismiss,state:()=>({seen,visible:active,stage})});
 sync();
})();
