const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const source=fs.readFileSync(path.join(__dirname,'../dist/auction-renewal.js'),'utf8'),context={Date,Number,Object,Array,Map,Set,Math};context.window=context;vm.createContext(context);vm.runInContext(source,context);const R=context.FasAuctionRenewal;
const now=Date.parse('2026-11-13T10:00:00Z'),hour=3600000,day=24*hour;
const base={id:1,name:'Лот без ставок',category:'cars',status:'live',autoRelist:true,relistDurationMinutes:360,relistLimit:3,price:10000,start:10000,startPrice:10000,step:100,deposit:0,bids:0,startsAt:new Date(now-2*hour).toISOString(),ends:new Date(now-hour).toISOString(),mediaRefs:[{id:'idb:example-123'}]};
const run=(changes={},bids={},time=now)=>R.plan([{...base,...changes}],bids,time);
const ids=result=>Array.from(result.renewedIds);
for(const duration of [60,360,1440,4320,10080,20160,43200]){const result=run({relistDurationMinutes:duration});assert.deepEqual(ids(result),[1]);const lot=result.lots[0];assert.equal(Date.parse(lot.ends)-now,duration*60000);assert.equal(Date.parse(lot.startsAt),now);assert.equal(lot.starts,lot.startsAt);assert.equal(lot.durationMinutes,duration);assert.equal(lot.relistCount,1);assert.equal(lot.price,base.price);assert.equal(lot.start,base.start);assert.equal(lot.startPrice,base.startPrice);assert.equal(Date.parse(lot.maxEnds)-now,30*day)}
for(const duration of [59,43201,60.5,'',NaN,Infinity,'1e2','<img>'])assert(!R.validate({autoRelist:true,relistDurationMinutes:duration,relistLimit:3}).valid,'invalid repeat duration '+duration);
for(const limit of [0,11,1.5,'',NaN,Infinity,'<img>'])assert(!R.validate({autoRelist:true,relistDurationMinutes:60,relistLimit:limit}).valid,'invalid repeat limit '+limit);
assert(R.validate({autoRelist:false,relistDurationMinutes:'broken',relistLimit:'broken'}).valid,'disabling malformed saved settings must remain possible');
const values={autoRelist:'on',relistDurationMinutes:'60',relistLimit:'1',relistCount:'9'},settings=R.readSettings({get:key=>values[key]??null});assert.equal(settings.autoRelist,true);assert(!Object.hasOwn(settings,'relistCount'));assert.equal(R.validate(settings).value.relistDurationMinutes,60);
assert.equal(R.validate({}).value.autoRelist,false,'renewal is opt-in');
const hostile='<img src=x onerror=alert(1)>',html=R.fieldsHTML({autoRelist:'false',relistDurationMinutes:hostile,relistLimit:hostile,relistCount:hostile});assert(!html.includes(hostile));assert(!/name="autoRelist" checked/.test(html));assert(html.includes('пока сайт или приложение открыты'));assert(R.fieldsHTML({relistDurationMinutes:90}).includes('value="90" selected'),'saved exact custom duration remains selectable');

const frozen=Object.freeze({...base,mediaRefs:Object.freeze([Object.freeze({...base.mediaRefs[0]})])}),input=Object.freeze([frozen]),bids=Object.freeze({}),before=JSON.stringify(input),planned=R.plan(input,bids,now);assert.equal(JSON.stringify(input),before);assert.notEqual(planned.lots,input);assert.notEqual(planned.lots[0],frozen);assert.equal(frozen.ends,base.ends);assert.equal(frozen.relistCount,undefined);assert.equal(JSON.stringify(bids),'{}','planning cannot mutate bid records');
assert.equal(R.plan(planned.lots,bids,now).lots,planned.lots,'no catch-up loop or repeated renewal before the new end');
const second=R.plan(planned.lots,bids,Date.parse(planned.lots[0].ends));assert.equal(second.lots[0].relistCount,2);assert.equal(Date.parse(second.lots[0].ends)-Date.parse(planned.lots[0].ends),360*60000);
assert.deepEqual(ids(run({relistCount:3})),[]);assert.deepEqual(ids(run({relistCount:1,relistLimit:1})),[]);
for(const count of [-1,'1',1.5,NaN,Infinity,null])assert.deepEqual(ids(run({relistCount:count})),[],'malformed internal count must fail closed');
for(const marker of [new Date(now-1000).toISOString(),new Date(now).toISOString()])assert.deepEqual(ids(run({sellerArchivedAt:marker})),[],'an explicit owner archive preserves the closed auction instead of renewing it');
for(const status of ['paused','sold','cancelled','draft','scheduled','ended',undefined])assert.deepEqual(ids(run({status})),[],'must not renew '+status);
for(const autoRelist of [false,undefined,'false','true','on',1])assert.deepEqual(ids(run({autoRelist})),[],'persisted opt-in must be a real boolean');
for(const entry of [{},null,undefined,{price:10000,count:0},{price:10000,count:1}])assert.deepEqual(ids(run({},Object.assign({}, {'1':entry}))),[],'any bid record prevents a repeat, even if empty or malformed');
for(const count of [1,'1',-1,{},[],false])assert.deepEqual(ids(run({bids:count})),[],'bid counts must be unambiguously zero');
for(const key of ['soldAt','soldPrice','settlement','settlementId','winningBid','winningBidId','winnerId','buyerId','paidAt'])assert.deepEqual(ids(run({[key]:'present'})),[],'sale/settlement marker prevents renewal: '+key);
assert.deepEqual(ids(run({sold:true})),[]);assert.deepEqual(ids(run({reservePrice:20000},{'1':{price:15000,count:1}})),[],'bids below reserve must not be discarded');
for(const changes of [{price:0},{price:'10000'},{start:-1},{startPrice:Infinity},{price:20000},{currentPrice:20000},{step:0},{step:Number.MAX_SAFE_INTEGER},{deposit:-1},{deposit:10001},{reservePrice:9000},{buyNowPrice:'20000'},{reservePrice:20000,buyNowPrice:15000},{ends:'not-a-date'},{ends:new Date(now+1).toISOString()},{startsAt:'not-a-date'},{startsAt:new Date(now-40*day).toISOString()},{startsAt:new Date(now).toISOString()},{relistDurationMinutes:59},{relistLimit:11},{id:'1'}])assert.deepEqual(ids(run(changes)),[],'invalid auction must not renew '+JSON.stringify(changes));
assert.deepEqual(ids(run({ends:new Date(now).toISOString()})),[1],'exact deadline is eligible');
const longAbsent=run({startsAt:new Date(now-100*day-hour).toISOString(),ends:new Date(now-100*day).toISOString()});assert.equal(longAbsent.lots[0].relistCount,1,'long absence creates one cycle');assert.equal(Date.parse(longAbsent.lots[0].ends),now+360*60000);
assert.equal(R.plan(input,{},NaN).lots,input);assert.equal(R.plan(input,[],now).lots,input);assert.deepEqual(ids(R.plan(input,{},8640000000000000)),[]);

