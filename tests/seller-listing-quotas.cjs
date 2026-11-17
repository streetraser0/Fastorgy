/* Actual private-seller submit/status/automatic-renewal handlers, isolated storage. */
const assert=require('node:assert/strict'),{boot,raw}=require('./helpers/category-seller-harness.cjs');
const NOW=Date.now(),hour=3600000,KEY='fas-seller-workspace-v1';
const base={sellerOwnerId:'seller-owner',sellerType:'private',category:'cars',subcategory:'cars',name:'Собственный лот',description:raw.description,condition:'used',regionCode:'36',city:'Воронеж',price:1000000,start:1000000,startPrice:1000000,step:10000,stepValue:10000,stepMode:'fixed',deposit:0,bids:0,status:'live',durationMinutes:120,startsAt:new Date(NOW-hour).toISOString(),ends:new Date(NOW+hour).toISOString(),mediaRefs:[{id:'idb:image-12345678',kind:'image',size:1024}]};
const listing=(id,changes={})=>({...base,id,...changes});
const active=(h)=>h.run('cars.filter(lot=>lot.sellerOwnerId==="seller-owner"&&["live","scheduled"].includes(window.FasSellerRules.getAuctionState(lot))).length');
const stored=h=>JSON.parse(h.records['fas-lots']||'[]');
const workspace=h=>JSON.parse(h.records[KEY]);
const wait=()=>new Promise(resolve=>setImmediate(resolve));
function setup(lots=[]){const h=boot({fixtureInventory:lots});h.run('window.__quotaNotices=[];toast=message=>window.__quotaNotices.push(message)');return h}
function formData(category='cars',name='Новое объявление квоты',changes={}){return {...raw,category:['houses','land'].includes(category)?'property':category==='ready_business'?'other':category,subcategory:category,name,area:'60',rooms:'1',businessType:'Мастерская',...changes}}
function draft(h,id,data){const value=workspace(h);value.drafts.push({id,ownerId:'seller-owner',data,mediaRefs:[{id:'idb:image-12345678',kind:'image',size:1024}],updatedAt:new Date().toISOString()});h.records[KEY]=JSON.stringify(value);h.setRaw(data);h.run('window.FasSellerUI.openEditor('+JSON.stringify(id)+')')}

