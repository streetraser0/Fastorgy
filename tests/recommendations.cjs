const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const source=fs.readFileSync('dist/recommendations.js','utf8'),taxonomy=fs.readFileSync('dist/category-tree.js','utf8'),KEY='fas-recommendations-v1',DAY=86400000;
function boot(options={}){
 let time=Date.UTC(2026,10,13,12),writes=0,blocked=!!options.blocked,dateConstructions=0;
 const records={...(options.records||{})};
 class Clock extends Date{constructor(...args){super(...(args.length?args:[time]));dateConstructions++}static now(){return time}}
 const context=vm.createContext({Date:Clock,console,localStorage:{getItem(key){if(blocked)throw Error('blocked');return records[key]??null},setItem(key,value){if(blocked)throw Error('quota');records[key]=value;writes++}}});
 context.window=context;vm.runInContext(taxonomy,context);vm.runInContext(source,context);
 return {api:context.FasRecommendations,context,records,writes:()=>writes,dateConstructions:()=>dateConstructions,advance:days=>{time+=days*DAY},time:()=>time,block:()=>{blocked=true}};
}
const lot=(id,fields={})=>({id,category:'cars',subcategory:'cars',brand:'Toyota',model:'RAV4',year:2021,price:2400000,...fields});
const ids=session=>session.ids?Array.from(session.ids):null;
const stored=h=>JSON.parse(h.records[KEY]);

