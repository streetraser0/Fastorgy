const assert=require('assert/strict');
const {boot}=require('./helpers/category-seller-harness.cjs');

(async()=>{
 const h=boot();h.run('openAdmin()');
 const future=new Date(Date.now()+86400000).toISOString(),name='Импорт с посторонними служебными полями';
 const csv='category;bank;name;city;price;ends;demo;demoEdited;sellerOwnerId;ownerId;mediaRefs;status;id;constructor;__proto__;model;manufacturer\n'+
  'phones;Тестовый банк;'+name+';Воронеж;50000;'+future+';false;;forged-owner;forged-owner;idb:forged-media;live;42;polluted;polluted;Galaxy S24;Samsung';
 await h.node('#csv').onchange({target:{files:[{text:async()=>csv}]}});
 const lot=h.run('cars.at(-1)');
 assert.equal(lot.name,name,'valid public data should still import');
 assert.equal(lot.status,'draft','CSV may only create reviewable drafts');
 assert.notEqual(lot.id,42,'CSV cannot select an internal lot ID');
 assert(!lot.demo,'a text value "false" must not mark a real import as a demo seed');
 for(const key of ['sellerOwnerId','ownerId','mediaRefs','constructor','__proto__'])assert(!Object.hasOwn(lot,key),'CSV must not import internal field '+key);
 assert.equal(lot.model,'Galaxy S24');assert.equal(lot.manufacturer,'Samsung');
 assert(JSON.parse(h.records['fas-lots']).some(row=>row.id===lot.id),'successful import must persist rather than vanish on reload');
 assert(h.node('#modal-content').innerHTML.includes(name),'successful import must remain visible to the bank manager');

 const payload='<img src=x onerror=alert(1)>',escaped='&lt;img src=x onerror=alert(1)&gt;';
 for(const category of ['cars','trucks','machinery','equipment','property','commercial','vessels','other']){
  const text=h.run('lotSpecs('+JSON.stringify({category,year:payload,km:'123',engine:'Описание <svg onload=alert(2)>'})+')');
  assert(!text.includes(payload),'stored year must be escaped for '+category);
  assert(text.includes(escaped),'stored year should remain readable as text for '+category);
  assert(!text.includes('<svg'),'stored technical text must be escaped for '+category);
 }
 const normal=h.run('lotSpecs({category:"cars",year:2021,km:"45 000",engine:"2.0 л / Бензин"})');
 assert.equal(normal,'2021 · 45 000 км · 2.0 л / Бензин','safe specifications keep their familiar presentation');
 for(const invalid of [JSON.stringify(payload),'undefined','null','NaN','Infinity','({toLocaleString:"broken"})']){
  const formatted=h.run('money('+invalid+')');
  assert.equal(typeof formatted,'string','corrupt saved money must have a safe display value');
  assert(!formatted.includes('<'),'money formatting must never return executable markup');
 }
 assert.match(h.run('money(25000)'),/^25[\s\u00a0\u202f]000 ₽$/,'normal monetary amounts keep localized formatting');

 const now=Date.now();
 h.run('var securityLot='+JSON.stringify({id:999999001,name:'Лот для проверки цены',city:'Воронеж',category:'cars',price:10000,start:10000,step:100,deposit:0,sellerOwnerId:'other-seller',startsAt:new Date(now-3600000).toISOString(),ends:new Date(now+86400000).toISOString(),status:'live'})+';cars.push(securityLot)');
 for(const invalid of [JSON.stringify(payload),'"20000"','Infinity','NaN','0','-1','9007199254740992']){
  h.run('securityLot.buyNowPrice='+invalid);
  assert.equal(h.run('window.FasSellerUI.purchaseActions(securityLot)'),'','invalid stored purchase price cannot create an action');
  assert(!h.run('window.FasSellerUI.details(securityLot)').includes('data-seller-buy-now'),'invalid stored purchase price cannot create a details action');
  h.node('#modal-content').innerHTML='previous-view';
  await h.click({sellerBuyNow:'999999001'});
  assert.equal(h.node('#modal-content').innerHTML,'previous-view','invalid stored price cannot open a purchase confirmation');
  await h.click({sellerConfirmBuy:'999999001'});
  assert.equal(h.run('securityLot.status'),'live','invalid stored price cannot mark a lot sold');
 }
 h.run('securityLot.buyNowPrice=20000');
 assert(h.run('window.FasSellerUI.purchaseActions(securityLot)').includes('data-seller-buy-now="999999001"'),'valid numeric price keeps the purchase action');
 h.run('securityLot.deposit='+JSON.stringify(payload)+';securityLot.reservePrice='+JSON.stringify(payload)+';openCar(securityLot.id)');
 assert(!h.node('#modal-content').innerHTML.includes(payload),'corrupt saved deposit/reserve must not inject HTML into a purchase card');
 const stepPayload='1" autofocus onfocus="alert(3)';
 h.run('securityLot.step='+JSON.stringify(stepPayload)+';openCar(securityLot.id)');
 assert(!h.node('#modal-content').innerHTML.includes('onfocus="alert(3)'),'corrupt saved step must not break a purchase input attribute');

 const subId='saved" autofocus onfocus="alert(4)',sub=boot({records:{'fas-subscriptions':JSON.stringify([{id:subId,category:'',regionCode:'',maxPrice:null,active:false,knownIds:[],createdAt:new Date().toISOString(),search:{query:'BMW',category:'',regionCode:'',brand:'',city:'',budget:'',values:{}}}])}});
 sub.run('openSubscriptions()');
 const subscriptionHTML=sub.node('#modal-content').innerHTML,encodedId=sub.run('escapeText('+JSON.stringify(subId)+')');
 for(const attribute of ['data-apply-search','data-toggle-sub','data-delete-sub'])assert(subscriptionHTML.includes(attribute+'="'+encodedId+'"'),'stored subscription ID must stay inside '+attribute);
 assert(!subscriptionHTML.includes('onfocus="alert(4)'),'stored subscription ID cannot create an event attribute');
 console.log('PASS: CSV internal fields blocked, imports persist, saved text/money/subscription IDs render safely and invalid purchase prices cannot create actions or sell a lot.');
})().catch(error=>{console.error(error);process.exitCode=1});
