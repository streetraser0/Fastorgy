const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {setup}=require('./helpers/quickbar-dom.cjs');
const source=fs.readFileSync('dist/auction-history.js','utf8'),KEY='fas-auction-history-v1',now=Date.now(),lot={id:101,name:'Toyota Camry',category:'cars',price:100000,bids:6,status:'live'};
function boot(options={}){
 const h=setup(),records={...(options.records||{})};h.context.Blob=Blob;h.context.Date=class extends Date{static now(){return now}};h.context.cars=options.lots||[{...lot}];h.context.bids=options.bids||{};h.context.localStorage={getItem:key=>records[key]??null,setItem(key,value){if(options.fail&&key===KEY)throw Error('quota');records[key]=value}};h.context.showModalContent=html=>{h.content.innerHTML=html;h.modal.showModal()};h.context.isLotLive=row=>row.status==='live';h.context.openCar=id=>h.calls.push(['open',id]);
 vm.runInContext(source,h.context);return {...h,records,api:h.context.FasAuctionHistory};
}
const entry=(price,delta=0)=>({price,at:new Date(now+delta).toISOString()});
{
 const h=boot({lots:[{...lot,status:'sold',soldPrice:100000,soldAt:new Date(now).toISOString()}],bids:{101:{price:105000,count:6}}});assert.equal(h.api.state().eventCount,0,'catalogue bid counters or sold prices never fabricate history or purchases');assert.equal(h.api.state().purchaseCount,0);h.api.openPurchases();assert.match(h.content.innerHTML,/Подтверждённых покупок пока нет/);assert(h.content.querySelector('[data-auction-history-my-bids]'));
}
{
 const h=boot({lots:[{...lot,price:110000,auctionUpdatedAt:new Date(now-2000).toISOString()}],bids:{101:{price:120000,count:9,history:[entry(105000,-5000),entry(120000,-1000)]}}});
 assert.equal(h.api.history(101).total,3);assert.equal(h.api.state().purchaseCount,0);assert(h.api.history(101).rows.some(row=>row.source==='legacy-own-history'));assert(h.api.history(101).rows.some(row=>row.source==='stored-market-quote'));assert.equal(h.api.recordOwnBid(lot,entry(120000,-1000)).ok,true,'a genuine accepted record upgrades migration provenance');assert.equal(h.api.history(101).total,3,'migration and accepted hooks deduplicate the same event');assert.equal(h.api.recordOwnBid(lot,entry(120000,-1000)).reason,'duplicate');
 const row=h.api.history(101).rows.find(row=>row.amount===120000);assert.equal(row.source,'accepted-local-bid');assert.deepEqual(Object.keys(row).sort(),['amount','at','kind','lotId','name','source']);
 assert.equal(h.api.recordOwnBid({...lot,phone:'PRIVATE',vin:'VIN-PRIVATE',sellerOwnerId:'OWNER-PRIVATE'},entry(130000)).ok,true);assert(!h.records[KEY].includes('PRIVATE'));const reloaded=boot({records:h.records,lots:h.context.cars,bids:h.context.bids});assert.equal(reloaded.api.history(101).total,4);assert.equal(reloaded.api.state().purchaseCount,0);assert(reloaded.api.history(101).rows.every(row=>Date.parse(row.at)>now-365*86400000));
}
{
 const h=boot({fail:true});const result=h.api.recordOwnBid(lot,entry(101000));assert.equal(result.captured,true);assert.equal(result.saved,false);assert.equal(h.api.state().storageAvailable,false);assert.equal(h.api.history(101).total,1,'quota failure keeps the accepted event in memory');assert.match(h.api.sectionHTML(lot),/только в этом окне|Не закрывайте/);h.api.openLotHistory(101);assert(h.content.querySelector('[data-auction-history-retry]'));h.context.localStorage.setItem=(key,value)=>h.records[key]=value;assert.equal(h.api.retrySave(),true);assert.equal(boot({records:h.records}).api.history(101).total,1);
}
{
 const h=boot();h.api.recordOwnBid(lot,entry(101000,-4000));h.records[KEY]=JSON.stringify({version:1,events:[{lotId:101,kind:'market-quote',amount:102000,at:new Date(now-2000).toISOString(),source:'accepted-market-update',name:'Toyota'}]});h.api.recordOwnBid(lot,entry(103000));assert.equal(h.api.history(101).total,3,'saving in an older tab merges a different tab’s archived events');assert.equal(JSON.parse(h.records[KEY]).events.length,3);
}
{
 const h=boot({records:{[KEY]:'bad JSON'}});assert.equal(h.api.state().complete,false);assert.equal(h.api.state().storageAvailable,false);assert.doesNotThrow(()=>h.api.openPurchases());assert.match(h.content.innerHTML,/повреждён|недоступна|не подтверждается/);assert.equal(h.api.state().purchaseCount,0);
 const expired={lotId:101,kind:'own-bid',amount:1,at:new Date(now-366*86400000).toISOString(),source:'legacy-own-history',name:'Старая ставка'};const p=boot({records:{[KEY]:JSON.stringify({version:1,events:[expired]})}});assert.equal(p.api.history(101).total,0);assert.equal(JSON.parse(p.records[KEY]).events.length,0,'expired records are removed from disk on reload too');assert.equal(p.api.recordOwnBid(lot,entry(1,-366*86400000)).captured,false);assert.equal(p.api.recordMarketQuote(lot,{price:2,occurredAt:new Date(now+600000).toISOString()}).captured,false);
}
{
 const h=boot();for(let i=0;i<65;i++)h.api.recordOwnBid(lot,entry(100000+i*1000,-65000+i*1000));assert.equal(h.api.history(101).total,65);h.api.openLotHistory(101);assert.equal(h.content.querySelectorAll('.auction-history-event').length,50);h.modal.scrollTop=600;h.click(h.content.querySelector('[data-auction-history-more]'));assert.equal(h.content.querySelectorAll('.auction-history-event').length,65);assert.equal(h.modal.scrollTop,600);assert.equal(JSON.parse(h.api.exportData()).events.length,65);assert.equal(h.api.state().purchaseCount,0);
 let returned=0;h.api.openPurchases({onBack(){returned++}});assert.equal(h.api.back(),true);assert.equal(returned,1);
}
{
 const h=boot();assert.equal(h.api.recordDemoPurchase(lot).captured,false,'a live/leading auction is not a purchase');const sold={...lot,status:'sold',soldPrice:150000,soldAt:new Date(now).toISOString()};assert.equal(h.api.recordDemoPurchase(sold).captured,true);assert.equal(h.api.state().purchaseCount,1);h.api.openPurchases();assert.match(h.content.innerHTML,/Демопокупка/);assert.match(h.content.innerHTML,/не подтверждение реальной сделки/);assert.equal(h.api.recordDemoPurchase(sold).reason,'duplicate');assert.equal(h.api.state().purchaseCount,1);
}
{
 // Safety bound preserves the persisted prefix and explicitly retains the unsaved event in memory.
 const rows=[],name='Ж'.repeat(200);let serial='';for(let i=0;i<10000;i++){rows.push({lotId:101,kind:'own-bid',amount:100000+i,at:new Date(now-100000+i).toISOString(),source:'accepted-local-bid',name});const next=JSON.stringify({version:1,complete:true,events:rows});if(Buffer.byteLength(next)>2*1024*1024-700){rows.pop();serial=JSON.stringify({version:1,complete:true,events:rows});break}}
 const h=boot({records:{[KEY]:serial}}),before=h.api.state().eventCount;h.api.recordOwnBid({...lot,name},entry(999999));h.api.recordOwnBid({...lot,name},entry(1000000));assert.equal(h.api.state().eventCount,before+2);assert.equal(h.api.state().storageAvailable,false);assert.match(h.api.state().warning,/2 МБ/);assert.equal(boot({records:h.records}).api.state().complete,false,'an incomplete last save remains visible after reload');assert.equal(boot({records:h.records}).api.state().eventCount,before+1,'the unsafe payload does not silently replace a valid stored prefix');assert.equal(h.api.history(101,{offset:0,limit:200}).total,before+2);
}
console.log('PASS: accepted-event ledger, transparent legacy seeds, no fabricated purchases, deduplication/provenance/privacy, 365-day retention, cross-tab merge, quota/size failure with memory recovery, paged history/export and explicit demo-only purchases.');