{
 const h=boot(),input=[lot(3),lot(1),lot(2)],before=input.slice();
 assert.equal(h.api.getMode(),'for-you');assert.equal(h.api.summary().localOnly,true);
 assert.equal(h.api.beginSession(input,new Set()).reason,'cold');
 assert.deepEqual(Array.from(h.api.select(input)),before,'cold start retains the complete caller order');
 assert.deepEqual(input,before,'inputs are not mutated');
 assert.equal(h.api.record(lot(1),'invalid'),false);
 assert.equal(h.api.record(null,'open'),false);
 for(const id of [0,-1,NaN,Infinity,'1',1.1,Number.MAX_SAFE_INTEGER+1])assert.equal(h.api.record(lot(id),'favorite'),false);
 assert.equal(h.api.beginSession(null).ids,null);assert.deepEqual(Array.from(h.api.select(null)),[]);
}
{
 const h=boot(),favorite=lot(1),nearDifferent=lot(2,{category:'property',subcategory:'property',brand:'',model:'',year:null,price:9000000}),nearCar=lot(3,{brand:'Kia',model:'Sportage',price:2000000}),farAnalog=lot(4,{price:90000000}),input=Object.freeze([nearDifferent,nearCar,farAnalog,favorite]);
 h.api.record(favorite,'favorite');
 const session=h.api.beginSession(input,new Set([1]));
 assert.equal(session.personalized,true);assert.deepEqual(ids(session),[3,4,1],'plausible cross-brand cars and exact models across prices remain eligible');
 const selected=h.api.select(input);assert.deepEqual(Array.from(selected,x=>x.id),[3,4,1],'the engine never sorts similar lots ahead of nearer input lots');assert.strictEqual(selected[0],nearCar);
 h.api.record(nearDifferent,'favorite');
 assert.deepEqual(ids(session),[3,4,1],'later interests cannot mutate an active session');
 const next=h.api.beginSession(input);assert.deepEqual(ids(next),[2,3,4,1]);assert.notStrictEqual(next.ids,session.ids);
 const noMatch=h.api.beginSession([lot(9,{category:'vessels',subcategory:'vessels',brand:'Yamaha',model:'Sea',year:1990,price:20000})]);
 assert.equal(noMatch.reason,'no-match');assert.equal(noMatch.ids,null,'a new region without suitable lots remains browseable');
}
{
 const h=boot(),car=lot(1),computer=lot(2,{category:'other',subcategory:'computers',brand:'Apple',model:'MacBook',manufacturer:'Apple',price:100000});
 h.api.record(car,'favorite');h.api.record(computer,'open');
 const candidates=[lot(3),lot(4,{...computer,id:4,brand:'Lenovo',model:'ThinkPad',manufacturer:'Lenovo'})];
 assert.deepEqual(ids(h.api.beginSession(candidates)),[3],'a weak one-off detail open does not outweigh a saved category');
 const writes=h.writes();for(let i=0;i<100;i++)h.api.record(computer,'open');
 assert.equal(h.writes(),writes,'repeated opening the same card does not write or accumulate scores');
 assert.equal(stored(h).signals.find(x=>x.lot.id===2).opens,1);
 h.advance(1);h.api.record(computer,'open');h.advance(1);h.api.record(computer,'open');h.advance(1);h.api.record(computer,'open');
 assert.equal(stored(h).signals.find(x=>x.lot.id===2).opens,3,'daily repeated opens have a hard contribution cap');
 assert.deepEqual(ids(h.api.beginSession(candidates)),[3,4],'sustained interest can add a second category');
}
{
 const h=boot(),favorite=lot(1),opened=lot(2,{category:'other',subcategory:'phones',brand:'Samsung',model:'Galaxy'});
 h.api.record(favorite,'favorite');h.api.record(opened,'open');h.api.record(opened,'favorite');
 assert.equal(h.api.summary().favoriteCount,2);
 h.api.record(opened,'unfavorite');assert.equal(h.api.summary().favoriteCount,1);assert.equal(h.api.summary().openCount,1);
 assert(stored(h).signals.some(x=>x.lot.id===2&&x.opens===1&&!x.favoriteAt),'unfavorite removes only the favorite contribution');
 h.api.record(favorite,'unfavorite');assert.equal(h.api.summary().signalCount,1);
 h.api.record(opened,'unfavorite');assert.equal(h.api.summary().signalCount,1,'repeated unfavorite is harmless');
 h.api.setMode('all');assert.equal(h.api.record(lot(3),'open'),false);assert.equal(h.api.beginSession([favorite]).reason,'all');
 assert.equal(h.api.setMode('bad'),false);assert.equal(h.api.getMode(),'all');
 const reload=boot({records:h.records});assert.equal(reload.api.getMode(),'all');
 reload.api.setMode('for-you');reload.api.record(lot(4),'favorite');reload.api.setMode('all');reload.api.record(lot(4),'unfavorite');reload.api.setMode('for-you');
 assert.equal(reload.api.summary().favoriteCount,0,'removing a favorite while viewing all lots cannot resurrect it later');
}
{
 const h=boot(),input=[lot(1),lot(2,{category:'other',subcategory:'phones',brand:'Apple',model:'iPhone'})];
 h.api.select(input);assert.equal(h.api.summary().seeded,false,'early featured reads do not consume old-favorite import');
 const seeded=h.api.beginSession(input,new Set([1]));assert.equal(seeded.personalized,true);assert.equal(h.api.summary().favoriteCount,1);
 const writes=h.writes();h.api.beginSession(input,new Set([2]));assert.equal(h.api.summary().favoriteCount,1);assert.equal(h.writes(),writes,'the favorite migration runs once');
 assert.deepEqual(ids(h.api.beginSession(input,new Set([1,2]))),[1],'passing favorites after migration cannot silently relearn them');
 h.api.record(input[1],'favorite');assert.deepEqual(ids(h.api.beginSession(input,new Set([1,2]))),[1,2],'recorded favorites remain eligible');
 const revision=h.api.summary().revision;h.api.clear();assert(h.api.summary().revision>revision);assert.equal(h.api.summary().signalCount,0);
 assert.equal(h.api.beginSession(input,new Set([1,2])).reason,'cold','clearing interests prevents immediate favorite reseeding');
 const saved=stored(h);assert.equal(saved.seeded,true);assert.deepEqual(saved.signals,[]);
 const reload=boot({records:h.records});assert.equal(reload.api.beginSession(input,new Set([1])).reason,'cold');
 reload.api.record(input[1],'open');assert.deepEqual(ids(reload.api.beginSession(input,new Set([1,2]))),[2],'after reset a new unrelated interest does not reintroduce old saved lots');
}
{
 const h=boot(),privateLot=lot(1,{name:'Secret title',description:'private description',vin:'WVWZZZ12345678901',phone:'+79991234567',email:'private@example.com',lat:51.123456,lon:39.123456,coordinates:{lat:51,lon:39},sellerOwnerId:'owner',brand:'ＴＯＹＯＴＡ',manufacturer:'<script>Brand</script>'});
 h.api.record(privateLot,'favorite');
 const saved=stored(h).signals[0].lot;
 assert.deepEqual(Object.keys(saved).sort(),['id','category','subcategory','make','model','manufacturer','year','price'].sort());
 assert.equal(saved.make,'toyota');assert.equal(saved.manufacturer,'script brand script');
 for(const secret of ['Secret title','private description','WVWZZZ','79991234567','private@example','51.123456','39.123456','sellerOwnerId'])assert(!h.records[KEY].includes(secret),'only approved preference fields may reach storage');
 const before=h.api.summary().revision;h.api.record(privateLot,'favorite');assert.equal(h.api.summary().revision,before,'saving an already saved lot cannot boost it');
 assert.equal(boot({records:h.records}).api.summary().favoriteCount,1);
}
{
 for(const raw of ['{broken','null','[]','42',JSON.stringify({version:2,signals:[]}),JSON.stringify({version:1,signals:{}}),'x'.repeat(300000)]){
  const h=boot({records:{[KEY]:raw}});assert.equal(h.api.summary().signalCount,0);assert.equal(h.api.beginSession([lot(1)]).ids,null);assert.equal(h.api.record(lot(1),'favorite'),true);
 }
 const template=boot(),time=template.time(),entries=[
  {lot:lot(1),opens:999,openedAt:time,favoriteAt:time},
  {lot:lot(2),opens:1,openedAt:time-91*DAY,favoriteAt:0},
  {lot:lot(3),opens:1,openedAt:time+DAY,favoriteAt:0},
  {lot:lot(4),opens:'3',openedAt:time,favoriteAt:'yesterday'},
  {lot:lot(5),opens:2,openedAt:time,favoriteAt:time-91*DAY},
  {lot:lot(0),opens:1,openedAt:time,favoriteAt:time},null,
  {lot:lot(1,{brand:'Older'}),opens:1,openedAt:time-DAY,favoriteAt:0}
 ];
 const h=boot({records:{[KEY]:JSON.stringify({version:1,mode:'bogus',seeded:true,signals:entries})}});
 assert.equal(h.api.summary().signalCount,2);assert.equal(h.api.summary().favoriteCount,1);assert.equal(h.api.getMode(),'for-you');
 assert.equal(stored(h).signals.length,2,'expired and invalid loaded records are removed from disk immediately');
 h.api.record(lot(6),'favorite');assert.equal(stored(h).signals.find(x=>x.lot.id===1).opens,3,'tampered counters cannot exceed the cap');
 assert.equal(stored(h).signals.find(x=>x.lot.id===5).favoriteAt,0,'expired favorite weights are dropped independently');
 h.advance(91);assert.equal(h.api.summary().signalCount,0);assert.equal(h.api.beginSession([lot(1)]).reason,'cold');
 const staleReload=boot({records:{[KEY]:JSON.stringify({version:1,seeded:true,signals:[{lot:lot(1),opens:1,openedAt:time-91*DAY,favoriteAt:time-91*DAY}]})}});
 assert.deepEqual(stored(staleReload).signals,[],'returning visitors do not retain expired raw preference history');
}
{
 const h=boot({blocked:true});assert.equal(h.api.summary().storageAvailable,false);
 assert.equal(h.api.record(lot(1),'favorite'),true);assert.equal(h.api.summary().favoriteCount,1);assert.equal(h.api.beginSession([lot(2)]).personalized,true);
 h.api.clear();assert.equal(h.api.summary().signalCount,0,'clearing remains effective when persistence is unavailable');
 const quota=boot();quota.api.record(lot(1),'favorite');quota.block();quota.api.record(lot(2,{category:'property',subcategory:'houses',brand:'',model:''}),'favorite');
 assert.equal(quota.api.summary().storageAvailable,false);assert.equal(quota.api.summary().favoriteCount,2,'a quota failure retains the latest in-memory interests');
}
{
 const h=boot();for(let id=1;id<=300;id++){h.advance(.00001);h.api.record(lot(id),'open')}
 assert.equal(h.api.summary().signalCount,128);assert.equal(stored(h).signals.length,128);assert(!stored(h).signals.some(x=>x.lot.id===1));
 const seeds=Array.from({length:300},(_,i)=>lot(i+1)),old=boot();old.api.beginSession(seeds,new Set(seeds.map(x=>x.id)));assert.equal(old.api.summary().signalCount,128,'bulk favorite migration is bounded too');
 const missing=boot();missing.api.record({id:1,brand:'Caterpillar',model:'D6'},'favorite');
 assert.deepEqual(ids(missing.api.beginSession([{id:2,brand:'Caterpillar',model:'D8'},{id:3},{id:4,category:'cars',brand:'Toyota'}])),[2],'brand similarities work without a category, missing fields do not default to cars');
 const mixed=boot();mixed.api.record(lot(1,{category:'other',subcategory:'furniture',brand:'',model:''}),'favorite');
 assert.deepEqual(ids(mixed.api.beginSession([lot(2,{category:'other',subcategory:'computers',brand:'',model:''}),lot(3,{category:'other',subcategory:'furniture',brand:'',model:''})])),[3],'the legacy mixed category does not link furniture with electronics');
 const broad=boot();broad.api.record({id:1,category:'home_garden'},'favorite');
 assert.deepEqual(ids(broad.api.beginSession([{id:2,category:'other',subcategory:'furniture'},{id:3,category:'other',subcategory:'computers'}])),[2],'explicit broad categories include their actual taxonomy children');
 const duplicate=missing.api.beginSession([{id:2,brand:'Caterpillar'},{id:2,brand:'Caterpillar'},null,{id:'2',brand:'Caterpillar'}]);assert.deepEqual(ids(duplicate),[2]);
}
{
 const h=boot();h.api.record(lot(1,{brand:'Porsche',model:'911',year:2023,price:18000000}),'favorite');
 const candidates=[
  lot(2,{brand:'Mercedes-Benz',model:'AMG GT',year:2022,price:14000000}),
  lot(3,{brand:'Lada',model:'2101',year:1975,price:120000}),
  lot(4,{brand:'Ferrari',model:'Roma',year:2023,price:24000000}),
  lot(5,{brand:'Porsche',model:'911',year:1980,price:4000000}),
  lot(6,{brand:'Toyota',model:'Corolla',year:2023,price:1200000})
 ];
 assert.deepEqual(ids(h.api.beginSession(candidates)),[2,4,5],'detailed preferences select credible price/year analogues across brands and exact-model variants');
 assert.equal(h.api.beginSession([candidates[1],candidates[4]]).reason,'no-match','absence of plausible analogues falls back to the complete local inventory');
 const broad=boot();broad.api.record({id:1,category:'cars',subcategory:'cars'},'favorite');
 assert.deepEqual(ids(broad.api.beginSession(candidates)),[2,3,4,5,6],'category-only signals never invent a hard budget or year constraint');
 const cold=boot();let reads=0;const unread=new Proxy(lot(1),{get(target,key){reads++;return target[key]}});
 cold.api.beginSession(Array(52785).fill(unread),new Set());assert.equal(reads,0,'cold start with no saved favorites does not normalize or walk inventory objects');
}
{
 const h=boot();vm.runInContext('globalThis.normalizationCalls=0;const originalNormalize=String.prototype.normalize;String.prototype.normalize=function(...args){normalizationCalls++;return originalNormalize.apply(this,args)}',h.context);
 h.api.record(lot(1,{brand:'Repeat',model:'Shared',manufacturer:'Factory'}),'favorite');h.api.beginSession([]);
 vm.runInContext('normalizationCalls=0',h.context);
 const repeated=Array.from({length:10000},(_,i)=>lot(i+10,{brand:'Repeat',model:'Shared',manufacturer:'Factory'})),dates=h.dateConstructions();
 assert.equal(h.api.beginSession(repeated).count,10000);assert.equal(h.context.normalizationCalls,0,'shared catalog strings reuse their normalized values');
 assert.equal(h.dateConstructions(),dates,'warming a whole catalog does not allocate one Date per descriptor');
 const unique=Array.from({length:1600},(_,i)=>lot(i+20000,{brand:'brand-'+i,model:'Shared',manufacturer:'Factory'}));h.api.beginSession(unique);
 h.api.beginSession([unique.at(-1)]);let calls=h.context.normalizationCalls;h.api.beginSession([unique.at(-1)]);assert.equal(h.context.normalizationCalls,calls,'recent cached keys remain reusable');
 h.api.beginSession([unique[0]]);assert(h.context.normalizationCalls>calls,'the bounded cache evicts old keys instead of retaining every catalog string');
 const huge=lot(99000,{brand:'A'.repeat(1000),model:'Shared',manufacturer:'Factory'});h.api.beginSession([huge]);calls=h.context.normalizationCalls;h.api.beginSession([huge]);
 assert(h.context.normalizationCalls>calls,'oversized raw strings are sanitized without being retained as cache keys');
 const unrelated={id:99999,category:'property',subcategory:'houses',brand:'Unrelated',model:'',manufacturer:'',get year(){throw Error('unnecessary year read')},get price(){throw Error('unnecessary price read')}};
 assert.deepEqual(ids(h.api.beginSession([unrelated,lot(2,{brand:'Repeat',model:'Shared',manufacturer:'Factory'})])),[2],'unrelated anchors are rejected before money/year work');
 const editedFavorite={id:1,category:'property',subcategory:'houses',brand:'Changed',model:'Changed',get year(){throw Error('favorite must bypass descriptor work')}};
 assert.deepEqual(ids(h.api.beginSession([editedFavorite,unrelated])),[1],'a favorite remains eligible after its category or brand changes');
 const sparse=boot();sparse.api.record({id:1},'favorite');assert.deepEqual(ids(sparse.api.beginSession([{id:1},lot(2)])),[1],'an ID-only favorite bypasses early anchor rejection');
}
{
 const h=boot();for(let id=1;id<=128;id++)h.api.record(lot(id),'favorite');
 let reads=0;const input=Array.from({length:52785},(_,i)=>{const value=lot(i+1000);return new Proxy(value,{get(target,key){reads++;return target[key]}})});
 const result=h.api.beginSession(input,new Set());assert.equal(result.count,input.length);assert(reads<input.length*20,'large inventories use bounded descriptor reads, independent of profile size');
 const revision=h.api.summary().revision;h.api.beginSession(input);assert.equal(h.api.summary().revision,revision,'reading a session does not update learned interests');
 const api=h.api;vm.runInContext(source,h.context);assert.strictEqual(h.context.FasRecommendations,api,'duplicate script loading cannot replace the profile');
}
console.log('PASS: local bounded interests, one-time favorites, weighted analogues, strict input order, immutable sessions, clear/modes, privacy allowlist, malformed/expired/quota storage, missing categories, duplicates and 52k bounded reads.');
