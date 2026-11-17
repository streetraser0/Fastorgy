'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Q=require('../../dist/listing-quotas.js'),{createListingQuotaCoordinator}=require('./adapter.cjs');
const NOW=Date.parse('2026-11-14T12:00:00.000Z'),iso=time=>new Date(time).toISOString(),clone=value=>JSON.parse(JSON.stringify(value));
const alice={kind:'private',id:'alice'},bob={kind:'private',id:'bob'},org={kind:'organization',id:'bank-a'};
const count=(cars=0,real_estate=0,ready_business=0,uncapped=0)=>({cars,real_estate,ready_business,uncapped,total:cars+real_estate+ready_business+uncapped});
const lot=(id,categoryId='cars',status='live',scope=alice,extra={})=>({id,scope,categoryId,status,revision:0,acceptedBidCount:0,startsAt:iso(NOW-3600000),endsAt:iso(NOW+3600000),protectedEndsAt:iso(NOW+3600000),...extra});
const cap=(cars,real_estate=2,ready_business=1,total=null)=>({cars,real_estate,ready_business,uncapped:null,total});
const entitlement=(scope,limits,extra={})=>({version:1,scope,plan:scope.kind==='private'?'standard':'partner',revision:4,validFrom:iso(NOW-3600000),validUntil:iso(NOW+3600000),limits,...extra});
const free=Q.resolvePolicy(null,alice,NOW);
function decision(before,next,currentUsage,policy=free,now=NOW){return Q.decide({before,next,currentUsage,policy,now})}
function rejectCode(fn,code){assert.throws(fn,error=>error instanceof Q.QuotaError&&error.code===code)}
async function rejectAsync(promise,code){await assert.rejects(promise,error=>error instanceof Q.QuotaError&&error.code===code)}

// Taxonomy drift fails loudly: a new/unknown category must not silently bypass a cap.
const taxonomy={};taxonomy.window=taxonomy;vm.runInNewContext(fs.readFileSync(require.resolve('../../dist/category-tree.js'),'utf8'),taxonomy);
assert.deepEqual([...Q.LEAVES].sort(),Array.from(taxonomy.FasCategories.leaves(),value=>String(value.id)).sort());
for(const category of ['property','houses','land','garages','commercial'])assert.equal(Q.bucketFor(category),'real_estate');
assert.equal(Q.bucketFor('cars'),'cars');assert.equal(Q.bucketFor('ready_business'),'ready_business');
for(const category of ['equipment','machinery','phones','home_appliances','trucks','tools'])assert.equal(Q.bucketFor(category),'uncapped');
for(const category of ['business','transport','fake','work'])rejectCode(()=>Q.bucketFor(category),'invalid-category');
assert.deepEqual(free.limits,{cars:3,real_estate:2,ready_business:1,uncapped:null,total:null});
assert.equal(decision(lot('fourth','cars','draft'),lot('fourth','cars','live',alice,{revision:1}),count(3)).allowed,false);
assert.equal(decision(lot('third-property','land','draft'),lot('third-property','land','scheduled',alice,{revision:1,startsAt:iso(NOW+60000)}),count(0,2)).bucket,'real_estate');
assert.equal(decision(lot('second-business','ready_business','draft'),lot('second-business','ready_business','live',alice,{revision:1}),count(0,0,1)).allowed,false);
assert.equal(decision(lot('machine','equipment','draft'),lot('machine','equipment','live',alice,{revision:1}),count(3,2,1,20000)).allowed,true);
assert.equal(decision(lot('draft','cars','draft'),lot('draft','cars','draft',alice,{revision:1}),count(3)).allowed,true);

