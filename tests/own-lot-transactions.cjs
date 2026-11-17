const assert=require('assert/strict');
const {boot}=require('./helpers/category-seller-harness.cjs');

(async()=>{
 const h=boot(),id=999871001,now=Date.now();
 const base={id,category:'cars',subcategory:'cars',name:'Тестовый автомобиль',bank:'Продавец',city:'Воронеж',regionCode:'36',sellerOwnerId:'another-seller',price:100000,start:100000,startPrice:100000,step:1000,stepValue:1000,stepMode:'fixed',deposit:0,status:'live',startsAt:new Date(now-3600000).toISOString(),ends:new Date(now+3600000).toISOString(),durationMinutes:120,bids:0};
 const reset=(overrides={})=>h.run('cars=cars.filter(lot=>lot.id!=='+id+');cars.push('+JSON.stringify({...base,...overrides})+');bids={};ends.splice(0,ends.length,...cars.map(lot=>Date.parse(lot.ends)))');
 const submit=price=>{h.node('#bid').value=price;h.node('#bid-form').onsubmit({preventDefault(){}})};
 const own=()=>h.run('cars.find(lot=>lot.id==='+id+').sellerOwnerId="seller-owner"');
 const record=()=>h.run('bids['+id+']');

 reset({sellerOwnerId:'seller-owner',buyNowPrice:200000});h.run('openCar('+id+')');
 assert(!h.node('#modal-content').innerHTML.includes('id="bid-form"'),'own lot has no bid form');
 assert(!h.node('#modal-content').innerHTML.includes('data-seller-buy-now'),'own lot has no private buy button');
 assert(!h.node('#modal-content').innerHTML.includes('data-open-lot-payment'),'own lot has no payment button');
 assert(!h.node('#modal-content').innerHTML.includes('ставка сохраняется'),'own lot does not suggest bidding');
 assert.equal(h.run('commitDemoBid(cars.at(-1),101000,cars.at(-1).ends)'),false);
 assert.equal(h.run('window.FasSellerUI.purchaseActions(cars.at(-1))'),'');
 assert(!h.run('window.FasSellerUI.details(cars.at(-1))').includes('data-seller-buy-now'));
 await h.click({sellerBuyNow:String(id)});await h.click({sellerConfirmBuy:String(id)});
 assert.equal(h.run('cars.at(-1).status'),'live','missing payments module cannot let a seller buy their own lot');
 assert.equal(record(),undefined);

 // The fallback confirmation must recheck ownership, including a changed listing.
 reset({buyNowPrice:200000});await h.click({sellerBuyNow:String(id)});
 assert(h.node('#modal-content').innerHTML.includes('data-seller-confirm-buy'));
 own();await h.click({sellerConfirmBuy:String(id)});
 assert.equal(h.run('cars.at(-1).status'),'live','stale confirmation cannot buy a lot now owned by this profile');
 reset({buyNowPrice:200000});await h.click({sellerBuyNow:String(id)});await h.click({sellerConfirmBuy:String(id)});
 assert.equal(h.run('cars.at(-1).status'),'sold','a different seller’s valid fallback purchase is preserved');
 const soldAt=h.run('cars.at(-1).soldAt');await h.click({sellerConfirmBuy:String(id)});
 assert.equal(h.run('cars.at(-1).soldAt'),soldAt,'repeat confirmation cannot resell the lot');

 // A delayed private-seller module must not remove the central ownership boundary.
 const sellerUI=h.context.window.FasSellerUI;
 reset({sellerOwnerId:'seller-owner'});h.context.window.FasSellerUI=undefined;
 h.run('window.paymentCalls=0;window.FasPayments={open(){window.paymentCalls++;return {ok:true}}}');
 assert.equal(h.run('openLotPayment('+id+')'),false);
 assert.equal(h.run('window.paymentCalls'),0);
 assert.equal(h.run('commitDemoBid(cars.at(-1),101000)'),false);
 h.run('openCar('+id+')');assert(!h.node('#modal-content').innerHTML.includes('id="bid-form"'));
 h.context.window.FasSellerUI=sellerUI;

 reset();h.run('openCar('+id+')');const oldSubmit=h.node('#bid-form').onsubmit;
 own();submit(101000);assert.equal(record(),undefined,'an ownership change while the form is open blocks bidding');
 assert(h.node('#bid-error').textContent.includes('собственный'));
 reset();h.run('openCar('+id+')');oldSubmit({preventDefault(){}});
 assert.equal(record(),undefined,'a replaced form invalidates its previous submit callback');
 submit(101000);assert.equal(record().price,101000,'ordinary private bid remains available');
 const count=record().count;submit(102000);assert.equal(record().count,count,'closed/committed form cannot submit twice');

 // Server-style quote replacements must be checked at submit, not captured on open.
 reset({sellerOwnerId:undefined});h.run('openCar('+id+')');
 assert.equal(h.run('window.FasApplyAuctionUpdate({lotId:'+id+',price:150000,actorOwn:false}).ok'),true);
 submit(101000);assert.equal(record(),undefined,'stale lower price must not be recorded');
 assert.equal(h.node('#bid').min,151000,'the form tells the buyer the new minimum');
 submit(151000);assert.equal(record().price,151000,'updated quote is usable without reopening');

 for(const replacement of [{status:'paused'},{status:'sold'},{status:'withdrawn'},{ends:new Date(now-1000).toISOString()},{startsAt:new Date(now+1800000).toISOString()},null]){
  reset({sellerOwnerId:undefined});h.run('openCar('+id+')');
  if(replacement)h.run('cars=cars.map(lot=>lot.id==='+id+'?{...lot,...'+JSON.stringify(replacement)+'}:lot)');
  else h.run('cars=cars.filter(lot=>lot.id!=='+id+')');
  submit(101000);assert.equal(record(),undefined,'changed status/deadline/deletion blocks a previously open form');
 }

 reset({sellerOwnerId:undefined});h.run('openCar('+id+')');
 const write=h.context.localStorage.setItem,beforeEnd=h.run('cars.at(-1).ends');
 h.context.localStorage.setItem=(key,value)=>{if(key==='fas-bids')throw Error('quota');write(key,value)};
 submit(101000);assert.equal(record(),undefined);assert.equal(h.run('cars.at(-1).ends'),beforeEnd);
 assert.equal(h.node('#modal').open,true);assert(h.node('#bid-error').textContent.includes('не сохранена'));
 h.context.localStorage.setItem=write;submit(101000);assert.equal(record().price,101000,'storage retry can succeed');
 console.log('PASS: own bid/purchase boundaries, missing-module ownership fallback, stale quote/status/ownership/forms, duplicate submission and truthful storage retry.');
})().catch(error=>{console.error(error);process.exitCode=1});
