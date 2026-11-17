/* Small, manually browsed selections from the live catalogue. No paid ranking. */
(()=>{
 'use strict';
 const section=document.querySelector('#featured-lots'),track=document.querySelector('#featured-track');
 if(!section||!track)return;
 const note=document.querySelector('#featured-note'),empty=document.querySelector('#featured-empty'),LIMIT=12,HOT_WINDOW=12*3600000,MODE_ORDER=['for-you','value','nearby','low','ending','hot'],MODES=new Set(MODE_ORDER),MODE_KEY='fas-featured-modes-v1';
 let storageAvailable=true;
 function normalizeModes(value){
  if(typeof value==='string')return value==='all'?[]:MODES.has(value)?[value]:null;
  if(!Array.isArray(value)||value.length>64)return null;
  const result=MODE_ORDER.filter(mode=>value.includes(mode));return value.length&&!result.length?null:result;
 }
 function writeModes(value){try{localStorage.setItem(MODE_KEY,JSON.stringify(value));storageAvailable=true;return true}catch{storageAvailable=false;return false}}
 function readModes(){
  try{
   for(const key of [MODE_KEY,'fas-featured-mode-v1','fas-featured-mode']){
    const raw=localStorage.getItem(key);if(raw===null)continue;if(typeof raw!=='string'||raw.length>4096)return null;
    let value;try{value=JSON.parse(raw)}catch{value=raw.trim()}
    if(value&&typeof value==='object'&&!Array.isArray(value)){if(value.version!==undefined&&value.version!==1)return null;value=value.modes??value.mode}
    const result=normalizeModes(value);if(result&& (key!==MODE_KEY||JSON.stringify(result)!==raw))writeModes(result);return result;
   }
  }catch{storageAvailable=false}
  return null;
 }
 const storedModes=readModes(),defaultMode=window.FasRecommendations?(window.FasRecommendations.getMode?.()==='all'?'nearby':'for-you'):'nearby';
 let modes=storedModes??[defaultMode],mode=modes[0]||'nearby',autoMode=storedModes===null&&!window.FasRecommendations,cache=null,contentKey='',lastRows=[],seededEngine=null;
 function recommendations(){
  const engine=window.FasRecommendations;if(!engine||typeof engine.select!=='function'||typeof engine.summary!=='function')return null;
  let state=engine.summary();
  if(seededEngine!==engine){if(!state.seeded&&typeof engine.beginSession==='function'){engine.beginSession(cars,saved);state=engine.summary()}seededEngine=engine}
  return {engine,state};
 }
 const esc=value=>escapeText(String(value??''));
 const own=lot=>typeof isOwnLot==='function'&&isOwnLot(lot);
 const origin=()=>typeof userOrigin==='function'?userOrigin():null;
 const hasPoint=point=>Array.isArray(point?.point)&&point.point.length===2&&Number.isFinite(point.point[0])&&Math.abs(point.point[0])<=90&&Number.isFinite(point.point[1])&&Math.abs(point.point[1])<=180;
 const live=lot=>Number.isSafeInteger(lot?.id)&&lot.id>0&&isLotLive(lot);
 const cityKey=value=>typeof value==='string'?value.normalize('NFKC').toLocaleLowerCase('ru').replace(/ё/g,'е').trim().slice(0,100):'';
 function originCity(point){
  if(cityKey(point?.city))return point.city.trim().slice(0,100);
  if(!point?.point||typeof CITY_CENTERS!=='object'||typeof kmBetween!=='function')return '';
  let closest='',minimum=30;
  for(const [city,position]of Object.entries(CITY_CENTERS)){const distance=kmBetween(point.point,position);if(Number.isFinite(distance)&&distance<=minimum){minimum=distance;closest=city}}
  return closest;
 }
 function originRegion(point,city){
  if(typeof point?.regionCode==='string'&&/^\d{2}$/.test(point.regionCode))return point.regionCode;
  if(typeof userRegion==='object'&&typeof userRegion.code==='string'&&/^\d{2}$/.test(userRegion.code))return userRegion.code;
  if(city&&typeof CITY_CENTERS==='object'&&typeof REGION_CENTERS==='object'){
   const position=CITY_CENTERS[city];if(position)for(const [id,center]of Object.entries(REGION_CENTERS))if(center[0]===position[0]&&center[1]===position[1])return id;
  }
  return '';
 }
 function compare(a,b){return (a.priority||0)-(b.priority||0)||a.rank-b.rank||(a.priceTie||0)-(b.priceTie||0)||(b.discount||0)-(a.discount||0)||(a.distance||0)-(b.distance||0)||a.lot.id-b.lot.id}
 function addBest(rows,row){const at=rows.findIndex(item=>compare(row,item)<0);if(at<0){if(rows.length<LIMIT)rows.push(row)}else rows.splice(at,0,row);if(rows.length>LIMIT)rows.pop()}
 function marketValue(lot){
  if(typeof assessMarket!=='function'||!Array.isArray(lot.comparables)||lot.comparables.length<3)return null;
  const date=Date.parse(lot.marketDate),now=Date.now();if(!Number.isFinite(date)||date>now||now-date>30*86400000)return null;
  const result=assessMarket(lot),discount=-result.delta,price=current(lot);
  if(!result.available||!Number.isSafeInteger(result.market)||result.market<=0||!Number.isSafeInteger(price)||price<=0||!Number.isFinite(discount)||discount<10||discount>=100)return null;
  return {market:result.market,discount,grade:discount>=30?'Суперцена':discount>=20?'Очень выгодно':'Выгодно',expires:date+30*86400000};
 }
 function desktopPersonalization(){return !!window.FasDesktopWeb?.active?.()}
 function singleSelection(point,recommendation,context){
  // Many assets share a storage site or a city reference point. Reuse only
  // exact coordinate pairs within this selection; every origin change starts fresh.
  const coordinateDistances=new Map();
  const selectionDistance=lot=>{if(!point||typeof distanceFromOrigin!=='function')return Infinity;if(typeof lotLocation!=='function'||typeof kmBetween!=='function'||!point.point)return distanceFromOrigin(lot,point);const destination=lotLocation(lot);if(!destination?.point)return Infinity;const key=destination.point[0]+','+destination.point[1];if(coordinateDistances.has(key))return coordinateDistances.get(key);const value=kmBetween(point.point,destination.point);if(coordinateDistances.size<1024)coordinateDistances.set(key,value);return value};
  const now=Date.now(),best=[],valueBest=[],values=new Map(),seen=new Set(),eligible=new Set(),scopeIds=new Set();let expires=now+30000,cheapTier=0;
  const selectionMode=autoMode?'nearby':mode;
  const town=originCity(point),preferCity=!!(recommendation?.state.enabled&&recommendation.state.signalCount||context?.active&&context.category),city=selectionMode==='for-you'&&!preferCity?'':town,region=originRegion(point,town);
  const pool=context?.active?(context.source===cars&&Array.isArray(context.lots)?context.lots:[]):cars;
  const desktop=desktopPersonalization();let priceScope=null;
  if(!desktop&&(selectionMode==='low'||selectionMode==='value'))priceScope=recommendation?.engine.priceCandidates?.(pool,{category:context?.active?context.category:'',active:!!context?.active,explicitAll:!!context?.explicitAll})||{lots:context?.active?pool:[],category:context?.category||'',reason:context?.active?'search':'cold'};
  const scopedPrice=priceScope&&(selectionMode==='low'||!['cold','all'].includes(priceScope.reason));
  // Desktop selections share the actual viewed groups. An applied explicit
  // search remains authoritative; a cold/opted-out profile returns the pool.
  const personal=desktop||['for-you','nearby','ending','hot'].includes(selectionMode),explicit=context?.active&&(context.category||context.explicitAll||desktop&&context.query);
  const candidates=personal&&recommendation&&!explicit?recommendation.engine.select(pool,{byViews:true}):scopedPrice?priceScope.lots:pool;
  if(desktop&&(selectionMode==='low'||selectionMode==='value'))priceScope={lots:candidates,category:context?.active?context.category||'':'',reason:explicit?'search':recommendation?.state.enabled&&recommendation.state.signalCount?'views':'cold'};
  const rankRow=lot=>{
   const distance=point?selectionDistance(lot):Infinity,value=values.get(lot.id),rowMode=autoMode?mode:selectionMode;
   const priority=rowMode==='for-you'&&city?Number(cityKey(lot.city)!==cityKey(city)):rowMode==='ending'&&region?Number((typeof getRegionCode==='function'?getRegionCode(lot):lot.regionCode)!==region):0;
   return {lot,priority,rank:rowMode==='low'?current(lot):(rowMode==='value'||rowMode==='hot')?-(value?.discount||0):point?distance:0,distance,...(rowMode==='low'?{discount:value?.discount||0}:{})};
  };
  const collect=inventory=>{for(const lot of inventory){
   if(!live(lot)||seen.has(lot.id))continue;seen.add(lot.id);
   const price=current(lot);if(!Number.isSafeInteger(price)||price<=0)continue;
   scopeIds.add(lot.id);
   const end=Date.parse(lot.ends);expires=Math.min(expires,end);
   // Keep the full scope before the time filter, so an open feed can admit
   // the same lot as soon as it crosses the strict twelve-hour boundary.
   if(selectionMode==='hot'){const entry=end-HOT_WINDOW+1;if(entry>now)expires=Math.min(expires,entry);if(!Number.isFinite(end)||end<=now||end-now>=HOT_WINDOW)continue}
   const value=marketValue(lot);if(value){values.set(lot.id,value);expires=Math.min(expires,value.expires)}
   const distance=point?selectionDistance(lot):Infinity;
   if(value)addBest(valueBest,{lot,rank:-value.discount,distance});
   if(selectionMode==='value'){if(value)eligible.add(lot.id);continue}
   if(selectionMode==='hot'&&!value)continue;
   if(selectionMode==='ending'&&end-Date.now()>=24*3600000)continue;
   if(selectionMode==='low'){
    if(!value)continue;const tier=value.discount>=30?3:value.discount>=20?2:1;
    if(tier<cheapTier)continue;if(tier>cheapTier){cheapTier=tier;best.length=0;eligible.clear()}
   }
   eligible.add(lot.id);addBest(best,rankRow(lot));
  }};
  collect(candidates);
  // Interests may still refer to sold or ended lots. Their descriptors remain
  // useful for finding analogues. Keep the legacy mobile fallback; desktop must
  // not silently replace established interests with unrelated categories.
  if(!desktop&&['for-you','nearby'].includes(selectionMode)&&recommendation&&!best.length&&candidates.length<pool.length)collect(pool);
  if(autoMode)mode=valueBest.length?'value':'nearby';
  if(autoMode&&mode==='value'){eligible.clear();for(const id of values.keys())eligible.add(id)}
  return {rows:mode==='value'?valueBest:best,expires,values,priceScope,eligible,scopeIds,rankRow,city,region,cheapTier};
 }
 function combinedSelection(input,point,recommendation,context,selectedModes,full=false){
  const desktop=desktopPersonalization(),active=new Set(selectedModes),personal=desktop&&selectedModes.length>0||selectedModes.some(value=>['for-you','nearby','ending','hot'].includes(value));
  const now=Date.now(),seen=new Set(),values=new Map(),eligible=new Set(),scopeIds=new Set(),rows=[];
  let expires=now+30000,cheapTier=0,priceScope=null,pool=Array.isArray(input)?input:[];
  if(context?.active){
   const allowed=context.source===cars&&Array.isArray(context.lots)?new Set(context.lots.map(lot=>lot?.id)):new Set();
   pool=pool.filter(lot=>allowed.has(lot?.id));
   if(context.category){const matches=typeof categoryMatches==='function'?categoryMatches:window.FasCategories?.matches;pool=pool.filter(lot=>typeof matches==='function'?matches(lot,context.category):lot?.category===context.category)}
  }
  let candidates=pool;
  if(personal&&recommendation){
   const chosen=recommendation.engine.select(pool,{byViews:true}),allowed=new Set((Array.isArray(chosen)?chosen:[]).map(lot=>lot?.id));
   candidates=pool.filter(lot=>allowed.has(lot?.id));
  }
  if(active.has('low')){
   if(desktop)priceScope={lots:candidates,category:context?.active?context.category||'':'',reason:recommendation?.state.enabled&&recommendation.state.signalCount?'views':'cold'};
   else if(context?.active)priceScope=recommendation?.engine.priceCandidates?.(pool,{category:context.category||'',active:true,explicitAll:!!context.explicitAll})||{lots:pool,category:context.category||'',reason:'search'};
   else if(personal&&recommendation?.state.enabled&&recommendation.state.signalCount)priceScope={lots:candidates,category:'',reason:'views'};
   else priceScope=recommendation?.engine.priceCandidates?.(pool,{active:false,category:''})||{lots:[],category:'',reason:'cold'};
   const allowed=new Set((Array.isArray(priceScope.lots)?priceScope.lots:[]).map(lot=>lot?.id));
   candidates=candidates.filter(lot=>allowed.has(lot?.id));
  }
  const located=hasPoint(point),distances=new Map();
  const distance=lot=>{
   if(!located||typeof distanceFromOrigin!=='function')return Infinity;
   const position=typeof lotLocation==='function'?lotLocation(lot)?.point:null,key=position?.join(',')||lot.id;
   if(distances.has(key))return distances.get(key);
   const raw=distanceFromOrigin(lot,point),value=Number.isFinite(raw)&&raw>=0?raw:Infinity;distances.set(key,value);return value;
  };
  for(const lot of candidates){
   if(!live(lot)||seen.has(lot.id))continue;seen.add(lot.id);
   const price=current(lot),end=Date.parse(lot.ends);if(!Number.isSafeInteger(price)||price<=0||!Number.isFinite(end)||end<=now)continue;
   scopeIds.add(lot.id);expires=Math.min(expires,end);
   if(active.has('hot')){const entry=end-HOT_WINDOW+1;if(entry>now)expires=Math.min(expires,entry);if(end-now>=HOT_WINDOW)continue}
   if(active.has('ending')&&end-now>=24*3600000)continue;
   const value=marketValue(lot);if((active.has('value')||active.has('low')||active.has('hot'))&&!value)continue;
   if(value){values.set(lot.id,value);expires=Math.min(expires,value.expires)}
   if(active.has('low')){
    const tier=value.discount>=30?3:value.discount>=20?2:1;
    if(tier<cheapTier)continue;if(tier>cheapTier){cheapTier=tier;rows.length=0;eligible.clear()}
   }
   eligible.add(lot.id);
   const row={lot,priority:0,rank:active.has('hot')?-value.discount:distance(lot),distance:distance(lot),priceTie:!active.has('hot')&&active.has('low')?price:0,discount:active.has('value')||active.has('low')||active.has('hot')?value?.discount||0:0};
   if(full)rows.push(row);else addBest(rows,row);
  }
  if(full)rows.sort(compare);
  return {rows,expires,values,priceScope,eligible,scopeIds,city:originCity(point),region:originRegion(point,originCity(point)),cheapTier,located};
 }
 function selection(point,recommendation,context){
  if(modes.length===1){mode=modes[0];const result=singleSelection(point,recommendation,context);if(autoMode)modes=[mode];return result}
  return combinedSelection(cars,point,recommendation,context,modes);
 }
 function fallback(lot){const category=typeof categoryNames==='object'&&Object.hasOwn(categoryNames,lot.category)?lot.category:'other';return 'assets/'+category+'.svg'}
 function safePhoto(value){
  if(typeof value!=='string'||!value||/[\u0000-\u0020]/.test(value)||/\.(?:mp4|webm|mov)(?:[?#]|$)/i.test(value))return '';
  if(/^assets\/[a-z-]+\.svg$/.test(value)||/^assets\/photos\/[a-z][a-z0-9-]*\.jpg(?:\?view=\d+)?$/.test(value))return value;
  if(value.startsWith('blob:'))return window.FasSellerMedia?.isSafeObjectUrl(value)?value:'';
  try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href:''}catch{return ''}
 }
 function photo(lot){
  const candidates=[typeof image==='function'?image(lot):lot.image,lot.poster];
  for(const item of (Array.isArray(lot.media)?lot.media:[]).slice(0,20))if(typeof item==='string')candidates.push(item);else if(item&&typeof item==='object')candidates.push(item.poster,item.type==='video'?'':item.url);
  for(const candidate of candidates){const value=safePhoto(candidate);if(value)return value}return fallback(lot);
 }
 // Keep the catalogue's trusted order. Only the displayed photo is requested.
 function photos(lot){
  const values=[],seen=new Set();
  const add=raw=>{const item=typeof raw==='string'?{url:raw}:raw,url=item?.type==='video'?'':safePhoto(item?.url);if(!url||seen.has(url))return;seen.add(url);values.push({url,crop:['left','detail'].includes(item.crop)?item.crop:'',label:typeof item.label==='string'?item.label.slice(0,200):''})};
  if(typeof lotMedia==='function'&&typeof lotMediaItem==='function'){
   for(const raw of lotMedia(lot)){const item=lotMediaItem(lot,raw);if(item?.type==='image')add(item)}
  }else{
   add(photo(lot));for(const raw of (Array.isArray(lot.media)?lot.media:[]).slice(0,20))add(raw);
  }
  return values.length?values:[{url:photo(lot),crop:'',label:''}];
 }
 const photoPositions=new Map(),photoGalleries=new WeakMap(),photoQueue=new Set();let photoOwner=null,photoPress=null,photoFrame=0,photoRenderKey='';
 const owner=()=>{try{return window.FasSellerUI?.getProfile?.()?.id||'device'}catch{return 'device'}};
 const homeActive=()=>!section.hidden&&!track.hidden&&!document.hidden&&!(typeof reelsMode!=='undefined'&&reelsMode)&&!Array.from(document.querySelectorAll('dialog')).some(dialog=>dialog.open);
 function photoImage(item,index,requested=false){const media=item.photos[index];return '<img '+photoAttributes(media.url,item.position,requested)+' data-featured-photo-url="'+esc(media.url)+'"'+(media.crop?' data-crop="'+esc(media.crop)+'"':'')+' alt="" decoding="async" draggable="false">'}
 function cancelPhotoPress(block=false){if(photoPress&&block)photoPress.gallery.blockedUntil=Date.now()+400;photoPress=null}
 function currentGallery(gallery,validateMedia=false){
  if(!gallery||!homeActive()||!track.contains(gallery.box)||gallery.source!==cars||gallery.owner!==owner())return false;
  if(validateMedia){const lot=cars[gallery.sourceIndex];if(lot?.id!==gallery.item.id){refresh({force:true});return false}if(!live(lot)||JSON.stringify(photos(lot))!==JSON.stringify(gallery.item.photos)){refresh({force:true});return false}}
  return true;
 }
 function loadPhotoSlide(gallery,index,requested=true){
  const slide=gallery.slides[index];if(!slide||slide.querySelector('img'))return;
  slide.innerHTML=photoImage(gallery.item,index,requested);
 }
 function activePhoto(gallery,index){
  const next=Math.max(0,Math.min(gallery.item.photos.length-1,index));loadPhotoSlide(gallery,next,false);
  if(gallery.index===next)return;
  gallery.index=next;gallery.box.dataset.featuredPhotoIndex=String(next);
  const media=gallery.item.photos[next],label=gallery.box.querySelector('[data-featured-photo-label]'),count=gallery.box.querySelector('.featured-photo-count'),dots=gallery.box.querySelector('.featured-photo-dots');
  if(label){label.textContent=media.label;label.hidden=!media.label;label.setAttribute('title',media.label)}
  if(count)count.textContent=(next+1)+' / '+gallery.item.photos.length;
  if(dots)dots.setAttribute('aria-label','Фото '+(next+1)+' из '+gallery.item.photos.length);
  gallery.slides.forEach((slide,i)=>slide.setAttribute('tabindex',i===next?'0':'-1'));
  gallery.box.querySelectorAll('[data-featured-photo-dot]').forEach((dot,i)=>{dot.classList.toggle('active',i===next);if(i===next)dot.setAttribute('aria-current','true');else dot.removeAttribute('aria-current')});
  photoPositions.set(gallery.item.id,media.url);
 }
 function restorePhoto(gallery){
  if(!gallery.pendingRestore)return true;
  const width=Number(gallery.rail.clientWidth)||0;if(!width)return false;
  gallery.rail.scrollLeft=Math.max(0,gallery.index)*width;gallery.lastLeft=gallery.rail.scrollLeft;gallery.lastWidth=width;gallery.pendingRestore=false;return true;
 }
 function syncPhoto(gallery){
  if(!currentGallery(gallery,true)||!restorePhoto(gallery))return;
  const width=Number(gallery.rail.clientWidth)||0;if(!width)return;
  const position=Math.max(0,Math.min(gallery.item.photos.length-1,(Number(gallery.rail.scrollLeft)||0)/width));
  loadPhotoSlide(gallery,Math.floor(position));loadPhotoSlide(gallery,Math.ceil(position));activePhoto(gallery,Math.round(position));
 }
 function queuePhoto(gallery){
  photoQueue.add(gallery);if(photoFrame)return;
  const flush=()=>{photoFrame=0;const pending=[...photoQueue];photoQueue.clear();for(const item of pending)syncPhoto(item)};
  photoFrame=window.requestAnimationFrame?window.requestAnimationFrame(flush):setTimeout(flush,16);
 }
 const photoResize=typeof window.ResizeObserver==='function'?new window.ResizeObserver(entries=>{for(const entry of entries){const gallery=photoGalleries.get(entry.target.closest('[data-featured-gallery]'));if(!gallery||photoPress?.gallery===gallery)continue;const width=Number(gallery.rail.clientWidth)||0;if(width&&width!==gallery.lastWidth)gallery.pendingRestore=true;queuePhoto(gallery)}}):null;
 function stepPhoto(gallery,direction){
  if(![-1,1].includes(direction)||!currentGallery(gallery,true)||!restorePhoto(gallery))return false;
  const width=Number(gallery.rail.clientWidth)||0;if(!width)return false;
  const next=Math.max(0,Math.min(gallery.item.photos.length-1,Math.round((Number(gallery.rail.scrollLeft)||0)/width)+direction));loadPhotoSlide(gallery,next);
  const behavior=window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches?'auto':'smooth';
  if(typeof gallery.rail.scrollTo==='function')gallery.rail.scrollTo({left:next*width,behavior});else{gallery.rail.scrollLeft=next*width;queuePhoto(gallery)}return true;
 }
 // Desktop photo arrows: walk through this lot's photos, then continue to the neighbouring lot in the feed.
 function stepFeatured(button){
  const direction=Number(button.dataset.featuredStep),card=button.closest?.('.featured-card');if(!card||![-1,1].includes(direction))return false;
  const box=card.querySelector('[data-featured-gallery]'),gallery=box?photoGalleries.get(box):null;
  if(gallery){const width=Number(gallery.rail.clientWidth)||0,count=gallery.item.photos.length,index=width?Math.round((Number(gallery.rail.scrollLeft)||0)/width):0;if(direction>0?index<count-1:index>0)return stepPhoto(gallery,direction)}
  let sibling=direction>0?card.nextElementSibling:card.previousElementSibling;while(sibling&&!sibling.matches?.('.featured-card'))sibling=direction>0?sibling.nextElementSibling:sibling.previousElementSibling;
  if(!sibling)return scrollTrack(direction);
  // The feed slides by one card, so the neighbouring lot lands under the pointer and the arrow can be pressed again.
  const delta=sibling.getBoundingClientRect().left-card.getBoundingClientRect().left;
  const behavior=window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches?'auto':'smooth';
  if(delta){if(typeof track.scrollBy==='function')track.scrollBy({left:delta,behavior});else track.scrollLeft=(Number(track.scrollLeft)||0)+delta}
  sibling.classList.remove('featured-card-arrived');void sibling.offsetWidth;sibling.classList.add('featured-card-arrived');setTimeout(()=>sibling.classList.remove('featured-card-arrived'),900);
  syncMoves();return true;
 }
 function previewPhoto(box,index){
  const gallery=photoGalleries.get(box);
  if(!desktopBrowser()||desktopDrag||desktopWheel||photoPress||!Number.isInteger(index)||!currentGallery(gallery,true)||!restorePhoto(gallery))return false;
  const width=Number(gallery.rail.clientWidth)||0;if(!width||index<0||index>=gallery.item.photos.length)return false;
  loadPhotoSlide(gallery,index);gallery.rail.scrollLeft=index*width;
  // Hover is an intentional preview, not a drag: its scroll must not swallow
  // the user's next ordinary click through the carousel's ghost-click guard.
  gallery.lastLeft=gallery.rail.scrollLeft;syncPhoto(gallery);return true;
 }
 function bindPhotos(models){
  photoResize?.disconnect();const ids=new Set(models.map(item=>item.id));for(const id of photoPositions.keys())if(!ids.has(id))photoPositions.delete(id);
  for(const [position,row] of models.entries()){
   const item={...row,position},previous=photoPositions.get(item.id),index=Math.max(0,item.photos.findIndex(media=>media.url===previous));
   if(item.photos.length<2){photoPositions.set(item.id,item.photos[0].url);continue}
   const box=track.querySelector('[data-featured-gallery="'+item.id+'"]'),rail=box?.querySelector('.featured-photo-track');if(!rail)continue;
   const gallery={box,rail,item,source:cars,sourceIndex:cars.findIndex(lot=>lot.id===item.id),lastWidth:0,slides:Array.from(rail.querySelectorAll('[data-featured-photo-slide]')),index:-1,owner:photoOwner,blockedUntil:0,pendingRestore:true,lastLeft:0};photoGalleries.set(box,gallery);
   activePhoto(gallery,index);restorePhoto(gallery);photoResize?.observe(rail);queuePhoto(gallery);
   const start=(point,event)=>{
    cancelPhotoPress();if(!currentGallery(gallery,true))return;
    window.FasBackSwipe?.cancel?.();photoPress={gallery,id:point.identifier??event.pointerId,x:point.clientX,y:point.clientY,moved:false};
    loadPhotoSlide(gallery,gallery.index-1);loadPhotoSlide(gallery,gallery.index+1);
   };
   const move=(point,event)=>{const press=photoPress;if(!press||press.gallery!==gallery||(point.identifier??event.pointerId)!==press.id)return;if(Math.max(Math.abs(point.clientX-press.x),Math.abs(point.clientY-press.y))>8)press.moved=true};
   const end=(point,event)=>{const press=photoPress;if(!press||press.gallery!==gallery)return;const moved=press.moved||Math.max(Math.abs(point.clientX-press.x),Math.abs(point.clientY-press.y))>8;cancelPhotoPress(moved);if((Number(gallery.rail.clientWidth)||0)!==gallery.lastWidth){gallery.pendingRestore=true;queuePhoto(gallery)}};
   // Passive observation only: scrolling, momentum, pinch and snapping belong to the browser.
   rail.addEventListener('touchstart',event=>{if(event.touches.length!==1){cancelPhotoPress(true);return}start(event.touches[0],event)},{passive:true});
   rail.addEventListener('touchmove',event=>{if(event.touches.length!==1){cancelPhotoPress(true);return}move(event.touches[0],event)},{passive:true});
   rail.addEventListener('touchend',event=>{if(event.touches.length){cancelPhotoPress(true);return}const point=Array.from(event.changedTouches||[]).find(touch=>touch.identifier===photoPress?.id);if(point)end(point,event);else cancelPhotoPress(true)},{passive:true});
   rail.addEventListener('touchcancel',()=>cancelPhotoPress(true),{passive:true});rail.addEventListener('contextmenu',()=>cancelPhotoPress(true));
   if(window.PointerEvent){
    rail.addEventListener('pointerdown',event=>{if(event.pointerType!=='touch'&&event.button===0&&event.isPrimary!==false)start(event,event)},{passive:true});
    rail.addEventListener('pointermove',event=>{if(event.pointerType!=='touch')move(event,event)},{passive:true});
    rail.addEventListener('pointerup',event=>{if(event.pointerType!=='touch')end(event,event)},{passive:true});
    rail.addEventListener('pointercancel',()=>cancelPhotoPress(true),{passive:true});
   }
   rail.addEventListener('scroll',()=>{if(!track.contains(box))return;const left=Number(rail.scrollLeft)||0;if(Math.abs(left-gallery.lastLeft)>.5)gallery.blockedUntil=Date.now()+400;gallery.lastLeft=left;queuePhoto(gallery)},{passive:true});
  }
 }
 function model(lot,point){
  const rawDistance=hasPoint(point)&&typeof distanceFromOrigin==='function'?distanceFromOrigin(lot,point):Infinity,distance=Number.isFinite(rawDistance)&&rawDistance>=0?rawDistance:Infinity;
  const location=String(lot.city||'Местоположение не указано')+(Number.isFinite(distance)?' · '+(distance<1?'менее 1 км':'≈ '+Math.round(distance).toLocaleString('ru-RU')+' км'):'');
  const value=cache?.values.get(lot.id),badge=value?value.grade+' · '+value.discount.toLocaleString('ru-RU',{maximumFractionDigits:2})+'%':own(lot)?'Ваше объявление':lot.demo?'Демонстрационный лот':lot.auctionDirection==='descending'?'Торги на понижение':modes.includes('ending')?'Завершение '+new Date(lot.ends).toLocaleDateString('ru-RU'):'Идут торги';
  const media=photos(lot);return {id:lot.id,name:String(lot.name||'Лот № '+lot.id),price:current(lot),photo:media[0].url,photos:media,location,ends:lot.ends,badge,value:value?{market:value.market,grade:value.grade,discount:value.discount}:null,down:lot.auctionDirection==='descending',engineFacts:window.FasVehicleEngineFacts?.summaryHTML(lot,{compact:true})||'',shareable:lot.demo===true&&!lot.demoEdited&&!lot.sellerOwnerId,partner:typeof window.FasSellerStorefront?.buttonHTML==='function'?'':window.FasPartnerBranding?.html(lot)||'',seller:window.FasSellerStorefront?.buttonHTML?.(lot)||''};
 }
 function photoAttributes(url,index,requested=false){
  const delivery=window.FasResponsiveMedia?.image?.(url),priority=requested||index<2;
  return 'src="'+esc(delivery?.src||url)+'" loading="'+(priority?'eager':'lazy')+'" fetchpriority="'+(priority?'high':'low')+'"'+(delivery?' srcset="'+esc(delivery.srcset)+'" sizes="(max-width:700px) calc(50vw - 38px), 190px" width="'+delivery.width+'" height="'+delivery.height+'" data-responsive-original="'+esc(delivery.originalSrc)+'"':'');
 }
 function deadlineHTML(value){
  const end=new Date(value);if(!Number.isFinite(end.getTime()))return '';
  const day=end.toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit'}),time=end.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}),label='Окончание торгов по местному времени: '+end.toLocaleString('ru-RU');
  return '<time class="featured-deadline" datetime="'+esc(end.toISOString())+'" aria-label="'+esc(label)+'" title="'+esc(label)+'">До '+esc(day)+' · '+esc(time)+'</time>';
 }
 function card(item,index){const selected=Math.max(0,item.photos.findIndex(media=>media.url===photoPositions.get(item.id))),multiple=item.photos.length>1;
  const share='<button type="button" class="featured-share" data-buyer-share="'+item.id+'" aria-label="'+(item.shareable?'Поделиться ссылкой на лот':'Копировать номер локального лота')+'" title="'+(item.shareable?'Поделиться лотом':'Копировать номер лота')+'">'+uiIcon(item.shareable?'share':'copy')+'<span>'+(item.shareable?'Поделиться':'Номер лота')+'</span></button>';
  const slide=(media,i)=>'<button type="button" class="featured-open" data-featured-open="'+item.id+'"'+(multiple?' data-featured-photo-slide="'+i+'" tabindex="'+(i===selected?'0':'-1')+'"':'')+' aria-label="'+esc('Открыть '+item.name+', фото '+(i+1)+' из '+item.photos.length+(media.label?' — '+media.label:''))+'">'+(i===selected?photoImage({...item,position:index},i):'')+'</button>';
  const dots='<div class="featured-photo-dots'+(item.photos.length>20?' is-dense':'')+'" role="img" aria-label="Фото '+(selected+1)+' из '+item.photos.length+'">'+item.photos.map((_,i)=>'<span data-featured-photo-dot="'+i+'" class="'+(i===selected?'active':'')+'"'+(i===selected?' aria-current="true"':'')+'></span>').join('')+'</div>';
  return `<article class="featured-card" data-featured-lot="${item.id}"><div class="featured-photo"${multiple?' data-featured-gallery="'+item.id+'" data-featured-photo-index="'+selected+'"':''}>${multiple?'<div class="featured-photo-track" tabindex="0" role="region" aria-roledescription="карусель" aria-label="'+esc('Фотографии лота '+item.name+'. Листайте влево и вправо')+'">'+item.photos.map(slide).join('')+'</div>':slide(item.photos[0],0)}<div class="featured-photo-overlay"><span class="featured-photo-label" data-featured-photo-label${item.photos[selected].label?'':' hidden'} title="${esc(item.photos[selected].label)}">${esc(item.photos[selected].label)}</span><span class="featured-photo-count" aria-live="polite">${selected+1} / ${item.photos.length}</span>${dots}</div><button type="button" class="featured-favorite" data-featured-fav="${item.id}" aria-label="В избранное" aria-pressed="false">${uiIcon('heart')}</button>${share}<button type="button" class="featured-photo-step" data-featured-step="-1" tabindex="-1" aria-label="Предыдущее фото или предыдущий лот"><span aria-hidden="true"></span></button><button type="button" class="featured-photo-step" data-featured-step="1" tabindex="-1" aria-label="Следующее фото или следующий лот"><span aria-hidden="true"></span></button></div><button type="button" class="featured-name" data-featured-open="${item.id}">${esc(item.name)}</button>${item.engineFacts}<span class="featured-price-label">Текущая цена</span><strong class="featured-price" data-current-lot-price="${item.id}"${item.down?' data-live-descending-price="'+item.id+'"':''}>${esc(money(item.price))}</strong><span class="featured-location">${esc(item.location)}</span>${deadlineHTML(item.ends)}${item.partner}${item.seller}<span class="featured-badge${item.value?' featured-value':''}"${item.value?' data-value-tier="'+(item.value.discount>=30?'super':item.value.discount>=20?'great':'good')+'"':''}>${esc(item.badge)}</span>${item.value?'<span class="featured-market"><s title="Медиана цен аналогов, добавленных продавцом. Это не независимая оценка. Комиссии, задаток и расходы не включены.">Ориентир '+esc(money(item.value.market))+'</s><small class="featured-value-source">По аналогам продавца</small></span>':''}<button type="button" class="featured-participate" data-featured-open="${item.id}" data-featured-participate="${item.id}" aria-label="${esc('Участвовать в торгах: '+item.name)}"><span>Участвовать в торгах</span>${uiIcon('arrow-right')}</button></article>`}
 function syncFavorites(){
  const favorites=new Set(saved);
  for(const button of track.querySelectorAll('[data-featured-fav]')){const liked=favorites.has(Number(button.dataset.featuredFav));if(button.dataset.liked===String(liked))continue;button.dataset.liked=String(liked);button.setAttribute('aria-pressed',String(liked));button.setAttribute('aria-label',liked?'Убрать из избранного':'В избранное');button.innerHTML=uiIcon('heart',liked)}
 }
 function syncMoves(){const max=Math.max(0,track.scrollWidth-track.clientWidth),left=Number(track.scrollLeft)||0;for(const button of section.querySelectorAll('[data-featured-move]'))button.disabled=!lastRows.length||(Number(button.dataset.featuredMove)<0?left<=1:left>=max-1);if(desktopViewport){desktopViewport.hidden=track.hidden;desktopViewport.classList.toggle('has-featured-prev',!!lastRows.length&&left>1);desktopViewport.classList.toggle('has-featured-next',!!lastRows.length&&left<max-1)}}
 function scrollTrack(direction){
  const maximum=Math.max(0,(Number(track.scrollWidth)||0)-(Number(track.clientWidth)||0)),left=Number(track.scrollLeft)||0;
  if(!maximum||direction!==-1&&direction!==1)return false;
  const next=Math.min(maximum,Math.max(0,left+direction*Math.max(180,(Number(track.clientWidth)||0)*.85)));
  if(Math.abs(next-left)<.5)return false;
  const behavior=window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches?'auto':'smooth';
  if(typeof track.scrollBy==='function')track.scrollBy({left:next-left,behavior});else track.scrollLeft=next;
  syncMoves();return true;
 }
 // Desktop mice need a drag and a vertical-wheel route for horizontal rails.
 // Touch and horizontal trackpad gestures remain browser-owned.
 const desktopMedia=window.matchMedia?.('(min-width: 1025px) and (hover: hover) and (pointer: fine)');
 let desktopDrag=null,desktopClickUntil=0,desktopBound=false,desktopWheelBound=false,desktopViewport=null,desktopWheel=null;
 function desktopBrowser(){
  if(typeof window.FasDesktopWeb?.active==='function')return window.FasDesktopWeb.active();
  if(!window.PointerEvent)return false;
  const nav=window.navigator||{};
  try{return !!desktopMedia?.matches&&!nav.userAgentData?.mobile&&!/Android|iPhone|iPad|iPod|Mobile/i.test(nav.userAgent||'')&&!(nav.platform==='MacIntel'&&nav.maxTouchPoints>1)&&!window.Capacitor?.isNativePlatform?.()&&!document.documentElement.classList.contains('native-app')}catch{return false}
 }
 function desktopEligible(){return !!window.PointerEvent&&desktopBrowser()}
 function finishDesktopWheel(){const wheel=desktopWheel;if(!wheel)return;desktopWheel=null;clearTimeout(wheel.timer);wheel.rail.classList.remove('is-desktop-wheeling')}
 function moveDesktopWheel(event){
  if(!desktopBrowser()||!homeActive()||event.defaultPrevented||event.cancelable===false||event.ctrlKey||event.metaKey||event.altKey||event.shiftKey||Number(event.deltaX)){finishDesktopWheel();return}
  const rail=event.target?.closest?.('.featured-photo-track')||track,raw=Number(event.deltaY);
  if(!track.contains(rail)||!Number.isFinite(raw)||!raw)return;
  const maximum=Math.max(0,(Number(rail.scrollWidth)||0)-(Number(rail.clientWidth)||0)),left=Number(rail.scrollLeft)||0;
  const unit=event.deltaMode===1?parseFloat(window.getComputedStyle?.(rail)?.lineHeight)||16:event.deltaMode===2?Number(rail.clientWidth)||0:1;
  const next=Math.max(0,Math.min(maximum,left+raw*unit));if(Math.abs(next-left)<.5){finishDesktopWheel();return}
  if(desktopWheel?.rail!==rail)finishDesktopWheel();else clearTimeout(desktopWheel.timer);
  // Let a wheel burst accumulate fractional native offsets before snap settles.
  rail.classList.add('is-desktop-wheeling');rail.scrollLeft=next;
  desktopWheel={rail,timer:setTimeout(finishDesktopWheel,180)};
  if(Math.abs((Number(rail.scrollLeft)||0)-left)>.5){event.preventDefault();syncMoves()}
 }
 function syncDesktopControls(){
  if(!desktopBrowser()){
   finishDesktopWheel();if(desktopViewport){desktopViewport.parentElement?.insertBefore(track,desktopViewport);desktopViewport.remove();desktopViewport=null}return;
  }
  if(!desktopViewport&&track.parentElement){
   desktopViewport=document.createElement('div');desktopViewport.className='featured-viewport';track.parentElement.insertBefore(desktopViewport,track);desktopViewport.appendChild(track);
   for(const direction of [-1,1]){const button=document.createElement('button');button.type='button';button.className='featured-edge';button.setAttribute('data-featured-move',String(direction));button.setAttribute('data-featured-edge',String(direction));button.setAttribute('aria-controls','featured-track');button.setAttribute('aria-label',direction<0?'Предыдущие лоты подборки':'Следующие лоты подборки');button.innerHTML='<span aria-hidden="true"></span>';desktopViewport.appendChild(button)}
  }
  if(!desktopWheelBound){desktopWheelBound=true;track.addEventListener('wheel',moveDesktopWheel,{passive:false});window.addEventListener('blur',finishDesktopWheel);window.addEventListener('pagehide',finishDesktopWheel);document.addEventListener('visibilitychange',()=>{if(document.hidden)finishDesktopWheel()})}
  syncMoves();
 }
 function finishDesktopDrag(){
  const drag=desktopDrag;if(!drag)return;desktopDrag=null;
  drag.rail.classList.remove('is-desktop-dragging');
  if(drag.moved){desktopClickUntil=Date.now()+450;cancelPhotoPress(true);if(drag.gallery)queuePhoto(drag.gallery)}
  try{if(drag.rail.hasPointerCapture?.(drag.id))drag.rail.releasePointerCapture(drag.id)}catch{}
 }
 function startDesktopDrag(event){
  if(event.pointerType!=='mouse'||event.button!==0||event.isPrimary===false||event.defaultPrevented||event.ctrlKey||event.altKey||event.metaKey||event.shiftKey||!desktopEligible()||!homeActive())return;
  finishDesktopWheel();finishDesktopDrag();desktopClickUntil=0;
  const target=event.target,control=target?.closest?.('button,input,textarea,select,a,[contenteditable="true"]');
  if(control&&!control.matches('.featured-open,.featured-name'))return;
  // Keep the native scrollbar thumb and track available to mouse users.
  if(target===track&&event.clientY>=track.getBoundingClientRect().top+track.clientHeight)return;
  const rail=target?.closest?.('.featured-photo-track')||track;
  if(!track.contains(rail)||(Number(rail.scrollWidth)||0)<=(Number(rail.clientWidth)||0))return;
  const gallery=rail===track?null:photoGalleries.get(rail.closest('[data-featured-gallery]'));
  if(gallery&&(!currentGallery(gallery,true)||!restorePhoto(gallery)))return;
  desktopDrag={rail,gallery,id:event.pointerId,x:event.clientX,y:event.clientY,left:Number(rail.scrollLeft)||0,moved:false};
 }
 function moveDesktopDrag(event){
  const drag=desktopDrag;if(!drag||event.pointerId!==drag.id)return;
  if(event.pointerType!=='mouse'||!desktopEligible()||!homeActive()||!track.contains(drag.rail)||event.buttons!==undefined&&!(event.buttons&1)){finishDesktopDrag();return}
  const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
  if(!drag.moved){
   if(Math.max(Math.abs(dx),Math.abs(dy))<=8)return;
   if(Math.abs(dx)<=Math.abs(dy)){finishDesktopDrag();return}
   drag.moved=true;drag.rail.classList.add('is-desktop-dragging');cancelPhotoPress(true);window.FasBackSwipe?.cancel?.();
   try{drag.rail.setPointerCapture?.(drag.id)}catch{}
   const selection=window.getSelection?.();if(selection?.anchorNode&&drag.rail.contains(selection.anchorNode))selection.removeAllRanges();
  }
  event.preventDefault();
  const maximum=Math.max(0,(Number(drag.rail.scrollWidth)||0)-(Number(drag.rail.clientWidth)||0));
  drag.rail.scrollLeft=Math.max(0,Math.min(maximum,drag.left-dx));
 }
 function syncDesktopDrag(){
  const enabled=desktopEligible();track.classList.toggle('featured-desktop-drag',enabled);
  if(!enabled)finishDesktopDrag();if(!enabled||desktopBound)return;desktopBound=true;
  track.addEventListener('pointerdown',startDesktopDrag,{passive:true});
  window.addEventListener('pointermove',moveDesktopDrag,{passive:false});
  for(const type of ['pointerup','pointercancel'])window.addEventListener(type,event=>{if(event.pointerId===desktopDrag?.id)finishDesktopDrag()},{passive:true});
  track.addEventListener('lostpointercapture',event=>{if(event.pointerId===desktopDrag?.id)finishDesktopDrag()});
  track.addEventListener('click',event=>{if(event.detail===0||Date.now()>=desktopClickUntil)return;desktopClickUntil=0;event.preventDefault();event.stopImmediatePropagation() },true);
  window.addEventListener('blur',finishDesktopDrag);window.addEventListener('pagehide',finishDesktopDrag);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)finishDesktopDrag()});
 }
 function syncDesktopContext(){syncDesktopDrag();syncDesktopControls();if(cache&&cache.desktop!==desktopPersonalization())refresh()}
 desktopMedia?.addEventListener?.('change',syncDesktopContext);
 if(window.FasDesktopWeb&&typeof window.MutationObserver==='function')new window.MutationObserver(syncDesktopContext).observe(document.documentElement,{attributes:true,attributeFilter:['class']});
 window.addEventListener('resize',()=>{finishDesktopDrag();syncDesktopContext()});syncDesktopDrag();syncDesktopControls();
 if(!track.getAttribute?.('tabindex'))track.setAttribute('tabindex','0');
 if(!track.getAttribute?.('aria-label'))track.setAttribute('aria-label','Горизонтальная подборка лотов');
 track.setAttribute('aria-roledescription','карусель');
 track.setAttribute('title','Листайте влево и вправо или используйте клавиши со стрелками');
 track.addEventListener('keydown',event=>{
  if(event.defaultPrevented||event.altKey||event.ctrlKey||event.metaKey||event.shiftKey||section.hidden||track.hidden||typeof reelsMode!=='undefined'&&reelsMode)return;
  if(!['ArrowLeft','ArrowRight'].includes(event.key)||event.target?.closest?.('input,textarea,select,[contenteditable="true"]'))return;
  const photoTarget=event.target?.closest?.('.featured-open,.featured-photo-track'),gallery=photoTarget?.closest?.('[data-featured-gallery]');
  if(gallery&&track.contains(gallery)){event.preventDefault();event.stopPropagation?.();stepPhoto(photoGalleries.get(gallery),event.key==='ArrowLeft'?-1:1);return}
  if(scrollTrack(event.key==='ArrowLeft'?-1:1)){event.preventDefault();event.stopPropagation?.()}
 });
 function refresh(options={}){
  const activeOwner=owner();if(photoOwner!==activeOwner){photoOwner=activeOwner;photoPositions.clear();contentKey='';photoRenderKey='';cancelPhotoPress(true)}
  const point=origin(),originKey=JSON.stringify(point||null),bidSource=typeof bids==='object'?bids:null,recommendation=recommendations(),context=window.FasCatalogBuyerContext?.()??null;
  const engine=recommendation?.engine||null,revision=recommendation?.state.revision??null,recommendationMode=recommendation?.state.mode??null,desktop=desktopPersonalization();
  const invalid=cache&&cache.rows.some(({lot})=>!live(lot));
  // A plain catalogue render creates a new context object even though its
  // candidates remain the same inventory. Active searches still invalidate it.
  const changedContext=cache&&cache.context!==context&&(cache.context?.active||context?.active);
  if(options?.force||!cache||cache.desktop!==desktop||cache.source!==cars||cache.length!==cars.length||cache.bids!==bidSource||cache.modeKey!==modes.join('|')||cache.origin!==originKey||cache.engine!==engine||cache.revision!==revision||cache.recommendationMode!==recommendationMode||changedContext||Date.now()>=cache.expires||invalid){cache={...selection(point,recommendation,context),source:cars,length:cars.length,bids:bidSource,mode,modeKey:modes.join('|'),origin:originKey,engine,revision,recommendationMode,context,desktop}}
  lastRows=cache.rows;const models=lastRows.map(({lot})=>model(lot,point)),key=JSON.stringify(models);
  if(key!==contentKey){
   const geometryKey=JSON.stringify(models.map(({price,...item})=>item));
   if(geometryKey===photoRenderKey){
    // Keep the browser's active scroll node and inertia during price-only updates.
    for(const item of models){const price=track.querySelector('[data-current-lot-price="'+item.id+'"]');if(price)price.textContent=money(item.price)}
   }else{finishDesktopWheel();finishDesktopDrag();cancelPhotoPress(true);photoQueue.clear();const left=Number(track.scrollLeft)||0;track.innerHTML=models.map(card).join('');track.scrollLeft=left;bindPhotos(models);photoRenderKey=geometryKey}
   contentKey=key;
  }
  for(const [position,item] of models.entries()){
   if(item.photos.length<2)continue;
   const box=track.querySelector('[data-featured-gallery="'+item.id+'"]'),gallery=box&&photoGalleries.get(box);if(!gallery)continue;
   gallery.source=cars;gallery.item={...item,position};if(cars[gallery.sourceIndex]?.id!==item.id)gallery.sourceIndex=cars.findIndex(lot=>lot.id===item.id);
  }
  syncFavorites();section.removeAttribute('data-featured-loading');section.removeAttribute('aria-busy');section.inert=false;section.hidden=false;track.hidden=!models.length;empty.hidden=!!models.length;
  let emptyText=mode==='hot'?'Пока нет выгодных лотов с актуальными аналогами и окончанием торгов менее чем через 12 часов.':mode==='value'?'Пока нет лотов с актуальной оценкой по аналогам. Выберите другую подборку.':'В этой подборке пока нет действующих торгов.',chooseCategory=false;
  if(mode==='low'&&!models.length){emptyText=desktop||cache.priceScope?.category?'Нет подходящих выгодных лотов с актуальной оценкой. Измените поиск или выберите другую категорию.':'Выберите категорию, найдите товар или добавьте интересный лот в избранное.';chooseCategory=true}
  const texts={
   'for-you':recommendation?.state.mode==='all'?'Персональная подборка отключена. Настройки — на этом устройстве.':recommendation?.state.enabled&&recommendation.state.signalCount?'Часто просматриваемые категории · '+(cache.city?'Сначала '+cache.city+', затем ближайшие.':'Сначала ближайшие.'):'Интересы сохраняются только на этом устройстве.',
   value:'Выгода рассчитана по текущей цене и актуальным аналогам продавца. Внешний сервис оценки не подключён; комиссии и расходы не включены.',
   nearby:point?(recommendation?.state.enabled&&recommendation.state.signalCount?'Интересующие вас категории, от ближних к дальним.':''):'Выберите регион, чтобы видеть ближайшие лоты.',
   hot:'Меньше 12 часов · Сначала наибольшая выгода по актуальным аналогам продавца. Комиссии и расходы не включены.',
   ending:'Меньше 24 часов · Интересующие вас категории. '+(cache.region?'Сначала ваш регион, затем ближайшие.':'Сначала ближайшие.')
  };
  const scope=cache.priceScope,label=scope?.category?(window.FasCategories?.label(scope.category)||(typeof categoryNames==='object'?categoryNames[scope.category]:'')||''):'';
  note.textContent=mode==='low'?(models.length?(label?label+' · ':'')+'Сначала дешевле среди '+(cache.cheapTier===3?'суперцен':cache.cheapTier===2?'очень выгодных':'выгодных')+' · По аналогам продавца.':''):texts[mode];
  if(modes.length!==1){
   const labels={'for-you':'Для вас',value:'Выгодно',nearby:'Рядом',low:'Дешевле',ending:'До 24 часов',hot:'Горящие предложения'},caption=modes.map(value=>labels[value]).join(' + ');
   note.textContent=(caption?caption+'. ':context?.active?'По текущему поиску. ':'Все доступные лоты. ')+(modes.includes('hot')?'Меньше 12 часов · Сначала наибольшая выгода.':cache.located?'Сначала ближайшие.':'Выберите регион для сортировки по расстоянию.');
   if(modes.includes('value')||modes.includes('low')||modes.includes('hot'))note.textContent+=' По актуальным аналогам продавца, без учёта расходов и комиссий.';
   if(!models.length){emptyText=modes.length?'Нет лотов, соответствующих всем выбранным условиям. Измените сочетание или параметры поиска.':'По текущим условиям нет действующих торгов. Измените параметры поиска.';chooseCategory=false}
  }
  empty.innerHTML=esc(emptyText)+(!models.length?(chooseCategory?' <button type="button" class="featured-empty-action" data-featured-choose>Выбрать категорию</button>':'')+' <button type="button" class="featured-empty-action" data-featured-empty-settings>Изменить условия</button>':'');
  for(const button of section.querySelectorAll('[data-featured-mode]'))button.setAttribute('aria-pressed',String(modes.includes(button.dataset.featuredMode)));syncMoves();
  const feed=document.querySelector('#home-open-feed');if(feed)feed.onclick=openFeed;
 }
 function singleOrderLots(lots,selectedMode=mode){
  if(!MODES.has(selectedMode))return [];
  const point=origin(),town=originCity(point),state=window.FasRecommendations?.summary?.(),context=window.FasCatalogBuyerContext?.(),preferCity=!!(state?.enabled&&state.signalCount||context?.active&&context.category),city=selectedMode==='for-you'&&!preferCity?'':town,region=originRegion(point,town),distances=new Map();let tier=0;
  const rows=[];
  for(const lot of Array.isArray(lots)?lots:[]){
   if(!live(lot)||selectedMode==='ending'&&Date.parse(lot.ends)-Date.now()>=24*3600000)continue;
   const price=current(lot);if(!Number.isSafeInteger(price)||price<=0)continue;
   if(selectedMode==='hot'){const remaining=Date.parse(lot.ends)-Date.now();if(!Number.isFinite(remaining)||remaining<=0||remaining>=HOT_WINDOW)continue}
   let value=null;if(selectedMode==='low'||selectedMode==='value'||selectedMode==='hot'){value=marketValue(lot);if(!value)continue}
   if(selectedMode==='low'){const next=value.discount>=30?3:value.discount>=20?2:1;if(next<tier)continue;if(next>tier){tier=next;rows.length=0}}
   let distance=Infinity;
   if(point&&typeof distanceFromOrigin==='function'){
    const position=typeof lotLocation==='function'?lotLocation(lot)?.point:null,distanceKey=position?.join(',')||lot.id;
    if(distances.has(distanceKey))distance=distances.get(distanceKey);else{distance=distanceFromOrigin(lot,point);distances.set(distanceKey,distance)}
   }
   const priority=selectedMode==='for-you'&&city?Number(cityKey(lot.city)!==cityKey(city)):selectedMode==='ending'&&region?Number((typeof getRegionCode==='function'?getRegionCode(lot):lot.regionCode)!==region):0;
   rows.push({lot,priority,rank:selectedMode==='low'?price:(selectedMode==='value'||selectedMode==='hot')?-value.discount:point?distance:0,distance,discount:selectedMode==='low'?value.discount:0});
  }
  return rows.sort(compare).map(row=>row.lot);
 }
 function orderLots(lots,selectedModes=modes){
  const selected=normalizeModes(selectedModes);if(!selected)return [];
  if(selected.length===1)return singleOrderLots(lots,selected[0]);
  return combinedSelection(lots,origin(),recommendations(),window.FasCatalogBuyerContext?.()??null,selected,true).rows.map(row=>row.lot);
 }
 function openFeed(){
  refresh({force:true});
  const lots=orderLots(cars.filter(lot=>cache.scopeIds.has(lot.id)),modes);
  if(!lots.length){if(typeof toast==='function')toast('По выбранным условиям лотов нет. Измените условия подборки.');empty.scrollIntoView?.({block:'center',behavior:'auto'});empty.querySelector('[data-featured-empty-settings]')?.focus?.({preventScroll:true});return false}
  if(typeof window.FasOpenFeaturedFeed!=='function')return false;
  return window.FasOpenFeaturedFeed({ids:lots.map(lot=>lot.id),scopeIds:[...cache.scopeIds],mode,modes:modes.slice(),city:cache.city,regionCode:cache.region});
 }
 function updateModes(value,optIn=false){
  const selected=normalizeModes(value);if(!selected)return false;
  if(optIn&&selected.includes('for-you'))window.FasRecommendations?.setMode?.('for-you');
  autoMode=false;const changed=selected.join('|')!==modes.join('|');modes=selected;mode=modes[0]||'nearby';
  writeModes(modes);if(changed){cache=null;track.scrollLeft=0}refresh();return true;
 }
 function setMode(value){return MODES.has(value)?updateModes([value],value==='for-you'):false}
 function setModes(value){const selected=normalizeModes(value);return selected?updateModes(selected,selected.includes('for-you')&&!modes.includes('for-you')):false}
 function toggleMode(value){if(!MODES.has(value))return false;const adding=!modes.includes(value);return updateModes(adding?[...modes,value]:modes.filter(item=>item!==value),adding&&value==='for-you')}
 function getModes(){return modes.slice()}
 function state(){return {modes:getModes(),mode,storageAvailable}}
 function invalidate(){cache=null}
 section.addEventListener('click',event=>{
  const target=event.target;
  const stepButton=target.closest?.('[data-featured-step]');if(stepButton&&section.contains(stepButton)){event.preventDefault();event.stopPropagation?.();stepFeatured(stepButton);return}
  const photoOpen=target.closest?.('.featured-open'),gallery=photoOpen?.closest?.('[data-featured-gallery]');
  if(gallery&&(!homeActive()||event.detail!==0&&Date.now()<(photoGalleries.get(gallery)?.blockedUntil||0))){event.preventDefault();event.stopPropagation?.();return}
  const modeButton=target.closest?.('[data-featured-mode]');if(modeButton&&section.contains(modeButton)){event.preventDefault();if(!modeButton.disabled)toggleMode(modeButton.dataset.featuredMode);return}
  const settings=target.closest?.('[data-featured-empty-settings]');if(settings&&section.contains(settings)){event.preventDefault();event.stopPropagation?.();if(typeof window.FasFeaturedSettings?.open==='function'){window.FasFeaturedSettings.open();section.querySelector('#featured-settings-panel')?.scrollIntoView?.({block:'nearest',behavior:'auto'})}else if(typeof showSearch==='function')showSearch();return}
  const choose=target.closest?.('[data-featured-choose]');if(choose&&section.contains(choose)){event.preventDefault();if(window.FasCategoryUI)window.FasCategoryUI.open({value:cache?.priceScope?.category||''});else if(typeof showSearch==='function')showSearch();return}
  const move=target.closest?.('[data-featured-move]');if(move&&section.contains(move)){if(move.disabled)return;event.preventDefault();scrollTrack(Number(move.dataset.featuredMove));return}
  const favorite=target.closest?.('[data-featured-fav]'),open=target.closest?.('[data-featured-open]'),button=favorite||open;if(!button||!section.contains(button))return;
  const participate=!!open?.hasAttribute('data-featured-participate');
  if(participate&&!homeActive())return;
  event.preventDefault();event.stopPropagation?.();const id=Number(favorite?favorite.dataset.featuredFav:open.dataset.featuredOpen),lot=cars.find(item=>item.id===id);
  if(!live(lot)){refresh({force:true});if(typeof toast==='function')toast('Лот сейчас недоступен для участия в торгах');return}
  if(favorite){toggleLotFavorite(id);refresh()}else{
   openCar(id);
   if(participate){
    const modal=document.getElementById('modal'),body=modal?.querySelector?.('[data-open-lot-id]'),input=modal?.querySelector?.('#bid');
    if(!modal?.open||Number(body?.dataset.openLotId)!==id)return;
    // Only navigate: bidding and payment still require their existing explicit actions.
    if(lot.auctionDirection!=='descending'&&!own(lot)&&input&&!input.disabled&&typeof openDetailedLotAction==='function')openDetailedLotAction(id,'participate');
    else modal.querySelector?.('.lot-detail-offer')?.scrollIntoView?.({block:'center',behavior:'auto'});
   }
  }
 });
 track.addEventListener('scroll',()=>{cancelPhotoPress(true);syncMoves()},{passive:true});for(const type of ['pointerup','pointercancel'])window.addEventListener(type,event=>{if(event.pointerType==='touch'||!photoPress)return;const moved=photoPress.moved||Math.max(Math.abs(event.clientX-photoPress.x),Math.abs(event.clientY-photoPress.y))>8;cancelPhotoPress(type==='pointercancel'||moved)},{passive:true});window.addEventListener('blur',()=>cancelPhotoPress(true));window.addEventListener('pagehide',()=>cancelPhotoPress(true));window.addEventListener('resize',syncMoves);document.addEventListener('visibilitychange',()=>{cancelPhotoPress(true);if(!document.hidden)refresh()});
 section.addEventListener('error',event=>{const img=event.target;if(img.tagName!=='IMG'||img.dataset.featuredFallback)return;img.removeAttribute('srcset');img.removeAttribute('sizes');if(img.dataset.responsiveOriginal&&!img.dataset.responsiveTried){img.dataset.responsiveTried='true';img.setAttribute('src',img.dataset.responsiveOriginal);return}const id=Number(img.closest('[data-featured-lot]')?.dataset.featuredLot),lot=cars.find(item=>item.id===id);img.dataset.featuredFallback='true';img.setAttribute('src',fallback(lot||{}))},true);
 window.FasFeaturedLots=Object.freeze({refresh,invalidate,setMode,setModes,toggleMode,getModes,state,openFeed,orderLots,previewPhoto});refresh();
})();