const scheduled=lot('scheduled','cars','scheduled',alice,{startsAt:iso(NOW+60000)});assert.equal(Q.occupied(scheduled,NOW),true);
const paused=lot('paused','cars','paused');assert.equal(Q.occupied(paused,NOW),false);
assert.equal(decision(paused,{...paused,status:'live',revision:1},count(3)).allowed,false,'resume reserves again');
assert.equal(decision(lot('pause'),lot('pause','cars','paused',alice,{revision:1}),count(3)).usage.cars,2);
const bid=lot('bid','cars','live',alice,{acceptedBidCount:1});
for(const badClock of [undefined,NaN,Infinity,0])rejectCode(()=>Q.assertTransition(bid,{...bid,status:'paused',revision:1},badClock),'invalid-clock');
for(const status of ['paused','cancelled','archived','ended'])rejectCode(()=>decision(bid,{...bid,status,revision:1},count(3)),'auction-withdrawal-locked');
assert.equal(Q.occupied({...bid,status:'paused'},NOW),true,'inconsistent paused rows with bids still consume capacity');
rejectCode(()=>Q.occupied({...bid,status:'draft'},NOW),'invalid-listing');
rejectCode(()=>Q.occupied({...bid,protectedEndsAt:null},NOW),'invalid-auction-time');
rejectCode(()=>Q.occupied({...scheduled,startsAt:scheduled.endsAt},NOW),'invalid-auction-time');
rejectCode(()=>decision(bid,{...bid,categoryId:'equipment',revision:1},count(3)),'auction-category-locked');
rejectCode(()=>decision(bid,{...bid,revision:1,endsAt:iso(NOW+1000),protectedEndsAt:iso(NOW+1000)},count(3)),'auction-deadline-locked');
const extended={...bid,protectedEndsAt:iso(NOW+7200000)};assert.equal(Q.occupied(extended,NOW+3600001),true);
assert.equal(Q.occupied(bid,NOW+3600000),false,'protected deadline, including equality, releases an expired reservation');

const paid=Q.resolvePolicy(entitlement(alice,cap(10,10,3)),alice,NOW);assert.equal(paid.limits.cars,10);
rejectCode(()=>Q.resolvePolicy(entitlement(alice,cap(2)),alice,NOW),'private-plan-must-not-reduce-free-limits');
rejectCode(()=>Q.resolvePolicy(entitlement(alice,cap(3)),alice,NOW),'paid-increase-not-configured');
rejectCode(()=>Q.resolvePolicy(entitlement(alice,cap(5,3,2,100)),alice,NOW),'private-plan-must-not-reduce-free-limits');
const expired=Q.resolvePolicy(entitlement(alice,cap(10),{validUntil:iso(NOW)}),alice,NOW);assert.equal(expired.plan,'free');
assert.equal(decision(lot('grandfather'),lot('grandfather','cars','live',alice,{revision:1}),count(10),expired).allowed,true,'downgrade does not cancel or block a no-delta edit');
assert.equal(decision(lot('new','cars','draft'),lot('new','cars','live',alice,{revision:1}),count(10),expired).allowed,false);
assert.equal(decision(lot('move','cars'),lot('move','houses','live',alice,{revision:1}),count(3,2)).bucket,'real_estate','category migration needs capacity in its target');
rejectCode(()=>decision(lot('bad'),lot('bad','cars','paused',alice,{revision:1}),count(0)),'usage-integrity-conflict');
rejectCode(()=>Q.resolvePolicy(null,org,NOW),'organization-terms-required');
const partner=Q.resolvePolicy(entitlement(org,cap(null,null,null,1000)),org,NOW);assert.equal(partner.limits.total,1000);
assert.equal(decision(lot('org-new','equipment','draft',org),lot('org-new','equipment','live',org,{revision:1}),count(0,0,0,1000),partner).bucket,'total');
rejectCode(()=>Q.resolvePolicy(entitlement(bob,cap(9)),alice,NOW),'invalid-entitlement');
rejectCode(()=>decision(lot('transfer'),lot('transfer','cars','live',bob,{revision:1}),count(1)),'scope-transfer-not-supported');
const browser={window:{},Date,Number,Object,Array,Set,Map};vm.runInNewContext(fs.readFileSync(require.resolve('../../dist/listing-quotas.js'),'utf8'),browser);assert.strictEqual(browser.FasListingQuotas,browser.window.FasListingQuotas,'shared policy exports to both a browser window and its containing VM global');