// Array species observes real catalogue-sized copies without depending on a
// particular loop or mocking the renewal result.
{
 let copies=0,slots=0,checked=0;
 const inventory=Array.from({length:512},(_,index)=>{const lot={id:index+1,status:'live'};Object.defineProperty(lot,'autoRelist',{get(){checked++;return false}});return lot});
 inventory.constructor={[Symbol.species]:function(length){copies++;slots+=length;return new Array(length)}};
 for(let n=0;n<20;n++){const idle=R.plan(inventory,{},now);assert.equal(idle.lots,inventory);assert.deepEqual(ids(idle),[])}
 assert.equal(checked,20*inventory.length,'idle checks still examine every current opt-in flag');
 assert.equal(copies,0,'idle renewal checks do not allocate and discard a full catalogue copy');assert.equal(slots,0);
 inventory[256]={...base,id:257};inventory[400]={...base,id:401};const untouched=inventory[0],renewed=R.plan(inventory,{},now);
 assert.deepEqual(ids(renewed),[257,401]);assert.equal(copies,1,'multiple eligible renewals share one immutable catalogue copy');assert.equal(slots,inventory.length);
 assert.equal(renewed.lots[0],untouched);assert.equal(renewed.lots[256].relistCount,1);assert.equal(renewed.lots[400].relistCount,1);assert.equal(inventory[256].relistCount,undefined);
}

(async()=>{
 const {boot,raw}=require('./helpers/category-seller-harness.cjs'),h=boot();vm.runInContext(source,h.context);
 h.setRaw({...raw,autoRelist:true,relistDurationMinutes:'360',relistLimit:'3',relistCount:9});h.run('window.FasSellerUI.openEditor("draft-initial")');assert(h.node('#modal-content').innerHTML.includes('name="autoRelist"'));h.run('window.FasSellerUI.leave()');const draft=JSON.parse(h.records['fas-seller-workspace-v1']).drafts[0];assert.equal(draft.data.autoRelist,true);assert.equal(draft.data.relistDurationMinutes,'360');
 h.run('window.FasSellerUI.openEditor("draft-initial")');await h.publish();let lot=JSON.parse(h.records['fas-lots']).find(c=>c.sellerOwnerId);assert.equal(lot.autoRelist,true);assert.equal(lot.relistDurationMinutes,360);assert.equal(lot.relistLimit,3);assert.equal(lot.relistCount,undefined,'form may not set internal repeat count');
 h.run('cars.find(c=>c.id==='+lot.id+').relistCount=2');h.setRaw({...raw,autoRelist:false,relistDurationMinutes:'60',relistLimit:'1'});h.run('window.FasSellerUI.openEditor('+lot.id+')');await h.publish();lot=JSON.parse(h.records['fas-lots']).find(c=>c.id===lot.id);assert.equal(lot.autoRelist,false);assert.equal(lot.relistCount,2,'editing settings must retain the internal counter');
 const invalid=boot();vm.runInContext(source,invalid.context);invalid.setRaw({...raw,autoRelist:true,relistDurationMinutes:'59',relistLimit:'3'});invalid.run('window.FasSellerUI.openEditor("draft-initial")');await invalid.publish();assert(!invalid.run('cars.some(c=>c.sellerOwnerId)'));assert(invalid.node('#seller-error').textContent.includes('повторных торгов'));
 console.log('PASS: opt-in bounded renewal, exact 1h–30d cycles, finite limits, no bid/sale replay, immutable planning and seller draft/publication/edit validation.');
})().catch(error=>{console.error(error);process.exitCode=1});
