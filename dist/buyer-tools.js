/* Small buyer shortcuts. Viewing history stays on this device; only seeded demo lots have shared links. */
(()=>{
 'use strict';
 const KEY='fas-recent-lots-v1',LIMIT=12;
 const modal=document.querySelector('#modal'),content=document.querySelector('#modal-content');
 if(!modal||!content||typeof openCar!=='function')return;
 const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
 const validId=id=>Number.isSafeInteger(id)&&id>0;
 const lotById=id=>cars.find(lot=>lot.id===id);
 const available=lot=>!!lot&&isLotLive(lot)&&Number.isFinite(Date.parse(lot.ends))&&Date.parse(lot.ends)>Date.now();
 const canShare=lot=>available(lot)&&lot.demo===true&&!lot.demoEdited&&!lot.sellerOwnerId;
 const clock='<svg class="ui-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11a9 9 0 1 1 2.6 7M3 4v7h7"/><path d="M12 7v5l3 2"/></svg>';
 const shareIcon='<svg class="ui-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3m-4 4 4-4 4 4M6 10H4v11h16V10h-2"/></svg>';
 let recent=[],sharing=null;
 try{const stored=JSON.parse(localStorage.getItem(KEY)||'[]');if(Array.isArray(stored))recent=[...new Set(stored.filter(validId))].slice(0,LIMIT)}catch{}
 function getRecentIds(){return recent.filter(id=>available(lotById(id))).slice(0,LIMIT)}
 function save(){try{localStorage.setItem(KEY,JSON.stringify(recent))}catch{}}
 function remember(id){if(!validId(id)||!available(lotById(id)))return;recent=[id,...getRecentIds().filter(value=>value!==id)].slice(0,LIMIT);save()}
 function activeId(){return Number(content.querySelector('[data-open-lot-id]')?.dataset.openLotId||content.querySelector('#bid-form')?.dataset.lotId)}
 function decorate(){
  if(!content.querySelector('.buyer-recent')&&modal.classList.contains('buyer-tools-dialog'))modal.classList.remove('buyer-tools-dialog');
  if(!modal.open||!modal.classList.contains('lot-dialog'))return;
  const id=activeId(),lot=lotById(id),body=content.querySelector('.purchase-body');
  if(!available(lot)||!body||body.querySelector('.buyer-lot-tools'))return;
  const row=document.createElement('div');row.className='buyer-lot-tools';row.setAttribute('role','group');row.setAttribute('aria-label','Действия с лотом');
  row.innerHTML=`<button type="button" data-buyer-share="${id}" aria-label="${canShare(lot)?'Поделиться ссылкой на лот':'Скопировать номер лота'} № ${id}" title="${canShare(lot)?'Поделиться ссылкой на лот':'Скопировать номер лота'} № ${id}">${canShare(lot)?shareIcon:uiIcon('copy')}<span>${canShare(lot)?'Поделиться лотом':'Копировать номер'}</span></button><button type="button" data-buyer-recent aria-label="Открыть историю просмотренных лотов" title="Открыть историю просмотров">${clock}<span>Недавно смотрели</span></button>${canShare(lot)?'<small>Ссылка откроется у пользователей с доступом к сайту.</small>':'<small>Локальное объявление — пока видно только на этом устройстве.</small>'}`;
  const target=body.querySelector('.lot-detail-secondary')||body.querySelector('.lot-detail-facts')||body,before=target.querySelector(target===body?'.purchase-price':'.object-attributes')||target.firstChild;
  (before?.parentElement||target).insertBefore(row,before);
 }
 const originalOpen=openCar;
 openCar=function(id,...args){
  const result=originalOpen.call(this,id,...args);
  if(validId(id)&&available(lotById(id))&&modal.open&&modal.classList.contains('lot-dialog')&&activeId()===id){modal.classList.remove('buyer-tools-dialog');remember(id);decorate()}
  return result;
 };
 function openRecent(){
  recent=getRecentIds();save();
  const rows=recent.map(id=>lotById(id));
  showModalContent(`<div class="modal-body buyer-recent"><div class="buyer-recent-heading"><div><div class="eyebrow">Вернуться к выбору</div><h2>Недавно смотрели</h2></div>${rows.length?'<button type="button" class="buyer-clear" data-buyer-clear aria-label="Очистить историю просмотренных лотов на этом устройстве">Очистить историю</button>':''}</div><p>Последние ${LIMIT} просмотренных лотов на этом устройстве. Завершённые и недоступные лоты скрыты.</p>${rows.length?'<div class="buyer-recent-list">'+rows.map(lot=>`<button type="button" class="buyer-recent-item" data-buyer-open="${lot.id}"><img data-buyer-photo="${lot.id}" src="${esc(image(lot))}" alt="" loading="lazy" decoding="async" width="100" height="80"><span><small>Лот № ${lot.id} · ${esc(lot.city)}</small><strong>${esc(lot.name)}</strong><b data-current-lot-price="${lot.id}">${esc(money(current(lot)))}</b></span>${uiIcon('chevron-right')}</button>`).join('')+'</div>':'<div class="buyer-recent-empty">'+clock+'<h3>Здесь появятся просмотренные лоты</h3><p>Откройте интересующее имущество в каталоге — потом его будет легко найти здесь.</p><button type="button" class="primary" data-buyer-close>Вернуться к лотам</button></div>'}<p class="buyer-history-note">История не передаётся другим пользователям и не синхронизируется с аккаунтом.</p></div>`);
  modal.classList.remove('plans-dialog','admin');modal.classList.add('buyer-tools-dialog');modal.scrollTop=0;
 }
 function clearRecent(){
  recent=[];let removed=false;
  try{localStorage.removeItem(KEY);removed=true}catch{try{localStorage.setItem(KEY,'[]');removed=true}catch{}}
  openRecent();
  toast(removed?'История просмотров очищена':'История скрыта в этом окне. Браузер не разрешил удалить сохранённые данные.');
 }
 function buildShareURL(id){
  if(!canShare(lotById(id)))return null;
  try{
   let url=new URL(location.href);
   if(!/^https?:$/.test(url.protocol)||/^(localhost|127\.0\.0\.1|\[::1\])$/.test(url.hostname)){
    const canonical=document.querySelector('link[rel="canonical"]')?.href;if(!canonical)return null;url=new URL(canonical);
   }
   if(url.protocol!=='https:'&&url.protocol!=='http:')return null;
   url.username='';url.password='';url.search='';url.hash='';url.searchParams.set('lot',String(id));return url.href;
  }catch{return null}
 }
 let copyDialog=null,copyOrigin=null;
 const topDialog=()=>typeof window.FasDialogLifecycle?.top==='function'?window.FasDialogLifecycle.top():Array.from(document.querySelectorAll('dialog[open]')).filter(node=>node.open).at(-1)||null;
 function copySheet(){
  if(copyDialog)return copyDialog;
  copyDialog=document.createElement('dialog');copyDialog.id='buyer-copy-dialog';copyDialog.className='buyer-copy-dialog';copyDialog.setAttribute('aria-labelledby','buyer-copy-title');document.body.appendChild(copyDialog);
  copyDialog.addEventListener('close',()=>{if(copyDialog.open)return;const origin=copyOrigin;copyOrigin=null;if(origin?.isConnected!==false)origin?.focus?.({preventScroll:true});if(typeof reelsMode!=='undefined'&&reelsMode&&!document.hidden&&typeof syncReels==='function'&&typeof swipeIndex==='function')syncReels(swipeIndex())});
  copyDialog.addEventListener('click',event=>{if(event.target===copyDialog)copyDialog.close()});
  copyDialog.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();copyDialog.close()}});
  return copyDialog;
 }
 function manualCopy(value,isLocal){
  const sheet=copySheet(),inFeed=typeof reelsMode!=='undefined'&&reelsMode,back=modal.open&&modal.classList.contains('lot-dialog')?'Вернуться к лоту':inFeed?'Вернуться к ленте':'Вернуться к каталогу';copyOrigin=document.activeElement;
  sheet.innerHTML=`<div class="modal-body buyer-copy"><header class="buyer-copy-heading"><h2 id="buyer-copy-title">${isLocal?'Номер лота':'Ссылка на лот'}</h2><button type="button" class="outline" data-buyer-copy-close aria-label="Закрыть копирование">×</button></header><p>${isLocal?'Другие посетители пока не видят это объявление. Можно сохранить его номер для себя.':'Браузер не разрешил автоматическое копирование. Выделите ссылку и скопируйте её вручную. Она откроется у пользователей с доступом к сайту.'}</p><label for="buyer-copy-value">${isLocal?'Номер':'Ссылка'}</label><input id="buyer-copy-value" type="text" readonly value="${esc(value)}"><button type="button" class="outline" data-buyer-select-copy title="Выделить текст для ручного копирования">Выделить ${isLocal?'номер':'ссылку'}</button><button type="button" class="primary buyer-copy-return" data-buyer-copy-close>${back}</button></div>`;
  if(!sheet.open)sheet.showModal();document.querySelectorAll('video').forEach(video=>video.pause?.());const input=sheet.querySelector('#buyer-copy-value');input?.focus?.();input?.select?.();
 }

 async function shareLot(id){
  if(sharing&&!sharing.current())sharing=null;
  if(sharing)return {ok:false,busy:true};
  const lot=lotById(id);if(!available(lot)){toast('Лот больше недоступен');return {ok:false}}
  const initialOpen=modal.open,initialBody=content.querySelector('.purchase-body'),initialChild=content.firstChild,initialDialog=topDialog();
  const inFeed=()=>typeof reelsMode!=='undefined'&&!!reelsMode,feedLot=()=>{try{return inFeed()&&typeof visibleLots!=='undefined'&&Array.isArray(visibleLots)&&typeof activeFeedIndex==='function'?visibleLots[activeFeedIndex()]?.id??null:null}catch{return null}};
  const initialFeed=inFeed(),initialFeedLot=feedLot();
  const sameContext=()=>topDialog()===initialDialog&&modal.open===initialOpen&&inFeed()===initialFeed&&(!initialFeed||initialFeedLot===null||feedLot()===initialFeedLot)&&(initialBody?content.contains(initialBody):content.firstChild===initialChild);
  const operation={current:sameContext};sharing=operation;
  // A -> B -> A must not revive a request that another share already replaced.
  const currentOperation=()=>sharing===operation&&sameContext();
  try{
   const url=buildShareURL(id),isLocal=!canShare(lot),value=isLocal?'Лот № '+id:url;
   if(!value){toast('Ссылка на сайт пока недоступна в этом приложении');return {ok:false}}
   const send=typeof window.FasNativeShare?.share==='function'?data=>window.FasNativeShare.share(data):typeof navigator.share==='function'?data=>navigator.share(data):null;
   if(!isLocal&&send){
    try{const result=await send({title:lot.name+' — ФАС торги',text:'Лот № '+id+' · '+money(current(lot)),url});if(result?.cancelled===true)return {ok:false,cancelled:true};return {ok:true,method:'share'}}
    catch(error){if(error?.name==='AbortError'||/^share\s+cancel(?:ed|led)?[.!]?$/i.test(String(error?.message||'').trim()))return {ok:false,cancelled:true}}
   }
   if(!currentOperation())return {ok:false,stale:true};
   if(navigator.clipboard?.writeText){try{await navigator.clipboard.writeText(value);if(currentOperation())toast(isLocal?'Номер скопирован. Объявление пока видно только на этом устройстве.':'Ссылка на лот скопирована');return {ok:true,method:'clipboard',local:isLocal}}catch{}}
   if(!currentOperation())return {ok:false,stale:true};
   manualCopy(value,isLocal);return {ok:false,manual:true,local:isLocal};
  }finally{if(sharing===operation)sharing=null}
 }
 function restoreLink(){
  const raw=new URLSearchParams(location.search||'').get('lot');if(raw===null)return false;
  const id=/^[1-9]\d{0,15}$/.test(raw)?Number(raw):NaN,lot=validId(id)?lotById(id):null;
  if(!canShare(lot)){toast('Лот по ссылке больше недоступен. Выберите другой в каталоге.');return false}
  openCar(id);return modal.open&&modal.classList.contains('lot-dialog')&&activeId()===id;
 }
 document.addEventListener('click',event=>{
  const target=event.target;
  if(target.closest?.('[data-buyer-recent]')){event.preventDefault();openRecent();return}
  const open=target.closest?.('[data-buyer-open]');if(open){event.preventDefault();openCar(Number(open.dataset.buyerOpen));return}
  const share=target.closest?.('[data-buyer-share]');if(share){event.preventDefault();void shareLot(Number(share.dataset.buyerShare));return}
  if(target.closest?.('[data-buyer-clear]')){event.preventDefault();clearRecent();return}
  if(target.closest?.('[data-buyer-copy-close]')){event.preventDefault();copyDialog?.close();return}
  if(target.closest?.('[data-buyer-close]')){event.preventDefault();modal.close();return}
  if(target.closest?.('[data-buyer-select-copy]')){const input=document.querySelector('#buyer-copy-value');input?.focus?.();input?.select?.()}
 });
 document.addEventListener('error',event=>{const target=event.target;if(!target.matches?.('img[data-buyer-photo]')||target.dataset.buyerFallback)return;target.dataset.buyerFallback='true';const category=lotById(Number(target.dataset.buyerPhoto))?.category;target.src='assets/'+(['cars','trucks','machinery','equipment','property','commercial','vessels','other'].includes(category)?category:'other')+'.svg'},true);
 const Observer=window.MutationObserver||globalThis.MutationObserver;
 if(Observer){new Observer(decorate).observe(content,{childList:true,subtree:true});new Observer(decorate).observe(modal,{attributes:true,attributeFilter:['open','class']})}
 modal.addEventListener('close',()=>{if(modal.open)return;if(modal.classList.contains('buyer-tools-dialog'))modal.classList.remove('buyer-tools-dialog')});
 window.FasBuyerTools=Object.freeze({openRecent,shareLot,clearRecent,getRecentIds,buildShareURL,restoreLink});
 restoreLink();
})();
