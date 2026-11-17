/* Isolated functional buyer/seller models, never live users or a load benchmark. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'../..'),{boot,raw,runCachedScript}=require(path.join(ROOT,'tests/helpers/category-seller-harness.cjs'));
const STARTED=Date.now(),SOURCE_FILES=['dist/index.html','dist/user-agreement.js','dist/seller-ui.js','dist/seller-rules.js','dist/listing-quotas.js','dist/auction-history.js','dist/ui-icons.js','dist/category-tree.js','dist/demo-profiles.js','dist/geo-data.js','dist/catalog-data.js','dist/region-select.js','dist/search-data.js','dist/search-typos.js','dist/search-identifiers.js','dist/search-intent.js','dist/keyword-search.js','dist/countdown.js','dist/auction-renewal.js','dist/lot-location.js','tests/helpers/category-seller-harness.cjs','scripts/diagnostics/model-marketplace-100.cjs'];
const MAX_PROFILES=1000,COUNT=Number(process.env.MODEL_PROFILES||100),SEED=58001114,NOW=Date.UTC(2026,10,14,12),OUT=process.env.MODEL_REPORT||'/tmp/model-marketplace-100.json';assert(Number.isInteger(COUNT)&&COUNT>0&&COUNT<=MAX_PROFILES,'MODEL_PROFILES must be an integer from 1 to 1000');
const BOOT_MODE=process.env.MODEL_BOOT_MODE||'isolated-fixtures';assert(['isolated-fixtures','full-catalog'].includes(BOOT_MODE),'Unknown MODEL_BOOT_MODE');
const DURATIONS=[60,120,360,1440,4320,10080,20160,43200],LOCATIONS=[{regionCode:'36',city:'Воронеж'},{regionCode:'77',city:'Москва'},{regionCode:'26',city:'Ставрополь'},{regionCode:'23',city:'Краснодар'},{regionCode:'78',city:'Санкт-Петербург'}];
const fingerprintSources=()=>crypto.createHash('sha256').update(SOURCE_FILES.map(name=>name+'\0'+fs.readFileSync(path.join(ROOT,name),'utf8')).join('\n')).digest('hex');
const report={source:process.env.MODEL_SOURCE||'working tree',sourceFiles:SOURCE_FILES,sourceDigest:fingerprintSources(),seed:SEED,requestedProfiles:COUNT,bootMode:BOOT_MODE,method:'Sequential isolated V8 browser-model contexts using actual client click/submit handlers and auction APIs. Three controlled initial lots per model (fixture dependency injection in isolated-fixtures mode; normal catalogue boot remains independently tested); no shared auction backend, network, public publication, real payment or visitor counter mutation.',limits:['This is not '+COUNT+' concurrent live clients or a load/capacity test.','The existing seller-form harness supplies a mock image storage adapter; this runner does not prove browser codec/IndexedDB security.','No account authentication or shared real auction/payment backend is connected. Local storage conflict guards are tested, not distributed transaction atomicity.'],profiles:[],totals:{completed:0,passed:0,failed:0,sellers:0,bidders:0,buyers:0,published:0,acceptedBids:0,demoPurchases:0,watcherChecks:0},findings:[]};
// Positive model profiles represent users who explicitly accepted the current
// edition. Use the production capture helper; runtime registration stays gated.
function modelAgreementAcceptance(now){
 const context={Date:class extends Date{constructor(...args){super(...(args.length?args:[now]))}static now(){return now}}};context.window=context;vm.createContext(context);
 runCachedScript('user-agreement.js',context);
 const acceptance=context.FasUserAgreement.capture({checked:true});assert(context.FasUserAgreement.isCurrent(acceptance));return acceptance;
}
function profilePlan(index) {
 assert(Number.isInteger(index) && index >= 0 && index < MAX_PROFILES, 'Invalid model index');
 const cohort = index % 100;
 const role = cohort < 40 ? 'seller' : cohort < 80 ? 'bidder' : 'buyer';
 return {
  role,
  experience: ['beginner', 'regular', 'expert', 'keyboard-oriented'][index % 4],
  scenario: index % (role === 'buyer' ? 5 : 8),
  durationMinutes: DURATIONS[(index + Math.floor(index / 100)) % DURATIONS.length],
  location: { ...LOCATIONS[index % LOCATIONS.length] }
 };
}
function fixture(id,owner,now,price=100000){return {id,category:'cars',subcategory:'cars',name:'Контрольный Toyota RAV4',brand:'Toyota',model:'RAV4',description:'Контрольное имущество только в изолированной модели.',bank:'Модельный продавец',city:'Воронеж',regionCode:'36',sellerType:owner?'private':'bank',...(owner?{sellerOwnerId:owner,sellerName:'Модельный продавец',buyNowPrice:price+100000,privateSellerDemo:true}:{}),price,start:price,startPrice:price,step:1000,stepMode:'fixed',stepValue:1000,deposit:0,bids:0,extension:false,antiSniping:false,status:'live',startsAt:new Date(now-3600000).toISOString(),ends:new Date(now+3600000).toISOString(),durationMinutes:120,demo:false,publicContact:''}}
async function click(h,dataset){
 const target={dataset,tagName:'BUTTON',disabled:false,matches(selectors){return selectors.split(',').some(selector=>{selector=selector.trim();if(selector==='button')return true;const match=selector.match(/^\[data-([\w-]+)(?:=["']?([^\]"']+)["']?)?\]$/);if(!match)return false;const key=match[1].replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase());return Object.hasOwn(dataset,key)&&(match[2]===undefined||String(dataset[key])===match[2])})},closest(selectors){return this.matches(selectors)?this:null}};
 h.dispatchClick({target,preventDefault(){},stopPropagation(){}});for(let n=0;n<16;n++)await Promise.resolve();
}
async function profile(index){
 const planned=profilePlan(index),role=planned.role,owner='model-owner-'+String(index+1).padStart(3,'0'),now=NOW+index*100000,bankId=998100000+index*10,foreignId=bankId+1,ownId=bankId+2,payload='<img src=x onerror="MODEL_XSS">',trace=[],watchers={};let h;
 const result={number:index+1,id:owner,role,experience:planned.experience,scenario:planned.scenario,trace,watchers,counts:{published:0,acceptedBids:0,demoPurchases:0},pass:false};
 const event=(action,details={})=>trace.push({step:trace.length+1,action,...details});
 function check(name,value,details){watchers[name]=(watchers[name]??0)+1;report.totals.watcherChecks++;assert(value,name+(details?': '+details:''))}
 try{
  const workspace={version:1,profile:{id:owner,displayName:'Модель '+(index+1),phone:'+79990000001',email:'',...planned.location,showPhone:false},drafts:[{id:'draft-model-'+index,ownerId:owner,data:{...raw,name:'Объявление модели '+(index+1)},mediaRefs:[{id:'idb:model-image-'+String(index).padStart(8,'0'),kind:'image',size:1024}],updatedAt:new Date(now).toISOString()},{id:'foreign-private-draft',ownerId:'foreign-owner',data:{...raw,name:'PRIVATE_DRAFT_SENTINEL'},mediaRefs:[],updatedAt:new Date(now).toISOString()}]};
  workspace.profile.agreementAcceptance=modelAgreementAcceptance(now);
  workspace.profile.agreementAcceptanceHistory=[workspace.profile.agreementAcceptance];
  const lots=[fixture(bankId,null,now),fixture(foreignId,'foreign-'+owner,now),fixture(ownId,owner,now)].map(lot=>({...lot,...planned.location}));
  h=boot({...(BOOT_MODE==='isolated-fixtures'?{fixtureInventory:lots}:{}),records:{'fas-lots':JSON.stringify(lots),'fas-bids':'{}','fas-seller-workspace-v1':JSON.stringify(workspace)}});
  h.context.Date=class extends Date{constructor(...args){super(...(args.length?args:[now]))}static now(){return now}};
  h.run('cars=cars.filter(lot=>'+JSON.stringify(lots.map(row=>row.id))+'.includes(lot.id));ends.splice(0,ends.length,...cars.map(lot=>Date.parse(lot.ends)));invalidateSubscriptionInventory();window.FasKeywordSearch.invalidate();render()');
  runCachedScript('auction-history.js',h.context);
  check('current-agreement-explicitly-accepted',h.context.window.FasUserAgreement.isCurrent(workspace.profile.agreementAcceptance));
  Object.assign(h.workspace.profile,workspace.profile);const own=()=>h.run('cars.find(lot=>lot.id==='+ownId+')'),foreign=()=>h.run('cars.find(lot=>lot.id==='+foreignId+')'),bank=()=>h.run('cars.find(lot=>lot.id==='+bankId+')'),price=()=>h.run('current(cars.find(lot=>lot.id==='+bankId+'))');
  const snapshot=()=>h.run('JSON.stringify(cars.find(lot=>lot.id==='+foreignId+'))');const foreignBefore=snapshot();
  await click(h,{sellerOpen:''});check('foreign-draft-hidden',!h.node('#modal-content').innerHTML.includes('PRIVATE_DRAFT_SENTINEL'));await click(h,{sellerEdit:String(foreignId)});await click(h,{sellerStatus:String(foreignId),nextStatus:'cancelled'});check('foreign-owner-write-blocked',snapshot()===foreignBefore);event('foreign edit/status attempt denied');
  check('own-bid-blocked',h.run('commitDemoBid(cars.find(lot=>lot.id==='+ownId+'),101000)')===false);await click(h,{sellerBuyNow:String(ownId)});await click(h,{sellerConfirmBuy:String(ownId)});check('own-buy-blocked',own().status==='live');event('own bid and buy rejected');
  await click(h,{sellerStatus:String(ownId),nextStatus:'paused'});
  check('unbid-own-lot-may-pause',own().status==='paused');
  await click(h,{sellerStatus:String(ownId),nextStatus:'live'});
  check('unbid-own-lot-may-resume',own().status==='live');
  const ownerUpdate=h.run('window.FasApplyAuctionUpdate({lotId:'+ownId+',price:101000,actorOwn:false,occurredAt:new Date().toISOString()})');
  check('genuine-owned-lot-market-update',ownerUpdate.ok);
  await click(h,{sellerStatus:String(ownId),nextStatus:'cancelled'});
  check('bid-owned-lot-withdrawal-blocked',own().status==='live');
  await click(h,{sellerStatus:String(ownId),nextStatus:'paused'});
  check('bid-owned-lot-pause-blocked',own().status==='live');
  const duration=planned.durationMinutes,deadline=now+duration*60000;
  const durationLot={...own(),startsAt:new Date(now).toISOString(),ends:new Date(deadline).toISOString(),announcedEnds:new Date(deadline).toISOString(),durationMinutes:duration,bids:1};
  check('announced-term-locked-before-expiry',h.context.window.FasSellerRules.listingProtection(durationLot,{now:deadline-1}).locked===true);
  check('announced-term-unlocked-at-expiry',h.context.window.FasSellerRules.listingProtection(durationLot,{now:deadline}).locked===false);
  result.parameters={durationMinutes:duration,region:planned.location.regionCode};
  event('unbid pause/resume allowed; accepted bid locks withdrawal until announced expiry',{durationMinutes:duration});
  if(role==='seller'){
   const scenario=index%8,category=['cars','trucks','property','other','equipment','commercial'][index%6],subcategory=category==='other'?'furniture':category;
   const data={...raw,category,subcategory,name:'Лот модели '+(index+1)+' '+(index%3===0?payload:''),description:'Точное описание изолированного имущества модели '+(index+1)+'. '+payload,startPrice:String(100000+index*1000),...planned.location,durationValue:String(duration/60),durationUnit:'hours',durationMinutes:duration,area:category==='property'||category==='commercial'?'60':'',latitude:'51.66',longitude:'39.2'};
   await click(h,{sellerEdit:'draft-model-'+index});h.setRaw(data);
   if(scenario===1||scenario===2){h.setRaw({...data,...(scenario===1?{durationValue:'31',durationUnit:'days'}:{ownershipConsent:false})});await h.publish();check('invalid-publication-keeps-form',h.node('#modal').open&&h.run('cars.length')===3);check('invalid-publication-saves-draft',JSON.parse(h.records['fas-seller-workspace-v1']).drafts.some(d=>d.ownerId===owner));event('invalid form rejected; corrected');h.setRaw(data)}
   if(scenario===3){h.setFailLots(true);await h.publish();check('quota-no-false-publication',h.run('cars.length')===3&&h.node('#modal').open);check('quota-retains-draft',JSON.parse(h.records['fas-seller-workspace-v1']).drafts.some(d=>d.ownerId===owner));h.setFailLots(false);event('lot-write quota failure retains editor and draft; retry')}
   if(scenario===4){const current=JSON.parse(h.records['fas-seller-workspace-v1']);current.drafts.push({id:'other-tab-draft',ownerId:owner,data:{...raw,name:'SAME_OWNER_OTHER_TAB_DRAFT'},mediaRefs:[],updatedAt:new Date(now).toISOString()});h.records['fas-seller-workspace-v1']=JSON.stringify(current);event('concurrent unrelated draft added')}
   await h.publish();const published=Array.from(h.run('cars.filter(lot=>lot.sellerOwnerId==='+JSON.stringify(owner)+'&&lot.id!=='+ownId+')'));check('actual-publication-committed',published.length===1,h.node('#seller-error').textContent);const lot=published[0];result.counts.published++;event('actual seller form published',{lotId:lot.id,category:lot.category,durationMinutes:lot.durationMinutes});
   check('phone-opt-in-preserved',lot.publicContact==='');check('auction-duration-bound',Date.parse(lot.ends)-Date.parse(lot.startsAt)>=3600000&&Date.parse(lot.ends)-Date.parse(lot.startsAt)<=30*86400000);
   h.run('openCar('+lot.id+')');const html=h.node('#modal-content').innerHTML;check('stored-text-html-escaped',!html.includes(payload));check('private-phone-not-rendered',!html.includes(workspace.profile.phone));check('owner-has-no-bid-form',!html.includes('id="bid-form"'));check('owner-has-no-purchase-button',!html.includes('data-seller-buy-now'));
   if(scenario===4)check('other-tab-draft-preserved',JSON.parse(h.records['fas-seller-workspace-v1']).drafts.some(d=>d.id==='other-tab-draft'));
   if(scenario===6){const editQuote=h.run('window.FasApplyAuctionUpdate({lotId:'+lot.id+',price:'+Number(lot.price+1000)+',actorOwn:false,occurredAt:new Date().toISOString()})');check('published-edit-market-bid-accepted',editQuote.ok);await click(h,{sellerEdit:String(lot.id)});h.setRaw({...data,description:'Исправленное описание модели. '+payload,startPrice:'9000000',durationValue:'31',durationUnit:'days'});await h.publish();const edited=h.run('cars.find(lot=>lot.id==='+lot.id+')');check('published-auction-terms-immutable',edited.startPrice===lot.startPrice&&edited.ends===lot.ends);check('published-edit-preserves-current-price',edited.price===lot.price+1000);check('description-edit-allowed-after-bid',edited.description.includes('Исправленное описание'));event('descriptive edit preserves locked auction terms')}
   check('foreign-owner-unchanged-after-publish',snapshot()===foreignBefore);
  }else if(role==='bidder'){
   const scenario=index%8,initial=price(),submit=amount=>{h.node('#bid').value=String(amount);h.node('#bid-form').onsubmit({preventDefault(){}})},open=()=>h.run('openCar('+bankId+')');open();
   if(scenario===1){const update=h.run('window.FasApplyAuctionUpdate({lotId:'+bankId+',price:150000,actorOwn:false,occurredAt:new Date().toISOString()})');check('market-price-accepted',update.ok);submit(101000);check('stale-input-rejected',!h.run('bids['+bankId+']')&&h.node('#modal').open);check('stale-input-retained',h.node('#bid').value==='101000');check('fresh-min-visible',Number(h.node('#bid').min)===151000);event('outbid quote raises current price and minimum');submit(151000)}
   else if(scenario===2){const set=h.context.localStorage.setItem;h.context.localStorage.setItem=(key,value)=>{if(key==='fas-bids')throw Error('quota');return set(key,value)};submit(101000);check('bid-quota-retains-form',!h.run('bids['+bankId+']')&&h.node('#modal').open&&h.node('#bid').value==='101000');check('bid-quota-no-history',h.context.window.FasAuctionHistory.history(bankId).total===0);h.context.localStorage.setItem=set;event('bid-write quota failure retained amount; retry');submit(101000)}
   else if(scenario===3){h.records['fas-bids']=JSON.stringify({[bankId]:{price:160000,count:1,history:[{price:160000,at:new Date(now).toISOString()}]}});const disk=h.records['fas-bids'];submit(101000);check('stale-tab-no-overwrite',h.records['fas-bids']===disk&&!h.run('bids['+bankId+']'));check('stale-tab-clear-guidance',h.node('#bid-error').textContent.includes('другой вкладке'));event('concurrent financial write rejected with reload guidance')}
   else if(scenario===4){h.run('cars.find(lot=>lot.id==='+bankId+').ends=new Date(Date.now()-1).toISOString()');submit(101000);check('ended-auction-no-ghost-bid',!h.run('bids['+bankId+']'));event('auction expires while form is open; submission rejected')}
   else if(scenario===6){for(const invalid of [-1,100000,100000.5,Infinity]){submit(invalid);check('invalid-money-not-committed',!h.run('bids['+bankId+']'))}submit(101000);event('invalid numeric bids rejected before valid retry')}
   else{submit(101000);if(scenario===7){open();submit(102000);open();submit(103000)}event('valid bid submitted',{repetitions:scenario===7?3:1})}
   const bid=h.run('bids['+bankId+']');if(bid){result.counts.acceptedBids=bid.count;const committed=JSON.stringify(bid);submit(Number(bid.price)+1000);check('duplicate-form-no-second-bid',h.run('JSON.stringify(bids['+bankId+'])')===committed);check('accepted-history-present',h.context.window.FasAuctionHistory.history(bankId).rows.some(row=>row.source==='accepted-local-bid'))}
   check('ascending-price-monotone',price()>=initial);check('no-fabricated-purchase',h.context.window.FasAuctionHistory.state().purchaseCount===0);check('bidding-does-not-buy',foreign().status==='live');
  }else{
   const scenario=index%5;await click(h,{sellerBuyNow:String(foreignId)});check('purchase-explicit-demo-disclosure',h.node('#modal-content').innerHTML.includes('Реальная покупка не состоится'));event('explicit demonstration purchase confirmation opened');
   if(scenario===2){h.setFailLots(true);await click(h,{sellerConfirmBuy:String(foreignId)});check('buy-quota-no-sale',foreign().status==='live'&&h.context.window.FasAuctionHistory.state().purchaseCount===0);check('buy-quota-keeps-confirmation',h.node('#modal').open);h.setFailLots(false);event('purchase quota failure; explicit retry')}
   if(scenario===3){const fresh=Array.from(h.run('cars')).map(lot=>lot.id===foreignId?{...lot,status:'sold',soldAt:new Date(now).toISOString(),soldPrice:lot.buyNowPrice}:lot);h.records['fas-lots']=JSON.stringify(fresh);const disk=h.records['fas-lots'];await click(h,{sellerConfirmBuy:String(foreignId)});check('stale-buy-does-not-overwrite',h.records['fas-lots']===disk&&foreign().status==='live');check('stale-buy-no-fake-purchase-history',h.context.window.FasAuctionHistory.state().purchaseCount===0);check('stale-buy-clear-reload-guidance',h.node('#toast').textContent.includes('другой вкладке')&&h.node('#toast').textContent.includes('Обновите страницу'));event('other buyer already sold this lot; stale local purchase rejected',{feedback:h.node('#toast').textContent})}
   else{await click(h,{sellerConfirmBuy:String(foreignId)});const sold=foreign();check('one-explicit-demo-sale',sold.status==='sold'&&sold.soldPrice===sold.buyNowPrice);result.counts.demoPurchases=1;const at=sold.soldAt,before=JSON.stringify(sold);await click(h,{sellerConfirmBuy:String(foreignId)});check('duplicate-purchase-no-resale',JSON.stringify(foreign())===before&&foreign().soldAt===at);check('only-confirmed-demo-purchase-recorded',h.context.window.FasAuctionHistory.state().purchaseCount===1);check('no-real-paid-claim',!h.node('#toast').textContent.includes('Оплачено'));event('one demo purchase persisted; duplicate ignored',{soldPrice:sold.soldPrice})}
  }
  result.pass=true;
 }catch(error){result.error={message:error.message,stack:error.stack};event('watcher failure',{error:error.message});report.findings.push({profile:result.number,role,result:result.error.message})}
 finally{if(h){result.writeKeys=[...new Set(h.writes)];result.localOnly=true;result.fixtureInventory=3;result.finalInventory=h.run('cars.length');result.finalFeedback=String(h.node('#toast').textContent||'').slice(0,350)}await Promise.resolve()}
 return result;
}
async function main(){
 for(let index=0;index<COUNT;index++){
  const result=await profile(index);report.profiles.push(result);report.totals.completed++;report.totals[result.pass?'passed':'failed']++;report.totals[result.role==='seller'?'sellers':result.role==='bidder'?'bidders':'buyers']++;for(const[key,value]of Object.entries(result.counts))report.totals[key]+=value;
  if(global.gc)global.gc();
  if(report.totals.completed%10===0||report.totals.completed===COUNT){fs.writeFileSync(OUT,JSON.stringify(report,null,2));console.log(JSON.stringify({completed:report.totals.completed,passed:report.totals.passed,failed:report.totals.failed,watcherChecks:report.totals.watcherChecks}))}
 }
 report.coverage={roles:{sellers:report.totals.sellers,bidders:report.totals.bidders,buyers:report.totals.buyers},experience:[...new Set(report.profiles.map(row=>row.experience))],durationMinutes:[...new Set(report.profiles.map(row=>row.parameters?.durationMinutes))].sort((a,b)=>a-b),regions:[...new Set(report.profiles.map(row=>row.parameters?.region))],scenarios:Object.fromEntries(['seller','bidder','buyer'].map(role=>[role,[...new Set(report.profiles.filter(row=>row.role===role).map(row=>row.scenario))].sort((a,b)=>a-b)]))};
 report.sourceDigestAfterRun=fingerprintSources();report.sourceUnchangedDuringRun=report.sourceDigestAfterRun===report.sourceDigest;report.finished=true;report.elapsedMs=Date.now()-STARTED;report.resources={maxRssKiB:process.resourceUsage().maxRSS,heapUsedBytes:process.memoryUsage().heapUsed,rssBytes:process.memoryUsage().rss};fs.writeFileSync(OUT,JSON.stringify(report,null,2));console.log(JSON.stringify({report:OUT,totals:report.totals,findings:report.findings}));if(report.totals.failed||!report.sourceUnchangedDuringRun)process.exitCode=1;
}
module.exports={profilePlan,MAX_PROFILES};
if(require.main===module)main().catch(error=>{report.runnerError=error.stack;fs.writeFileSync(OUT,JSON.stringify(report,null,2));console.error(error);process.exitCode=1});
