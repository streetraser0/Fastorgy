/* Local question drafts only. No server transport, sent/read state or invented replies. */
function createFasMessageDraftStore(options={}) {
 const storage=options.storage,now=options.now||(()=>Date.now()),PREFIX='fas-message-drafts-v1:',MAX_DRAFTS=40,MAX_BODY=4000,MAX_RAW=240000;
 const ownerId=value=>typeof value==='string'&&value.trim()&&value.length<=256&&!/[\u0000-\u001f\u007f]/.test(value)?value:'';
 const validId=id=>Number.isSafeInteger(id)&&id>0;
 const key=owner=>{if(!ownerId(owner))throw Error('Не удалось определить профиль. Откройте кабинет и сохраните профиль.');return PREFIX+encodeURIComponent(owner)};
 const clean=row=>row&&validId(row.lotId)&&typeof row.sellerKey==='string'&&row.sellerKey.length>0&&row.sellerKey.length<=600&&typeof row.body==='string'&&row.body.length<=MAX_BODY&&!row.body.includes('\0')&&Number.isFinite(Date.parse(row.updatedAt))?{lotId:row.lotId,sellerKey:row.sellerKey,body:row.body,updatedAt:row.updatedAt}:null;
 function read(owner){
  let raw;try{raw=storage.getItem(key(owner))}catch{throw Error('Браузер не разрешил прочитать черновики. Проверьте доступ к памяти устройства.')}if(raw===null)return {owner,raw:null,drafts:[]};
  if(typeof raw!=='string'||raw.length>MAX_RAW)throw Error('Черновики недоступны: размер или формат хранения не поддерживается.');
  let parsed;try{parsed=JSON.parse(raw)}catch{throw Error('Черновики повреждены. Данные не перезаписаны.')}
  if(!parsed||parsed.version!==1||parsed.owner!==owner||!Array.isArray(parsed.drafts)||parsed.drafts.length>MAX_DRAFTS)throw Error('Черновики принадлежат другому профилю или имеют неподдерживаемый формат.');
  const rows=parsed.drafts.map(clean);if(rows.some(row=>!row)||new Set(rows.map(row=>row.lotId+'|'+row.sellerKey)).size!==rows.length)throw Error('Часть черновиков повреждена. Данные не перезаписаны.');
  return {owner,raw,drafts:rows};
 }
 function commit(owner,expectedRaw,rows){
  let current;try{current=storage.getItem(key(owner))}catch{throw Error('Браузер не разрешил проверить сохранённый черновик. Текст остаётся здесь.')}
  if(current!==expectedRaw)throw Error('Черновики изменились в другой вкладке. Текст остаётся здесь; откройте список заново перед сохранением.');
  if(rows.length>MAX_DRAFTS)throw Error('Можно хранить до 40 черновиков. Удалите ненужный черновик перед сохранением нового.');
  const raw=JSON.stringify({version:1,owner,drafts:rows});if(raw.length>MAX_RAW)throw Error('Черновики достигли общего лимита хранения. Сократите вопрос или удалите ненужный черновик. Текст остаётся здесь.');try{storage.setItem(key(owner),raw)}catch{throw Error('Черновик не сохранён. Освободите место или проверьте доступ к памяти браузера. Текст остаётся в этом окне.')}return {owner,raw,drafts:rows};
 }
 function save(owner,snapshot,record){
  const row=clean({...record,updatedAt:new Date(now()).toISOString()});if(!row)throw Error('Вопрос должен содержать не более 4000 символов и быть связан с лотом.');
  if(!snapshot||snapshot.owner!==owner||!Array.isArray(snapshot.drafts))throw Error('Сначала откройте актуальный список черновиков.');
  return commit(owner,snapshot.raw,[row,...snapshot.drafts.filter(item=>item.lotId!==row.lotId||item.sellerKey!==row.sellerKey)]);
 }
 function remove(owner,snapshot,lotId,sellerKey){if(!snapshot||snapshot.owner!==owner)throw Error('Черновик открыт в другом профиле. Откройте актуальный список.');return commit(owner,snapshot.raw,snapshot.drafts.filter(row=>row.lotId!==lotId||row.sellerKey!==sellerKey))}
 return Object.freeze({read,save,remove,limits:Object.freeze({drafts:MAX_DRAFTS,body:MAX_BODY}),key});
}
(()=>{
 'use strict';
 if(window.FasMessages)return;
 const document=window.document,modal=document.querySelector('#modal'),content=document.querySelector('#modal-content');
 if(!modal||!content||typeof openCar!=='function')return;
 const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
 const text=(value,max=160)=>typeof value==='string'?value.trim().replace(/\s+/g,' ').slice(0,max):'';
 const validId=id=>Number.isSafeInteger(id)&&id>0;
 const own=lot=>typeof isOwnLot==='function'&&isOwnLot(lot);
 const lotById=id=>typeof cars!=='undefined'&&Array.isArray(cars)?cars.find(lot=>lot.id===Number(id)):null;
 const available=lot=>!!lot&&validId(lot.id)&&!['draft','paused','deleted','cancelled','unavailable'].includes(lot.status)&&typeof isLotLive==='function'&&isLotLive(lot);
 const top=()=>window.FasDialogLifecycle?.top?.()||Array.from(document.querySelectorAll('dialog[open]')).filter(dialog=>dialog.open).at(-1)||null;
 const store=createFasMessageDraftStore({storage:localStorage}),recovery=new Map();
 let active=null,owner='',snapshot={raw:null,drafts:[]},origin=null,returnState=null,session=0,cleaned=0,deletePending=false,scopeRaw,scopeId='',scopeReadable=false,storageError='';
 const dialog=document.createElement('dialog');dialog.id='messages-dialog';dialog.className='messages-dialog';dialog.setAttribute('aria-labelledby','messages-title');document.body.appendChild(dialog);
 const nativeClose=dialog.close.bind(dialog);
 function currentOwner(){
  try{
   const raw=localStorage.getItem('fas-seller-workspace-v1');
   if(raw!==scopeRaw){scopeRaw=raw;scopeId='';scopeReadable=false;if(raw!==null){const value=JSON.parse(raw);if(value?.version!==1||typeof value.profile?.id!=='string'||!value.profile.id.trim()||value.profile.id.length>256)return '';scopeId=value.profile.id}scopeReadable=true}
   if(!scopeReadable)return '';
   const id=scopeId||window.FasSellerUI?.getProfile?.()?.id;
   return typeof id==='string'&&id.trim()&&id.length<=256?id:'';
  }catch{return ''}
 }
 function identity(lot){
  if(!lot)return '';const seller=text(lot.sellerOwnerId,256);if(seller)return 'private:'+seller;
  const ids=[...new Set([lot.sellerOrganizationId,lot.organizationId,lot.orgId,lot.sellerOrgId].map(value=>typeof value==='number'&&Number.isSafeInteger(value)?String(value):text(value,256)).filter(Boolean))];
  if(ids.length===1)return 'organization:'+ids[0];
  return 'listing:'+lot.id+':'+text(lot.sellerType,30)+':'+text(lot.bank||lot.sellerName||lot.organizationName||lot.publicDisplayName||'Продавец',200);
 }
 function sellerName(lot){return text(lot?.sellerName||lot?.bank||lot?.organizationName||lot?.publicDisplayName)||'Продавец'}
 function safePhoto(lot){
  const fallback='assets/'+(['cars','trucks','property','commercial','machinery','equipment','vessels','electronics','other'].includes(lot?.category)?lot.category:'other')+'.svg';
  try{const value=typeof image==='function'?image(lot):lot?.image,item=typeof lotMediaItem==='function'?lotMediaItem(lot,{url:value}):null;if(item?.type!=='image')return fallback;return window.FasResponsiveMedia?.image?.(item.url)?.src||item.url}catch{return fallback}
 }
 function link(lot){
  if(lot?.demo!==true||lot.demoEdited||lot.sellerOwnerId)return '';
  try{const url=new URL(location.href);if(url.protocol!=='https:'||url.username||url.password)return '';url.search='';url.hash='';url.searchParams.set('lot',String(lot.id));return url.href}catch{return ''}
 }
 function field(){return dialog.querySelector('[data-message-body]')}
 function body(){return field()?.value??active?.body??''}
 function dirty(){return !!active&&body()!==active.body}
 function rememberRecovery(){if(!owner||!active||!dirty())return;recovery.set(JSON.stringify([owner,active.lotId,active.sellerKey]),{...active,owner,body:body(),updatedAt:new Date().toISOString(),memoryOnly:true})}
 function error(message){const box=dialog.querySelector('[data-messages-error]');if(box){box.hidden=!message;box.textContent=message}}
 function load(){try{snapshot=store.read(owner);storageError='';return true}catch(reason){snapshot=null;storageError=reason.message||'Не удалось прочитать черновики.';error(storageError);return false}}
 function ensureOwner(){
  const next=currentOwner();if(next===owner)return !!next||!active;
  rememberRecovery();owner=next;active=null;deletePending=false;snapshot={raw:null,drafts:[]};renderInbox();if(owner)load();renderInbox();error('Профиль изменился. Открыт отдельный список; несохранённый текст прежнего профиля остаётся только в памяти этой страницы.');return false;
 }
 function currentLot(){const lot=active&&lotById(active.lotId);return lot&&identity(lot)===active.sellerKey&&!own(lot)?lot:null}
 function canEdit(){return available(currentLot())}
 const header=(title,sub='')=>'<header class="messages-header" data-dialog-swipe-header><div><span class="messages-eyebrow">Личный кабинет</span><h2 id="messages-title">'+esc(title)+'</h2>'+(sub?'<p>'+esc(sub)+'</p>':'')+'</div><button class="outline dialog-close" type="button" data-messages-close aria-label="Вернуться назад">×</button></header>';
 const notice='<p class="messages-demo" role="note"><b>Демоверсия · черновики на этом устройстве.</b> Доставка сообщений продавцам и ответы ещё не подключены. Сохранение вопроса не отправляет его другому пользователю.</p>';
 const errorHTML='<p class="messages-error" data-messages-error role="alert" hidden></p>';
 function ownRows(){const rows=snapshot?.drafts?.slice()||[];for(const row of recovery.values())if(row.owner===owner){const index=rows.findIndex(item=>item.lotId===row.lotId&&item.sellerKey===row.sellerKey);if(index<0)rows.unshift(row);else rows[index]=row}return rows.sort((a,b)=>Date.parse(b.updatedAt)-Date.parse(a.updatedAt))}
 function renderInbox(){
  const rows=owner?ownRows():[];
  dialog.innerHTML=header('Сообщения','Вопросы продавцам по выбранному имуществу')+notice+'<div class="messages-inbox">'+(rows.length?rows.map(row=>{const lot=lotById(row.lotId),same=lot&&identity(lot)===row.sellerKey&&!own(lot),label=same?text(lot.name,300):'Лот № '+row.lotId+' недоступен';return '<button type="button" class="messages-thread" data-message-thread="'+row.lotId+'" data-message-seller="'+esc(row.sellerKey)+'"><span><small>'+esc(row.memoryOnly?'Не сохранён · только в памяти страницы':'Черновик · не отправлен')+'</small><strong>'+esc(label)+'</strong><span>'+esc(row.body.trim().slice(0,100)||'Пустой черновик')+'</span></span><span aria-hidden="true">›</span></button>'}).join(''):'<div class="messages-empty"><h3>Здесь будут ваши вопросы продавцам</h3><p>Откройте лот и нажмите «Написать продавцу». Вопрос можно пока сохранить как черновик; другие пользователи его не получат.</p></div>')+'</div>'+errorHTML;if(storageError)error(storageError);
 }
 function renderThread(){
  const lot=currentLot(),editable=available(lot),title=lot?text(lot.name,300):'Лот № '+active.lotId+' недоступен',url=lot&&link(lot),contextLink=url?'<a href="'+esc(url)+'" data-message-open-lot="'+active.lotId+'">Открыть лот</a>':lot?'<button type="button" class="messages-link" data-message-open-lot="'+active.lotId+'">Открыть лот на этом устройстве</button>':'';
  dialog.innerHTML=header('Вопрос продавцу',lot?sellerName(lot):'Прежнее объявление недоступно')+'<button type="button" class="messages-link" data-messages-inbox>← К сообщениям</button><section class="messages-lot-context">'+(lot?'<img src="'+esc(safePhoto(lot))+'" alt="" width="72" height="72" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-message-photo>':'')+'<div><small>Лот № '+active.lotId+'</small><h3>'+esc(title)+'</h3>'+contextLink+'</div></section>'+notice+(!editable?'<p class="messages-warning">Объявление или прежний продавец сейчас недоступны. Сохранённый текст можно скопировать или удалить.</p>':'')+'<label class="messages-field">Ваш вопрос<textarea data-message-body maxlength="4000" rows="6" '+(!editable?'readonly':'')+' placeholder="Уточните состояние имущества, документы или время осмотра">'+esc(active.body)+'</textarea><small>До 4000 символов. Не добавляйте паспортные и платёжные данные.</small></label><div class="messages-actions"><button type="button" class="primary" data-message-save '+(!editable?'disabled':'')+'>Сохранить черновик</button><button type="button" class="outline" data-message-cancel-edit>Отменить изменения</button><button type="button" class="outline" data-message-discard>Удалить черновик</button></div><p class="messages-save-status" data-message-status role="status">'+(active.memoryOnly?'Текст ещё не записан в память браузера.':'Черновик не отправлен продавцу.')+'</p><section class="messages-delete" data-message-delete-confirm hidden><p>Удалить текст этого вопроса? Восстановить его нельзя.</p><button type="button" class="outline" data-message-delete-cancel>Оставить</button><button type="button" class="primary" data-message-delete-confirmed>Удалить черновик</button></section>'+errorHTML;
  const input=field();if(input)input.value=active.body;
 }
 function save(feedback=false){
  if(!active||!ensureOwner())return false;
  if(!scopeId){error('Для сохранения черновика сначала сохраните профиль в кабинете. Текст остаётся здесь.');return false}
  if(!canEdit()){error('Объявление или продавец изменились. Текст остаётся в этом окне.');return false}
  const input=body();if(input.length>4000||input.includes('\0')){error('Вопрос должен содержать не более 4000 символов.');return false}
  if(!snapshot){error('Откройте актуальный список черновиков перед сохранением.');return false}
  try{snapshot=store.save(owner,snapshot,{lotId:active.lotId,sellerKey:active.sellerKey,body:input});active={...active,body:input,memoryOnly:false};recovery.delete(JSON.stringify([owner,active.lotId,active.sellerKey]));error('');const status=dialog.querySelector('[data-message-status]');if(status)status.textContent='Черновик сохранён на этом устройстве. Продавцу не отправлен.';if(feedback&&typeof toast==='function')toast('Черновик сохранён. Сообщение не отправлено.');return true}catch(reason){rememberRecovery();error(reason.message||'Не удалось сохранить черновик. Не закрывайте страницу; текст остаётся в этом окне.');return false}
 }
 function prepareLeave(){if(!ensureOwner())return false;return !dirty()||save()}
 function requestClose(){
  if(!dialog.open||top()!==dialog)return false;
  if(deletePending){deletePending=false;const panel=dialog.querySelector('[data-message-delete-confirm]');if(panel)panel.hidden=true;return false}
  if(!prepareLeave())return false;nativeClose();return true;
 }
 // Generic Back/blank/swipe calls dialog.close(); keep the same guarded path.
 dialog.close=requestClose;
 function openInbox(options={}){
  if(dialog.open){if(top()!==dialog||!prepareLeave())return false;active=null;load();renderInbox();return true}
  const upper=top();if(upper&&upper!==modal)return false;owner=currentOwner();active=null;snapshot={raw:null,drafts:[]};origin=options.trigger||document.activeElement;session++;deletePending=false;
  returnState={modal,modalTop:modal.scrollTop,modalFirst:content.firstChild,modalOpen:modal.open,modalClass:modal.className,inFeed:typeof reelsMode!=='undefined'&&reelsMode,gridFirst:document.querySelector('#grid')?.firstChild,grid:document.querySelector('#grid'),gridTop:document.querySelector('#grid')?.scrollTop,gridLeft:document.querySelector('#grid')?.scrollLeft,x:window.scrollX,y:window.scrollY};
  renderInbox();load();renderInbox();if(!owner)error('Сначала сохраните профиль в личном кабинете.');dialog.showModal();dialog.querySelector('[data-messages-close]')?.focus?.({preventScroll:true});window.FasBackSwipe?.refreshHeaders?.();return true;
 }
 function openLot(id,trigger=null){
  const lot=lotById(Number(id));if(!available(lot)||own(lot)){if(typeof toast==='function')toast('Лот или продавец сейчас недоступны для вопроса.');return false}
  if(!dialog.open&&!openInbox({trigger}))return false;if(!owner){error('Сначала сохраните профиль в личном кабинете. Вопрос не отправлен.');return false}if(top()!==dialog||!prepareLeave())return false;
  const sellerKey=identity(lot);if(recovery.size>=40&&!recovery.has(JSON.stringify([owner,lot.id,sellerKey]))){error('В памяти страницы уже 40 несохранённых вопросов. Сохраните или отмените один из них перед новым вопросом.');return false}const remembered=ownRows().find(row=>row.lotId===lot.id&&row.sellerKey===sellerKey);active=remembered?{...remembered}:{lotId:lot.id,sellerKey,body:'',updatedAt:new Date().toISOString()};deletePending=false;renderThread();field()?.focus?.({preventScroll:true});return true;
 }
 function openStored(id,sellerKey){if(!prepareLeave())return false;const row=ownRows().find(item=>item.lotId===id&&item.sellerKey===sellerKey);if(!row)return false;if(recovery.size>=40&&!recovery.has(JSON.stringify([owner,id,sellerKey]))){error('Сначала сохраните или отмените один из несохранённых вопросов.');return false}active={...row};deletePending=false;renderThread();return true}
 function remove(){
  if(!active||!ensureOwner()||!deletePending||!snapshot)return false;
  try{snapshot=store.remove(owner,snapshot,active.lotId,active.sellerKey);recovery.delete(JSON.stringify([owner,active.lotId,active.sellerKey]));active=null;deletePending=false;renderInbox();return true}catch(reason){error(reason.message||'Не удалось удалить черновик. Текст сохранён в этом окне.');return false}
 }
 dialog.addEventListener('cancel',event=>{event.preventDefault();requestClose()});
 dialog.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation?.();requestClose()}});
 dialog.addEventListener('click',event=>{
  if(top()!==dialog||!dialog.contains(event.target))return;const target=event.target;
  if(target===dialog||target.closest?.('[data-messages-close]')){event.preventDefault();requestClose();return}
  if(target.closest?.('[data-message-save]')){event.preventDefault();save(true);return}
  if(target.closest?.('[data-messages-inbox]')){event.preventDefault();if(prepareLeave()){active=null;deletePending=false;load();renderInbox()}return}
  const thread=target.closest?.('[data-message-thread]');if(thread){event.preventDefault();openStored(Number(thread.dataset.messageThread),thread.dataset.messageSeller);return}
  if(target.closest?.('[data-message-cancel-edit]')){event.preventDefault();if(!active||!ensureOwner())return;const saved=snapshot?.drafts?.find(row=>row.lotId===active.lotId&&row.sellerKey===active.sellerKey);recovery.delete(JSON.stringify([owner,active.lotId,active.sellerKey]));active={...active,body:saved?.body||'',memoryOnly:false};deletePending=false;renderThread();return}
  if(target.closest?.('[data-message-discard]')){event.preventDefault();if(!ensureOwner())return;deletePending=true;dialog.querySelector('[data-message-delete-confirm]').hidden=false;return}
  if(target.closest?.('[data-message-delete-cancel]')){event.preventDefault();deletePending=false;dialog.querySelector('[data-message-delete-confirm]').hidden=true;return}
  if(target.closest?.('[data-message-delete-confirmed]')){event.preventDefault();remove();return}
  const open=target.closest?.('[data-message-open-lot]');if(open){event.preventDefault();if(!active||!currentLot()||!available(currentLot())){error('Лот сейчас недоступен.');return}const id=Number(open.dataset.messageOpenLot);if(id!==active.lotId)return;const existing=modal.open&&modal.classList.contains('lot-dialog')&&Number(content.querySelector('[data-open-lot-id]')?.dataset.openLotId)===id;if(!existing&&window.FasSellerUI?.prepareNavigation?.()===false){error('Не удалось выйти из кабинета. Вернитесь назад и проверьте несохранённые изменения профиля или объявления.');return}if(requestClose()&&!existing)openCar(id)}
 });
 dialog.addEventListener('close',()=>{
  if(dialog.open||cleaned===session)return;cleaned=session;active=null;deletePending=false;const prior=returnState,focus=origin;returnState=null;origin=null;
  const sameContext=prior&&modal.open===prior.modalOpen&&modal.className===prior.modalClass&&content.firstChild===prior.modalFirst&&(typeof reelsMode!=='undefined'&&reelsMode)===prior.inFeed&&prior.grid?.firstChild===prior.gridFirst;
  if(sameContext){if(prior.modal?.isConnected!==false)prior.modal.scrollTop=prior.modalTop;if(prior.grid?.isConnected!==false&&prior.grid){prior.grid.scrollTop=prior.gridTop;prior.grid.scrollLeft=prior.gridLeft}if(Number.isFinite(prior.y)&&window.scrollY!==prior.y)window.scrollTo?.({left:prior.x||0,top:prior.y,behavior:'instant'})}
  if(sameContext&&(!top()||top()===prior?.modal))focus?.isConnected!==false&&focus?.focus?.({preventScroll:true});
 });
 dialog.addEventListener('error',event=>{const image=event.target;if(image.matches?.('img[data-message-photo]'))image.hidden=true},{capture:true});
 function decorate(){
  if(!modal.open||!modal.classList.contains('lot-dialog'))return;
  const body=content.querySelector('.purchase-body');if(!body||body.querySelector('[data-message-lot]'))return;
  // Countdown and price mutations revisit this observer. An existing entry
  // needs no catalogue lookup; its click still validates the live lot below.
  const id=Number(body.dataset.openLotId),lot=lotById(id);if(!available(lot)||own(lot))return;
  const button=document.createElement('button');button.type='button';button.className='outline messages-lot-open';button.setAttribute('data-message-lot',String(id));button.textContent='Написать продавцу';button.setAttribute('aria-haspopup','dialog');
  const seller=body.querySelector('.seller-public-links');if(seller)seller.appendChild(button);else{const row=document.createElement('div');row.className='messages-lot-entry';row.appendChild(button);const target=body.querySelector('.lot-detail-secondary')||body.querySelector('.lot-detail-facts')||body,before=target.querySelector(target===body?'.purchase-price':'.object-attributes')||target.firstChild;(before?.parentElement||target).insertBefore(row,before)}
 }
 const originalOpen=openCar;openCar=function(...args){const result=originalOpen.apply(this,args);decorate();return result};
 document.addEventListener('click',event=>{const button=event.target.closest?.('[data-message-lot]');if(!button)return;const id=Number(button.dataset.messageLot),body=content.querySelector('[data-open-lot-id]');if(top()!==modal||!modal.classList.contains('lot-dialog')||!content.contains(button)||Number(body?.dataset.openLotId)!==id)return;event.preventDefault();event.stopPropagation?.();openLot(id,button)});
 const Observer=window.MutationObserver||globalThis.MutationObserver;if(typeof Observer==='function'){new Observer(decorate).observe(content,{childList:true,subtree:true});new Observer(decorate).observe(modal,{attributes:true,attributeFilter:['open','class']})}
 window.addEventListener('storage',event=>{if(dialog.open&&(!event.key||event.key==='fas-seller-workspace-v1'))ensureOwner()});
 window.addEventListener('beforeunload',event=>{if(recovery.size>0||dialog.open&&(dirty()||active?.memoryOnly)){event.preventDefault?.();event.returnValue=''}});
 window.addEventListener('pagehide',()=>{if(dialog.open&&dirty())rememberRecovery()});
 window.FasMessages=Object.freeze({openInbox,openLot,close:requestClose,prepareLeave,decorate,state:()=>({open:dialog.open,owner,lotId:active?.lotId||null,dirty:dirty(),deliveryConnected:false,unreadCount:null})});decorate();
})();
