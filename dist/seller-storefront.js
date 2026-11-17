/* Buyer-facing projection of published listings only. Private workspaces and personal reviews are never read. */
(()=>{
 'use strict';
 if(window.FasSellerStorefront)return;
 const PAGE_SIZE=12,MAX_ID_LENGTH=256;
 const blocked=new Set(['draft','deleted','cancelled','withdrawn','paused','unavailable']);
 const kindLabels={private:'Частный продавец',bank:'Банк',leasing:'Лизинговая компания',company:'Организация'};
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const text=(value,max=240)=>typeof value==='string'?value.trim().replace(/\s+/g,' ').slice(0,max):'';
 const validId=value=>Number.isSafeInteger(value)&&value>0;
 const record=value=>value&&typeof value==='object'&&!Array.isArray(value);
 const date=value=>typeof value==='number'&&Number.isFinite(value)?value:typeof value==='string'?Date.parse(value):NaN;
 const read=(action,fallback)=>{try{return action()}catch{return fallback}};
 let config={},source=null,sourceLength=-1,indexRevision=null,positions=new Map(),groups=new Map(),directoryCache=null;
 let anchorId=null,anchorIdentity=null,tab='active',page=0,origin=null,snapshot=null,rows=[],profile=null;
 let lotReturn=null,routeEpoch=0;
 const dialog=document.createElement('dialog');dialog.id='seller-storefront-dialog';dialog.className='seller-storefront-dialog';dialog.setAttribute('aria-labelledby','seller-storefront-title');document.body.appendChild(dialog);
 function allLots(){const value=read(()=>config.getLots?.()??(typeof cars!=='undefined'?cars:[]),[]);return Array.isArray(value)?value:[]}
 function opaque(value){if(typeof value==='number')return validId(value)?String(value):'';return typeof value==='string'&&value.trim()&&value.length<=MAX_ID_LENGTH&&!/[\u0000-\u001f\u007f]/.test(value)?value.trim():''}
 function publicName(lot,kind){return kind==='private'?text(lot.sellerName)||text(lot.publicDisplayName)||'Частный продавец':text(lot.bank)||text(lot.organizationName)||text(lot.sellerName)||text(lot.publicDisplayName)||'Продавец'}
 function identity(lot){
  if(!record(lot)||!validId(lot.id))return null;
  const owner=typeof lot.sellerOwnerId==='string'?opaque(lot.sellerOwnerId):'';
  const declared=text(lot.sellerType,30).toLowerCase(),kind=owner||declared==='private'?'private':['bank','leasing'].includes(declared)?declared:'company';
  const name=publicName(lot,kind);
  if(owner)return {key:'private:'+owner,kind,name,demo:lot.privateSellerDemo===true||lot.demo===true};
  if(kind!=='private'){
   const ids=[...new Set([lot.sellerOrganizationId,lot.organizationId,lot.orgId,lot.sellerOrgId].map(opaque).filter(Boolean))];
   if(ids.length===1)return {key:'organization:'+ids[0],kind,name,demo:lot.demo===true};
   if(lot.demo===true&&!lot.demoEdited&&ids.length===0&&text(lot.bank))return {key:'demo-organization:'+kind+':'+name.normalize('NFKC').toLocaleLowerCase('ru'),kind,name,demo:true};
  }
  if(kind==='private'||text(lot.bank)||text(lot.sellerName)||text(lot.organizationName)||text(lot.publicDisplayName))return {key:'listing:'+lot.id,kind,name,demo:lot.demo===true||lot.privateSellerDemo===true,unlinked:true};
  return null;
 }
 function revision(){return read(()=>config.getRevision?.()??(typeof subscriptionInventoryRevision!=='undefined'?subscriptionInventoryRevision:null),null)}
 function invalidate(){source=null;sourceLength=-1;indexRevision=null;positions.clear();groups.clear();directoryCache=null}
 function inventory(){
  const lots=allLots(),nextRevision=revision();
  if(lots!==source||lots.length!==sourceLength||nextRevision!==indexRevision){
   source=lots;sourceLength=lots.length;indexRevision=nextRevision;positions=new Map();groups=new Map();directoryCache=null;
   for(let i=0;i<lots.length;i++){const lot=lots[i];if(!record(lot)||!validId(lot.id)||positions.has(lot.id))continue;positions.set(lot.id,i);if(blocked.has(lot.status))continue;const seller=identity(lot);if(!seller)continue;if(!groups.has(seller.key))groups.set(seller.key,[]);groups.get(seller.key).push(i)}
  }
  return lots;
 }
 function lotById(id){
  const lots=inventory(),position=positions.get(Number(id)),lot=lots[position];
  if(lot?.id===Number(id))return lot;
  // Same-length replacement is uncommon, but never return the old object.
  if(position!==undefined||lots.some(row=>row?.id===Number(id))){invalidate();const fresh=inventory();return fresh[positions.get(Number(id))]||null}
  return null;
 }
 function live(lot){return read(()=>config.isLive?.(lot)??(typeof isLotLive==='function'?isLotLive(lot):lot.status==='live'&&date(lot.ends)>Date.now()),false)}
 function publishedEvidence(lot){return lot.demo===true&&!lot.demoEdited||lot.privateSellerDemo===true&&!!opaque(lot.sellerOwnerId)||Number.isFinite(date(lot.publishedAt))&&date(lot.publishedAt)<=Date.now()}
 function publicState(lot){
  if(!record(lot)||!validId(lot.id)||blocked.has(lot.status)||!text(lot.name,300))return null;
  if(live(lot))return 'active';
  if(!publishedEvidence(lot))return null;
  const now=Date.now(),end=date(lot.ends),start=date(lot.startsAt??lot.starts);
  if(Number.isFinite(start)&&start>now)return null;
  if(lot.status==='sold')return Number.isFinite(date(lot.soldAt))&&date(lot.soldAt)<=now?'completed':null;
  return Number.isFinite(end)&&end<=now&&(!Number.isFinite(start)||start<end)&&['live','ended','scheduled',undefined,''].includes(lot.status)?'completed':null;
 }
 function contact(lot){
  if(!(lot.publicContactOptIn===true||lot.showPublicContact===true||lot.privateSellerDemo===true&&opaque(lot.sellerOwnerId)))return '';
  const value=text(lot.publicContact,40);return /^\+?[\d ()-]{6,30}$/.test(value)&&value.replace(/\D/g,'').length>=6?value:'';
 }
 function price(lot){return read(()=>config.getPrice?.(lot)??(typeof current==='function'?current(lot):lot.price),null)}
 function money(value){return Number.isSafeInteger(value)&&value>0?value.toLocaleString('ru-RU')+' ₽':'Цена не указана'}
 function distance(lot){return read(()=>config.getDistance?.(lot)??(typeof distanceToLot==='function'?distanceToLot(lot):Infinity),Infinity)}
 function collect(lot){
  const seller=identity(lot);if(!seller||!publicState(lot))return false;
  rows=(groups.get(seller.key)||[]).map(position=>source[position]).filter(row=>identity(row)?.key===seller.key&&publicState(row));
  // All displayed metadata comes from a currently public listing, not the
  // private seller profile, purchase ledger, wallet or local rating notes.
  const names=[...new Set(rows.map(row=>publicName(row,identity(row).kind)))],cities=[...new Set(rows.map(row=>text(row.city,100)).filter(Boolean))],contacts=[...new Set(rows.filter(row=>publicState(row)==='active').map(contact).filter(Boolean))];
  profile={name:names.length===1?names[0]:seller.name,kind:seller.kind,demo:seller.demo,unlinked:seller.unlinked===true,city:cities.length===1?cities[0]:cities.length>1?'Объявления в '+cities.length+' городах':'Город не указан',contact:contacts.length===1?contacts[0]:''};
  return true;
 }
 // Public organization directory data. Viewer preferences are handled separately.
 function organizationInfo(lot,seller,publicRows){
  const active=publicRows.filter(row=>publicState(row)==='active'),completed=publicRows.filter(row=>publicState(row)==='completed');
  if(!active.length&&!completed.length)return null;
  const names=[...new Set(publicRows.map(row=>publicName(row,identity(row).kind)))],cities=[...new Set(publicRows.map(row=>text(row.city,100)).filter(Boolean))],kinds=[...new Set(publicRows.map(row=>identity(row).kind))];
  return {key:seller.key,lotId:lot.id,name:names.length===1?names[0]:seller.name,kind:kinds.length===1?kinds[0]:'company',demo:publicRows.every(row=>identity(row).demo),unlinked:seller.unlinked===true,city:cities.length===1?cities[0]:cities.length>1?'Объявления в '+cities.length+' городах':'Город не указан',activeCount:active.length,completedCount:completed.length};
 }
 function publicSellerInfo(id,options={}){
  if(options.force)invalidate();const lot=lotById(Number(id)),seller=identity(lot);
  if(!seller||seller.kind==='private'||!publicState(lot))return null;
  const publicRows=(groups.get(seller.key)||[]).map(position=>source[position]).filter(row=>identity(row)?.key===seller.key&&publicState(row));
  return organizationInfo(lot,seller,publicRows);
 }
 function publicOrganizations(options={}){
  if(options.force)invalidate();inventory();const now=Date.now();if(directoryCache&&now<directoryCache.expires)return directoryCache.rows.map(row=>({...row}));const result=[];let expires=now+30000;
  for(const [key,indices]of groups){
   for(const position of indices){const row=source[position];for(const value of [row?.startsAt??row?.starts,row?.ends,row?.publishedAt,row?.soldAt]){const at=date(value);if(at>now)expires=Math.min(expires,at)}}
   const publicRows=indices.map(position=>source[position]).filter(row=>{const seller=identity(row);return seller?.key===key&&seller.kind!=='private'&&publicState(row)});
   if(!publicRows.length)continue;const lot=publicRows.find(row=>publicState(row)==='active')||publicRows[0],seller=identity(lot),info=organizationInfo(lot,seller,publicRows);if(info)result.push(info);
  }
  result.sort((a,b)=>a.name.localeCompare(b.name,'ru')||a.lotId-b.lotId);directoryCache={rows:result,expires};return result.map(row=>({...row}));
 }
 function refreshProfile(){if(!dialog.open||top()!==dialog)return false;const saved=dialog.scrollTop;render();dialog.scrollTop=saved;return true}
 function safePhoto(lot){
  const value=read(()=>typeof image==='function'?image(lot):lot.image,'');
  if(typeof lotMediaItem==='function'){const item=read(()=>lotMediaItem(lot,{url:value}),null);if(item?.type==='image')return item.url}
  if(typeof value==='string'&&/^assets\/[a-z0-9_./-]+\.(?:svg|jpe?g|webp|png)(?:\?view=\d+)?$/i.test(value)&&!value.includes('..'))return value;
  try{const url=new URL(value);if(url.protocol==='https:'&&!url.username&&!url.password)return url.href}catch{}
  return 'assets/other.svg';
 }
 function card(lot){
  const state=publicState(lot),original=safePhoto(lot),responsive=window.FasResponsiveMedia?.image?.(original),src=responsive?.src||original;
  const completed=state==='completed',sold=lot.status==='sold',amount=completed&&sold&&Number.isSafeInteger(lot.soldPrice)&&lot.soldPrice>0?lot.soldPrice:price(lot);
  const when=completed?(sold?date(lot.soldAt):date(lot.ends)):date(lot.ends),stamp=Number.isFinite(when)?new Date(when).toLocaleDateString('ru-RU'):'';
  const imageHTML='<img src="'+esc(src)+'"'+(responsive?' srcset="'+esc(responsive.srcset)+'" sizes="(max-width:600px) calc((100vw - 64px)/2), 240px" width="'+responsive.width+'" height="'+responsive.height+'"':'')+' data-storefront-image-original="'+esc(original)+'" loading="lazy" decoding="async" referrerpolicy="no-referrer" alt="'+esc(lot.name)+'">';
  const photo=completed?'<div class="storefront-lot-image">'+imageHTML+'</div>':'<button type="button" class="storefront-lot-image" data-storefront-open-lot="'+lot.id+'">'+imageHTML+'</button>';
  const title=completed?'<h3 class="storefront-lot-name">'+esc(text(lot.name,300))+'</h3>':'<button type="button" class="storefront-lot-name" data-storefront-open-lot="'+lot.id+'">'+esc(text(lot.name,300))+'</button>';
  const priceLabel=completed?(sold&&Number.isSafeInteger(lot.soldPrice)&&lot.soldPrice>0?'Указанная цена продажи':'Последняя указанная цена'):'Текущая цена';
  return '<article class="storefront-lot">'+photo+'<div>'+title+'<span>'+priceLabel+'</span><strong>'+esc(money(amount))+'</strong><span>'+esc(text(lot.city,100)||'Местоположение не указано')+'</span><small>'+esc(completed?(sold?'Указано: продано':'Объявление завершено'):'Идут торги')+(stamp?' · '+esc(stamp):'')+'</small></div></article>';
 }
 function lists(){
  const currentRows=rows.filter(lot=>identity(lot)?.key===anchorIdentity);
  const active=currentRows.filter(lot=>publicState(lot)==='active'),completed=currentRows.filter(lot=>publicState(lot)==='completed');
  active.sort((a,b)=>{const x=distance(a),y=distance(b);return (Number.isFinite(x)?x:Infinity)-(Number.isFinite(y)?y:Infinity)||a.id-b.id});
  completed.sort((a,b)=>(date(b.soldAt??b.ends)||0)-(date(a.soldAt??a.ends)||0)||b.id-a.id);
  return {active,completed};
 }
 function render(){
  const anchor=lotById(anchorId);if(!anchor||identity(anchor)?.key!==anchorIdentity||!collect(anchor)){rows=[];profile=null;dialog.innerHTML='<header class="storefront-header" data-dialog-swipe-header><h2 id="seller-storefront-title">Профиль продавца</h2><button type="button" data-storefront-close aria-label="Закрыть профиль продавца">×</button></header><p class="storefront-empty">Публичные объявления этого продавца сейчас недоступны.</p>';return}
  const collection=lists(),selected=collection[tab],pages=Math.max(1,Math.ceil(selected.length/PAGE_SIZE));page=Math.min(Math.max(0,page),pages-1);
  const phone=profile.contact?'<a class="outline storefront-contact" href="tel:'+esc(profile.contact.replace(/[^+\d]/g,''))+'">'+esc(profile.contact)+'</a>':'<span class="storefront-contact-note">Публичный телефон не предоставлен</span>';
  dialog.innerHTML='<header class="storefront-header" data-dialog-swipe-header><img src="assets/brand/fas-torgi-logo.png?v=20261116-gradient1" alt="ФАС торги — Федеральная аукционная сеть" width="128" height="80"><button type="button" data-storefront-close aria-label="Вернуться из профиля продавца">'+(typeof uiIcon==='function'?uiIcon('close'):'×')+'</button></header><div class="storefront-body"><div class="storefront-identity"><span class="storefront-avatar" aria-hidden="true">'+esc(Array.from(profile.name)[0]||'П')+'</span><div><span class="storefront-kind">'+kindLabels[profile.kind]+(profile.demo?' · демопрофиль':'')+'</span><h2 id="seller-storefront-title">'+esc(profile.name)+'</h2><p>'+esc(profile.city)+'</p></div></div><div class="storefront-contact-row">'+phone+'</div><div data-storefront-follow-slot></div><p class="storefront-trust">Данные продавца взяты из опубликованных объявлений. Проверка организации и публичные отзывы не подключены.</p>'+(profile.unlinked?'<p class="storefront-scope">У продавца пока нет общего публичного идентификатора: здесь показано только это объявление.</p>':'')+'<div class="storefront-tabs" role="group" aria-label="Объявления продавца"><button type="button" data-storefront-tab="active" aria-pressed="'+(tab==='active')+'">В продаже <span>'+collection.active.length+'</span></button><button type="button" data-storefront-tab="completed" aria-pressed="'+(tab==='completed')+'">Завершённые <span>'+collection.completed.length+'</span></button></div><p class="storefront-history-note">'+(tab==='completed'?'Только завершённые публичные объявления доступного каталога. Это не подтверждение покупки или оплаты.':'Активные публичные объявления доступного каталога. Сначала ближайшие, если известно ваше местоположение.')+'</p><div class="storefront-lots">'+(selected.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE).map(card).join('')||'<p class="storefront-empty">'+(tab==='completed'?'Публичная история завершённых объявлений не предоставлена.':'Активных публичных объявлений сейчас нет.')+'</p>')+'</div><nav class="storefront-pages" aria-label="Страницы объявлений продавца"><button class="outline" type="button" data-storefront-page="-1" '+(page===0?'disabled':'')+'>Назад</button><span>Страница '+(page+1)+' из '+pages+'</span><button class="outline" type="button" data-storefront-page="1" '+(page+1===pages?'disabled':'')+'>Далее</button></nav><p class="storefront-local-note">Показан каталог этого устройства. Общая серверная публикация, подтверждённые отзывы и реальные расчёты ещё не подключены. Личные контакты и черновики сюда не передаются; оформление текущего профиля показывается только на этом устройстве.</p><p class="storefront-error" data-storefront-error role="alert" hidden></p></div>';
  window.FasSellerFollowing?.mountProfile?.(dialog,anchorId);
  // Branding is an optional, separately guarded local projection; canonical identity stays visible.
  try{Promise.resolve(window.FasSellerBranding?.decorate?.(dialog.querySelector('.storefront-body'),identity(anchor))).catch(()=>{})}catch{}
 }
 function top(){return read(()=>window.FasDialogLifecycle?.top?.(),null)||Array.from(document.querySelectorAll('dialog[open]')).filter(node=>node.open).at(-1)||null}
 function open(id,trigger=null){
  const lot=lotById(Number(id)),seller=identity(lot);if(!seller||!publicState(lot))return false;
  lotReturn=null;routeEpoch++;
  anchorId=lot.id;anchorIdentity=seller.key;tab='active';page=0;collect(lot);if(!rows.some(row=>publicState(row)==='active'))tab='completed';
  if(!dialog.open){origin=trigger||document.activeElement;const modal=document.querySelector('#modal'),grid=document.querySelector('#grid');snapshot={modal,modalTop:modal?.scrollTop,grid,gridTop:grid?.scrollTop,gridLeft:grid?.scrollLeft,x:window.scrollX,y:window.scrollY}}
  render();document.querySelectorAll('video').forEach(video=>video.pause?.());document.body.classList.add('seller-storefront-open');if(!dialog.open)dialog.showModal();dialog.scrollTop=0;window.FasBackSwipe?.refreshHeaders?.();dialog.querySelector('[data-storefront-close]')?.focus?.({preventScroll:true});return true;
 }
 function close(){if(dialog.open&&top()===dialog)dialog.close()}
 function showError(message){const field=dialog.querySelector('[data-storefront-error]');if(field){field.hidden=false;field.textContent=message}}
 function currentLotId(content){return Number(content?.querySelector('[data-open-lot-id]')?.dataset.openLotId)}
 function previousLot(modal,content){
  if(!modal?.open||!modal.classList.contains('lot-dialog'))return null;
  const id=currentLotId(content),lot=lotById(id);if(!lot||publicState(lot)!=='active')return null;
  return {id,identity:identity(lot)?.key,own:read(()=>typeof isOwnLot==='function'&&isOwnLot(lot),false),nodes:Array.from(content.childNodes||content.children||[]),top:modal.scrollTop};
 }
 function restorePreviousLot(saved,modal,content){
  if(!saved)return false;
  const lot=lotById(saved.id);
  if(!lot||publicState(lot)!=='active'||identity(lot)?.key!==saved.identity||read(()=>typeof isOwnLot==='function'&&isOwnLot(lot),false)!==saved.own)return false;
  content.innerHTML='';for(const node of saved.nodes)content.appendChild(node);
  modal.classList.add('lot-dialog');modal.showModal();modal.scrollTop=saved.top;
  if(typeof syncLotSwipeSurface==='function')syncLotSwipeSurface();
  // Keep the user's typed amount, but revalidate it against the current quote.
  if(typeof syncCurrentPriceViews==='function')syncCurrentPriceViews(false);
  return true;
 }
 function returnFromLot(){
  const saved=lotReturn;
  if(!saved||saved.epoch!==routeEpoch||!saved.modal.open||top()!==saved.modal||currentLotId(saved.content)!==saved.id||saved.content.querySelector('[data-open-lot-id]')!==saved.child)return false;
  lotReturn=null;
  if(!saved.mapRoute||read(()=>window.FasPropertyMap?.returnFromLot?.(),false)!==true){saved.modal.close();restorePreviousLot(saved.previous,saved.modal,saved.content)}
  anchorId=saved.anchorId;anchorIdentity=saved.identity;tab=saved.tab;page=saved.page;
  snapshot=saved.snapshot;origin=saved.origin;
  window.FasSellerFollowing?.resumeDirectoryForLot?.(saved.directoryRoute);render();document.body.classList.add('seller-storefront-open');dialog.showModal();dialog.scrollTop=saved.top;
  window.FasBackSwipe?.refreshHeaders?.();return true;
 }
 function openLot(id){
  if(!dialog.open||top()!==dialog)return false;const lot=lotById(Number(id));if(!lot||identity(lot)?.key!==anchorIdentity||publicState(lot)!=='active'){showError('Объявление изменилось или больше недоступно для участия в торгах.');return false}
  const modal=document.querySelector('#modal');
  if(modal?.open&&modal.classList.contains('seller-dialog')){if(window.FasSellerUI?.prepareNavigation?.()!==true){showError('Сначала сохраните изменения в личном кабинете. Они остаются в открытой форме.');return false}}
  else if(modal?.open&&!modal.classList.contains('lot-dialog')&&modal.querySelector('form')){showError('Сначала сохраните или закройте предыдущую форму.');return false}
  const opener=config.openLot||(typeof openCar==='function'?openCar:null);if(!opener){showError('Карточка лота сейчас недоступна.');return false}
  const content=document.querySelector('#modal-content');if(!modal||!content)return false;
  const saved={id:lot.id,modal,content,previous:previousLot(modal,content),anchorId,identity:anchorIdentity,tab,page,top:dialog.scrollTop,snapshot,origin,epoch:++routeEpoch};
  saved.mapRoute=read(()=>window.FasPropertyMap?.state?.().open,false)&&typeof window.FasPropertyMap?.openLot==='function';
  lotReturn=saved;
  // Native close events are queued. A later close must not restore the old
  // lot's scroll/focus after an explicit transition to another listing.
  saved.directoryRoute=window.FasSellerFollowing?.suspendDirectoryForLot?.()||null;snapshot=null;origin=null;dialog.close();
  try{
   // The map's adapter preserves its native top-layer order, map state and
   // previous lot. Otherwise the storefront owns this one child transition.
   if(saved.mapRoute){if(window.FasPropertyMap.openLot(lot.id)===false)throw Error('map navigation refused')}else opener(lot.id);
   if(!modal.open||currentLotId(content)!==lot.id)throw Error('listing unavailable');
   saved.child=content.querySelector('[data-open-lot-id]');
   const back=content.querySelector('[data-close-lot]');if(back){back.textContent='← К профилю продавца';back.setAttribute('aria-label','Вернуться к профилю продавца')}
   return true;
  }catch{
   lotReturn=null;restorePreviousLot(saved.previous,modal,content);snapshot=saved.snapshot;origin=saved.origin;
   window.FasSellerFollowing?.resumeDirectoryForLot?.(saved.directoryRoute);document.body.classList.add('seller-storefront-open');dialog.showModal();dialog.scrollTop=saved.top;showError('Не удалось открыть объявление. Профиль продавца сохранён.');return false;
  }
 }
 function buttonHTML(lot){const seller=identity(lot);if(!seller)return '';const branding=window.FasPartnerBranding?.html?.(lot),fallback='<span class="seller-identity-mark" aria-hidden="true">'+(typeof uiIcon==='function'?uiIcon(seller.kind==='private'?'user':'building'):'')+'</span><span class="seller-identity-copy"><span class="seller-identity-name">'+esc(seller.name)+'</span><small>'+esc(kindLabels[seller.kind])+'</small></span>';return '<button type="button" class="seller-storefront-entry seller-identity-entry" data-open-seller-storefront="'+lot.id+'" aria-label="'+esc('Открыть профиль продавца '+seller.name)+'">'+(branding||fallback)+'</button>'}
 function bootstrapEntries(){
  // Enhance only the handful of already mounted cards, without reading or
  // indexing the full inventory during initial page load.
  let count=0;
  for(const card of document.querySelectorAll('.card[data-lot],.featured-card[data-featured-lot]')){
   const id=Number(card.dataset.lot||card.dataset.featuredLot);if(!validId(id)||card.querySelector('[data-open-seller-storefront]'))continue;
   const host=card.querySelector('.seller-public-links')||card.querySelector('.location')||card,label=host.querySelector('.lot-partner')||host.querySelector('.lot-seller-name'),name=label?.querySelector('.lot-partner-name')?.textContent||label?.textContent||'Продавец',button=document.createElement('button');button.type='button';button.className='seller-storefront-entry seller-identity-entry';button.setAttribute('data-open-seller-storefront',id);button.setAttribute('aria-label','Открыть профиль продавца '+name);if(label){label.parentElement.insertBefore(button,label);button.appendChild(label)}else{button.textContent=name;host.appendChild(button)}count++;
  }
  return count;
 }
 function state(){const collection=dialog.open?lists():{active:[],completed:[]};return {open:dialog.open,lotId:anchorId,tab,page,pageSize:PAGE_SIZE,name:profile?.name||'',activeCount:collection.active.length,completedCount:collection.completed.length,visibleIds:collection[tab].slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE).map(lot=>lot.id)}}
 function configure(options={}){config={...config,...options};invalidate();return state()}
 dialog.addEventListener('close',()=>{if(dialog.open)return;document.body.classList.remove('seller-storefront-open');const saved=snapshot,focus=origin;snapshot=null;origin=null;if(saved){if(saved.modal?.isConnected!==false&&saved.modal)saved.modal.scrollTop=saved.modalTop;if(saved.grid?.isConnected!==false&&saved.grid){saved.grid.scrollTop=saved.gridTop;saved.grid.scrollLeft=saved.gridLeft}if(Number.isFinite(saved.y)&&window.scrollY!==saved.y)window.scrollTo?.({left:saved.x||0,top:saved.y,behavior:'instant'})}focus?.focus?.({preventScroll:true})});
 dialog.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation?.();close()}});
 dialog.addEventListener('click',event=>{const button=event.target.closest?.('[data-storefront-close],[data-storefront-tab],[data-storefront-page],[data-storefront-open-lot]');if(!button||top()!==dialog)return;event.preventDefault();if(button.hasAttribute('data-storefront-close')){close();return}if(button.dataset.storefrontOpenLot){openLot(Number(button.dataset.storefrontOpenLot));return}if(button.dataset.storefrontTab&&['active','completed'].includes(button.dataset.storefrontTab)){tab=button.dataset.storefrontTab;page=0}else if(button.dataset.storefrontPage&&!button.disabled)page+=Number(button.dataset.storefrontPage);render();dialog.scrollTop=0});
 dialog.addEventListener('error',event=>{const image=event.target;if(!image?.matches?.('img[data-storefront-image-original]'))return;if(!image.dataset.storefrontFailed){image.dataset.storefrontFailed='true';image.removeAttribute('srcset');image.src=image.dataset.storefrontImageOriginal}else image.hidden=true},true);
 document.addEventListener('click',event=>{const button=event.target.closest?.('[data-open-seller-storefront]');if(!button)return;event.preventDefault();event.stopPropagation?.();open(Number(button.dataset.openSellerStorefront),button)});
 window.FasSellerStorefront=Object.freeze({open,close,openLot,returnFromLot,buttonHTML,bootstrapEntries,configure,invalidate,state,publicSellerInfo,publicOrganizations,refreshProfile});
})();
