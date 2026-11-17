/* Device-local interests. Candidate selection never changes geographical order. */
(()=>{
 'use strict';
 if(globalThis.FasRecommendations)return;
 const KEY='fas-recommendations-v1',VERSION=1,MAX_SIGNALS=128,DAY=86400000,AGE=90*DAY,INTENT_AGE=7*DAY,MAX_JSON=262144;
 const validId=value=>Number.isSafeInteger(value)&&value>0;
 const number=value=>typeof value==='number'&&Number.isFinite(value)?value:null;
 // Shared inventory templates repeat these small strings across many regions.
 // These caches contain no lot objects, IDs, locations, or persistent history.
 const words=new Map(),categories=new Map(),facets=new Map();
 function remember(cache,key,value,limit){if(cache.size>=limit)cache.delete(cache.keys().next().value);cache.set(key,value);return value}
 function word(value){
  if(typeof value!=='string')return '';
  if(words.has(value))return words.get(value);
  const result=value.normalize('NFKC').toLocaleLowerCase('ru').replace(/ё/g,'е').replace(/[^\p{L}\p{N}]+/gu,' ').trim().slice(0,64);
  return value.length<=256?remember(words,value,result,1024):result;
 }
 function category(value){
  if(typeof value!=='string')return '';
  if(categories.has(value))return categories.get(value);
  const result=/^[a-z][a-z0-9_-]{0,47}$/i.test(value.trim())?value.trim().toLowerCase():'';
  return value.length<=128?remember(categories,value,result,256):result;
 }
 const now=()=>Date.now();
 let yearDay=-1,maximumYear=0;
 function updateYear(time){const day=Math.floor(time/DAY);if(day!==yearDay){yearDay=day;maximumYear=new Date(time).getUTCFullYear()+2}}
 updateYear(now());
 let mode='for-you',seeded=false,storageAvailable=true,revision=0,cached=null,searchIntent=null;
 const signals=new Map();

 function descriptor(lot,profile){
  if(!lot||typeof lot!=='object'||Array.isArray(lot)||!validId(lot.id))return null;
  const categoryId=category(lot.category),subcategoryId=category(lot.subcategory),make=word(lot.make)||word(lot.brand),model=word(lot.model),manufacturer=word(lot.manufacturer);
  if(profile){
   const t=taxonomyTerms(categoryId,subcategoryId),m=profile.maps;
   // No year, money, bucket, or score work is needed without an interest anchor.
   if(!((t.leaf&&m.leaf.has(t.leaf))||(t.broad&&m.broad.has(t.broad))||(t.group&&m.broad.has(t.group))||(make&&m.make.has(make))||(model&&m.model.has(make+'|'+model))||(manufacturer&&m.manufacturer.has(manufacturer))))return null;
  }
  const year=number(lot.year),price=number(lot.price)??number(lot.startPrice);
  // Never copy an arbitrary property, title, location, VIN, or seller information.
  return {id:lot.id,category:categoryId,subcategory:subcategoryId,make,model,manufacturer,year:year!==null&&Number.isInteger(year)&&year>=1800&&year<=maximumYear?year:null,price:price!==null&&price>0&&price<=1e15?price:null};
 }
 function timestamp(value,time){return typeof value==='number'&&Number.isFinite(value)&&value>0&&value<=time+300000&&value>time-AGE?value:0}
 function sanitize(entry,time){
  if(!entry||typeof entry!=='object'||Array.isArray(entry))return null;
  const lot=descriptor(entry.lot);if(!lot)return null;
  const openedAt=timestamp(entry.openedAt,time),favoriteAt=timestamp(entry.favoriteAt,time),opens=openedAt&&Number.isInteger(entry.opens)&&entry.opens>0?Math.min(3,entry.opens):0;
  return opens||favoriteAt?{lot,opens,openedAt:opens?openedAt:0,favoriteAt,touchedAt:Math.max(opens?openedAt:0,favoriteAt)}:null;
 }
 function invalidate(){revision++;cached=null}
 function intentCategory(value){const tree=globalThis.FasCategories;if(tree?.selection&&tree?.selectionValue){const ids=tree.selection(value);return ids===null?'':tree.selectionValue(ids)||''}const id=category(value);return id&&(!tree||tree.get(id))?id:''}
 function cleanIntent(value,time){
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const id=intentCategory(value.category),at=timestamp(value.at,time),rooms=value.rooms;
  return id&&at>time-INTENT_AGE?{category:id,rooms:Number.isInteger(rooms)&&rooms>=0&&rooms<=30?rooms:null,at}:null;
 }
 function prune(time){
  updateYear(time);
  let changed=false;
  if(searchIntent&&!cleanIntent(searchIntent,time)){searchIntent=null;changed=true}
  for(const [id,entry] of signals){
   const next=sanitize(entry,time);
   if(!next){signals.delete(id);changed=true}
   else if(next.opens!==entry.opens||next.favoriteAt!==entry.favoriteAt){signals.set(id,next);changed=true}
  }
  if(signals.size>MAX_SIGNALS){
   const oldest=[...signals.values()].sort((a,b)=>a.touchedAt-b.touchedAt);
   for(let i=0;i<oldest.length-MAX_SIGNALS;i++)signals.delete(oldest[i].lot.id);
   changed=true;
  }
  if(changed)invalidate();return changed;
 }
 function persist(){
  try{localStorage.setItem(KEY,JSON.stringify({version:VERSION,mode,seeded,intent:searchIntent,signals:[...signals.values()]}));storageAvailable=true}
  catch{storageAvailable=false}
 }
 let rawStored=null;
 try{
  const raw=rawStored=localStorage.getItem(KEY);
  if(raw&&raw.length<=MAX_JSON){
   const stored=JSON.parse(raw);
   if(stored&&stored.version===VERSION&&!Array.isArray(stored)){
    mode=stored.mode==='all'?'all':'for-you';seeded=stored.seeded===true;searchIntent=cleanIntent(stored.intent,now());
    if(Array.isArray(stored.signals))for(const entry of stored.signals.slice(-MAX_SIGNALS)){
     const clean=sanitize(entry,now());if(clean&&(!signals.has(clean.lot.id)||signals.get(clean.lot.id).touchedAt<clean.touchedAt))signals.set(clean.lot.id,clean);
    }
   }
  }
 }catch(error){if(error?.name!=='SyntaxError')storageAvailable=false}
 // Expiration is also a retention limit on disk, not just a matching rule.
 if(rawStored&&rawStored!==JSON.stringify({version:VERSION,mode,seeded,intent:searchIntent,signals:[...signals.values()]}))persist();

 function add(lot,action,time){
  const previous=signals.get(lot.id);
  if(action==='unfavorite'){
   if(!previous?.favoriteAt)return false;
   if(previous.opens)signals.set(lot.id,{...previous,favoriteAt:0,touchedAt:previous.openedAt});else signals.delete(lot.id);
   return true;
  }
  const entry=previous?{...previous,lot}:{lot,opens:0,openedAt:0,favoriteAt:0,touchedAt:time};
  if(action==='favorite'){
   if(entry.favoriteAt)return false;
   entry.favoriteAt=time;
  }else{
   // At most one contribution per day and three contributions per object.
   if(entry.openedAt&&Math.floor(entry.openedAt/DAY)===Math.floor(time/DAY))return false;
   entry.opens=Math.min(3,entry.opens+1);entry.openedAt=time;
  }
  entry.touchedAt=time;signals.set(lot.id,entry);return true;
 }
 function record(lot,action){
  if(!['open','favorite','unfavorite'].includes(action)||(mode==='all'&&action!=='unfavorite'))return false;
  const time=now();updateYear(time);
  const clean=descriptor(lot);if(!clean)return false;
  const expired=prune(time),changed=add(clean,action,time);
  if(changed){invalidate();prune(time)}
  if(changed||expired)persist();return changed;
 }
 function taxonomyTerms(categoryId,subcategoryId){
  const key=categoryId+'|'+subcategoryId;
  if(facets.has(key))return facets.get(key);
  const taxonomy=globalThis.FasCategories;
  const sub=taxonomy?.get?.(subcategoryId),cat=taxonomy?.get?.(categoryId);
  const leaf=sub&&sub.kind!=='group'?sub.id:cat&&cat.kind!=='group'?cat.id:subcategoryId||(!cat||cat.kind!=='group'?categoryId:'');
  const group=sub?.groupId||cat?.groupId||(cat?.kind==='group'?cat.id:'');
  // Legacy "other" mixes furniture, electronics, and business assets.
  const broad=categoryId==='other'&&leaf&&leaf!=='other'?'':categoryId;
  return remember(facets,key,{leaf,group,broad},512);
 }
 function terms(lot){
  const t=taxonomyTerms(lot.category,lot.subcategory);
  return {leaf:t.leaf,group:t.group,broad:t.broad,make:lot.make,model:lot.model?(lot.make+'|'+lot.model):'',manufacturer:lot.manufacturer,year:lot.year===null?'':String(Math.floor(lot.year/5)),price:lot.price===null?'':String(Math.floor(Math.log2(lot.price)))};
 }
 const put=(map,key,weight)=>{if(key)map.set(key,(map.get(key)||0)+weight)};
 function vector(time){
  if(cached&&cached.revision===revision&&cached.day===Math.floor(time/DAY))return cached;
  const maps={leaf:new Map(),group:new Map(),broad:new Map(),make:new Map(),model:new Map(),manufacturer:new Map(),year:new Map(),price:new Map()},favorites=new Set(),contexts=new Map();
  for(const entry of signals.values()){
   const weight=(entry.favoriteAt?8:0)+entry.opens,age=Math.max(0,time-entry.touchedAt),decay=Math.max(.25,1-age/AGE),t=terms(entry.lot);
   for(const key of Object.keys(maps))put(maps[key],t[key],weight*decay);
   if(t.leaf&&entry.lot.year!==null&&entry.lot.price!==null){
    if(!contexts.has(t.leaf))contexts.set(t.leaf,{weight:0,years:new Map(),prices:new Map()});
    const context=contexts.get(t.leaf);context.weight+=weight*decay;put(context.years,t.year,weight*decay);put(context.prices,t.price,weight*decay);
   }
   if(entry.favoriteAt)favorites.add(entry.lot.id);
  }
  const maxima={};for(const key of Object.keys(maps))maxima[key]=Math.max(1,...maps[key].values());
  cached={revision,day:Math.floor(time/DAY),maps,maxima,favorites,contexts,empty:signals.size===0};return cached;
 }
 function score(lot,profile){
  if(profile.favorites.has(lot.id))return Infinity;
  const t=terms(lot),m=profile.maps,ratio=key=>t[key]?(m[key].get(t[key])||0)/profile.maxima[key]:0;
  const leaf=ratio('leaf'),broad=Math.max(ratio('broad'),t.group?(m.broad.get(t.group)||0)/profile.maxima.broad:0),make=ratio('make'),model=ratio('model'),manufacturer=ratio('manufacturer');
  if(!(leaf||broad||make||model||manufacturer))return 0;
  const context=profile.contexts.get(t.leaf);
  if(context&&context.weight>=Math.max(1,(m.leaf.get(t.leaf)||0)*.35)&&lot.year!==null&&lot.price!==null&&model<.15){
   const nearby=(map,key)=>map.has(String(key-1))||map.has(String(key))||map.has(String(key+1));
   // A detailed interest suggests plausible analogues across brands. Sparse
   // category-only interests remain broad, and an exact model stays eligible.
   if(!nearby(context.years,Number(t.year))||!nearby(context.prices,Number(t.price)))return 0;
  }
  return Math.max(6*leaf,4*broad)+3*make+4*model+2.5*manufacturer+ratio('group')+.3*ratio('year')+.4*ratio('price');
 }
 function idsOf(values){
  const ids=new Set();
  if(values instanceof Set||Array.isArray(values)||values&&typeof values[Symbol.iterator]==='function'){
   try{for(const id of values)if(validId(id))ids.add(id)}catch{}
  }
  return ids;
 }
 function snapshot(lots,savedIds){
  const input=Array.isArray(lots)?lots:[],time=now(),expired=prune(time);
  if(expired)persist();
  if(mode==='all')return {ids:null,personalized:false,reason:'all',count:input.length};
  const favorites=idsOf(savedIds);
  // Old favorites are imported once. A cold profile costs no inventory walk.
  const needsSeed=!seeded&&savedIds!==undefined;
  let seedIds=null;
  if(needsSeed){seedIds=new Set([...favorites].slice(-MAX_SIGNALS));seeded=true}
  const prepared=seedIds?.size?[]:null;
  if(needsSeed&&!prepared){invalidate();persist()}
  let profile=prepared?null:vector(time);
  if(profile?.empty)return {ids:null,personalized:false,reason:'cold',count:input.length};
  const ids=new Set();
  for(const lot of input){
   if(!prepared&&lot&&typeof lot==='object'&&!Array.isArray(lot)&&profile.favorites.has(lot.id)){ids.add(lot.id);continue}
   const clean=descriptor(lot,profile);if(!clean)continue;
   if(prepared){prepared.push(clean);if(seedIds.has(clean.id)&&!(typeof isOwnLot==='function'&&isOwnLot(lot)))add(clean,'favorite',time)}
   else if(score(clean,profile)>=2)ids.add(clean.id);
  }
  if(prepared){invalidate();prune(time);persist();profile=vector(time)}
  if(profile.empty)return {ids:null,personalized:false,reason:'cold',count:input.length};
  if(prepared)for(const lot of prepared)if(score(lot,profile)>=2)ids.add(lot.id);
  if(!ids.size)return {ids:null,personalized:false,reason:'no-match',count:input.length};
  return {ids,personalized:true,reason:'interests',count:ids.size};
 }
 function beginSession(lots,savedIds){return Object.freeze(snapshot(lots,savedIds))}
 function viewedCategories(lots){
  const input=Array.isArray(lots)?lots:[],time=now();if(prune(time))persist();
  if(mode==='all')return input.slice();
  const views=new Map(),favorites=new Map();
  for(const entry of signals.values()){
   const id=terms(entry.lot).leaf;if(!id||!intentCategory(id))continue;
   const addWeight=(map,weight)=>{const old=map.get(id)||{weight:0,at:0};map.set(id,{weight:old.weight+weight,at:Math.max(old.at,entry.touchedAt)})};
   const decay=Math.max(.25,1-(time-entry.touchedAt)/AGE);
   if(entry.opens)addWeight(views,entry.opens*decay);
   if(entry.favoriteAt)addWeight(favorites,decay);
  }
  const ranked=[...(views.size?views:favorites)].sort((a,b)=>b[1].weight-a[1].weight||b[1].at-a[1].at||a[0].localeCompare(b[0]));
  if(!ranked.length)return input.slice();
  const chosen=new Set(ranked.filter(row=>row[1].weight>=ranked[0][1].weight*.5).slice(0,3).map(row=>row[0]));
  return input.filter(lot=>lot&&chosen.has(taxonomyTerms(category(lot.category),category(lot.subcategory)).leaf));
 }
 function select(lots,options){const input=Array.isArray(lots)?lots:[];if(options?.byViews===true)return viewedCategories(input);const session=beginSession(input);return session.ids?input.filter(lot=>session.ids.has(lot?.id)):input.slice()}
 function recordSearch(value){
  if(mode==='all'||!value||typeof value!=='object')return false;
  const time=now(),expired=prune(time),next=cleanIntent({...value,at:time},time);
  if(!next){if(expired)persist();return false}
  if(searchIntent?.category===next.category&&searchIntent.rooms===next.rooms&&time-searchIntent.at<DAY){if(expired)persist();return false}
  searchIntent=next;invalidate();persist();return true;
 }
 function priceCandidates(lots,options={}){
  if(!options||typeof options!=='object'||Array.isArray(options))options={};
  const input=Array.isArray(lots)?lots:[],time=now();if(prune(time))persist();
  const explicit=intentCategory(options.category),active=options.active===true;
  if(active&&options.explicitAll===true)return {lots:input.slice(),category:'',reason:'search'};
  let chosen=explicit,reason=explicit?'search':'cold',rooms=null;
  // An applied search is authoritative. Past interests cannot override an
  // empty result or widen it to an unrelated, intrinsically cheaper product.
  if(!chosen&&active&&input.length){
   const first=taxonomyTerms(category(input[0]?.category),category(input[0]?.subcategory)).leaf;
   if(first&&input.every(lot=>taxonomyTerms(category(lot?.category),category(lot?.subcategory)).leaf===first)){chosen=first;reason='search'}
  }
  if(!chosen&&!active&&mode!=='all'&&searchIntent){chosen=searchIntent.category;rooms=searchIntent.rooms;reason='search-history'}
  if(!chosen&&mode!=='all'&&(!active||input.length)){
   const weights=new Map();
   for(const entry of signals.values()){
    const id=terms(entry.lot).leaf;if(!id||!intentCategory(id))continue;
    const weight=((entry.favoriteAt?8:0)+entry.opens)*Math.max(.25,1-(time-entry.touchedAt)/AGE),previous=weights.get(id)||{weight:0,at:0};
    weights.set(id,{weight:previous.weight+weight,at:Math.max(previous.at,entry.touchedAt)});
   }
   const best=[...weights].sort((a,b)=>b[1].weight-a[1].weight||b[1].at-a[1].at||a[0].localeCompare(b[0]))[0];
   if(best){chosen=best[0];reason='interests'}
  }
  if(!chosen)return {lots:[],category:'',reason:active?'search':mode==='all'?'all':'cold'};
  const taxonomy=globalThis.FasCategories;
  const selected=input.filter(lot=>{
   if(!lot||typeof lot!=='object')return false;
   const matches=taxonomy?taxonomy.matches(lot,chosen):taxonomyTerms(category(lot.category),category(lot.subcategory)).leaf===chosen;
   if(!matches||rooms===null||taxonomy&&taxonomy.filterFamily(lot)!=='property')return matches;
   if(lot.rooms!==undefined&&lot.rooms!==null&&lot.rooms!==''&&Number.isFinite(Number(lot.rooms)))return Number(lot.rooms)===rooms;
   return !!globalThis.FasKeywordSearch?.matches(lot,rooms+' rooms');
  });
  return {lots:selected,category:chosen,reason};
 }
 function getMode(){return mode}
 function setMode(value){
  if(value!=='for-you'&&value!=='all')return false;
  if(mode===value)return false;mode=value;invalidate();persist();return true;
 }
 function clear(){signals.clear();words.clear();categories.clear();facets.clear();searchIntent=null;seeded=true;invalidate();persist()}
 function summary(){
  const expired=prune(now());if(expired)persist();
  let favoriteCount=0,openCount=0;const categories=new Set();
  for(const entry of signals.values()){if(entry.favoriteAt)favoriteCount++;if(entry.opens)openCount++;const t=terms(entry.lot);if(t.leaf||t.broad)categories.add(t.leaf||t.broad)}
  return {mode,enabled:mode==='for-you',revision,signalCount:signals.size,favoriteCount,openCount,categoryCount:categories.size,storageAvailable,localOnly:true,seeded,hasSearchIntent:!!searchIntent,searchCategory:searchIntent?.category||''};
 }
 const api=Object.freeze({record,recordSearch,priceCandidates,beginSession,select,getMode,setMode,clear,summary});
 globalThis.FasRecommendations=api;if(typeof window!=='undefined')window.FasRecommendations=api;
})();
