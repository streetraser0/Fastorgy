/* Optional local seller follows. No server registration, messages, schedules or verified identities. */
(()=>{
 'use strict';
 if(window.FasSellerFollowing||!window.FasSellerStorefront)return;
 const S=window.FasSellerStorefront,PREFIX='fas-seller-following-v1:',MAX_FOLLOWS=200,PAGE_SIZE=12;
 const kinds={bank:'Банки',leasing:'Лизинговые компании',company:'Организации и партнёры'},labels={bank:'Банк',leasing:'Лизинговая компания',company:'Организация'};
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const record=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
 const clean=value=>typeof value==='string'?value.trim().replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').slice(0,120):'';
 const normalize=value=>(typeof value==='string'?value:'').trim().replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').slice(0,512).normalize('NFKC').toLocaleLowerCase('ru').replace(/ё/g,'е');
 const validViewer=value=>typeof value==='string'&&value.trim()&&value.length<=256&&!/[\u0000-\u001f\u007f]/.test(value)?value.trim():null;
 const validSeller=key=>typeof key==='string'&&key.length<=512&&!/[\u0000-\u001f\u007f]/.test(key)&&(/^organization:.+/.test(key)||/^demo-organization:(?:bank|leasing|company):.+/.test(key));
 let config={},generation=0,directoryEpoch=0,models=[],directoryOrigin=null,directorySnapshot=null,suspension=null,lastVisited=null;
 let query='',kind='all',followedOnly=false,shown=PAGE_SIZE,directoryViewer=undefined,directoryBatch=null,loadFrame=0;
 const contexts=new WeakMap();
 const dialog=document.createElement('dialog');dialog.id='seller-directory-dialog';dialog.className='seller-storefront-dialog seller-directory-dialog';dialog.setAttribute('aria-labelledby','seller-directory-title');document.body.appendChild(dialog);
 const profileDialog=()=>document.querySelector('#seller-storefront-dialog');
 const top=()=>{try{return window.FasDialogLifecycle?.top?.()||Array.from(document.querySelectorAll('dialog[open]')).filter(node=>node.open).at(-1)||null}catch{return null}};
 const viewer=()=>{try{return validViewer(typeof config.getViewerId==='function'?config.getViewerId():window.FasSellerUI?.getProfile?.()?.id)}catch{return null}};
 const storage=()=>config.storage||window.localStorage;
 const keyFor=owner=>PREFIX+encodeURIComponent(owner);
 function load(owner=viewer()){
  if(!owner)return {ok:false,error:'Откройте личный кабинет, чтобы сохранить подписку на этом устройстве.'};
  try{
   const raw=storage().getItem(keyFor(owner));if(raw===null)return {ok:true,owner,raw,revision:0,entries:[]};
   if(typeof raw!=='string'||raw.length>131072)throw Error('invalid');
   const value=JSON.parse(raw);
   if(!record(value)||value.version!==1||value.owner!==owner||!Number.isSafeInteger(value.revision)||value.revision<0||!Array.isArray(value.entries)||value.entries.length>MAX_FOLLOWS)throw Error('invalid');
   const seen=new Set(),entries=value.entries.map(entry=>{const at=Date.parse(entry?.subscribedAt);if(!record(entry)||!validSeller(entry.sellerKey)||seen.has(entry.sellerKey)||!Number.isFinite(at)||at<0||at>Date.now()+300000)throw Error('invalid');seen.add(entry.sellerKey);return {sellerKey:entry.sellerKey,subscribedAt:new Date(at).toISOString()}});
   return {ok:true,owner,raw,revision:value.revision,entries};
  }catch{return {ok:false,owner,error:'Не удалось прочитать подписки этого профиля. Проверьте доступ к памяти браузера; данные не перезаписаны.'}}
 }
 function fieldError(slot,message){const note=slot?.querySelector('[data-follow-error],[data-directory-error]');if(note){note.hidden=!message;note.textContent=message||''}}
 function mountProfile(host,id){
  const slot=host?.querySelector('[data-storefront-follow-slot]');if(!slot)return;
  const seller=S.publicSellerInfo(id);slot.innerHTML='';if(!seller)return;
  const snapshot=load(),supported=!seller.unlinked&&validSeller(seller.key),followed=snapshot.ok&&snapshot.entries.some(entry=>entry.sellerKey===seller.key);
  slot.innerHTML='<div class="seller-follow-row"><button type="button" class="outline seller-follow-button" data-storefront-follow="'+seller.lotId+'" aria-pressed="'+!!followed+'">'+(followed?'Вы подписаны':'Подписаться на новые лоты')+'</button><p class="seller-follow-note">'+(supported?'Подписка сохраняется только на этом устройстве. Уведомления в Telegram и MAX ещё не подключены.':'Для подписки нужен общий публичный идентификатор организации. Пока доступно только отдельное объявление.')+'</p></div><p class="storefront-error" data-follow-error role="alert" hidden></p>';
  const button=slot.querySelector('[data-storefront-follow]');button.disabled=!supported||!snapshot.ok;
  contexts.set(button,{host,slot,id:seller.lotId,sellerKey:seller.key,snapshot,generation});
  if(!snapshot.ok&&supported)fieldError(slot,snapshot.error);
 }
 function toggle(button){
  const expected=contexts.get(button),host=expected?.host;
  if(!expected||!host?.open||top()!==host||!host.contains(button)||button.disabled)return false;
  const fail=message=>{fieldError(expected.slot,message);return false};
  if(expected.generation!==generation||viewer()!==expected.snapshot.owner)return fail('Профиль изменился. Закройте и снова откройте продавца; прежняя подписка не изменена.');
  const seller=expected.removeOnly?{key:expected.sellerKey}:S.publicSellerInfo(expected.id);
  if(!seller||seller.unlinked||seller.key!==expected.sellerKey||!validSeller(seller.key))return fail('Объявление или продавец изменились. Обновите профиль перед подпиской.');
  const previous=expected.snapshot;if(!previous.ok)return fail(previous.error);
  try{
   if(storage().getItem(keyFor(previous.owner))!==previous.raw)return fail('Подписки изменены в другой вкладке. Обновите профиль продавца и повторите действие.');
   const exists=previous.entries.some(entry=>entry.sellerKey===seller.key);
   if(expected.removeOnly&&!exists)return fail('Эта подписка уже удалена. Обновите каталог.');
   if(!exists&&previous.entries.length>=MAX_FOLLOWS)return fail('На устройстве сохранено '+MAX_FOLLOWS+' подписок. Удалите ненужную подписку перед добавлением новой.');
   const entries=exists?previous.entries.filter(entry=>entry.sellerKey!==seller.key):[...previous.entries,{sellerKey:seller.key,subscribedAt:new Date().toISOString()}];
   if(previous.revision>=Number.MAX_SAFE_INTEGER)return fail('Версия подписок больше не поддерживается. Данные не изменены.');
   const next=JSON.stringify({version:1,owner:previous.owner,revision:previous.revision+1,entries});
   if(viewer()!==previous.owner||top()!==host||!host.contains(button))return fail('Контекст изменился. Действие отменено.');
   storage().setItem(keyFor(previous.owner),next);
   if(storage().getItem(keyFor(previous.owner))!==next)return fail('Не удалось подтвердить сохранение подписки. Откройте продавца заново и проверьте настройку.');
   if(viewer()!==previous.owner)return fail('Профиль изменился. Проверьте подписку в исходном профиле.');
   if(expected.removeOnly)renderDirectory();else S.refreshProfile();return true;
  }catch{return fail('Подписка не сохранена: память браузера недоступна или заполнена. Освободите место и повторите действие.')}
 }
 function filtered(snapshot){
  const entries=snapshot.ok?snapshot.entries:[],selected=new Set(entries.map(entry=>entry.sellerKey)),needle=normalize(query);
  const available=new Set(models.map(item=>item.key)),missing=followedOnly?entries.filter(entry=>!available.has(entry.sellerKey)).map(entry=>({key:entry.sellerKey,orphan:true,name:'Продавец временно недоступен',city:'Подписка от '+new Date(entry.subscribedAt).toLocaleDateString('ru-RU')})):[];
  return [...models,...missing].filter(item=>(kind==='all'||item.kind===kind)&&(!needle||normalize(item.name+' '+item.city).includes(needle))&&(!followedOnly||selected.has(item.key)));
 }
 function directoryCard(item,selected,index){
  if(item.orphan)return '<article class="seller-directory-card"><div class="seller-directory-avatar" aria-hidden="true">—</div><div><h3>'+esc(item.name)+'</h3><p>'+esc(item.city)+'</p><p>Публичные объявления сейчас недоступны. Подписка сохранена на случай появления новых лотов.</p><button type="button" class="outline" data-directory-unfollow="'+index+'">Удалить подписку</button></div></article>';
  return '<article class="seller-directory-card"><div class="seller-directory-avatar" aria-hidden="true">'+esc(Array.from(item.name)[0]||'О')+'</div><div><span class="storefront-kind">'+esc(labels[item.kind]||labels.company)+(item.demo?' · демопрофиль':'')+'</span><h3>'+esc(item.name)+'</h3><p>'+esc(item.city)+'</p><p class="seller-directory-count">В продаже: '+item.activeCount+' · Завершено: '+item.completedCount+'</p>'+(item.unlinked?'<p class="seller-follow-note">Общий профиль пока не связан; показано одно объявление.</p>':'')+(selected.has(item.key)?'<span class="seller-directory-followed">Вы подписаны</span>':'')+'<button type="button" class="outline" data-directory-seller="'+item.lotId+'">Лоты продавца</button></div></article>';
 }
 function syncDirectoryViewer(){const activeViewer=viewer();if(activeViewer!==directoryViewer){directoryViewer=activeViewer;query='';kind='all';followedOnly=false;shown=PAGE_SIZE;directoryEpoch++}return activeViewer}
 function renderDirectory({preserveScroll=true}={}){
  syncDirectoryViewer();const saved=directoryBatch?.owner===viewer()?dialog.scrollTop:0,snapshot=load(),selected=new Set(snapshot.ok?snapshot.entries.map(entry=>entry.sellerKey):[]),visible=filtered(snapshot);shown=Math.min(Math.max(PAGE_SIZE,shown),visible.length);const pageRows=visible.slice(0,shown);directoryBatch={snapshot,selected,visible,owner:viewer()};
  dialog.innerHTML='<header class="storefront-header" data-dialog-swipe-header><img src="assets/brand/fas-torgi-logo.png?v=20261116-gradient1" alt="ФАС торги — Федеральная аукционная сеть" width="128" height="80"><button type="button" data-directory-close aria-label="Закрыть каталог продавцов">×</button></header><div class="storefront-body"><h2 id="seller-directory-title">Банки и партнёры</h2><p class="storefront-trust">Организации из публичных объявлений этого устройства. Тип продавца заявлен в объявлении; проверка организаций ещё не подключена.</p><form class="seller-directory-filters" data-directory-form><label>Название или город<input type="search" name="query" maxlength="120" value="'+esc(query)+'" data-directory-query autocomplete="off"></label><label>Тип продавца<select data-directory-kind><option value="all"'+(kind==='all'?' selected':'')+'>Все организации</option>'+Object.entries(kinds).map(([id,label])=>'<option value="'+id+'"'+(kind===id?' selected':'')+'>'+label+'</option>').join('')+'</select></label><button type="submit" class="primary">Найти</button><button type="button" class="outline" data-directory-followed aria-pressed="'+followedOnly+'">Мои подписки</button><button type="button" class="outline" data-directory-refresh>Обновить</button></form><p class="storefront-history-note">Найдено организаций: '+visible.length+'. Подписки локальные; автоматическая рассылка пока не подключена.</p>'+(!snapshot.ok?'<p class="storefront-error" role="status">'+esc(snapshot.error)+'</p>':'')+'<div class="seller-directory-grid">'+(pageRows.map((item,index)=>directoryCard(item,selected,index)).join('')||'<p class="storefront-empty">Подходящих публичных организаций нет. Измените поиск или фильтры.</p>')+'</div><p class="seller-directory-progress" data-directory-progress role="status"></p><p class="storefront-error" data-directory-error role="alert" hidden></p></div>';
  const queryField=dialog.querySelector('[data-directory-query]'),kindField=dialog.querySelector('[data-directory-kind]');if(queryField)queryField.value=query;if(kindField)kindField.value=kind;
  for(const button of dialog.querySelectorAll('[data-directory-unfollow]')){const item=pageRows[Number(button.dataset.directoryUnfollow)];if(item&&selected.has(item.key))contexts.set(button,{host:dialog,slot:dialog,sellerKey:item.key,snapshot,generation,removeOnly:true})}
  updateDirectoryProgress();dialog.scrollTop=preserveScroll?saved:0;queueDirectoryLoad();
 }
 function updateDirectoryProgress(){
  const status=dialog.querySelector('[data-directory-progress]'),total=directoryBatch?.visible.length||0;if(!status)return;
  status.textContent=total?shown<total?'Показано '+shown+' из '+total+' · Листайте вниз':'Все организации показаны · '+total:'';
 }
 function appendDirectoryBatch(){
  const batch=directoryBatch;if(!batch||!dialog.open||top()!==dialog||batch.owner!==viewer()||shown>=batch.visible.length||dialog.clientHeight<=0||dialog.scrollHeight-dialog.scrollTop-dialog.clientHeight>240)return;
  const list=dialog.querySelector('.seller-directory-grid');if(!list)return;
  const start=shown;shown=Math.min(shown+PAGE_SIZE,batch.visible.length);
  list.insertAdjacentHTML('beforeend',batch.visible.slice(start,shown).map((item,index)=>directoryCard(item,batch.selected,start+index)).join(''));
  for(const button of list.querySelectorAll('[data-directory-unfollow]')){if(contexts.has(button))continue;const item=batch.visible[Number(button.dataset.directoryUnfollow)];if(item&&batch.selected.has(item.key))contexts.set(button,{host:dialog,slot:dialog,sellerKey:item.key,snapshot:batch.snapshot,generation,removeOnly:true})}
  updateDirectoryProgress();queueDirectoryLoad();
 }
 function queueDirectoryLoad(){
  if(loadFrame)return;loadFrame=requestAnimationFrame(()=>{loadFrame=0;appendDirectoryBatch()});
 }
 dialog.addEventListener('scroll',queueDirectoryLoad,{passive:true});
 window.addEventListener('resize',queueDirectoryLoad);
 function readFilters(){query=clean(dialog.querySelector('[data-directory-query]')?.value);const value=dialog.querySelector('[data-directory-kind]')?.value;kind=Object.hasOwn(kinds,value)?value:'all';shown=PAGE_SIZE}
 function openDirectory(trigger=null){
  if(profileDialog()?.open)return false;
  directoryEpoch++;suspension=null;models=S.publicOrganizations();
  if(!dialog.open){directoryOrigin=trigger||document.activeElement;const modal=document.querySelector('#modal'),grid=document.querySelector('#grid');directorySnapshot={parent:top(),modal,modalContent:document.querySelector('#modal-content')?.firstChild,modalTop:modal?.scrollTop,grid,gridTop:grid?.scrollTop,gridLeft:grid?.scrollLeft,x:window.scrollX,y:window.scrollY}}
  renderDirectory();document.querySelectorAll('video').forEach(video=>video.pause?.());document.body.classList.add('seller-directory-open');if(!dialog.open)dialog.showModal();queueDirectoryLoad();window.FasBackSwipe?.refreshHeaders?.();dialog.querySelector('[data-directory-query]')?.focus?.({preventScroll:true});return true;
 }
 function closeDirectory(){if(!dialog.open||top()!==dialog)return false;suspension=null;directoryEpoch++;dialog.close();return true}
 function refreshDirectory(){if(!dialog.open||top()!==dialog)return false;models=S.publicOrganizations({force:true});renderDirectory();return true}
 function suspendDirectoryForLot(){
  if(!dialog.open)return null;
  const token={epoch:directoryEpoch,owner:viewer(),top:dialog.scrollTop};suspension=token;document.body.classList.remove('seller-directory-open');dialog.close();return token;
 }
 function resumeDirectoryForLot(token){
  if(!token||token!==suspension||token.epoch!==directoryEpoch||token.owner!==viewer())return false;
  suspension=null;document.body.classList.add('seller-directory-open');if(!dialog.open)dialog.showModal();dialog.scrollTop=token.top;return true;
 }
 function directoryState(){syncDirectoryViewer();const snapshot=load(),visible=filtered(snapshot);return {open:dialog.open,query,kind,followedOnly,page:0,pageSize:PAGE_SIZE,total:visible.length,visibleIds:visible.slice(0,shown).map(item=>item.lotId),followingAvailable:snapshot.ok,followingCount:snapshot.ok?snapshot.entries.length:0}}
 function followingState(){const snapshot=load();return {available:snapshot.ok,count:snapshot.ok?snapshot.entries.length:0,sellerKeys:snapshot.ok?snapshot.entries.map(entry=>entry.sellerKey):[]}}
 function configure(options={}){config={...config,...options};generation++;if(profileDialog()?.open&&top()===profileDialog())S.refreshProfile();if(dialog.open&&top()===dialog)renderDirectory();return true}
 dialog.addEventListener('submit',event=>{if(top()!==dialog||!dialog.contains(event.target))return;event.preventDefault();readFilters();renderDirectory({preserveScroll:false})});
 dialog.addEventListener('keydown',event=>{if(event.key==='Escape'&&top()===dialog){event.preventDefault();event.stopPropagation?.();closeDirectory()}});
 dialog.addEventListener('click',event=>{
  const button=event.target.closest?.('[data-directory-close],[data-directory-seller],[data-directory-followed],[data-directory-refresh],[data-directory-unfollow]');if(!button||!dialog.contains(button)||top()!==dialog)return;event.preventDefault();
  if(button.hasAttribute('data-directory-unfollow')){toggle(button);return}
  if(button.hasAttribute('data-directory-close')){closeDirectory();return}
  if(button.hasAttribute('data-directory-refresh')){readFilters();refreshDirectory();return}
  if(button.hasAttribute('data-directory-followed')){readFilters();followedOnly=!followedOnly;renderDirectory({preserveScroll:false});return}
  if(button.dataset.directorySeller){const id=Number(button.dataset.directorySeller),seller=S.publicSellerInfo(id);if(!seller){const error=dialog.querySelector('[data-directory-error]');error.hidden=false;error.textContent='Продавец или объявления изменились. Обновите каталог.';return}lastVisited=id;S.open(id,button);return}
 });
 dialog.addEventListener('close',()=>{
  if(dialog.open||suspension)return;document.body.classList.remove('seller-directory-open');const saved=directorySnapshot,focus=directoryOrigin;directorySnapshot=null;directoryOrigin=null;
  const currentTop=top(),sameParent=!currentTop||currentTop===saved?.parent,sameContent=!saved?.modal||document.querySelector('#modal-content')?.firstChild===saved.modalContent;
  if(!sameParent||!sameContent)return;
  if(saved){if(saved.modal?.isConnected!==false&&saved.modal)saved.modal.scrollTop=saved.modalTop;if(saved.grid?.isConnected!==false&&saved.grid){saved.grid.scrollTop=saved.gridTop;saved.grid.scrollLeft=saved.gridLeft}if(Number.isFinite(saved.y)&&window.scrollY!==saved.y)window.scrollTo?.({left:saved.x||0,top:saved.y,behavior:'instant'})}if(focus?.isConnected!==false)focus?.focus?.({preventScroll:true});
 });
 profileDialog()?.addEventListener('close',()=>{if(profileDialog()?.open||!dialog.open||top()!==dialog)return;renderDirectory();dialog.querySelector('[data-directory-seller="'+lastVisited+'"]')?.focus?.({preventScroll:true})});
 document.addEventListener('click',event=>{
  const follow=event.target.closest?.('[data-storefront-follow]');if(follow){if(event.defaultPrevented)return;event.preventDefault();event.stopPropagation?.();toggle(follow);return}
  const entry=event.target.closest?.('[data-open-seller-directory]');if(entry&&!event.defaultPrevented){event.preventDefault();openDirectory(entry)}
 });
 window.addEventListener('storage',event=>{if(typeof event.key!=='string'||!event.key.startsWith(PREFIX))return;if(profileDialog()?.open&&top()===profileDialog())S.refreshProfile();if(dialog.open&&top()===dialog)renderDirectory()});
 window.addEventListener('focus',()=>{if(profileDialog()?.open&&top()===profileDialog())S.refreshProfile();if(dialog.open&&top()===dialog)renderDirectory()});
 window.FasSellerFollowing=Object.freeze({openDirectory,closeDirectory,refreshDirectory,directoryState,followingState,mountProfile,suspendDirectoryForLot,resumeDirectoryForLot,configure});
})();
