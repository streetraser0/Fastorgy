/* Pure opt-in renewal rules. The caller must persist a plan before exposing it. */
((root)=>{
 'use strict';
 if(root.FasAuctionRenewal)return;
 const MIN=60,MAX=43200,MAX_MS=MAX*60000;
 const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
 const positive=value=>Number.isSafeInteger(value)&&value>0;
 const enabled=value=>value===true||value==='on'||value==='true'||value==='1';
 const integer=value=>typeof value==='number'?Number.isSafeInteger(value)?value:null:typeof value==='string'&&/^\d+$/.test(value.trim())&&Number.isSafeInteger(Number(value))?Number(value):null;
 const present=value=>value!==undefined&&value!==null&&value!=='';
 const time=value=>typeof value==='number'?value:typeof value==='string'&&value.trim()?Date.parse(value):NaN;
 function defaults(lot={}){lot=record(lot)?lot:{};const duration=integer(lot.relistDurationMinutes??lot.durationMinutes),limit=integer(lot.relistLimit);return {autoRelist:enabled(lot.autoRelist),relistDurationMinutes:duration!==null&&duration>=MIN&&duration<=MAX?duration:10080,relistLimit:limit!==null&&limit>=1&&limit<=10?limit:3}}
 function readSettings(form){const get=key=>form&&typeof form.get==='function'?form.get(key):undefined;return {autoRelist:enabled(get('autoRelist')),relistDurationMinutes:get('relistDurationMinutes')??10080,relistLimit:get('relistLimit')??3}}
 function validate(settings={}){
  settings=record(settings)?settings:{};const base=defaults(settings),active=enabled(settings.autoRelist),duration=integer(settings.relistDurationMinutes??base.relistDurationMinutes),limit=integer(settings.relistLimit??base.relistLimit),errors={};
  if(active&&(duration===null||duration<MIN||duration>MAX))errors.relistDurationMinutes='Срок повторных торгов — от 1 часа до 30 суток, в целых минутах.';
  if(active&&(limit===null||limit<1||limit>10))errors.relistLimit='Выберите от 1 до 10 повторных аукционов.';
  return {valid:!Object.keys(errors).length,errors,value:{autoRelist:active,relistDurationMinutes:active?duration:base.relistDurationMinutes,relistLimit:active?limit:base.relistLimit}};
 }
 function fieldsHTML(lot={}){
  lot=record(lot)?lot:{};const value=defaults(lot),durations=new Map([[60,'1 час'],[360,'6 часов'],[1440,'1 сутки'],[4320,'3 суток'],[10080,'7 суток'],[20160,'14 суток'],[43200,'30 суток']]),limits=new Map([[1,'1 раз'],[3,'3 раза'],[5,'5 раз'],[10,'10 раз']]);
  if(!durations.has(value.relistDurationMinutes))durations.set(value.relistDurationMinutes,value.relistDurationMinutes+' мин');
  if(!limits.has(value.relistLimit))limits.set(value.relistLimit,value.relistLimit+' раз');
  const options=(items,current)=>[...items].map(([key,label])=>'<option value="'+key+'" '+(key===current?'selected':'')+'>'+label+'</option>').join('');
  const count=integer(lot.relistCount);
  return '<fieldset class="wide auction-renewal-settings"><legend>Повторные торги</legend><label class="seller-check wide"><input type="checkbox" name="autoRelist" '+(value.autoRelist?'checked':'')+'>Повторять торги, если лот не продан</label><div class="seller-grid"><label>Срок каждого повтора<select name="relistDurationMinutes">'+options(durations,value.relistDurationMinutes)+'</select><span class="seller-field-error" data-error-for="relistDurationMinutes"></span></label><label>Максимум повторов<select name="relistLimit">'+options(limits,value.relistLimit)+'</select><span class="seller-field-error" data-error-for="relistLimit"></span></label></div><p class="note">Повторяем только лоты без ставок, сохраняя цену. В демоверсии проверка работает, пока сайт или приложение открыты, и при возвращении к ним.'+(count!==null&&count>0?' Уже выполнено повторов: '+count+'.':'')+'</p></fieldset>';
 }
 function soldOrSettling(lot){return lot.sold===true||['soldAt','soldPrice','settlement','settlementId','winningBid','winningBidId','winnerId','buyerId','paidAt'].some(key=>present(lot[key]))}
 function validMoney(lot){
  if(!positive(lot.price))return false;
  for(const key of ['start','startPrice'])if(present(lot[key])&&!positive(lot[key]))return false;
  const start=lot.startPrice??lot.start??lot.price;
  if(lot.price!==start||present(lot.currentPrice)&&(!positive(lot.currentPrice)||lot.currentPrice!==lot.price))return false;
  if(present(lot.deposit)&&(!Number.isSafeInteger(lot.deposit)||lot.deposit<0||lot.deposit>start))return false;
  for(const key of ['reservePrice','buyNowPrice'])if(present(lot[key])&&(!positive(lot[key])||lot[key]<start))return false;
  if(present(lot.reservePrice)&&present(lot.buyNowPrice)&&lot.buyNowPrice<lot.reservePrice)return false;
  if(present(lot.step)&&(!positive(lot.step)||!Number.isSafeInteger(lot.price+lot.step)))return false;
  return true;
 }
 function plan(lots,bids={},now=Date.now()){
  if(!Array.isArray(lots))return {lots:[],renewedIds:[]};
  if(!record(bids)||!Number.isSafeInteger(now)||Math.abs(now)>8640000000000000-MAX_MS)return {lots,renewedIds:[]};
  const renewedIds=[];let next=null;
  for(let index=0,length=lots.length;index<length;index++){
   if(!(index in lots))continue;
   const lot=lots[index];
   if(!record(lot)||lot.autoRelist!==true||lot.status!=='live'||!positive(lot.id)||typeof lot.sellerArchivedAt==='string'&&Number.isFinite(time(lot.sellerArchivedAt))||soldOrSettling(lot)||Object.hasOwn(bids,lot.id)||!validMoney(lot))continue;
   if(present(lot.bids)&&integer(lot.bids)!==0)continue;
   const end=time(lot.ends),startRaw=lot.startsAt??lot.starts,start=time(startRaw);
   if(!Number.isFinite(end)||end>now||present(startRaw)&&(!Number.isFinite(start)||end-start<MIN*60000||end-start>MAX_MS))continue;
   const settings=validate(lot),count=lot.relistCount===undefined?0:Number.isSafeInteger(lot.relistCount)?lot.relistCount:null;
   if(!settings.valid||count===null||count<0||count>=settings.value.relistLimit)continue;
   const stamp=new Date(now).toISOString();renewedIds.push(lot.id);
   // Idle checks keep the source and allocate no catalogue-sized array.
   // Clone once only after a real renewal has passed every guard.
   if(!next)next=lots.slice();
   next[index]={...lot,...settings.value,starts:stamp,startsAt:stamp,startMode:'now',ends:new Date(now+settings.value.relistDurationMinutes*60000).toISOString(),durationMinutes:settings.value.relistDurationMinutes,maxEnds:new Date(now+MAX_MS).toISOString(),relistCount:count+1,relistedAt:stamp,updatedAt:stamp};
  }
  const result={lots:next||lots,renewedIds};
  if(!renewedIds.length)return result;
  if(typeof root.FasListingQuotas?.guardLocalRenewalPlan==='function')return root.FasListingQuotas.guardLocalRenewalPlan({lots,plan:result,bids,now});
  // Without the quota module, preserve seed/bank renewal but never reactivate
  // a private listing through an unchecked alternate publication path.
  const pending=new Set(renewedIds),blocked=new Set();for(const lot of lots)if(lot?.sellerOwnerId&&pending.has(lot.id))blocked.add(lot.id);
  if(!blocked.size)return result;
  const allowed=renewedIds.filter(id=>!blocked.has(id));return {lots:allowed.length?result.lots.map((lot,index)=>blocked.has(lot.id)?lots[index]:lot):lots,renewedIds:allowed,quotaBlockedIds:[...blocked]};
 }
 root.FasAuctionRenewal=Object.freeze({fieldsHTML,readSettings,validate,plan});
})(typeof window==='undefined'?globalThis:window);
