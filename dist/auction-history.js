/* Device-local accepted auction events. This is not a server ledger or payment confirmation. */
(()=>{
 'use strict';
 if(window.FasAuctionHistory)return;
 const KEY='fas-auction-history-v1',STATUS_KEY='fas-auction-history-status-v1',YEAR=365*86400000,MAX_BYTES=2*1024*1024,MAX_MEMORY=20000,PAGE=50,EMPTY={};
 const KIND=new Set(['own-bid','market-quote','demo-purchase']),SOURCES=new Set(['accepted-local-bid','accepted-market-update','legacy-own-history','stored-market-quote','explicit-demo-purchase']);
 const priority={'legacy-own-history':1,'stored-market-quote':1,'accepted-local-bid':2,'accepted-market-update':2,'explicit-demo-purchase':2};
 const events=new Map();let storageAvailable=true,complete=true,warning='',view=null,seedSource=null,seedBids=null,seedLength=-1,needsInitialCleanup=false;
 const object=value=>value&&typeof value==='object'&&!Array.isArray(value),positive=value=>Number.isSafeInteger(value)&&value>0;
 const safeText=value=>typeof value==='string'?value.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g,' ').trim().slice(0,200):'';
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=value=>positive(value)?value.toLocaleString('ru-RU')+' ₽':'Не указана';
 const stamp=value=>{const time=typeof value==='number'?value:typeof value==='string'?Date.parse(value):NaN;return Number.isFinite(time)&&time>Date.now()-YEAR&&time<=Date.now()+300000?time:null};
 const key=row=>row.lotId+'|'+row.kind+'|'+row.at+'|'+row.amount;
 const lots=()=>{try{return typeof cars!=='undefined'&&Array.isArray(cars)?cars:[]}catch{return []}};
 const book=()=>{try{return typeof bids!=='undefined'&&object(bids)?bids:EMPTY}catch{return EMPTY}};
 const lotById=id=>lots().find(lot=>lot?.id===id);
 function normalize(row){
  if(!object(row)||!positive(row.lotId)||!positive(row.amount)||!KIND.has(row.kind)||!SOURCES.has(row.source))return null;
  const at=stamp(row.at);if(at===null)return null;
  if(row.kind==='own-bid'&&!['accepted-local-bid','legacy-own-history'].includes(row.source)||row.kind==='market-quote'&&!['accepted-market-update','stored-market-quote'].includes(row.source)||row.kind==='demo-purchase'&&row.source!=='explicit-demo-purchase')return null;
  return Object.freeze({lotId:row.lotId,kind:row.kind,amount:row.amount,at:new Date(at).toISOString(),source:row.source,name:safeText(row.name)||'Лот № '+row.lotId});
 }
 function prune(){const cutoff=Date.now()-YEAR;let changed=false;for(const [id,row] of events)if(Date.parse(row.at)<=cutoff){events.delete(id);changed=true}return changed}
 function ingest(row){
  const clean=normalize(row);if(!clean)return false;const id=key(clean),previous=events.get(id);
  if(previous){if(priority[clean.source]<=priority[previous.source])return false;events.set(id,clean);return true}
  if(events.size>=MAX_MEMORY){complete=false;storageAvailable=false;warning='Журнал переполнен. Новые события не добавлены; существующая история сохранена. Экспортируйте журнал.';return false}
  events.set(id,clean);return true;
 }
 function bytes(text){return typeof Blob==='function'?new Blob([text]).size:text.length*3}
 function readStored(raw){
  if(raw===null||raw==='')return [];
  if(raw.length>MAX_BYTES||bytes(raw)>MAX_BYTES)throw Error('Сохранённый журнал превышает безопасный размер. Новые события доступны только в этом окне.');
  let data;try{data=JSON.parse(raw)}catch{throw Error('Сохранённый журнал повреждён. Новые события доступны только в этом окне.')}if(!object(data)||data.version!==1||!Array.isArray(data.events))throw Error('Сохранённый журнал недоступен или имеет другой формат. Новые события доступны только в этом окне.');
  if(data.events.length>MAX_MEMORY)throw Error('В сохранённом журнале слишком много событий. Новые события доступны только в этом окне.');
  if(data.complete===false){complete=false;warning='Полнота ранее сохранённой истории не подтверждается.'}const rows=[];
  for(const row of data.events){
   const clean=normalize(row);if(clean){rows.push(clean);continue}
   needsInitialCleanup=true;
   if(!object(row)||!Number.isFinite(Date.parse(row.at))||Date.parse(row.at)>Date.now()-YEAR){complete=false;warning='Часть сохранённых событий повреждена и не показана.'}
  }
  return rows;
 }
 function persist(){
  prune();try{
   for(const row of readStored(localStorage.getItem(KEY))){if(!ingest(row)&&!events.has(key(row)))throw Error('Истории из разных вкладок не удалось объединить. Новые события доступны только в этом окне.');}
   const text=JSON.stringify({version:1,complete,events:[...events.values()]});if(bytes(text)>MAX_BYTES)throw Error('Журнал достиг 2 МБ. Новые события доступны только в этом окне; экспортируйте историю и освободите память.');
   localStorage.setItem(KEY,text);storageAvailable=true;try{if(typeof localStorage.removeItem==='function')localStorage.removeItem(STATUS_KEY);else localStorage.setItem(STATUS_KEY,'')}catch{}if(complete)warning='';return true;
  }catch(error){storageAvailable=false;try{localStorage.setItem(STATUS_KEY,'pending')}catch{}if(!warning||complete)warning=error?.message?.includes('журнал')||error?.message?.includes('Журнал')?error.message:'Не удалось сохранить историю. Новые события доступны только в этом окне. Не закрывайте страницу до повторного сохранения.';return false}
 }
 try{for(const row of readStored(localStorage.getItem(KEY)))ingest(row)}catch(error){storageAvailable=false;complete=false;warning=error?.message||'Не удалось прочитать сохранённую историю.'}
 try{if(localStorage.getItem(STATUS_KEY)==='pending'){complete=false;warning='Предыдущее сохранение истории не завершилось. Часть событий прошлого окна может быть недоступна.'}}catch{}
 function seedExisting(defer=false){
  const inventory=lots(),own=book();if(seedSource===inventory&&seedLength===inventory.length&&seedBids===own)return false;
  seedSource=inventory;seedLength=inventory.length;seedBids=own;let changed=false;
  const index=new Map();for(const lot of inventory){if(!positive(lot?.id))continue;index.set(lot.id,lot);if(lot.auctionUpdatedAt&&positive(lot.price))changed=ingest({lotId:lot.id,kind:'market-quote',amount:lot.price,at:lot.auctionUpdatedAt,source:'stored-market-quote',name:lot.name})||changed}
  for(const [id,bid] of Object.entries(own)){const lot=index.get(Number(id));if(!lot||String(lot.id)!==id||!object(bid)||!Array.isArray(bid.history))continue;for(const row of bid.history)if(object(row))changed=ingest({lotId:lot.id,kind:'own-bid',amount:row.price,at:row.at,source:'legacy-own-history',name:lot.name})||changed}
  if(changed&&!defer)persist();return changed;
 }
 function capture(lot,kind,amount,at,source){
  if(!object(lot)||!positive(lot.id)||!positive(amount)||stamp(at)===null)return {ok:false,captured:false,reason:'invalid-event'};
  const seeded=seedExisting(true),changed=ingest({lotId:lot.id,kind,amount,at,source,name:lot.name});if(!changed&&!seeded){const captured=events.has(key({lotId:lot.id,kind,amount,at:new Date(stamp(at)).toISOString()}));if(!captured)refresh();return {ok:false,captured,reason:captured?'duplicate':'capacity'}};
  const saved=persist();refresh();return {ok:changed,captured:events.has(key({lotId:lot.id,kind,amount,at:new Date(stamp(at)).toISOString()})),saved};
 }
 function recordOwnBid(lot,entry){return capture(lot,'own-bid',entry?.price,entry?.at,'accepted-local-bid')}
 function recordMarketQuote(lot,event){return capture(lot,'market-quote',event?.price,event?.occurredAt,'accepted-market-update')}
 function recordDemoPurchase(lot){if(!object(lot)||lot.status!=='sold')return {ok:false,captured:false,reason:'not-a-demo-purchase'};return capture(lot,'demo-purchase',lot.soldPrice,lot.soldAt,'explicit-demo-purchase')}
 function rowsFor(lotId=null,purchases=false){if(prune())persist();return [...events.values()].filter(row=>(lotId===null||row.lotId===lotId)&&(!purchases||row.kind==='demo-purchase')).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)||key(a).localeCompare(key(b)))}
 function history(lotId,{offset=0,limit=PAGE}={}){seedExisting();const rows=rowsFor(Number(lotId));return {total:rows.length,rows:rows.slice(Math.max(0,offset),Math.max(0,offset)+Math.min(200,Math.max(1,limit)))}}
 function state(){prune();return {eventCount:events.size,purchaseCount:rowsFor(null,true).length,storageAvailable,complete,warning,retentionDays:365,maxStorageBytes:MAX_BYTES}}
 const labels={'own-bid':'Ваша демоставка','market-quote':'Полученное обновление цены','demo-purchase':'Демопокупка — без списания денег'};
 const provenance={'legacy-own-history':'Из ранее сохранённой истории ваших ставок','stored-market-quote':'Из сохранённой котировки лота','accepted-local-bid':'Принято на этом устройстве','accepted-market-update':'Принятое обновление торгов','explicit-demo-purchase':'Явно подтверждено в деморежиме'};
 function eventHTML(row){return '<li class="auction-history-event"><div><strong>'+esc(labels[row.kind])+'</strong><time datetime="'+esc(row.at)+'">'+esc(new Date(row.at).toLocaleString('ru-RU'))+'</time></div><b>'+esc(money(row.amount))+'</b><small>'+esc(provenance[row.source])+'</small></li>'}
 function statusHTML(){return '<p class="auction-history-status" data-auction-history-status role="status">'+esc(warning||'История хранится на этом устройстве за последние 365 дней.')+'</p>'+(!storageAvailable?'<button type="button" class="outline" data-auction-history-retry>Повторить сохранение</button>':'')}
 function sectionHTML(lot){if(!positive(lot?.id))return '';seedExisting();const rows=rowsFor(lot.id);return '<details class="auction-history-preview" data-auction-history-preview="'+lot.id+'"><summary>История торгов <span data-auction-history-count>'+rows.length+'</span></summary>'+statusHTML()+'<p class="note">Показаны полученные и сохранённые события. Общий серверный журнал торгов ещё не подключён. Число ставок в демокаталоге не создаёт события.</p><ol class="auction-history-events" data-auction-history-events>'+rows.slice(0,3).map(eventHTML).join('')+'</ol>'+(rows.length?'':'<p class="note">Принятых ставок и обновлений цены для этого лота пока нет.</p>')+'<button type="button" class="outline" data-auction-history-open="'+lot.id+'">Открыть всю историю</button></details>'}
 function active(){const modal=document.querySelector('#modal'),content=document.querySelector('#modal-content');return view&&modal?.open&&(content?.querySelector?.('[data-auction-history-view]')||content?.innerHTML?.includes('data-auction-history-view'))}
 function pageHTML(){
  const purchases=view.type==='purchases',all=purchases?rowsFor(null,true):rowsFor(view.lotId),rows=all.slice(0,view.limit),lot=lotById(view.lotId),title=purchases?'Мои покупки':'История торгов',name=lot?.name||all[0]?.name||'Лот № '+view.lotId;
  const content=purchases?rows.map(row=>'<article class="auction-purchase-card"><span class="auction-purchase-demo">Демопокупка</span><h3>'+esc(row.name)+'</h3><p>Лот № '+row.lotId+' · '+esc(new Date(row.at).toLocaleString('ru-RU'))+'</p><strong>'+esc(money(row.amount))+'</strong><p>Деньги не списывались. Это не подтверждение реальной сделки.</p><button type="button" class="outline" data-auction-history-open="'+row.lotId+'">История торгов по лоту</button></article>').join(''):'<ol class="auction-history-events">'+rows.map(eventHTML).join('')+'</ol>';
  return '<section class="modal-body auction-history-view" data-auction-history-view><div class="auction-history-heading"><h2>'+title+'</h2><button type="button" class="outline" data-auction-history-back>Назад</button></div>'+(!purchases?'<h3>'+esc(name)+'</h3><p>Лот № '+view.lotId+'</p>':'<p>Здесь появятся подтверждённые покупки. Демонстрационные покупки отмечаются отдельно; оплата образца квитанции и завершение торгов не подтверждают покупку.</p>')+statusHTML()+(all.length?content:'<div class="auction-history-empty"><h3>'+(purchases?'Подтверждённых покупок пока нет':'Сохранённых событий пока нет')+'</h3><p>'+(purchases?'Ставки и полученные обновления можно посмотреть в разделе «Мои ставки» и в истории конкретного лота.':'История начнётся с первой принятой ставки или полученного обновления цены.')+'</p><button type="button" class="primary" data-auction-history-my-bids>Мои ставки</button></div>')+(all.length>view.limit?'<button type="button" class="outline" data-auction-history-more>Показать ещё '+PAGE+' событий</button>':'')+'<p class="note">До подключения журнала доступны только ранее сохранённые ставки (до 50 на лот) и последняя известная котировка. Все новые принятые события сохраняются отдельно. '+(complete?'':'Часть истории недоступна; полнота журнала не подтверждается.')+'</p><button type="button" class="outline" data-auction-history-export>Скачать историю JSON</button></section>';
 }
 function show(next,top=0){if(typeof showModalContent!=='function')return false;view=next;showModalContent(pageHTML());const modal=document.querySelector('#modal');if(modal)modal.scrollTop=top;return true}
 function openPurchases(options={}){seedExisting();return show({type:'purchases',limit:PAGE,onBack:typeof options.onBack==='function'?options.onBack:()=>window.FasSellerUI?.openDashboard?.()})}
 function openLotHistory(id,options={}){
  id=Number(id);if(!positive(id))return false;
  const modal=document.querySelector('#modal'),top=Number.isFinite(modal?.scrollTop)?modal.scrollTop:0,previous=active()?{...view}:null;
  const form=modal?.querySelector?.('#bid-form')||document.querySelector('#bid-form'),input=modal?.querySelector?.('#bid')||document.querySelector('#bid');
  const draft=modal?.classList?.contains('lot-dialog')&&Number(form?.dataset?.lotId)===id&&input?String(input.value):null;
  seedExisting();
  const restoreLot=()=>{const lot=lotById(id);if(lot&&typeof isLotLive==='function'&&isLotLive(lot)&&typeof openCar==='function'){
   openCar(id);const returned=document.querySelector('#modal'),returnedForm=returned?.querySelector?.('#bid-form')||document.querySelector('#bid-form'),returnedInput=returned?.querySelector?.('#bid')||document.querySelector('#bid');
   if(!returned?.classList?.contains('lot-dialog')){window.FasSellerUI?.openDashboard?.();return}
   if(draft!==null&&returned?.classList?.contains('lot-dialog')&&Number(returnedForm?.dataset?.lotId)===id&&returnedInput)returnedInput.value=draft;
   if(returned)returned.scrollTop=top;
  }else window.FasSellerUI?.openDashboard?.()};
  const custom=typeof options.onBack==='function'?()=>{options.onBack();const returned=document.querySelector('#modal');if(returned)returned.scrollTop=top}:null;
  return show({type:'history',lotId:id,limit:PAGE,onBack:custom|| (previous?()=>show(previous,top):restoreLot)});
 }
 function back(){if(!active())return false;const action=view.onBack;view=null;action?.();return true}
 function refresh(){
  document.querySelectorAll('[data-auction-history-preview]').forEach(node=>{const id=Number(node.dataset.auctionHistoryPreview),rows=rowsFor(id),count=node.querySelector?.('[data-auction-history-count]'),list=node.querySelector?.('[data-auction-history-events]'),status=node.querySelector?.('[data-auction-history-status]');if(count)count.textContent=String(rows.length);if(list)list.innerHTML=rows.slice(0,3).map(eventHTML).join('');if(status)status.textContent=warning||'История хранится на этом устройстве за последние 365 дней.'});
  if(active()){const modal=document.querySelector('#modal'),content=document.querySelector('#modal-content'),top=modal.scrollTop;content.innerHTML=pageHTML();modal.scrollTop=top}
 }
 function retrySave(){const result=persist();refresh();return result}
 function exportData(){const selected=view?.type==='history'?rowsFor(view.lotId):rowsFor(null,view?.type==='purchases');return JSON.stringify({version:1,exportedAt:new Date().toISOString(),deviceLocal:true,realPaymentConfirmation:false,complete,events:selected},null,2)}
 document.addEventListener('click',event=>{
  const target=event.target,button=target.closest?.('[data-auction-history-open],[data-auction-history-back],[data-auction-history-more],[data-auction-history-retry],[data-auction-history-my-bids],[data-auction-history-export]');if(!button)return;
  if(button.dataset.auctionHistoryOpen){event.preventDefault();openLotHistory(button.dataset.auctionHistoryOpen);return}
  if(button.hasAttribute?.('data-auction-history-back')){event.preventDefault();back();return}
  if(button.hasAttribute?.('data-auction-history-more')&&active()){event.preventDefault();view.limit+=PAGE;refresh();return}
  if(button.hasAttribute?.('data-auction-history-retry')){event.preventDefault();retrySave();return}
  if(button.hasAttribute?.('data-auction-history-my-bids')){event.preventDefault();window.FasAuctionNotifications?.openMyBids?.({onBack:()=>openPurchases()});return}
  if(button.hasAttribute?.('data-auction-history-export')&&typeof download==='function'){event.preventDefault();download('fas-auction-history.json',exportData())}
 });
 window.FasAuctionHistory=Object.freeze({recordOwnBid,recordMarketQuote,recordDemoPurchase,seedExisting,sectionHTML,openPurchases,openLotHistory,back,history,state,retrySave,exportData});
 if(needsInitialCleanup)persist();seedExisting();
})();
