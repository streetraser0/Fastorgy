const assert=require('assert/strict');
const {boot}=require('./helpers/category-seller-harness.cjs');
const now=Date.now();
const lot=(id,extra={})=>({id,name:'Повторные торги '+id,bank:'Тестовый банк',category:'cars',subcategory:'cars',city:'Воронеж',regionCode:'36',price:10000,start:10000,step:100,deposit:0,status:'live',bids:0,startsAt:new Date(now-3601000).toISOString(),ends:new Date(now-1000).toISOString(),autoRelist:true,relistDurationMinutes:60,relistLimit:3,demo:false,...extra});
function add(h,value){h.run('cars.push('+JSON.stringify(value)+');ends.push(Date.parse(cars.at(-1).ends))')}
{
 const h=boot(),value=lot(999801001);add(h,value);h.writes.length=0;
 let stateAtWrite;const originalSet=h.context.localStorage.setItem;
 h.context.localStorage.setItem=(key,text)=>{if(key==='fas-lots')stateAtWrite=h.run('cars.at(-1).ends');originalSet(key,text)};
 h.context.window.renewalNow=now;
 const ids=h.run('window.FasProcessAuctionRenewals(window.renewalNow)');
 assert.equal(JSON.stringify(ids),JSON.stringify([value.id]));
 assert.equal(stateAtWrite,value.ends,'the previous deadline remains authoritative until persistence succeeds');
 assert.deepEqual(h.writes,['fas-lots'],'automatic renewal does not rewrite favorites or bids');
 const renewed=h.run('cars.at(-1)');assert.equal(renewed.relistCount,1);assert.equal(Date.parse(renewed.startsAt),now);assert.equal(Date.parse(renewed.ends),now+3600000);
 assert.equal(renewed.price,value.price);assert.equal(renewed.start,value.start);
 assert.equal(h.run('ends.at(-1)'),Date.parse(renewed.ends));
 assert(h.run('visibleLots.some(c=>c.id==='+value.id+')'),'a renewed lot returns to the live catalog');
 assert.equal(JSON.parse(h.records['fas-lots']).find(c=>c.id===value.id).ends,renewed.ends);
 assert.equal(JSON.stringify(h.run('window.FasProcessAuctionRenewals(window.renewalNow)')),'[]','one expired round cannot restart twice');
}
{
 const h=boot({failLots:true}),value=lot(999801002);add(h,value);h.context.window.renewalNow=now;
 const before=h.records['fas-lots'];
 assert.equal(JSON.stringify(h.run('window.FasProcessAuctionRenewals(window.renewalNow)')),'[]');
 assert.equal(h.run('cars.at(-1).ends'),value.ends);assert.equal(h.run('cars.at(-1).relistCount'),undefined);
 assert.equal(h.run('ends.at(-1)'),Date.parse(value.ends));assert.equal(h.records['fas-lots'],before);
 assert(h.node('#toast').textContent.includes('не сохранены'));
 h.setFailLots(false);assert.equal(h.run('window.FasProcessAuctionRenewals(window.renewalNow).length'),1,'a later successful retry is allowed');
}
{
 const h=boot(),value=lot(999801003);add(h,value);h.context.window.renewalNow=now;h.context.document.hidden=true;
 assert.equal(h.run('window.FasProcessAuctionRenewals(window.renewalNow).length'),0);assert.equal(h.run('cars.at(-1).ends'),value.ends);
 h.context.document.hidden=false;h.run('bids[cars.at(-1).id]={price:11000,count:1}');
 assert.equal(h.run('window.FasProcessAuctionRenewals(window.renewalNow).length'),0,'even one recorded bid prevents renewal');
 assert.equal(h.run('bids[cars.at(-1).id].price'),11000,'renewal never clears bids');
}
{
 const h=boot(),value=lot(999801004,{demo:true});add(h,value);h.context.window.renewalNow=now;
 assert.equal(h.run('window.FasProcessAuctionRenewals(window.renewalNow).length'),1);
 const saved=JSON.parse(h.records['fas-lots']).find(c=>c.id===value.id);assert(saved,'renewal of a demo seed must survive reload');assert.equal(saved.demoEdited,true);assert.equal(saved.relistCount,1);
}
{
 const h=boot();h.run('openAdmin()');h.node('#role').value='manager';
 assert(h.node('#modal-content').innerHTML.includes('name="autoRelist"'));
 const fields={category:'cars',regionCode:'36',bank:'Тестовый банк',name:'Банковский лот с повтором',city:'Воронеж',price:'10000',step:'100',deposit:'0',ends:new Date(now+3600000).toISOString(),status:'live',autoRelist:'on',relistDurationMinutes:'59',relistLimit:'3',relistCount:'999',latitude:'51,67',longitude:'39,20',address:'Склад 1'};
 h.context.FormData=function(){return {get:key=>fields[key]??'',has:key=>Object.hasOwn(fields,key)}};
 const before=h.run('cars.length');h.node('#lot-form').onsubmit({preventDefault(){}});
 assert.equal(h.run('cars.length'),before);assert(h.node('#lot-error').textContent.includes('1 часа'));
 fields.relistDurationMinutes='60';h.node('#lot-form').onsubmit({preventDefault(){}});
 assert.equal(h.run('cars.length'),before+1);const created=h.run('cars.at(-1)');
 assert.equal(created.autoRelist,true);assert.equal(created.relistDurationMinutes,60);assert.equal(created.relistLimit,3);assert.equal(created.relistCount,undefined,'the browser form cannot forge internal repeat counters');
 assert.equal(created.latitude,51.67);assert.equal(created.longitude,39.2);assert.equal(created.address,'Склад 1');
}
console.log('PASS: bank renewal settings, durable write before state, failure/retry, hidden pages, bid preservation and reloadable demo rounds.');
