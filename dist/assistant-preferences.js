/* Device-local assistant preferences. Speech is opt-in and works only while this page is visible. */
(()=>{
 'use strict';
 if(window.FasAssistantPreferences)return;
 const KEY='fas-assistant-preferences-v1:',MAX_SEEN=500,MAX_TRACKED=5000,QUEUE_LIMIT=5;
 const labels={outbid:'Мою ставку перебили',newBidOwn:'Новая ставка на мой лот',endingSoon:'Скоро завершатся интересующие торги',auctionEnded:'Завершились интересующие торги',matchingNew:'Новый лот по сохранённому поиску',priceDrop:'Снизилась цена избранного лота'};
 const defaults=()=>({spoken:false,outbid:false,newBidOwn:false,endingSoon:false,auctionEnded:false,matchingNew:false,priceDrop:false,endingMinutes:30,quiet:false,quietStart:'22:00',quietEnd:'08:00'});
 const boolKeys=new Set(['spoken','quiet',...Object.keys(labels)]),positive=n=>Number.isSafeInteger(n)&&n>0,record=v=>v&&typeof v==='object'&&!Array.isArray(v),clock=v=>typeof v==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(v);
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let adapter={},owner=null,preferences=defaults(),seen=new Set(),tracked=new Map(),source=null,sourceLength=-1,index=new Map(),ownIds=[],queue=[],speaking=null,generation=0,storageOK=true,pendingPreferences={},workspaceRaw,workspaceOwner='device';
 const read=(fn,fallback)=>{try{return fn()}catch{return fallback}};
 const now=()=>Date.now(),money=n=>positive(n)?n.toLocaleString('ru-RU')+' рублей':'цена не указана';
 function profile(){
  const p=read(()=>{
   if(adapter.getProfileId)return adapter.getProfileId();
   const raw=localStorage.getItem('fas-seller-workspace-v1');
   // Drafts can make the workspace large. Reparse only changed bytes while
   // still checking storage on each scope lookup for same-tab profile changes.
   if(raw!==workspaceRaw){
    workspaceRaw=raw;workspaceOwner='device';
    const workspace=JSON.parse(raw||'null'),id=workspace?.profile?.id;
    if(workspace?.version===1&&typeof id==='string'&&id.trim()&&id.length<=256)workspaceOwner=id;
    else workspaceOwner=window.FasSellerUI?.getProfile?.()?.id||'device';
   }
   return workspaceOwner;
  },null);
  return typeof p==='string'&&p.trim()&&p.length<=256?p:'device';
 }
 function key(){return KEY+encodeURIComponent(owner)}
 function sanitize(raw){const result=defaults();if(!record(raw))return result;for(const k of boolKeys)if(typeof raw[k]==='boolean')result[k]=raw[k];if(Number.isInteger(raw.endingMinutes)&&raw.endingMinutes>=1&&raw.endingMinutes<=1440)result.endingMinutes=raw.endingMinutes;for(const k of ['quietStart','quietEnd'])if(clock(raw[k]))result[k]=raw[k];return result}
 function load(reset=true){if(reset)pendingPreferences={};const value=read(()=>JSON.parse(localStorage.getItem(key())||'null'),null);preferences={...(value?.version===1&&value.owner===owner?sanitize(value.preferences):defaults()),...pendingPreferences};seen=new Set(value?.version===1&&value.owner===owner&&Array.isArray(value.seen)?value.seen.filter(x=>typeof x==='string'&&x.length<=240).slice(-MAX_SEEN):[])}
 function stopSpeech(){generation++;queue=[];if(speaking){speaking=null;read(()=>window.speechSynthesis?.cancel?.(),null)}}
 function scope(){const next=profile();if(next===owner)return false;stopSpeech();owner=next;tracked.clear();source=null;sourceLength=-1;index.clear();ownIds=[];load();return true}
 function save(){try{localStorage.setItem(key(),JSON.stringify({version:1,owner,preferences,seen:[...seen].slice(-MAX_SEEN)}));storageOK=true;pendingPreferences={};return true}catch{storageOK=false;return false}}
 function sharedState(){const value=read(()=>JSON.parse(localStorage.getItem(key())||'null'),null);if(value?.version!==1||value.owner!==owner){preferences={...defaults(),...pendingPreferences};return}preferences={...sanitize(value.preferences),...pendingPreferences};if(Array.isArray(value.seen))for(const id of value.seen.slice(-MAX_SEEN))if(typeof id==='string'&&id.length<=240)seen.add(id);while(seen.size>MAX_SEEN)seen.delete(seen.values().next().value)}
 function remember(id){sharedState();if(seen.has(id))return false;seen.add(id);while(seen.size>MAX_SEEN)seen.delete(seen.values().next().value);save();return true}
 const minute=value=>Number(value.slice(0,2))*60+Number(value.slice(3));
 function quietAt(time=now()){if(!preferences.quiet)return false;const date=new Date(time),value=date.getHours()*60+date.getMinutes(),start=minute(preferences.quietStart),end=minute(preferences.quietEnd);return start===end?true:start<end?value>=start&&value<end:start<=value||value<end}
 function visible(){return typeof document==='undefined'||document.hidden!==true}
 function microphone(){return read(()=>{const state=window.FasVoiceAssistant?.state?.();return state?.listening===true||state?.starting===true},false)}
 function drain(){
  if(scope()){sync();return}
  sharedState();
  if(speaking||!queue.length)return;
  if(!visible()||!preferences.spoken||quietAt()||microphone()){queue=[];return}
  const synth=window.speechSynthesis,Utterance=window.SpeechSynthesisUtterance;
  if(!synth?.speak||typeof Utterance!=='function'||synth.speaking||synth.pending){queue=[];return}
  const item=queue.shift(),current=generation;
  if(item.owner!==owner||!preferences[item.type]){drain();return}
  const utterance=new Utterance(item.text);utterance.lang='ru-RU';try{window.FasAssistantPersonalization?.decorateUtterance?.(utterance)}catch{}
  // A decorator may discover a changed local profile and synchronously cancel
  // this queue. Recheck both ownership and the latest other-tab mute before use.
  if(scope()||current!==generation||item.owner!==owner){sync();return}
  sharedState();if(!visible()||!preferences.spoken||!preferences[item.type]||quietAt()||microphone()){queue=[];return}
  speaking=utterance;
  const finish=()=>{if(current!==generation||speaking!==utterance)return;speaking=null;drain()};utterance.onend=finish;utterance.onerror=finish;
  try{synth.speak(utterance)}catch{finish()}
 }
 function announce(type,id,text){
  scope();if(!Object.hasOwn(labels,type)||!preferences[type]||typeof id!=='string'||id.length>240||!remember(id))return {ok:false,reason:'disabled-or-duplicate'};
  if(preferences.spoken&&visible()&&!quietAt()&&!microphone()){queue.push({owner,type,text:String(text).slice(0,600)});if(queue.length>QUEUE_LIMIT)queue.shift();drain()}
  return {ok:true,spoken:!!speaking};
 }
 function allLots(){const value=read(()=>adapter.getLots?.()??(typeof cars!=='undefined'?cars:[]),[]);return Array.isArray(value)?value:[]}
 function isOwn(lot){return read(()=>adapter.getIsOwn?adapter.getIsOwn(lot):typeof isOwnLot==='function'?isOwnLot(lot):!!(lot?.sellerOwnerId&&owner!=='device'&&lot.sellerOwnerId===owner),false)}
 function inventory(){const lots=allLots();if(lots!==source||lots.length!==sourceLength){source=lots;sourceLength=lots.length;index=new Map();ownIds=[];for(const lot of lots){if(!record(lot)||!positive(lot.id)||index.has(lot.id))continue;index.set(lot.id,lot);if(isOwn(lot))ownIds.push(lot.id)}}return index}
 function price(lot){return read(()=>adapter.getCurrentPrice?adapter.getCurrentPrice(lot):typeof current==='function'?current(lot):lot.price,null)}
 function live(lot){return read(()=>adapter.isLive?adapter.isLive(lot):typeof isLotLive==='function'?isLotLive(lot):lot?.status==='live'&&Date.parse(lot.ends)>now(),false)}
 function name(lot){return String(lot?.name||'Лот № '+lot?.id).slice(0,180)}
 function ownBids(){const value=read(()=>adapter.getOwnBids?.()??(typeof bids!=='undefined'?bids:{}),{});return record(value)?value:{}}
 function favorites(){const value=read(()=>adapter.getFavorites?.()??(typeof saved!=='undefined'?saved:[]),[]);return new Set(Array.isArray(value)?value.filter(positive).slice(-MAX_TRACKED):[])}
 function onAuctionUpdate(event){
  scope();if(!record(event)||event.actorOwn!==false||!positive(event.lotId)||!positive(event.price))return {ok:false,reason:'invalid-update'};
  if(!preferences.newBidOwn&&!preferences.outbid)return {ok:false,reason:'disabled'};
  const lot=inventory().get(event.lotId),at=Date.parse(event.occurredAt);
  if(!lot||!live(lot)||lot.auctionDirection==='descending'||price(lot)!==event.price||!Number.isFinite(at)||at>now()+300000||at<now()-86400000||Date.parse(lot.auctionUpdatedAt)!==at)return {ok:false,reason:'unconfirmed-auction-update'};
  if(isOwn(lot))return announce('newBidOwn','own:'+event.lotId+':'+at+':'+event.price,'Новая ставка на ваш лот «'+name(lot)+'»: '+money(event.price)+'.');
  const bid=ownBids()[event.lotId],own=bid?.price,ownAt=Date.parse(bid?.history?.at?.(-1)?.at);
  if(!positive(own)||event.price<=own||Number.isFinite(ownAt)&&at<ownAt)return {ok:false,reason:'not-outbid'};
  return announce('outbid','outbid:'+event.lotId+':'+event.price,'Вашу ставку на лот «'+name(lot)+'» перебили. Текущая цена: '+money(event.price)+'.');
 }
 function onNotice(notice){
  scope();if(!record(notice)||typeof notice.id!=='string'||!notice.id||notice.id.length>200||!positive(notice.lotId))return {ok:false,reason:'invalid-notice'};
  const type=notice.type==='outbid'?'outbid':'matchingNew';if(!preferences[type])return {ok:false,reason:'disabled'};
  const list=read(()=>adapter.getNotices?.()??(typeof lotNotices!=='undefined'?lotNotices:[]),[]),accepted=Array.isArray(list)&&list.some(row=>row?.id===notice.id&&row.lotId===notice.lotId&&row.type===notice.type&&row.currentPrice===notice.currentPrice&&row.ownPrice===notice.ownPrice);if(!accepted)return {ok:false,reason:'unconfirmed-notice'};
  const lot=inventory().get(notice.lotId);if(!lot||isOwn(lot)||!live(lot))return {ok:false,reason:'unavailable-lot'};
  if(type==='outbid'){const own=ownBids()[notice.lotId]?.price;if(!positive(own)||own!==notice.ownPrice||!positive(notice.currentPrice)||notice.currentPrice<=own||price(lot)!==notice.currentPrice)return {ok:false,reason:'unconfirmed-outbid'}}
  else if(notice.type&&notice.type!=='new-lot')return {ok:false,reason:'unsupported-notice'};
  return announce(type,type==='outbid'?'outbid:'+notice.lotId+':'+notice.currentPrice:'notice:'+notice.id,type==='outbid'?'Вашу ставку на лот «'+name(lot)+'» перебили. Текущая цена: '+money(notice.currentPrice)+'.':'Новый лот по вашему сохранённому поиску: «'+name(lot)+'».');
 }
 function tick(){
  scope();if(!visible()||!preferences.endingSoon&&!preferences.auctionEnded&&!preferences.priceDrop)return {checked:0};
  const byId=inventory(),book=ownBids(),favs=favorites(),ids=new Set([...Object.keys(book).map(Number).filter(positive),...favs,...ownIds].slice(-MAX_TRACKED));let checked=0;
  for(const id of ids){const lot=byId.get(id);if(!lot||['draft','deleted','cancelled','withdrawn','paused'].includes(lot.status)){tracked.delete(id);continue}const end=Date.parse(lot.ends),p=price(lot),remaining=end-now(),old=tracked.get(id),valid=Number.isFinite(end)&&positive(p),isLive=valid&&live(lot);if(!valid)continue;checked++;
   if(old&&old.end===end&&old.live&&remaining<=0&&preferences.auctionEnded)announce('auctionEnded','ended:'+id+':'+end,'Торги по лоту «'+name(lot)+'» завершились. Результат и обязательства проверьте в карточке.');
   if(isLive&&remaining>0&&remaining<=preferences.endingMinutes*60000&&preferences.endingSoon)announce('endingSoon','ending:'+id+':'+end,'До завершения торгов по лоту «'+name(lot)+'» осталось меньше '+preferences.endingMinutes+' минут.');
   if(old&&isLive&&old.live&&old.end===end&&favs.has(id)&&!isOwn(lot)&&p<old.price&&preferences.priceDrop)announce('priceDrop','drop:'+id+':'+end+':'+p,'Цена избранного лота «'+name(lot)+'» снизилась до '+money(p)+'.'+(lot.auctionDirection==='descending'?' По опубликованному расписанию торгов.':''));
   tracked.set(id,{end,price:p,live:isLive});
  }
  for(const id of tracked.keys())if(!ids.has(id))tracked.delete(id);
  return {checked};
 }
 function state(){scope();return {...preferences,scope:owner,storageAvailable:storageOK,queued:queue.length,quietNow:quietAt(),eventTypes:{...labels}}}
 function sync(){
  if(typeof document==='undefined')return;
  document.querySelectorAll?.('[data-assistant-pref-owner]').forEach(panel=>{
   const current=panel.dataset.assistantPrefOwner===owner;
   panel.querySelectorAll?.('[data-assistant-pref]').forEach(node=>{node.disabled=!current;if(!current)return;const k=node.dataset.assistantPref;if(!Object.hasOwn(preferences,k))return;if(boolKeys.has(k))node.checked=preferences[k];else node.value=String(preferences[k])});
   const status=panel.querySelector?.('[data-assistant-pref-status]');if(status)status.textContent=!current?'Профиль изменился. Откройте настройки помощника заново.':storageOK?'Настройки сохранены на этом устройстве.':'Настройка действует до закрытия страницы: сохранить её не удалось.';
  });
 }
 function setPreference(k,value){
  scope();if(!Object.hasOwn(defaults(),k))return {ok:false,handled:true,message:'Неизвестная настройка помощника.'};
  if(boolKeys.has(k)&&typeof value!=='boolean'||k==='endingMinutes'&&(!Number.isInteger(value)||value<1||value>1440)||['quietStart','quietEnd'].includes(k)&&!clock(value))return {ok:false,handled:true,message:'Проверьте значение настройки.'};
  sharedState();
  preferences={...preferences,[k]:value};pendingPreferences[k]=value;if(k==='spoken'&&!value||boolKeys.has(k)&&!value||k==='quiet'||k==='quietStart'||k==='quietEnd')stopSpeech();const persisted=save();sync();
  const title=labels[k]||{spoken:'Озвучивание событий',quiet:'Тихие часы',quietStart:'Начало тихих часов',quietEnd:'Конец тихих часов',endingMinutes:'За сколько минут напоминать'}[k];
  return {ok:true,handled:true,setting:k,value,message:title+': '+(typeof value==='boolean'?(value?'включено':'выключено'):value)+(k==='outbid'&&value?' — сообщать о перебитой ставке в ваших торгах':'')+(persisted?'.':' — только до закрытия страницы: сохранить настройку не удалось.')};
 }
 function parseCommand(text){
  const raw=String(text??'').trim().toLowerCase().replace(/ё/g,'е').replace(/[.!?]+$/,'').replace(/\s+/g,' ');
  if(/^(?:(?:открой|покажи|показать|открыть) )?(?:настройки (?:голосового )?помощника|настройки оповещений|настройки уведомлений(?: помощника)?)$/.test(raw))return {action:'preferences',request:{type:'show',scope:profile()}};
  const off=/^(?:не |перестань |прекрати |выключи |отключи |выключить |отключить )/.test(raw),on=/^(?:оповещай|сообщай|уведомляй|предупреждай|включи|включить|включать|озвучивай|говори|напоминай)/.test(raw);
  if(!off&&!on)return null;
  let key;if(/(?:тихие часы|ночной режим)/.test(raw))key='quiet';else if(/(?:озвучиван|озвучивай|говори вслух|голосовые оповещения|голосовые уведомления)/.test(raw))key='spoken';else if(/(?:мою ставку переб|моя ставка переб|перебит.{0,12}ставк|перебив.{0,12}ставк)/.test(raw))key='outbid';else if(/(?:нов.{0,8}ставк.{0,30}мо[йеию]{1,2} лот|ставк.{0,20}на мо[йеию]{1,2} лот)/.test(raw))key='newBidOwn';else if(/(?:нов.{0,8}ставк)/.test(raw))key='outbid';else if(/(?:нов.{0,8}лот.{0,25}(?:поиск|подборк)|лот.{0,20}по сохраненному поиску)/.test(raw))key='matchingNew';else if(/(?:сниже.{0,10}цен|цена.{0,10}сниз|подешев|падени.{0,10}цен)/.test(raw))key='priceDrop';else if(/(?:скоро.{0,15}заверш|скоро.{0,15}конч|до конца|об окончании|перед окончанием)/.test(raw))key='endingSoon';else if(/(?:завершен.{0,10}торг|торги заверш|результат.{0,10}торг|окончани.{0,10}торг)/.test(raw))key='auctionEnded';
  if(!key)return null;return {action:'preferences',request:{type:'set',key,value:!off,scope:profile()}};
 }
 function execute(request){if(!record(request))return {ok:false,handled:true,message:'Настройка не распознана.'};scope();if(request.scope!==undefined&&request.scope!==owner)return {ok:false,handled:true,message:'Профиль изменился. Задайте команду или откройте настройки заново.'};if(request.type==='show')return {ok:true,handled:true,showSettings:true,message:'Здесь можно выбрать события, озвучивание и тихие часы.'};if(request.type==='set')return setPreference(request.key,request.value);return {ok:false,handled:true,message:'Настройка не распознана.'}}
 function settingsHTML(){scope();return '<section class="assistant-preferences" data-assistant-preferences-panel data-assistant-pref-owner="'+esc(owner)+'" tabindex="-1"><h3>Как помощник сообщает о событиях</h3><p>Выберите нужные события. Озвучивание включается отдельно и работает при открытом, видимом сайте.</p><label><input type="checkbox" data-assistant-pref="spoken" '+(preferences.spoken?'checked':'')+'>Озвучивать выбранные события</label><div class="assistant-event-options">'+Object.entries(labels).map(([k,v])=>'<label><input type="checkbox" data-assistant-pref="'+k+'" '+(preferences[k]?'checked':'')+'>'+esc(v)+'</label>').join('')+'</div><label>Напоминать до окончания за<select data-assistant-pref="endingMinutes">'+[5,15,30,60,180,1440].map(v=>'<option value="'+v+'" '+(preferences.endingMinutes===v?'selected':'')+'>'+v+' мин</option>').join('')+'</select></label><label><input type="checkbox" data-assistant-pref="quiet" '+(preferences.quiet?'checked':'')+'>Тихие часы — без озвучивания</label><div class="assistant-quiet-hours"><label>С<input type="time" data-assistant-pref="quietStart" value="'+preferences.quietStart+'"></label><label>До<input type="time" data-assistant-pref="quietEnd" value="'+preferences.quietEnd+'"></label></div><p>Используются только полученные события и данные этого устройства. Завершение торгов не подтверждает победу или оплату. Доставка после закрытия сайта не подключена.</p><p data-assistant-pref-status role="status">'+(storageOK?'Настройки сохранены на этом устройстве.':'Сохранить настройки не удалось.')+'</p></section>'}
 function configure(options={}){adapter={...adapter,...options};scope();source=null;return state()}
 scope();
 document.addEventListener?.('change',event=>{const node=event.target;if(!node?.matches?.('[data-assistant-pref]'))return;scope();const panel=node.closest?.('[data-assistant-pref-owner]');if(!panel||panel.dataset.assistantPrefOwner!==owner||node.isConnected===false||panel.isConnected===false){sync();return}const k=node.dataset?.assistantPref;setPreference(k,boolKeys.has(k)?node.checked===true:k==='endingMinutes'?Number(node.value):node.value)});
 document.addEventListener?.('visibilitychange',()=>{if(!visible())stopSpeech();scope()});
 window.addEventListener?.('storage',event=>{const changed=scope();if(changed||event.key===key()){stopSpeech();load(false);sync()}});
 setInterval(()=>tick(),15000);
 window.FasAssistantPreferences=Object.freeze({configure,state,settingsHTML,parseCommand,execute,onAuctionUpdate,onNotice,tick,pauseSpeech:stopSpeech});
})();
