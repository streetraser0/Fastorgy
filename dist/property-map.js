/* Local Leaflet view. Exact asset coordinates and city-center estimates remain distinct. */
(()=>{
 'use strict';
 if(window.FasPropertyMap)return;
 const MAX_POINTS=200,PAGE_SIZE=20,DEFAULT_POINT=[55.756,37.617];
 const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
 const number=value=>typeof value==='number'?Number.isFinite(value)?value:null:typeof value==='string'&&/^[-+]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim().replace(',','.'))?Number(value.trim().replace(',','.')):null;
 function point(value){if(!Array.isArray(value)||value.length!==2)return null;const lat=number(value[0]),lon=number(value[1]);return lat!==null&&lon!==null&&Math.abs(lat)<=90&&Math.abs(lon)<=180?[lat,lon]:null}
 function distance(a,b){const x=point(a),y=point(b);if(!x||!y)return Infinity;const rad=Math.PI/180,dlat=(y[0]-x[0])*rad,dlon=(y[1]-x[1])*rad,h=Math.sin(dlat/2)**2+Math.cos(x[0]*rad)*Math.cos(y[0]*rad)*Math.sin(dlon/2)**2;return 12742*Math.asin(Math.sqrt(Math.max(0,Math.min(1,h))))}
 const locationKey=value=>value.map(v=>v.toFixed(5)).join(',');
 const validId=value=>Number.isSafeInteger(value)&&value>0;
 function radiusMatches(km,radius){if(!radius)return true;if(!Number.isFinite(km))return false;return radius==='gt1000'?km>1000:['5','10','30','50','100','500','1000'].includes(String(radius))&&km<=Number(radius)}
 function project(lots,origin,options={}){
  const rows=[],seen=new Set(),coordinateDistances=new Map();let withoutLocation=0;
  for(const lot of Array.isArray(lots)?lots:[]){
   if(!lot||!validId(lot.id)||seen.has(lot.id)||options.isLive&&!options.isLive(lot)||options.matches&&!options.matches(lot))continue;
   seen.add(lot.id);const exact=point([lot.latitude,lot.longitude]),reference=exact?{point:exact,approximate:false}:options.locate?.(lot),position=point(reference?.point);
   if(!position){withoutLocation++;continue}
   // Assets at the same exact point share one distance calculation per projection.
   // Keep this separate from the rounded marker key so nearby points retain their order.
   const coordinateKey=position[0]+','+position[1];let km;
   if(coordinateDistances.has(coordinateKey))km=coordinateDistances.get(coordinateKey);
   else{km=distance(origin,position);if(coordinateDistances.size<1024)coordinateDistances.set(coordinateKey,km)}
   if(!radiusMatches(km,options.radius))continue;
   rows.push({lot,point:position,approximate:!exact,distance:km,key:locationKey(position)});
  }
  rows.sort((a,b)=>a.distance-b.distance||a.lot.id-b.lot.id);
  const groups=new Map();for(const row of rows){if(!groups.has(row.key))groups.set(row.key,{key:row.key,point:row.point,rows:[],distance:row.distance,approximate:true});const group=groups.get(row.key);group.rows.push(row);group.approximate=group.approximate&&row.approximate}
  return {rows,groups:[...groups.values()],withoutLocation};
 }
 let config={},dialog=null,map=null,markers=null,originMarker=null,leafletPromise=null,previousFocus=null,focusedLotId=null;
 let reference=null,customReference=false,scope='search',query='',category='',radius='',limit=PAGE_SIZE,locationFilter='',chooseMode=false,geoEpoch=0,viewEpoch=0,geoBusy=false,tileError=false,searchEpoch=0,searchBusy=false,searchTimer=null;
 let projection={rows:[],groups:[],withoutLocation:0},lotReturn=null,popupState=null,rebuildingMarkers=false,resumeScroll=null;
 const apiSource=()=>typeof visibleLots!=='undefined'?visibleLots:typeof cars!=='undefined'?cars:[];
 const apiAll=()=>typeof cars!=='undefined'?cars:[];
 const apiOrigin=()=>typeof userOrigin==='function'?userOrigin():null;
 function apiLocation(lot){if(typeof lotLocation==='function')return lotLocation(lot);const exact=point([lot.latitude,lot.longitude]);return exact?{point:exact,approximate:false}:null}
 const apiLive=lot=>typeof isLotLive==='function'?isLotLive(lot):!['draft','paused','archived','sold','scheduled'].includes(lot.status)&&Number.isFinite(Date.parse(lot.ends))&&Date.parse(lot.ends)>Date.now();
 const price=lot=>config.getPrice?config.getPrice(lot):typeof current==='function'?current(lot):lot.price;
 const label=lot=>config.getCategoryLabel?config.getCategoryLabel(lot):window.FasCategories?.label(lot)||'Имущество';
 const money=value=>Number.isFinite(value)?value.toLocaleString('ru-RU')+' ₽':'Цена уточняется';
 const distanceLabel=value=>Number.isFinite(value)?value<1?'менее 1 км':'≈ '+Math.round(value).toLocaleString('ru-RU')+' км':'Расстояние неизвестно';
 const field=id=>dialog?.querySelector('#'+id);
 const active=()=>!!dialog?.open;
 function configure(value={}){config={...config,...value};return api}
 function status(message){if(field('property-map-status'))field('property-map-status').textContent=message}
 function syncReference(){field('property-map-reference').textContent=reference?.label||'Выберите точку отсчёта';field('property-map-reference-precision').textContent=reference?.approximate?'Примерная точка — центр города или региона. Расстояния по прямой.':'Расстояния по прямой от указанной точки.'}
 function syncCategories(){
  const T=window.FasCategories,native=field('property-map-category'),ids=typeof T?.selection==='function'?T.selection(category)||[]:category?[category]:[];
  native.innerHTML=T?.optionsHTML?.(category,{includeAll:true,includeGroups:true,auctionOnly:true})||'<option value="">Все категории</option>';native.value=category;native.hidden=true;native.setAttribute('aria-hidden','true');native.setAttribute('tabindex','-1');
  field('property-map-category-value').textContent=category?(T?.label(category)||'Выбранные категории'):'Все категории';field('property-map-category-count').textContent=ids.length?'Выбрано: '+ids.length:'Любой вид имущества';
 }
 function applyCategories(value){
  const T=window.FasCategories,normalized=typeof T?.selectionValue==='function'?T.selectionValue(value):typeof value==='string'?value:null;if(normalized===null){syncCategories();status('Выберите одну или несколько доступных категорий.');return false}
  clearTimeout(searchTimer);query=field('property-map-query').value.trim().slice(0,300);category=normalized;limit=PAGE_SIZE;locationFilter='';syncCategories();refresh();return true;
 }
 function openCategories(){
  if(!active()||typeof window.FasCategoryUI?.open!=='function')return unavailable('Выбор категорий сейчас недоступен. Попробуйте ещё раз.');
  const epoch=viewEpoch;window.FasCategoryUI.open({value:category,onSelect:value=>{if(active()&&epoch===viewEpoch)applyCategories(value)},onSearch:value=>{if(!active()||epoch!==viewEpoch)return;clearTimeout(searchTimer);query=String(value??'').trim().slice(0,300);field('property-map-query').value=query;limit=PAGE_SIZE;locationFilter='';refresh()}});return true;
 }
 function unavailable(message){status(message);if(config.notify)config.notify(message);else if(typeof toast==='function')toast(message);return false}
 function selectedLocation(id){
  if(!validId(id))return null;
  let inventory;try{inventory=(config.getAllLots||apiAll)()}catch{return null}
  const lot=Array.isArray(inventory)?inventory.find(lot=>lot?.id===id):null;
  if(!lot||!(config.isLive||apiLive)(lot))return null;
  return project([lot],reference?.point,{locate:config.locate||apiLocation,isLive:config.isLive||apiLive}).rows[0]||null;
 }
 const precision=row=>(row.lot.demo?'Демонстрационный лот · ':'')+(row.approximate?'Ориентир по центру города или региона; точное место не указано':'Координаты, указанные продавцом');
 function showFocusedLot(){
  if(!active()||!map||focusedLotId===null)return false;
  const row=selectedLocation(focusedLotId);if(!row){focusedLotId=null;return unavailable('Лот или его местоположение сейчас недоступны. Обновите карту.')}
  map.setView(row.point,row.approximate?10:15);
  // A city marker may contain thousands of assets. The initial popup always
  // identifies this particular asset, rather than an unrelated first result.
  window.L.popup({maxWidth:290}).setLatLng(row.point).setContent(popup({key:row.key,point:row.point,rows:[row],distance:row.distance,approximate:row.approximate},true)).openOn(map);
  status((row.lot.name||'Лот № '+row.lot.id)+' · '+precision(row)+'.');return true;
 }
 function setOrigin(value,description='Выбранная точка',approximate=false){const parsed=point(value);if(!parsed)return false;geoEpoch++;geoBusy=false;reference={point:parsed,label:String(description).slice(0,160),approximate:!!approximate};customReference=true;chooseMode=false;limit=PAGE_SIZE;locationFilter='';if(active()){field('property-map-geolocate').disabled=false;field('property-map-choose').setAttribute('aria-pressed','false');syncReference();refresh();map?.setView(parsed,Math.max(map.getZoom(),7));}return true}
 function source(){const getter=scope==='all'?config.getAllLots||apiAll:config.getLots||apiSource;try{return getter()}catch{return []}}
 function matches(lot,compiled){if(category&&window.FasCategories&&!window.FasCategories.matches(lot,category))return false;if(!query)return true;if(window.FasKeywordSearch)return window.FasKeywordSearch.matches(lot,compiled);return [lot.name,lot.description,lot.city,lot.brand,lot.model,lot.id].join(' ').toLocaleLowerCase('ru').includes(query.toLocaleLowerCase('ru'))}
 function cancelSearch(){searchEpoch++;searchBusy=false}
 function applyProjection(inventory,compiled){
  projection=project(inventory,reference?.point,{locate:config.locate||apiLocation,isLive:config.isLive||apiLive,matches:lot=>matches(lot,compiled),radius});
  if(focusedLotId!==null&&!projection.rows.some(row=>row.lot.id===focusedLotId)){focusedLotId=null;status('Лот сейчас недоступен. Показаны другие лоты на карте.')}
  if(locationFilter&&!projection.groups.some(group=>group.key===locationFilter))locationFilter='';
  syncReference();renderList();renderMarkers();if(resumeScroll!==null){dialog.scrollTop=resumeScroll;resumeScroll=null}
 }
 function refresh(){
  if(!active())return false;
  cancelSearch();const epoch=searchEpoch,keyword=window.FasKeywordSearch,compiled=keyword?.compile(query);
  if(compiled?.intent?.error){applyProjection([],compiled);status(compiled.intent.error);return true}
  const inventory=source();
  if(!query||typeof keyword?.prepare!=='function'){applyProjection(inventory,compiled);return true}
  // Build expensive bilingual indexes in short browser tasks. Existing rows and
  // map panning remain available until the current request is fully prepared.
  const live=config.isLive||apiLive,candidates=(Array.isArray(inventory)?inventory:[]).filter(lot=>lot&&live(lot)&&(!category||!window.FasCategories||window.FasCategories.matches(lot,category)));
  searchBusy=true;status('Ищем лоты…');
  const cancelled=()=>epoch!==searchEpoch||!active();
  try{Promise.resolve(keyword.prepare(candidates,compiled,{cancelled,onProgress(progress){if(!cancelled())status('Ищем лоты… '+Number(progress.prepared||0).toLocaleString('ru-RU')+' из '+candidates.length.toLocaleString('ru-RU'))}})).then(result=>{if(cancelled())return;searchBusy=false;if(result?.cancelled){status('Каталог изменился. Нажмите «Обновить лоты», чтобы повторить поиск.');return}applyProjection(candidates,compiled);status('Лоты найдены. Ближайшие показаны первыми.');},()=>{if(cancelled())return;searchBusy=false;status('Не удалось завершить поиск. Измените запрос или нажмите «Обновить лоты».');})}catch{if(!cancelled()){searchBusy=false;status('Не удалось завершить поиск. Измените запрос или нажмите «Обновить лоты».')}}
  return true;
 }
 function renderList(){
  const list=locationFilter?projection.rows.filter(row=>row.key===locationFilter):projection.rows;
  field('property-map-summary').textContent=list.length.toLocaleString('ru-RU')+' лотов · от ближнего к дальнему';
  field('property-map-clear-point').hidden=!locationFilter;
  field('property-map-result-list').innerHTML=list.length?list.slice(0,limit).map(row=>'<li class="property-map-result"><div><span class="property-map-result-category">'+escape(label(row.lot))+(row.lot.demo?' · Демо':'')+'</span><h3><button type="button" data-map-open-lot="'+row.lot.id+'">'+escape(row.lot.name||'Лот № '+row.lot.id)+'</button></h3><p>'+escape(row.lot.city||'Город не указан')+'</p><span class="property-map-precision '+(row.approximate?'is-approximate':'')+'">'+(row.approximate?'Ориентир: центр города или региона':'Координаты продавца')+'</span></div><div class="property-map-result-side"><strong>'+escape(money(price(row.lot)))+'</strong><span>'+distanceLabel(row.distance)+'</span><button class="outline" type="button" data-map-locate-lot="'+row.lot.id+'">На карте</button></div></li>').join(''):'<li class="property-map-empty">Лотов с координатами или известным городом по этим условиям пока нет. Измените поиск или выберите «Весь каталог».</li>';
  field('property-map-more').hidden=list.length<=limit;field('property-map-more').textContent='Показать ещё '+Math.min(PAGE_SIZE,Math.max(0,list.length-limit));
  field('property-map-data-note').textContent='Расстояния — по прямой от точки отсчёта. '+(projection.withoutLocation?'Без местоположения: '+projection.withoutLocation.toLocaleString('ru-RU')+' лотов. ':'')+'На карте показаны '+Math.min(MAX_POINTS,projection.groups.length)+' ближайших точек из '+projection.groups.length.toLocaleString('ru-RU')+'. Общая отметка объединяет лоты в одной точке.';
 }
 function popup(group,selected=false){
  popupState={key:group.key,selectedId:selected?group.rows[0].lot.id:null};
  const chosen=group.rows.find(row=>row.lot.id===focusedLotId);if(chosen&&!selected)group={...group,rows:[chosen,...group.rows.filter(row=>row!==chosen)]};
  const node=document.createElement('div');node.className='property-map-popup';const title=document.createElement('strong');title.textContent=group.rows[0].lot.city||'Местоположение имущества';node.appendChild(title);const detail=document.createElement('p');detail.textContent=group.rows.length.toLocaleString('ru-RU')+' лотов · '+distanceLabel(group.distance)+(group.approximate?' · ориентир по центру города':'');node.appendChild(detail);
  if(selected){detail.textContent=precision(group.rows[0])+' · '+distanceLabel(group.distance);const selectedTitle=document.createElement('strong');selectedTitle.textContent='Лот № '+group.rows[0].lot.id;node.appendChild(selectedTitle)}
  group.rows.slice(0,3).forEach(row=>{const button=document.createElement('button');button.type='button';button.className='property-map-popup-lot';button.textContent=row.lot.name||'Лот № '+row.lot.id;button.addEventListener('click',()=>openLot(row.lot.id));node.appendChild(button)});
  if(selected)return node;
  const button=document.createElement('button');button.type='button';button.className='primary property-map-popup-all';button.textContent='Показать '+group.rows.length+' лотов здесь';button.addEventListener('click',()=>{locationFilter=group.key;limit=PAGE_SIZE;renderList();field('property-map-summary').focus?.({preventScroll:true});field('property-map-results').scrollIntoView?.({block:'nearest',behavior:'smooth'})});node.appendChild(button);return node;
 }
 function renderMarkers(){
  if(!map||!window.L)return;const previousPopup=popupState;rebuildingMarkers=true;try{markers.clearLayers()}finally{rebuildingMarkers=false}
  const groups=locationFilter?projection.groups.filter(group=>group.key===locationFilter):projection.groups.slice(0,MAX_POINTS),selected=projection.rows.find(row=>row.lot.id===focusedLotId),selectedGroup=selected&&projection.groups.find(group=>group.key===selected.key);
  if(selectedGroup&&!groups.includes(selectedGroup)){if(groups.length>=MAX_POINTS)groups.pop();groups.push(selectedGroup)}
  for(const group of groups){const count=group.rows.length,icon=window.L.divIcon({className:'property-map-pin '+(group.approximate?'is-approximate':''),html:'<span>'+count.toLocaleString('ru-RU')+'</span>',iconSize:[44,36],iconAnchor:[22,36],popupAnchor:[0,-33]});window.L.marker(group.point,{icon,title:(group.rows[0].lot.city||'Имущество')+': '+count+' лотов'+(group.approximate?', приблизительное местоположение':''),keyboard:true}).addTo(markers).bindPopup(()=>popup(group),{maxWidth:290})}
  if(originMarker)map.removeLayer(originMarker);const tooltip=document.createElement('span');tooltip.textContent='Точка отсчёта: '+reference.label;originMarker=window.L.circleMarker(reference.point,{radius:8,color:'#ffffff',weight:3,fillColor:'#ef4058',fillOpacity:1}).addTo(map).bindTooltip(tooltip,{direction:'top'});
  if(previousPopup){let group=projection.groups.find(value=>value.key===previousPopup.key);if(group&&previousPopup.selectedId!==null){const row=group.rows.find(value=>value.lot.id===previousPopup.selectedId);group=row?{...group,rows:[row]}:null}if(group)window.L.popup({maxWidth:290}).setLatLng(group.point).setContent(popup(group,previousPopup.selectedId!==null)).openOn(map);else popupState=null}
 }
 function clearMapView(){
  geoEpoch++;viewEpoch++;cancelSearch();geoBusy=false;chooseMode=false;focusedLotId=null;clearTimeout(searchTimer);map?.remove();map=null;markers=null;originMarker=null;popupState=null;resumeScroll=null;field('property-map-geolocate').disabled=false;document.body.classList.remove('property-map-open');
 }
 function previousLotSnapshot(modal,content){
  if(!modal?.open||!modal.classList.contains('lot-dialog'))return null;const id=Number(content?.querySelector('[data-open-lot-id]')?.dataset.openLotId),lot=(config.getAllLots||apiAll)().find(value=>value.id===id);if(!lot)return null;
  return {id,owner:lot.sellerOwnerId||lot.ownerId||'',own:typeof isOwnLot==='function'&&isOwnLot(lot),nodes:Array.from(content.childNodes||content.children||[]),top:modal.scrollTop};
 }
 function restorePreviousLot(saved,modal,content){
  if(!saved)return false;const lot=(config.getAllLots||apiAll)().find(value=>value.id===saved.id);if(!lot||!(config.isLive||apiLive)(lot)||(lot.sellerOwnerId||lot.ownerId||'')!==saved.owner||(typeof isOwnLot==='function'&&isOwnLot(lot))!==saved.own)return false;
  content.innerHTML='';for(const node of saved.nodes)content.appendChild(node);modal.classList.add('lot-dialog');modal.showModal();modal.scrollTop=saved.top;if(typeof syncLotSwipeSurface==='function')syncLotSwipeSurface();if(typeof syncCurrentPriceViews==='function')syncCurrentPriceViews(false);
  const staleBlob=Array.from(content.querySelectorAll('img,video,source')).some(node=>{const url=node.getAttribute?.('src')||'';return url.startsWith('blob:')&&!window.FasSellerMedia?.isSafeObjectUrl?.(url)});
  if(staleBlob&&typeof gallery==='function'){
   const refreshGallery=()=>{if(!modal.open||Number(content.querySelector('[data-open-lot-id]')?.dataset.openLotId)!==saved.id||(config.getAllLots||apiAll)().find(value=>value.id===saved.id)!==lot)return;const old=content.querySelector('.lot-gallery');if(!old)return;const left=old.querySelector('.gallery-track')?.scrollLeft||0,holder=document.createElement('div');holder.innerHTML=gallery(lot,true);const next=holder.firstElementChild||holder.children[0];if(next){old.parentElement.insertBefore(next,old);old.remove();const track=next.querySelector('.gallery-track');if(track)track.scrollLeft=left}};
   refreshGallery();if(typeof window.FasSellerMedia?.hydrateLots==='function')try{Promise.resolve(window.FasSellerMedia.hydrateLots((config.getAllLots||apiAll)())).then(refreshGallery,()=>{})}catch{}
  }
  return true;
 }
 function returnFromLot(){
  const saved=lotReturn;if(!saved||!saved.modal.open)return false;const top=typeof window.FasDialogLifecycle?.top==='function'?window.FasDialogLifecycle.top():Array.from(document.querySelectorAll('dialog[open]')).at(-1);if(top&&top!==saved.modal)return false;
  if(Number(saved.content.querySelector('[data-open-lot-id]')?.dataset.openLotId)!==saved.id)return false;
  lotReturn=null;saved.modal.close();restorePreviousLot(saved.previous,saved.modal,saved.content);document.body.classList.add('property-map-open');dialog.showModal();dialog.scrollTop=saved.top;resumeScroll=saved.top;
  if(map){map.invalidateSize({pan:false});refresh();if(saved.center)map.setView(saved.center,saved.zoom,{animate:false})}else{refresh();startMap()}
  const button=field('property-map-result-list').querySelector('[data-map-open-lot="'+saved.id+'"]');button?.focus?.({preventScroll:true});dialog.scrollTop=saved.top;return true;
 }
 function openLot(id){
  if(!validId(id))return false;const inventory=source(),lot=Array.isArray(inventory)?inventory.find(row=>row?.id===id):null;if(!lot||!(config.isLive||apiLive)(lot)){status('Этот лот сейчас недоступен. Обновите карту.');refresh();return false}
  const opener=config.openLot||(typeof openCar==='function'?openCar:null);if(!opener){status('Не удалось открыть карточку. Обновите страницу.');return false}
  // Keep map-specific reference local: a manually chosen map point is not the
  // visitor's actual location. The lot receives an immutable-value snapshot.
  const mapOrigin=point(reference?.point)?{point:reference.point.slice(),approximate:!!reference.approximate,label:reference.label}:null;
  const modal=document.querySelector('#modal'),content=document.querySelector('#modal-content');
  if(!active()||!modal||!content){dialog.close();opener(id,mapOrigin?{mapOrigin}:{});return true}
  if(modal.open&&modal.classList.contains('seller-dialog')&&window.FasSellerUI?.prepareNavigation?.()===false)return false;
  const center=map?.getCenter?.(),saved={id,modal,content,previous:previousLotSnapshot(modal,content),top:dialog.scrollTop,center:center?{lat:center.lat,lng:center.lng}:null,zoom:map?.getZoom?.()};lotReturn=saved;
  if(!modal.fasMapReturnListener){modal.fasMapReturnListener=true;modal.addEventListener('close',()=>{if(!modal.open&&lotReturn?.modal===modal){lotReturn=null;clearMapView()}})}
  dialog.close();
  try{opener(id,mapOrigin?{mapOrigin}:{})}catch{lotReturn=null;restorePreviousLot(saved.previous,modal,content);document.body.classList.add('property-map-open');dialog.showModal();dialog.scrollTop=saved.top;return unavailable('Не удалось открыть лот. Карта и выбранные условия сохранены.')}
  if(!modal.open||Number(content.querySelector('[data-open-lot-id]')?.dataset.openLotId)!==id){lotReturn=null;document.body.classList.add('property-map-open');dialog.showModal();dialog.scrollTop=saved.top;return false}
  const back=content.querySelector('[data-close-lot]');if(back){back.textContent='← К карте';back.setAttribute('aria-label','Вернуться к карте с выбранными условиями')}return true;
 }
 function requestLocation(){
  if(!active()||geoBusy)return false;
  const geolocation=config.geolocation||window.navigator?.geolocation;if(!geolocation?.getCurrentPosition){status('Геолокация недоступна. Выберите регион или точку на карте.');return false}
  geoBusy=true;const epoch=++geoEpoch;field('property-map-geolocate').disabled=true;status('Определяем ваше местоположение…');
  try{geolocation.getCurrentPosition(result=>{if(epoch!==geoEpoch||!active())return;geoBusy=false;field('property-map-geolocate').disabled=false;if(!setOrigin([result?.coords?.latitude,result?.coords?.longitude],'Ваше местоположение',false))status('Не удалось получить корректные координаты. Выберите точку на карте.');else status('Ближайшие лоты показаны первыми. Расстояния указаны по прямой.');},error=>{if(epoch!==geoEpoch||!active())return;geoBusy=false;field('property-map-geolocate').disabled=false;status(error?.code===1?'Доступ к местоположению не разрешён. Выберите регион или точку на карте.':'Не удалось определить местоположение. Выберите регион или точку на карте.');},{enableHighAccuracy:false,timeout:10000,maximumAge:60000});return true}catch{if(epoch===geoEpoch&&active()){geoBusy=false;field('property-map-geolocate').disabled=false;status('Не удалось запросить местоположение. Выберите регион или точку на карте.')}return false}
 }
 function ensureLeaflet(){
  if(window.L?.map)return Promise.resolve(window.L);if(leafletPromise)return leafletPromise;
  leafletPromise=new Promise((resolve,reject)=>{if(!document.querySelector('link[data-fas-leaflet]')){const link=document.createElement('link');link.rel='stylesheet';link.href='vendor/leaflet/leaflet.css';link.dataset.fasLeaflet='';document.head.appendChild(link)}const script=document.createElement('script');script.src='vendor/leaflet/leaflet.js';script.onload=()=>window.L?.map?resolve(window.L):reject(Error('map-library'));script.onerror=()=>reject(Error('map-library'));document.head.appendChild(script)}).catch(error=>{leafletPromise=null;throw error});return leafletPromise;
 }
 async function startMap(){
  const epoch=viewEpoch;try{await ensureLeaflet();if(!active()||epoch!==viewEpoch)return;const L=window.L;map=L.map(field('property-map-canvas'),{preferCanvas:true,scrollWheelZoom:false,zoomControl:true}).setView(reference.point,customReference?7:5);markers=L.layerGroup().addTo(map);const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>',maxZoom:19,minZoom:2});tiles.on('tileerror',()=>{tileError=true;field('property-map-tile-note').hidden=false});tiles.on('tileload',()=>{tileError=false;field('property-map-tile-note').hidden=true});tiles.addTo(map);map.on('popupclose',()=>{if(!rebuildingMarkers)popupState=null});map.on('click',event=>{if(chooseMode)setOrigin([event.latlng.lat,event.latlng.lng],'Выбранная точка на карте',false)});if(focusedLotId!==null)refresh();else renderMarkers();map.invalidateSize();showFocusedLot();field('property-map-choose').disabled=false;field('property-map-fit').disabled=false;field('property-map-canvas').setAttribute('aria-busy','false');}catch{if(active()&&epoch===viewEpoch){field('property-map-canvas').setAttribute('aria-busy','false');status('Карта не загрузилась. Список лотов и выбор региона доступны ниже.');field('property-map-tile-note').hidden=false}}
 }
 function regionOptions(){const regions=typeof RF_REGIONS!=='undefined'?RF_REGIONS:[],centers=typeof REGION_CENTERS!=='undefined'?REGION_CENTERS:{};return '<option value="">Выбрать регион отсчёта</option>'+regions.filter(region=>point(centers[region.code])).map(region=>'<option value="'+escape(region.code)+'">'+escape(region.name)+'</option>').join('')}
 function build(){
  if(dialog)return;dialog=document.createElement('dialog');dialog.id='property-map-dialog';dialog.className='property-map-dialog';dialog.setAttribute('aria-labelledby','property-map-title');
  dialog.innerHTML=`<div class="property-map-shell"><header class="property-map-header"><img src="assets/brand/fas-torgi-logo.png?v=20261116-gradient1" alt="ФАС торги — Федеральная аукционная сеть" width="145" height="90"><button type="button" class="outline property-map-close" data-map-close aria-label="Закрыть карту">×</button></header><div class="property-map-body"><div class="property-map-heading"><div><span class="property-map-kicker">Имущество рядом</span><h2 id="property-map-title" tabindex="-1">Лоты на карте</h2></div><button type="button" class="outline" id="property-map-refresh">Обновить лоты</button></div><div class="property-map-toolbar"><label class="property-map-query">Поиск на карте<input id="property-map-query" type="search" placeholder="Название, марка или ключевые слова" autocomplete="off"></label><label class="property-map-scope-label">Какие лоты показать<select id="property-map-scope"><option value="search">Результаты поиска</option><option value="all">Весь каталог</option></select></label><div class="property-map-categories"><span id="property-map-category-label">Категории</span><button type="button" class="property-map-category-trigger" id="property-map-category-trigger" aria-haspopup="dialog" aria-controls="category-picker" aria-labelledby="property-map-category-label property-map-category-value"><span><strong id="property-map-category-value">Все категории</strong><small id="property-map-category-count">Любой вид имущества</small></span><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg></button><select id="property-map-category" hidden aria-hidden="true" tabindex="-1"><option value="">Все категории</option></select></div><label class="property-map-radius-label">Радиус поиска<select id="property-map-radius"><option value="">Любое расстояние</option><option value="5">До 5 км</option><option value="10">До 10 км</option><option value="30">До 30 км</option><option value="50">До 50 км</option><option value="100">До 100 км</option><option value="500">До 500 км</option><option value="1000">До 1 000 км</option><option value="gt1000">Свыше 1 000 км</option></select></label></div><section class="property-map-origin" aria-labelledby="property-map-origin-title"><h3 id="property-map-origin-title">Откуда считать расстояние</h3><div class="property-map-reference-block"><strong id="property-map-reference"></strong><small id="property-map-reference-precision"></small></div><button type="button" class="outline" id="property-map-geolocate">Моё местоположение</button><label class="property-map-region-label"><span>Мой регион</span><select id="property-map-region">${regionOptions()}</select></label><button type="button" class="outline" id="property-map-choose" aria-pressed="false" disabled>Указать точку на карте</button></section><p id="property-map-status" class="property-map-status" role="status" aria-live="polite"></p><div class="property-map-layout"><section class="property-map-maparea" aria-label="Интерактивная карта имущества"><div id="property-map-canvas" class="property-map-canvas" aria-label="Карта. Изменяйте масштаб кнопками, перемещайте карту касанием." aria-busy="true"></div><button type="button" class="outline property-map-fit" id="property-map-fit" disabled>Показать лоты</button><p id="property-map-tile-note" class="property-map-tile-note" hidden>Подложка карты недоступна. Проверьте интернет; список и расстояния доступны.</p><div class="property-map-legend"><span><i></i> Координаты продавца</span><span><i class="is-approximate"></i> Ориентир по городу</span><span><i class="is-origin"></i> Точка отсчёта</span></div></section><section class="property-map-results" id="property-map-results" aria-label="Лоты от ближнего к дальнему"><div class="property-map-list-heading"><h3 id="property-map-summary" tabindex="-1"></h3><button type="button" class="outline" id="property-map-clear-point" hidden>Все ближайшие</button></div><ol id="property-map-result-list"></ol><button type="button" class="outline property-map-more" id="property-map-more" hidden>Показать ещё</button></section></div><p id="property-map-data-note" class="property-map-data-note"></p></div></div>`;
  document.body.appendChild(dialog);syncCategories();
  dialog.addEventListener('click',event=>{const button=event.target.closest?.('[data-map-close],[data-map-open-lot],[data-map-locate-lot]');if(!button)return;if(button.hasAttribute('data-map-close')){dialog.close();return}if(button.dataset.mapOpenLot){openLot(Number(button.dataset.mapOpenLot));return}const id=Number(button.dataset.mapLocateLot),row=projection.rows.find(row=>row.lot.id===id);if(row&&map){map.setView(row.point,row.approximate?11:15);const group=projection.groups.find(group=>group.key===row.key);if(group)window.L.popup({maxWidth:290}).setLatLng(row.point).setContent(popup(group)).openOn(map);field('property-map-canvas').scrollIntoView?.({block:'nearest',behavior:'smooth'})}});
  field('property-map-scope').onchange=()=>{scope=field('property-map-scope').value==='all'?'all':'search';limit=PAGE_SIZE;locationFilter='';refresh()};
  field('property-map-category').onchange=()=>applyCategories(field('property-map-category').value);
  field('property-map-category-trigger').onclick=openCategories;
  field('property-map-query').oninput=()=>{clearTimeout(searchTimer);cancelSearch();status('Ищем лоты…');searchTimer=setTimeout(()=>{if(!active())return;query=field('property-map-query').value.trim().slice(0,300);limit=PAGE_SIZE;locationFilter='';refresh()},180)};
  field('property-map-region').onchange=()=>{const code=field('property-map-region').value,centers=typeof REGION_CENTERS!=='undefined'?REGION_CENTERS:{},regions=typeof RF_REGIONS!=='undefined'?RF_REGIONS:[];if(centers[code])setOrigin(centers[code],'Центр: '+(regions.find(region=>region.code===code)?.name||code),true)};
  field('property-map-radius').onchange=()=>{radius=field('property-map-radius').value;limit=PAGE_SIZE;locationFilter='';refresh()};
  field('property-map-geolocate').onclick=requestLocation;field('property-map-refresh').onclick=refresh;
  field('property-map-choose').onclick=()=>{chooseMode=!chooseMode;field('property-map-choose').setAttribute('aria-pressed',String(chooseMode));status(chooseMode?'Нажмите на карту в точке, от которой искать ближайшее имущество.':'Выбор точки отменён.');};
  field('property-map-fit').onclick=()=>{const groups=projection.groups.slice(0,MAX_POINTS);if(!groups.length){map.setView(reference.point,7);return}map.fitBounds(window.L.latLngBounds([reference.point,...groups.map(group=>group.point)]),{padding:[24,24],maxZoom:11})};
  field('property-map-clear-point').onclick=()=>{locationFilter='';limit=PAGE_SIZE;renderList();renderMarkers()};field('property-map-more').onclick=()=>{limit+=PAGE_SIZE;renderList()};
  dialog.addEventListener('close',()=>{if(dialog.open)return;if(lotReturn){geoEpoch++;viewEpoch++;cancelSearch();geoBusy=false;clearTimeout(searchTimer);field('property-map-geolocate').disabled=false;document.body.classList.remove('property-map-open');return}clearMapView();if(!document.querySelector('dialog[open]'))previousFocus?.focus?.({preventScroll:true});if(typeof reelsMode!=='undefined'&&reelsMode&&!document.hidden&&typeof syncReels==='function'&&typeof swipeIndex==='function')syncReels(swipeIndex())});
 }
 function open(options={}){
  if(typeof document==='undefined')return false;
  const focusing=options.lotId!==undefined;
  if(focusing&&!selectedLocation(options.lotId))return unavailable('Не удалось показать место лота: лот недоступен или местоположение не указано.');
  build();if(lotReturn&&!active()){lotReturn=null;clearMapView()}if(active()){
   if(!focusing)return true;
   geoEpoch++;geoBusy=false;cancelSearch();focusedLotId=options.lotId;scope='all';query='';category='';radius='';limit=PAGE_SIZE;locationFilter='';chooseMode=false;
   field('property-map-geolocate').disabled=false;field('property-map-scope').value='all';field('property-map-query').value='';syncCategories();field('property-map-radius').value='';field('property-map-choose').setAttribute('aria-pressed','false');refresh();showFocusedLot();return true;
  }
  previousFocus=document.activeElement;geoEpoch++;viewEpoch++;cancelSearch();focusedLotId=focusing?options.lotId:null;scope=focusing||options.scope==='all'?'all':'search';query='';category='';radius='';limit=PAGE_SIZE;locationFilter='';chooseMode=false;tileError=false;
  if(!customReference){const existing=(config.getOrigin||apiOrigin)();reference=point(existing?.point)?{point:point(existing.point),approximate:!!existing.approximate,label:existing.approximate?'Выбранный регион — примерная точка отсчёта':'Ваше сохранённое местоположение'}:{point:DEFAULT_POINT.slice(),approximate:true,label:'Москва — точка отсчёта. Выберите свою.'}}
  for(const video of document.querySelectorAll('video'))video.pause();document.body.classList.add('property-map-open');dialog.showModal();dialog.scrollTop=0;field('property-map-title').focus?.({preventScroll:true});field('property-map-query').value='';syncCategories();field('property-map-radius').value='';field('property-map-scope').value=scope;field('property-map-choose').disabled=true;field('property-map-choose').setAttribute('aria-pressed','false');field('property-map-fit').disabled=true;field('property-map-canvas').setAttribute('aria-busy','true');field('property-map-tile-note').hidden=false;status('Выберите точку отсчёта. Приблизительные позиции отмечены отдельно.');refresh();startMap();return true;
 }
 const api=Object.freeze({configure,open,openLotLocation(id){return open({lotId:id,scope:'all'})},close(){dialog?.close()},refresh,setOrigin,requestLocation,openLot,returnFromLot,project,point,distance,radiusMatches,state:()=>({open:active(),reference,scope,query,category,radius,geoBusy,searchBusy,total:projection.rows.length,withoutLocation:projection.withoutLocation,points:projection.groups.length,renderedPoints:Math.min(MAX_POINTS,projection.groups.length),limit,chooseMode,focusedLotId})});
 window.FasPropertyMap=api;
 if(typeof document!=='undefined')document.addEventListener('click',event=>{const button=event.target.closest?.('[data-open-property-map]');if(!button)return;event.preventDefault();open({scope:button.dataset.mapScope})});
})();
