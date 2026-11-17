/* Pure quota policy for UI previews and a future trusted server coordinator.
   Loading this module does not enable billing or enforce browser-local identity. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else{root.FasListingQuotas=api;if(root.window&&typeof root.window==='object')root.window.FasListingQuotas=api}})(typeof globalThis==='object'?globalThis:this,function(root){
 'use strict';
 const VERSION=1,BUCKETS=Object.freeze(['cars','real_estate','ready_business','uncapped']);
 const FREE_LIMITS=Object.freeze({cars:3,real_estate:2,ready_business:1,uncapped:null,total:null});
 const LEAVES=Object.freeze(['cars','motorcycles','trucks','machinery','vessels','trailers','snowmobiles','atvs','property','houses','land','garages','commercial','furniture','home_appliances','kitchenware','home_textiles','building_materials','garden','tools','phones','computers','computer_parts','audio_video','cameras','games','office_electronics','equipment','ready_business','business_materials','other']);
 const REAL_ESTATE=new Set(['property','houses','land','garages','commercial']);
 const STATUSES=new Set(['draft','live','scheduled','paused','ended','sold','cancelled','withdrawn','archived']);
 class QuotaError extends Error{constructor(code){super('Listing quota rejected: '+code);this.name='ListingQuotaError';this.code=code}}
 const fail=code=>{throw new QuotaError(code)};
 const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
 function identity(value){if(typeof value!=='string'||!/^[A-Za-z0-9][A-Za-z0-9:_-]{0,127}$/.test(value))fail('invalid-id');return value}
 function scope(value){if(!record(value)||!['private','organization'].includes(value.kind))fail('invalid-scope');return Object.freeze({kind:value.kind,id:identity(value.id)})}
 function sameScope(a,b){return !!a&&!!b&&a.kind===b.kind&&a.id===b.id}
 function counter(value){if(!Number.isSafeInteger(value)||value<0)fail('invalid-counter');return value}
 function limit(value){if(value!==null)counter(value);return value}
 function limits(value){if(!record(value)||Object.keys(value).some(key=>![...BUCKETS,'total'].includes(key)))fail('invalid-limits');const next={};for(const key of [...BUCKETS,'total']){if(!Object.hasOwn(value,key))fail('invalid-limits');next[key]=limit(value[key])}return Object.freeze(next)}
 function usage(value){if(!record(value))fail('invalid-usage');const next={};for(const key of [...BUCKETS,'total'])next[key]=counter(value[key]);if(BUCKETS.reduce((sum,key)=>sum+next[key],0)!==next.total)fail('invalid-usage');return Object.freeze(next)}
 function bucketFor(categoryId){if(typeof categoryId!=='string'||!LEAVES.includes(categoryId))fail('invalid-category');return categoryId==='cars'?'cars':REAL_ESTATE.has(categoryId)?'real_estate':categoryId==='ready_business'?'ready_business':'uncapped'}
 function timestamp(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString()!==value)fail('invalid-auction-time');return Date.parse(value)}
 function listing(value){
  if(!record(value)||!STATUSES.has(value.status)||!Number.isSafeInteger(value.revision)||value.revision<0)fail('invalid-listing');
  identity(value.id);scope(value.scope);bucketFor(value.categoryId);counter(value.acceptedBidCount);
  if(value.status==='draft'&&value.acceptedBidCount>0)fail('invalid-listing');
  if(value.status!=='draft')timestamp(value.endsAt);
  if(value.protectedEndsAt!==null&&value.protectedEndsAt!==undefined)timestamp(value.protectedEndsAt);
  if(value.acceptedBidCount>0&&(value.protectedEndsAt===null||value.protectedEndsAt===undefined))fail('invalid-auction-time');
  if(value.status==='scheduled'&&timestamp(value.startsAt)>=timestamp(value.endsAt))fail('invalid-auction-time');
  return value;
 }
 function protectedUntil(value){listing(value);const dates=[value.endsAt,value.protectedEndsAt].filter(item=>item!==null&&item!==undefined).map(timestamp);return dates.length?Math.max(...dates):null}
 function occupied(value,now){
  if(!Number.isSafeInteger(now)||now<=0)fail('invalid-clock');if(value===null)return false;listing(value);
  if(value.status==='draft')return false;
  const end=protectedUntil(value);if(end===null)fail('invalid-auction-time');
  // An inconsistent paused/withdrawn row with accepted bids never frees a slot.
  if(value.acceptedBidCount>0&&now<end&&!['live','scheduled','sold'].includes(value.status))return true;
  return now<end&&['live','scheduled'].includes(value.status);
 }
 function assertTransition(before,next,now){
  if(!Number.isSafeInteger(now)||now<=0)fail('invalid-clock');
  if(before!==null)listing(before);listing(next);
  if(before===null)return;
  if(before.id!==next.id||!sameScope(before.scope,next.scope))fail('scope-transfer-not-supported');
  if(next.revision!==before.revision+1)fail('listing-version-conflict');
  if(next.acceptedBidCount!==before.acceptedBidCount)fail('bid-ledger-change-not-supported');
  if(before.acceptedBidCount>0){
   if(before.categoryId!==next.categoryId)fail('auction-category-locked');
   const end=protectedUntil(before);if(end===null)fail('invalid-auction-time');
   if(now<end){
    if(!['live','scheduled'].includes(next.status))fail('auction-withdrawal-locked');
    const nextEnd=protectedUntil(next);if(nextEnd===null||nextEnd<end)fail('auction-deadline-locked');
   }
  }
 }
 function resolvePolicy(entitlement,owner,now){
  owner=scope(owner);if(!Number.isSafeInteger(now)||now<=0)fail('invalid-clock');
  if(entitlement===null){if(owner.kind!=='private')fail('organization-terms-required');return Object.freeze({version:VERSION,plan:'free',revision:0,limits:FREE_LIMITS})}
  if(!record(entitlement)||entitlement.version!==VERSION||!sameScope(scope(entitlement.scope),owner))fail('invalid-entitlement');
  const revision=counter(entitlement.revision),from=timestamp(entitlement.validFrom),until=timestamp(entitlement.validUntil);
  if(from>=until)fail('invalid-entitlement');
  if(now<from||now>=until){if(owner.kind!=='private')fail('organization-terms-required');return Object.freeze({version:VERSION,plan:'free',revision,limits:FREE_LIMITS})}
  if(owner.kind==='private'&&!['standard','premium'].includes(entitlement.plan)||owner.kind==='organization'&&entitlement.plan!=='partner')fail('invalid-plan');
  const selected=limits(entitlement.limits);
  if(owner.kind==='private'){
   if(selected.uncapped!==null||selected.total!==null)fail('private-plan-must-not-reduce-free-limits');
   for(const key of ['cars','real_estate','ready_business'])if(selected[key]!==null&&selected[key]<FREE_LIMITS[key])fail('private-plan-must-not-reduce-free-limits');
   if(['cars','real_estate','ready_business'].every(key=>selected[key]===FREE_LIMITS[key]))fail('paid-increase-not-configured');
  }
  return Object.freeze({version:VERSION,plan:entitlement.plan,revision,limits:selected});
 }
 function decide({policy,currentUsage,before=null,next,now}){
  if(!record(policy)||policy.version!==VERSION)fail('invalid-policy');const caps=limits(policy.limits),counts=usage(currentUsage);assertTransition(before,next,now);
  if(before!==null&&!sameScope(before.scope,next.scope))fail('scope-transfer-not-supported');
  const delta=Object.fromEntries([...BUCKETS,'total'].map(key=>[key,0]));
  if(occupied(before,now)){delta[bucketFor(before.categoryId)]--;delta.total--}
  if(occupied(next,now)){delta[bucketFor(next.categoryId)]++;delta.total++}
  const after={};for(const key of [...BUCKETS,'total']){
   after[key]=counts[key]+delta[key];if(!Number.isSafeInteger(after[key])||after[key]<0)fail('usage-integrity-conflict');
   // Grandfather existing auctions after expiry/downgrade; only positive deltas
   // need capacity. An edit at/above the limit cannot be used to create a slot.
   if(delta[key]>0&&caps[key]!==null&&after[key]>caps[key])return Object.freeze({allowed:false,code:'quota-exceeded',bucket:key,limit:caps[key],used:counts[key],delta:Object.freeze(delta)});
  }
  usage(after);return Object.freeze({allowed:true,code:'allowed',delta:Object.freeze(delta),usage:Object.freeze(after)});
 }
 // Browser-local demo bridge. It never establishes identity or paid access.
 // Callers may display this result, but real accounts must use the coordinator.
 const host=()=>root.window&&typeof root.window==='object'?root.window:root;
 function localNow(value){if(!Number.isSafeInteger(value)||value<=0)fail('invalid-clock');return value}
 function localAllocation(lot,ownerId,bids,now){
  if(!record(lot)||lot.sellerOwnerId!==ownerId)fail('forbidden');
  const R=host().FasSellerRules,T=host().FasCategories;if(!R?.getAuctionState||!R?.listingProtection)fail('local-rules-unavailable');
  const current=typeof root.current==='function'?root.current(lot):typeof host().current==='function'?host().current(lot):lot.currentPrice??lot.price;
  const protectedState=R.listingProtection(lot,{ownBid:bids?.[lot.id],current,now}),state=R.getAuctionState(lot,now);
  if(R.hasFinalResult(lot))return null;
  if(state==='unavailable'&&['live','scheduled'].includes(lot.status))fail('local-usage-unavailable');
  if(!['live','scheduled'].includes(state)&&!protectedState.locked)return null;
  if(!Number.isFinite(protectedState.until))fail('local-usage-unavailable');
  if(protectedState.until<=now)return null;
  const categoryId=T?.canonicalId?.(lot)||lot.subcategory||lot.category;
  const start=Date.parse(lot.startsAt||lot.starts),end=Date.parse(lot.ends);
  if(!Number.isFinite(end))fail('local-usage-unavailable');
  return listing({id:String(lot.id),scope:{kind:'private',id:ownerId},categoryId,status:['live','scheduled'].includes(state)?state:'paused',revision:0,acceptedBidCount:protectedState.hasBids?1:0,startsAt:Number.isFinite(start)?new Date(start).toISOString():null,endsAt:new Date(end).toISOString(),protectedEndsAt:new Date(protectedState.until).toISOString()});
 }
 function localUsage({lots,ownerId,bids={},now=Date.now()}){
  identity(ownerId);localNow(now);if(!Array.isArray(lots))fail('invalid-usage');
  const counts={cars:0,real_estate:0,ready_business:0,uncapped:0,total:0};
  for(const lot of lots){if(lot?.sellerOwnerId!==ownerId)continue;const row=localAllocation(lot,ownerId,bids,now);if(row){counts[bucketFor(row.categoryId)]++;counts.total++}}
  return usage(counts);
 }
 function localChangeDecision({lots,before=null,next,ownerId,bids={},now=Date.now()}){
  identity(ownerId);localNow(now);if(before!==null&&before.sellerOwnerId!==ownerId||next?.sellerOwnerId!==ownerId)fail('forbidden');
  if(before!==null&&before.id!==next.id)fail('invalid-local-listing-change');
  const nextRow=localAllocation(next,ownerId,bids,now),beforeRow=before===null?null:localAllocation(before,ownerId,bids,now);
  // Removing a reservation or preserving its bucket cannot exceed a quota.
  // Existing seller/auction rules still validate the actual mutation separately.
  if(nextRow===null||beforeRow!==null&&bucketFor(beforeRow.categoryId)===bucketFor(nextRow.categoryId))return Object.freeze({allowed:true,code:'no-additional-slot'});
  const counts=localUsage({lots,ownerId,bids,now}),selected=resolvePolicy(null,{kind:'private',id:ownerId},now);
  return decide({policy:selected,currentUsage:counts,before:beforeRow,next:{...nextRow,revision:1},now});
 }
 function guardLocalRenewalPlan({lots,plan,bids={},now=Date.now()}){
  localNow(now);if(!Array.isArray(lots)||!record(plan)||!Array.isArray(plan.lots)||!Array.isArray(plan.renewedIds)||plan.lots.length!==lots.length)fail('invalid-renewal-plan');
  if(!plan.renewedIds.length)return plan;
  const wanted=new Set(plan.renewedIds),candidates=[],owners=new Set();
  for(let index=0;index<lots.length;index++){const original=lots[index];if(!original||!wanted.has(original.id)||!original.sellerOwnerId)continue;const next=plan.lots[index];if(next?.id!==original.id||next.sellerOwnerId!==original.sellerOwnerId)fail('invalid-renewal-plan');candidates.push({index,original,next});owners.add(original.sellerOwnerId)}
  if(!candidates.length)return plan;
  const counts=new Map(),invalid=new Set(),empty=()=>({cars:0,real_estate:0,ready_business:0,uncapped:0,total:0});for(const ownerId of owners){identity(ownerId);counts.set(ownerId,empty())}
  // A single pass initializes the relevant owners. Accepted renewals update the
  // same counters sequentially, so two expired lots cannot consume one last slot.
  for(const original of lots){const ownerId=original?.sellerOwnerId;if(!owners.has(ownerId)||invalid.has(ownerId))continue;try{const row=localAllocation(original,ownerId,bids,now);if(row){counts.get(ownerId)[bucketFor(row.categoryId)]++;counts.get(ownerId).total++}}catch{invalid.add(ownerId)}}
  let nextLots=plan.lots;const blocked=new Set();
  for(const {index,original,next}of candidates){
   let allowed=false;const ownerId=original.sellerOwnerId;
   if(!invalid.has(ownerId))try{
    const before=localAllocation(original,ownerId,bids,now),after=localAllocation(next,ownerId,bids,now);
    if(after){const selected=resolvePolicy(null,{kind:'private',id:ownerId},now),decision=decide({policy:selected,currentUsage:counts.get(ownerId),before,next:{...after,revision:1},now});if(decision.allowed){counts.set(ownerId,{...decision.usage});allowed=true}}
   }catch{/* A corrupt/local stale auction cannot gain an automatic reservation. */}
   if(!allowed){if(nextLots===plan.lots)nextLots=plan.lots.slice();nextLots[index]=original;blocked.add(original.id)}
  }
  if(!blocked.size)return plan;
  const renewedIds=plan.renewedIds.filter(id=>!blocked.has(id));return {lots:renewedIds.length?nextLots:lots,renewedIds,quotaBlockedIds:[...blocked]};
 }
 return Object.freeze({VERSION,BUCKETS,LEAVES,FREE_LIMITS,QuotaError,scope,sameScope,limits,usage,bucketFor,listing,occupied,protectedUntil,assertTransition,resolvePolicy,decide,localUsage,localChangeDecision,guardLocalRenewalPlan});
});