// Test-only reference repository: scope serialization + copy-on-commit rollback.
// Production must provide this contract with a real DB transaction, not a mutex.
function fixture({scope=alice,principal='alice',limits=null,listings=[]}={}){
 let time=NOW,authorizeCalls=0,commits=0,gate=null;
 const states=new Map(),queues=new Map(),key=value=>value.kind+':'+value.id;
 const ensure=owner=>{const id=key(owner);if(!states.has(id))states.set(id,{listings:{},prepared:{},commands:{},usageRevision:0,entitlement:null});return states.get(id)};
 const state=ensure(scope);for(const value of listings)ensure(value.scope).listings[value.id]=clone(value);state.entitlement=limits;
 const repository={async withQuotaTransaction(owner,run){
  const tag=key(owner),previous=queues.get(tag)||Promise.resolve();let release;const lock=new Promise(resolve=>{release=resolve});queues.set(tag,previous.catch(()=>{}).then(()=>lock));await previous.catch(()=>{});
  const working=clone(ensure(owner));
  try{
   if(gate)await gate();
   const tx={
    async claimCommand(input){const commandKey=input.principalId+':'+input.idempotencyKey;const stored=working.commands[commandKey];if(stored)return clone(stored);working.commands[commandKey]={status:'new',...clone(input)};return clone(working.commands[commandKey])},
    async getListing(id){if(working.listings[id])return clone(working.listings[id]);for(const other of states.values())if(other.listings[id])return clone(other.listings[id]);return null},
    async getPreparedChange(input){return clone(working.prepared[input.preparedChangeId]??null)},
    async validateAuctionChange(){return true},
    async getEntitlement(){return clone(working.entitlement)},
    async getUsage(_owner,now){const counts=count();for(const value of Object.values(working.listings))if(Q.occupied(value,now)){counts[Q.bucketFor(value.categoryId)]++;counts.total++}return {revision:working.usageRevision,counts}},
    async commitChange(input){assert.equal(working.listings[input.before.id].revision,input.expectedListingRevision);assert.equal(working.usageRevision,input.expectedUsageRevision);working.listings[input.next.id]=clone(input.next);working.usageRevision++;commits++;return {listingRevision:input.next.revision,usageRevision:working.usageRevision}},
    async completeCommand(input){working.commands[input.principalId+':'+input.idempotencyKey]={status:'complete',...clone(input)};return true}
   };
   const result=await run(tx);states.set(tag,working);return result;
  }finally{release()}
 }};
 const authorize=async context=>{authorizeCalls++;return context?.deny?{allowed:false}:{allowed:true,principalId:context?.principal||principal,scope:context?.scope||scope}};
 const service=createListingQuotaCoordinator({configuration:{state:'ready',reviewReference:'test-only-review'},authorize,repository,clock:()=>time});
 function prepare(id,category='cars',nextStatus='live',context={}){
  const owner=context.scope||scope,user=context.principal||principal,st=ensure(owner);if(!st.listings[id])st.listings[id]=lot(id,category,'draft',owner);
  const before=st.listings[id],change='prepared-'+id+'-'+before.revision;st.prepared[change]={principalId:user,scope:owner,listingId:id,expectedListingRevision:before.revision,expiresAt:iso(NOW+300000),next:{...clone(before),categoryId:category,status:nextStatus,revision:before.revision+1}};
  return {version:1,idempotencyKey:'request-key-'+id+'-'+before.revision,listingId:id,expectedListingRevision:before.revision,preparedChangeId:change};
 }
 return {service,repository,authorize,prepare,ensure,states,scope,clock:()=>time,setTime:value=>{time=value},setGate:value=>{gate=value},commits:()=>commits,authCalls:()=>authorizeCalls};
}