(async()=>{
 // Three active/scheduled cars consume the free allowance, foreign/bank rows do not.
 {
  const lots=[listing(901),listing(902),listing(903,{status:'scheduled',startsAt:new Date(NOW+hour).toISOString(),ends:new Date(NOW+2*hour).toISOString()}),listing(904,{sellerOwnerId:'another-owner'}),{...listing(905),sellerOwnerId:undefined,bank:'Банк'}],h=setup(lots);
  draft(h,'draft-fourth',formData());const count=h.run('cars.length'),original=workspace(h).drafts.find(row=>row.id==='draft-fourth');await h.publish();
  assert.equal(h.run('cars.length'),count);assert.equal(active(h),3);assert.match(h.node('#seller-error').textContent,/3 из 3/);assert.match(h.node('#seller-error').textContent,/Свободных мест: 0/);
  assert(workspace(h).drafts.some(row=>row.id===original.id&&row.data.name===original.data.name),'blocked publication keeps the edited draft and its media');assert(h.node('#modal').open);assert(h.node('#modal-content').innerHTML.includes('seller-listing-form'));
  h.run('window.FasSellerUI.openDashboard()');assert(h.node('#modal-content').innerHTML.includes('авто 3/3'));assert(h.node('#modal-content').innerHTML.includes('недвижимость 0/2'));
 }
 // Same-category edits do not consume a second slot, including over-limit migrated data.
 {
  const h=setup([listing(911),listing(912),listing(913),listing(914)]);h.setRaw(formData('cars','Сохранённое имя',{description:raw.description+' Новое уточнение.'}));h.run('window.FasSellerUI.openEditor(911)');await h.publish();
  assert.equal(active(h),4);assert.match(h.run('cars.find(lot=>lot.id===911).description'),/Новое уточнение/);assert(!h.node('#seller-error').textContent);
 }
 // Buckets are independent: housing shares one cap; equipment remains commercially uncapped.
 {
  const h=setup([listing(921),listing(922),listing(923),listing(924,{category:'property',subcategory:'property'}),listing(925,{category:'property',subcategory:'houses'})]);
  draft(h,'draft-land',formData('land'));await h.publish();assert.match(h.node('#seller-error').textContent,/объектов недвижимости: 2 из 2/);assert(workspace(h).drafts.some(row=>row.id==='draft-land'));
  draft(h,'draft-machine',formData('equipment','Деревообрабатывающий станок'));await h.publish();assert(stored(h).some(lot=>lot.name==='Деревообрабатывающий станок'));
  draft(h,'draft-business-one',formData('ready_business','Действующая мастерская'));await h.publish();assert(stored(h).some(lot=>lot.name==='Действующая мастерская'));
  draft(h,'draft-business-two',formData('ready_business','Ещё один готовый бизнес'));await h.publish();assert.match(h.node('#seller-error').textContent,/готовых бизнесов: 1 из 1/);assert(workspace(h).drafts.some(row=>row.id==='draft-business-two'));
 }
 // Pausing a no-bid lot frees a slot; resume must compete for that slot anew.
 {
  const h=setup([listing(926),listing(927,{category:'property',subcategory:'property'}),listing(928,{category:'property',subcategory:'houses'})]);
  h.setRaw(formData('houses','Дом вместо автомобиля'));h.run('window.FasSellerUI.openEditor(926)');await h.publish();
  assert.equal(h.run('cars.find(lot=>lot.id===926).category'),'cars','an active category change cannot overflow the destination bucket');assert.match(h.node('#seller-error').textContent,/объектов недвижимости: 2 из 2/);assert(workspace(h).drafts.some(row=>row.targetId===926));
 }
 {
  const h=setup([listing(931),listing(932),listing(933),listing(934,{status:'paused'})]);await h.click({sellerStatus:'934',nextStatus:'live'});
  assert.equal(h.run('cars.find(lot=>lot.id===934).status'),'paused');assert(h.context.window.__quotaNotices.some(text=>text.includes('3 из 3')));
  await h.click({sellerStatus:'931',nextStatus:'paused'});assert.equal(h.run('cars.find(lot=>lot.id===931).status'),'paused');
  await h.click({sellerStatus:'934',nextStatus:'live'});assert.equal(h.run('cars.find(lot=>lot.id===934).status'),'live');assert.equal(active(h),3);
  const bid=setup([listing(935,{bids:1})]);await bid.click({sellerStatus:'935',nextStatus:'cancelled'});await bid.click({sellerStatus:'935',nextStatus:'paused'});assert.equal(bid.run('cars[0].status'),'live','quota does not weaken the accepted-bid withdrawal lock');
 }
 // Ended/archive rows free space and drafts are not counted or discarded by refusal.
 {
  const h=setup([listing(941),listing(942),listing(943,{startsAt:new Date(NOW-3*hour).toISOString(),ends:new Date(NOW-hour).toISOString()})]);await h.click({sellerArchive:'943'});
  assert(h.run('!!cars.find(lot=>lot.id===943).sellerArchivedAt'));draft(h,'draft-after-archive',formData());await h.publish();assert.equal(active(h),3);assert(!workspace(h).drafts.some(row=>row.id==='draft-after-archive'));
 }
 // The authoritative in-page inventory is reread after the asynchronous media read.
 {
  const h=setup([listing(951),listing(952)]);draft(h,'draft-media-race',formData());await wait();let release;h.context.window.FasSellerMedia.getMedia=()=>new Promise(resolve=>{release=resolve});const pending=h.publish();
  h.run('cars.push('+JSON.stringify(listing(953))+')');release([{type:'image',ref:'idb:image-12345678'}]);await pending;
  assert.equal(active(h),3);assert.match(h.node('#seller-error').textContent,/3 из 3/);assert(workspace(h).drafts.some(row=>row.id==='draft-media-race'));
 }
 // Preview/paid-looking browser flags do not enlarge the free allowance.
 {
  const h=setup([listing(961),listing(962),listing(963)]);h.records['fas-plan']='premium';h.context.window.FasPlan={plan:'premium',paid:true};draft(h,'draft-fake-premium',formData());await h.publish();assert.equal(active(h),3);assert.match(h.node('#seller-error').textContent,/3 из 3/);
  assert.throws(()=>h.run('window.FasListingQuotas.localChangeDecision({lots:cars,before:cars[0],next:{...cars[0],id:999999},ownerId:"seller-owner",bids,now:Date.now()})'),error=>error.code==='invalid-local-listing-change','another listing cannot be subtracted to pretend a new publication is an edit');
 }
 // Missing shared policy fails closed for publish while preserving draft editing.
 {
  const h=setup();delete h.context.window.FasListingQuotas;draft(h,'draft-no-policy',formData());await h.publish();assert.equal(active(h),0);assert.match(h.node('#seller-error').textContent,/загрузить правила/);assert(workspace(h).drafts.some(row=>row.id==='draft-no-policy'));
 }
 // Repeated editor typing must not invoke a full quota usage pass.
 {
  const h=setup([listing(971)]),original=h.context.window.FasListingQuotas;let counts=0;
  h.context.window.FasListingQuotas={...original,localUsage(...args){counts++;return original.localUsage(...args)}};draft(h,'draft-typing',formData());const before=counts;
  for(let n=0;n<20;n++){h.setRaw(formData('cars','Новая цена',{startPrice:String(1000000+n)}));h.node('#seller-listing-form').events.input({target:{name:'startPrice'}})}
  assert.equal(counts,before,'quota hints stay static while typing');h.run('window.FasSellerUI.openDashboard()');assert(counts>before,'explicit dashboard rendering computes current usage');
 }
 // Auto-relist is a publication path: ended private cars cannot return as a fourth.
 {
  const ended=id=>listing(id,{autoRelist:true,relistDurationMinutes:60,relistLimit:3,startsAt:new Date(NOW-3*hour).toISOString(),ends:new Date(NOW-hour).toISOString()});
  const h=setup([listing(981),listing(982),listing(983)]);h.run('cars.push(...'+JSON.stringify([ended(984),ended(985)])+')');
  h.run('window.__quotaRenewal=window.FasAuctionRenewal.plan(cars,bids,'+NOW+')');assert.deepEqual(Array.from(h.context.window.__quotaRenewal.renewedIds),[]);assert.equal(active(h),3);assert.deepEqual(Array.from(h.context.window.__quotaRenewal.quotaBlockedIds),[984,985]);
  h.run('cars=cars.filter(lot=>lot.id!==983);window.__quotaRenewal=window.FasAuctionRenewal.plan(cars,bids,'+NOW+')');assert.deepEqual(Array.from(h.context.window.__quotaRenewal.renewedIds),[984]);assert.deepEqual(Array.from(h.context.window.__quotaRenewal.quotaBlockedIds),[985]);
  const bank={...ended(986),sellerOwnerId:undefined,sellerType:'bank'};h.run('cars.push('+JSON.stringify(bank)+');window.__quotaRenewal=window.FasAuctionRenewal.plan(cars,bids,'+NOW+')');assert.deepEqual(Array.from(h.context.window.__quotaRenewal.renewedIds),[984,986],'bank seed renewal remains separate and a single remaining private slot is reserved once');
  delete h.context.window.FasListingQuotas;h.run('window.__quotaRenewal=window.FasAuctionRenewal.plan(cars,bids,'+NOW+')');assert.deepEqual(Array.from(h.context.window.__quotaRenewal.renewedIds),[986],'without policy, private renewal fails closed while bank behavior is retained');
 }
 console.log('PASS: actual private publication/resume caps, independent categories, scheduled reservations, retained drafts, in-flight inventory changes, no paid-preview bypass, static typing hints, and sequential auto-relist quota guards. Local demo only, not real server account enforcement.');
})().catch(error=>{console.error(error);process.exitCode=1});
