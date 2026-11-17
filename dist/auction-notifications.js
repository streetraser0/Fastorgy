/* Browser-local alerts from genuine auction updates; no synthetic bids or closed-app delivery. */
(()=>{
 'use strict';
 if(window.FasAuctionNotifications)return;
 const KEY='fas-auction-alerts-v1',MAX_WATCHED=5000,MAX_DELIVERED=1000,BID_PAGE=24,SUMMARY_TTL=900;
 const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
 const positive=value=>Number.isSafeInteger(value)&&value>0;
 const stamp=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))?Date.parse(value):0;
 let stored;try{stored=JSON.parse(localStorage.getItem(KEY)||'null')}catch{}
 let preferences={outbid:stored?.version===1&&typeof stored.outbid==='boolean'?stored.outbid:true,browser:stored?.version===1&&stored.browser===true};
 const watches=new Map(),delivered=new Set(),delivering=new Set();
 if(stored?.version===1&&object(stored.watches))for(const [id,value]of Object.entries(stored.watches).slice(-MAX_WATCHED))if(positive(Number(id))&&object(value)&&positive(value.price))watches.set(Number(id),{price:value.price,at:Number.isFinite(value.at)?value.at:0,notified:positive(value.notified)?value.notified:0});
 if(stored?.version===1&&Array.isArray(stored.delivered))for(const id of stored.delivered.slice(-MAX_DELIVERED))if(typeof id==='string'&&id.length<=300)delivered.add(id);
 let adapter={},permissionBusy=false,inventory=null,inventoryLength=-1,lotIndex=new Map(),summaryCache=null,myBidsView=null;
 const lots=()=>adapter.getLots?.()??(typeof cars!=='undefined'?cars:[]);
 const ownBids=()=>adapter.getOwnBids?.()??(typeof bids!=='undefined'?bids:{});
 const notices=()=>adapter.getNotices?.()??(typeof lotNotices!=='undefined'?lotNotices:[]);
 const eligible=lot=>adapter.isLive?adapter.isLive(lot):typeof isLotLive==='function'?isLotLive(lot):lot?.status==='live'&&Date.parse(lot.ends)>Date.now();
 const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
 function indexedLots(source=lots()){
  const input=Array.isArray(source)?source:[],length=input.length;
  if(inventory!==input||inventoryLength!==length){inventory=input;inventoryLength=length;lotIndex=new Map();for(const lot of input)if(object(lot)&&positive(lot.id)&&!lotIndex.has(lot.id))lotIndex.set(lot.id,lot);summaryCache=null}
  return lotIndex;
 }
 function bidSummary(){
  const source=lots(),book=ownBids(),time=Date.now(),length=Array.isArray(source)?source.length:0;
  if(summaryCache&&summaryCache.source===source&&summaryCache.length===length&&summaryCache.book===book&&time>=summaryCache.at&&time-summaryCache.at<SUMMARY_TTL)return summaryCache.value;
  const rows=[],seen=new Set();let outbidCount=0,index=null;
  if(object(book))for(const [key,bid]of Object.entries(book)){
   const id=Number(key);if(!positive(id)||String(id)!==key||seen.has(id)||!object(bid)||!positive(bid.price))continue;
   const lot=(index??=indexedLots(source)).get(id);if(!lot||['draft','deleted','cancelled'].includes(lot.status)||lot.auctionDirection==='descending')continue;
   seen.add(id);
   let own=false,currentPrice=null,live=false;
   try{own=adapter.getIsOwn?adapter.getIsOwn(lot):typeof isOwnLot==='function'?isOwnLot(lot):false}catch{own=true}
   if(own)continue;
   try{const value=adapter.getCurrentPrice?adapter.getCurrentPrice(lot):typeof current==='function'?current(lot):lot.price;currentPrice=positive(value)?value:null}catch{}
   const direction=lot.auctionDirection,ascending=direction===undefined||direction===null||direction===''||direction==='ascending',end=stamp(lot.ends),rawStart=lot.startsAt??lot.starts,start=stamp(rawStart),hasStart=rawStart!==undefined&&rawStart!==null&&rawStart!=='',liveStatus=lot.status===undefined||lot.status===null||lot.status===''||lot.status==='live'||lot.status==='scheduled'&&hasStart;
   try{live=ascending&&liveStatus&&currentPrice!==null&&!!end&&end>time&&(!hasStart||!!start&&start<=time&&start<end)&&!!eligible(lot)}catch{}
   const ended=!!end&&end<=time||['sold','closed','ended'].includes(lot.status),scheduled=!ended&&!!end&&end>time&&(start>time||lot.status==='scheduled');
   const status=live?(currentPrice>bid.price?'outbid':'leading'):ended?'ended':scheduled?'scheduled':'unavailable',canRaise=status==='outbid';
   if(canRaise)outbidCount++;
   rows.push(Object.freeze({id,name:typeof lot.name==='string'?lot.name:'Лот № '+id,ownPrice:bid.price,currentPrice,ends:typeof lot.ends==='string'?lot.ends:'',status,canRaise}));
  }
  const order={outbid:0,leading:1,scheduled:2,ended:3,unavailable:4};rows.sort((a,b)=>order[a.status]-order[b.status]||b.id-a.id);
  const value=Object.freeze({total:rows.length,outbidCount,rows:Object.freeze(rows)});summaryCache={source,length,book,at:time,value};return value;
 }
 const mainModal=()=>typeof document!=='undefined'?document.querySelector?.('#modal'):null;
 const mainContent=()=>typeof document!=='undefined'?document.querySelector?.('#modal-content'):null;
 function activeMyBids(){const content=mainContent();return !!myBidsView&&mainModal()?.open===true&&!!(content?.querySelector?.('[data-my-bids-root]')||typeof content?.querySelector!=='function'&&content?.innerHTML?.includes('data-my-bids-root'))}
 function myBidsHTML(summary,limit,hasBack=false){
  const statuses={outbid:'Ставку перебили',leading:'Вы лидируете',ended:'Торги завершены',scheduled:'Торги ещё не начались',unavailable:'Торги недоступны'};
  const rows=summary.rows.slice(0,limit).map(row=>'<article class="my-bid-row my-bid-'+row.status+'"><div class="my-bid-heading"><h3>'+escape(row.name)+'</h3><span>Лот № '+row.id+'</span></div><p class="my-bid-status">'+statuses[row.status]+'</p><dl><div><dt>Ваша ставка</dt><dd>'+escape(money(row.ownPrice))+'</dd></div><div><dt>Текущая цена</dt><dd data-current-lot-price="'+row.id+'">'+escape(money(row.currentPrice))+'</dd></div></dl>'+(row.canRaise?'<button type="button" class="primary" data-my-bids-raise="'+row.id+'">Повысить ставку</button>':row.status==='leading'?'<button type="button" class="outline" data-my-bids-open="'+row.id+'">Открыть лот</button>':'')+'</article>').join('');
  return '<section class="modal-body my-bids" data-my-bids-root><div class="eyebrow">Ваше участие в торгах</div><div class="my-bids-title"><h2 tabindex="-1">Мои ставки</h2>'+(hasBack?'<button type="button" class="outline" data-my-bids-back>В кабинет</button>':'')+'</div>'+(summary.total?'<p class="my-bids-summary">Всего: '+summary.total+' · Перебитых ставок: '+summary.outbidCount+'</p><div class="my-bids-list">'+rows+'</div>'+(summary.rows.length>limit?'<button type="button" class="outline my-bids-more" data-my-bids-more>Показать ещё ставки</button>':'')+'<p class="note">Ставки сохраняются на этом устройстве. Завершение торгов само по себе не подтверждает победу.</p>':'<div class="my-bids-empty"><h3>У вас пока нет ставок</h3><p>Выберите лот в каталоге, изучите условия и сделайте ставку.</p><button type="button" class="primary" data-my-bids-catalog>Вернуться к каталогу</button></div>')+'</section>';
 }
 function showBidContent(html){if(adapter.showContent){adapter.showContent(html);return true}if(typeof showModalContent==='function'){showModalContent(html);return true}return false}
 function openMyBids(options={}){summaryCache=null;const summary=bidSummary(),onBack=typeof options?.onBack==='function'?options.onBack:null;myBidsView=null;if(!showBidContent(myBidsHTML(summary,BID_PAGE,!!onBack)))return false;myBidsView={limit:BID_PAGE,summary,key:JSON.stringify(summary),onBack};return true}
 function refreshMyBids(){
  if(!activeMyBids()){myBidsView=null;return false}
  const summary=bidSummary();if(myBidsView.summary===summary&&myBidsView.key)return false;const key=JSON.stringify(summary);if(myBidsView.key===key){myBidsView.summary=summary;return false}
  const modal=mainModal(),content=mainContent(),root=content?.querySelector?.('[data-my-bids-root]'),top=modal.scrollTop,focused=typeof document!=='undefined'?document.activeElement:null;
  let focusSelector='';if(root?.contains?.(focused))for(const action of ['raise','open','more','catalog','back']){const control=focused.closest?.('[data-my-bids-'+action+']');if(!control)continue;const id=Number(control.dataset?.[action==='raise'?'myBidsRaise':'myBidsOpen']);focusSelector=positive(id)?'[data-my-bids-'+action+'="'+id+'"]':'[data-my-bids-'+action+']';break}
  const html=myBidsHTML(summary,myBidsView.limit,!!myBidsView.onBack);if(root&&'outerHTML'in root)root.outerHTML=html;else if(content)content.innerHTML=html;else return false;
  myBidsView.summary=summary;myBidsView.key=key;
  if(focusSelector){const target=content.querySelector?.(focusSelector)||content.querySelector?.('[data-my-bids-root] h2');target?.focus?.({preventScroll:true})}
  modal.scrollTop=top;return true;
 }
 function bidsChanged(){
  summaryCache=null;refreshMyBids();
  try{const EventType=window.Event||(typeof Event==='function'?Event:null);if(EventType&&typeof window.dispatchEvent==='function')window.dispatchEvent(new EventType('fas-bids-changed'))}catch{}
 }
 function openBidLot(id,raise){
  summaryCache=null;const row=bidSummary().rows.find(item=>item.id===id);if(!row||(raise?!row.canRaise:row.status!=='leading')){refreshMyBids();return false}
  const previousView=myBidsView;myBidsView=null;
  if(raise&&adapter.openBidLot){const opened=adapter.openBidLot(id)!==false;if(!opened){myBidsView=previousView;refreshMyBids()}return opened}
  openLot(id);
  if(raise&&typeof document!=='undefined'){
   const modal=mainModal(),form=document.querySelector?.('#bid-form'),input=document.querySelector?.('#bid');
   if(modal?.open&&modal.classList?.contains('lot-dialog')&&Number(form?.dataset?.lotId)===id&&!input?.disabled){form.scrollIntoView?.({block:'center',behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});input?.focus?.({preventScroll:true})}
  }
  return true;
 }
 function returnToCatalog(){myBidsView=null;if(adapter.returnToCatalog){adapter.returnToCatalog();return}mainModal()?.close?.();if(typeof reelsMode!=='undefined'&&reelsMode&&typeof setReels==='function')setReels(false)}
 function saveState(){
  try{localStorage.setItem(KEY,JSON.stringify({version:1,...preferences,watches:Object.fromEntries([...watches].sort((a,b)=>b[1].at-a[1].at).slice(0,MAX_WATCHED)),delivered:[...delivered].slice(-MAX_DELIVERED)}));return true}catch{return false}
 }
 function saveNotices(next){
  if(adapter.saveNotices){try{return adapter.saveNotices(next)===true}catch{return false}}
  try{localStorage.setItem('fas-notices',JSON.stringify(next));if(typeof lotNotices!=='undefined')lotNotices=next;if(typeof refreshSubscriptions==='function')refreshSubscriptions();return true}catch{return false}
 }
 function syncSettings(){if(typeof document==='undefined')return;document.querySelectorAll?.('[data-auction-browser-alerts]').forEach(node=>{node.textContent=(preferences.browser?'Выключить':'Включить')+' системные уведомления';node.disabled=permissionBusy});document.querySelectorAll?.('[data-auction-outbid]').forEach(node=>{node.checked=preferences.outbid})}
 function status(text){syncSettings();if(typeof document!=='undefined')document.querySelectorAll?.('[data-auction-alert-status]').forEach(node=>{node.textContent=text})}
 function baseline(){
  const book=ownBids();if(!object(book))return;
  for(const [key,bid]of Object.entries(book)){
   const id=Number(key);if(!positive(id)||!object(bid)||!positive(bid.price))continue;
   const old=watches.get(id),at=stamp(bid.history?.at?.(-1)?.at),past=notices().filter(n=>n.type==='outbid'&&n.lotId===id&&positive(n.currentPrice)).reduce((value,n)=>Math.max(value,n.currentPrice),0);
   if(!old||old.price!==bid.price)watches.set(id,{price:bid.price,at:at||old?.at||0,notified:Math.max(bid.price,past,old?.notified||0)});
  }
 }
 function configure(options={}){adapter={...adapter,...options};baseline();bidsChanged();return state()}
 function money(value){return positive(value)?value.toLocaleString('ru-RU')+' ₽':'не указана'}
 function noticeText(notice){return notice?.type==='outbid'?'Вашу ставку '+money(notice.ownPrice)+' перебили. Новая цена: '+money(notice.currentPrice)+'.':'Новый лот по вашей подборке.'}
 function openLot(id){const lot=indexedLots().get(id);if(!lot||!eligible(lot))return;if(adapter.openLot)adapter.openLot(id);else if(typeof openCar==='function')openCar(id)}
 async function browserAlert(notice){
  const N=window.Notification;if(!preferences.browser||!N||N.permission!=='granted'||!notice?.id||delivered.has(notice.id)||delivering.has(notice.id))return false;
  delivering.add(notice.id);
  try{
   const title=notice.type==='outbid'?'Вашу ставку перебили':'Новый лот по вашему поиску',options={body:String(notice.name||'Имущество').slice(0,200)+' · '+noticeText(notice),tag:notice.type==='outbid'?'fas-outbid-'+notice.lotId:'fas-new-lot-'+notice.lotId,data:{lotId:notice.lotId},icon:'assets/app/icon-192.png?v=20261116-gradient1'};
   const registration=await window.navigator?.serviceWorker?.getRegistration?.();
   if(registration?.showNotification)await registration.showNotification(title,options);
   else{const notification=new N(title,options);notification.onclick=()=>{window.focus?.();openLot(notice.lotId);notification.close?.()}}
   delivered.add(notice.id);while(delivered.size>MAX_DELIVERED)delivered.delete(delivered.values().next().value);saveState();return true;
  }catch{status('Системное уведомление недоступно. Оно сохранено внутри сайта.');return false}finally{delivering.delete(notice.id)}
 }
 function recordOwnBid(id,price){
  id=Number(id);if(!positive(id)||!positive(price))return false;
  const old=watches.get(id),at=Date.now();watches.set(id,{price,at,notified:Math.max(price,old?.notified||0)});
  const previous=notices(),next=previous.map(notice=>notice.type==='outbid'&&notice.lotId===id&&!notice.read&&positive(notice.currentPrice)&&notice.currentPrice<=price?{...notice,read:true}:notice);
  if(next.some((notice,index)=>notice!==previous[index]))saveNotices(next);
  while(watches.size>MAX_WATCHED){const oldest=[...watches].sort((a,b)=>a[1].at-b[1].at)[0];watches.delete(oldest[0])}
  saveState();bidsChanged();return true;
 }
 function reportAuctionUpdate(event){
  if(!object(event)||event.actorOwn!==false)return {ok:false,reason:'not-an-external-update'};
  const id=Number(event.lotId),price=event.price;if(!positive(id)||!positive(price))return {ok:false,reason:'invalid-update'};
  try{window.FasAssistantPreferences?.onAuctionUpdate?.(event)}catch{}
  bidsChanged();if(!preferences.outbid)return {ok:false,reason:'not-an-external-update'};
  baseline();const own=watches.get(id),lot=indexedLots().get(id);
  if(!own||!lot||!eligible(lot))return {ok:false,reason:'not-watched-live-lot'};
  const at=event.occurredAt===undefined?Date.now():stamp(event.occurredAt);if(!at||at<own.at||at>Date.now()+300000)return {ok:false,reason:'stale-update'};
  if(price<=own.price||price<=own.notified)return {ok:false,reason:'not-higher'};
  const previous=notices(),unread=previous.find(notice=>notice.type==='outbid'&&notice.lotId===id&&!notice.read),createdAt=new Date(at).toISOString();
  const notice={id:unread?.id||'outbid-'+id+'-'+at+'-'+price,type:'outbid',lotId:id,name:String(lot.name||'Имущество').slice(0,300),ownPrice:own.price,currentPrice:price,createdAt,read:false};
  const next=(unread?previous.map(item=>item===unread?notice:item):[notice,...previous]).slice(0,50);
  if(!saveNotices(next))return {ok:false,reason:'storage-failed'};
  own.notified=price;saveState();try{window.FasAssistantPreferences?.onNotice?.(notice)}catch{}void browserAlert(notice);return {ok:true,notice};
 }
 function onNewLotNotice(notice){if(notice&&notice.type!=='outbid'&&positive(notice.lotId)){try{window.FasAssistantPreferences?.onNotice?.(notice)}catch{}void browserAlert(notice)}}
 async function toggleBrowserAlerts(){
  if(permissionBusy)return {ok:false,reason:'busy'};
  if(preferences.browser){preferences.browser=false;saveState();status('Системные уведомления выключены. Уведомления внутри сайта остаются.');return {ok:true,enabled:false}}
  const N=window.Notification;if(!N||typeof N.requestPermission!=='function'){status('Браузер не поддерживает системные уведомления. Используйте уведомления внутри сайта.');return {ok:false,reason:'unsupported'}}
  if(N.permission==='denied'){status('Уведомления запрещены в настройках браузера. Внутри сайта они продолжают работать.');return {ok:false,reason:'denied'}}
  permissionBusy=true;syncSettings();
  try{const permission=N.permission==='granted'?'granted':await N.requestPermission();if(permission!=='granted'){status('Системные уведомления не включены. Уведомления внутри сайта остаются.');return {ok:false,reason:'not-granted'}}preferences.browser=true;saveState();status('Системные уведомления включены, пока сайт открыт. Доставка после закрытия сайта не подключена.');return {ok:true,enabled:true}}catch{status('Не удалось включить системные уведомления. Уведомления внутри сайта остаются.');return {ok:false,reason:'failed'}}finally{permissionBusy=false;syncSettings()}
 }
 function settingsHTML(){return '<section class="auction-alert-preferences"><h3>Ставки и новые лоты</h3><label><input type="checkbox" data-auction-outbid '+(preferences.outbid?'checked':'')+'><span>Сообщать, когда мою ставку перебили</span></label><p>Новые лоты приходят по вашим сохранённым поискам. Перебитая ставка определяется только по полученному обновлению торгов, а не по числу ставок.</p><button type="button" class="outline" data-auction-browser-alerts>'+(preferences.browser?'Выключить':'Включить')+' системные уведомления</button><p class="auction-alert-status" role="status" data-auction-alert-status>Уведомления работают в этом браузере при открытом сайте. Доставка после закрытия, SMS и уведомления приложения пока не подключены.</p></section>'}
 function state(){return {...preferences,watched:watches.size,permission:window.Notification?.permission||'unsupported'}}
 if(typeof document!=='undefined'){
  document.addEventListener('change',event=>{if(!event.target.matches?.('[data-auction-outbid]'))return;preferences.outbid=event.target.checked===true;const saved=saveState();status(saved?(preferences.outbid?'Оповещения о перебитой ставке включены.':'Оповещения о перебитой ставке выключены.'):'Настройка действует до закрытия страницы: сохранить её не удалось.')});
  document.addEventListener('click',event=>{
   const target=event.target;
   if(target.closest?.('[data-auction-browser-alerts]')){event.preventDefault();void toggleBrowserAlerts();return}
   if(target.closest?.('[data-my-bids-back]')&&activeMyBids()){event.preventDefault();const onBack=myBidsView.onBack;myBidsView=null;onBack?.();return}
   const raise=target.closest?.('[data-my-bids-raise]'),open=target.closest?.('[data-my-bids-open]');if(raise||open){event.preventDefault();const id=Number((raise||open).dataset?.[raise?'myBidsRaise':'myBidsOpen']);if(positive(id))openBidLot(id,!!raise);return}
   if(target.closest?.('[data-my-bids-catalog]')){event.preventDefault();returnToCatalog();return}
   if(target.closest?.('[data-my-bids-more]')&&activeMyBids()){event.preventDefault();myBidsView.limit+=BID_PAGE;myBidsView.key='';refreshMyBids()}
  });
 }
 window.addEventListener?.('fas-auction-update',event=>reportAuctionUpdate(event.detail));
 window.FasAuctionNotifications=Object.freeze({configure,recordOwnBid,reportAuctionUpdate,onNewLotNotice,settingsHTML,noticeText,toggleBrowserAlerts,state,bidSummary,openMyBids,refreshMyBids,refreshPrices:bidsChanged});
 baseline();
})();