(async()=>{
 let touched=false;const disabled=createListingQuotaCoordinator({authorize:()=>{touched=true}});await rejectAsync(disabled.apply({}),'integration-disabled');assert.equal(touched,false);
 const f=fixture(),requests=Array.from({length:12},(_,index)=>f.prepare('concurrent-'+index));
 const results=await Promise.allSettled(requests.map(request=>f.service.apply(request,{})));
 assert.equal(results.filter(row=>row.status==='fulfilled').length,3,'concurrent publication cannot exceed the last three private slots');
 assert(results.filter(row=>row.status==='rejected').every(row=>row.reason.code==='quota-exceeded'));assert.equal(f.commits(),3);
 assert.equal(Object.values(f.ensure(alice).listings).filter(value=>Q.occupied(value,NOW)).length,3);
 const replay=fixture(),once=replay.prepare('once'),pair=await Promise.all([replay.service.apply(once,{}),replay.service.apply({...once},{})]);assert.deepEqual(pair[0],pair[1]);assert.equal(replay.commits(),1,'accepted replay does not reserve twice');
 await rejectAsync(replay.service.apply({...once,preparedChangeId:'another-prepared'},{}),'command-conflict');
 const editor=fixture({listings:[lot('own')]});const edit=editor.prepare('own');const first=await editor.service.apply(edit,{});assert.equal(first.usage.cars,1,'editing the current listing subtracts its own reservation');
 await rejectAsync(editor.service.apply({...editor.prepare('own'),plan:'premium'},{}),'invalid-command');
 await rejectAsync(editor.service.apply(editor.prepare('own'),{deny:true}),'forbidden');
 const stranger=fixture({listings:[lot('foreign','cars','draft',bob)]});
 await rejectAsync(stranger.service.apply({version:1,idempotencyKey:'foreign-request-1',listingId:'foreign',expectedListingRevision:0,preparedChangeId:'none'},{}),'forbidden');
 const forged=fixture(),forgedCommand=forged.prepare('forged');forged.ensure(alice).prepared[forgedCommand.preparedChangeId].principalId='bob';await rejectAsync(forged.service.apply(forgedCommand,{}),'prepared-change-unavailable');
 const stale=fixture(),staleCommand=stale.prepare('expired-change');stale.ensure(alice).prepared[staleCommand.preparedChangeId].expiresAt=iso(NOW);await rejectAsync(stale.service.apply(staleCommand,{}),'prepared-change-unavailable');
 const orgFixture=fixture({scope:org,principal:'employee-one',limits:entitlement(org,cap(null,null,null,1))});const a=orgFixture.prepare('org-a','equipment','live',{principal:'employee-one'}),b=orgFixture.prepare('org-b','equipment','live',{principal:'employee-two'});
 const organization=await Promise.allSettled([orgFixture.service.apply(a,{principal:'employee-one'}),orgFixture.service.apply(b,{principal:'employee-two'})]);assert.equal(organization.filter(row=>row.status==='fulfilled').length,1,'organization capacity is shared by employees, not one allowance each');
 const delayed=fixture({limits:entitlement(alice,cap(10),{validUntil:iso(NOW+1000)}),listings:Array.from({length:3},(_,i)=>lot('existing-'+i))});const delayedCommand=delayed.prepare('waited');let resume;const wait=new Promise(resolve=>{resume=resolve});delayed.setGate(()=>wait);const queued=delayed.service.apply(delayedCommand,{});await Promise.resolve();delayed.setTime(NOW+2000);resume();await rejectAsync(queued,'quota-exceeded');
 const broken=createListingQuotaCoordinator({configuration:{state:'ready',reviewReference:'test'},authorize:async()=>({allowed:true,principalId:'alice',scope:alice}),repository:{async withQuotaTransaction(){throw Error('dsn://PRIVATE-secret')}}});await rejectAsync(broken.apply(once,{}),'repository-unavailable');
 const authBroken=createListingQuotaCoordinator({configuration:{state:'ready',reviewReference:'test'},authorize:async()=>{throw Error('TOKEN-secret')},repository:replay.repository});await rejectAsync(authBroken.apply(once,{}),'authorization-unavailable');
 console.log('PASS: approved free category caps, scheduled reservations, protected auctions, downgrade grandfathering, atomic concurrent/idempotent publication, organization sharing, prepared-change/owner boundaries and safe failures. Test-only in-memory repository; no live billing or backend connection.');
})().catch(error=>{console.error(error);process.exitCode=1});
