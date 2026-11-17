const assert=require('node:assert/strict');
const {boot,raw}=require('./helpers/category-seller-harness.cjs');
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve;const promise=new Promise(yes=>resolve=yes);return {promise,resolve}};
(async()=>{
 const h=boot(),normalMedia=h.context.window.FasSellerMedia.getMedia;let sequence=0;
 async function editor(overrides={}){
  const id=999684000+sequence++;
  h.context.window.fixture={...h.run('window.FasSellerRules.validateListing('+JSON.stringify(raw)+',{regionCodes:RF_REGIONS.map(region=>region.code)}).value'),id,sellerOwnerId:'seller-owner',sellerName:'Продавец',bank:'Продавец',status:'live',bids:0,createdAt:new Date().toISOString(),mediaRefs:[{id:'idb:image-12345678',kind:'image',size:1024}],...overrides};
  h.run('cars.push(window.fixture);window.FasSellerUI.openEditor(window.fixture.id)');await settle();
  h.setRaw({...raw,description:raw.description+' Уточнение описания '+id});return id;
 }
 const lot=id=>h.run('cars.find(lot=>lot.id==='+id+')');
 const replace=(id,value)=>h.run('cars=cars.map(lot=>lot.id==='+id+'?{...lot,...'+JSON.stringify(value)+'}:lot)');
 // Metadata editing never resets an existing external quote to the start price.
 let id=await editor({price:1200000,bids:2});await h.publish();
 assert.equal(lot(id).price,1200000);assert.equal(lot(id).startPrice,1000000);assert.equal(lot(id).bids,2);
 assert.equal(lot(id).name,raw.name,'the auction object keeps its name after the first bid');
 assert.match(lot(id).description,/Уточнение описания/,'description clarifications remain available after a bid');
 // A quote, pause, deadline extension and count arriving during IDB reading are authoritative.
 id=await editor();let reading=deferred();h.context.window.FasSellerMedia.getMedia=()=>reading.promise;
 let pending=h.publish();const end=new Date(Date.parse(lot(id).ends)+120000).toISOString();
 replace(id,{price:1300000,status:'paused',ends:end,bids:3,auctionUpdatedAt:'2026-11-13T01:00:00Z'});
 reading.resolve([{type:'image',ref:'idb:image-12345678'}]);await pending;h.context.window.FasSellerMedia.getMedia=normalMedia;
 assert.equal(lot(id).price,1300000);assert.equal(lot(id).status,'paused');assert.equal(lot(id).ends,end);assert.equal(lot(id).bids,3);assert.equal(lot(id).auctionUpdatedAt,'2026-11-13T01:00:00Z');
 // Closing a sale while an editor is open cannot be undone by metadata publication.
 id=await editor();reading=deferred();h.context.window.FasSellerMedia.getMedia=()=>reading.promise;pending=h.publish();
 const soldAt=new Date().toISOString();replace(id,{status:'sold',soldAt,soldPrice:1400000,price:1400000});reading.resolve([{type:'image'}]);await pending;h.context.window.FasSellerMedia.getMedia=normalMedia;
 assert.equal(lot(id).status,'sold');assert.equal(lot(id).soldAt,soldAt);assert.equal(lot(id).soldPrice,1400000);assert.equal(lot(id).price,1400000);
 // A lost ownership or deleted record rejects a stale editor and keeps its draft.
 for(const removed of [false,true]){
  id=await editor();reading=deferred();h.context.window.FasSellerMedia.getMedia=()=>reading.promise;pending=h.publish();
  if(removed)h.run('cars=cars.filter(lot=>lot.id!=='+id+')');else replace(id,{sellerOwnerId:'another-seller',name:'Другой владелец'});
  reading.resolve([{type:'image'}]);await pending;h.context.window.FasSellerMedia.getMedia=normalMedia;
  if(removed)assert.equal(lot(id),undefined);else{assert.equal(lot(id).sellerOwnerId,'another-seller');assert.equal(lot(id).name,'Другой владелец')}
  assert.match(h.node('#seller-error').textContent,/больше недоступно/);
  assert(JSON.parse(h.records['fas-seller-workspace-v1']).drafts.some(draft=>draft.targetId===id),'rejected update retains its editable draft');
 }
 // Pause/withdrawal must account for others' bids as well as this browser's own bids.
 for(const bidEvidence of [{bids:1},{price:1100000}]){
  id=await editor(bidEvidence);h.run('window.FasSellerUI.openDashboard()');
  assert(!h.node('#modal-content').innerHTML.includes('data-seller-status="'+id+'"'),'auction controls disappear after external bid evidence');
  await h.click({sellerStatus:String(id),nextStatus:'cancelled'});assert.equal(lot(id).status,'live');
  await h.click({sellerStatus:String(id),nextStatus:'paused'});assert.equal(lot(id).status,'live');
 }
 id=await editor();await h.click({sellerStatus:String(id),nextStatus:'paused'});assert.equal(lot(id).status,'paused','an unbid auction can still pause');
 console.log('PASS: seller metadata preserves current quotes/status/deadlines/sales, rejects removed/reassigned lots, and respects external bids before pause/withdrawal.');
})().catch(error=>{console.error(error);process.exitCode=1});
