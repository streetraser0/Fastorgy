/* Current payment boundaries, not a claim of implemented escrow or real-money authorization. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {integration}=require('./helpers/category-multi-harness.cjs');
const root=path.resolve(__dirname,'..');
(async()=>{
 const source=fs.readFileSync(path.join(root,'worker/index.js'),'utf8');
 const worker=(await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).default;
 let dbWork=0;const DB={prepare(){dbWork++;throw Error('Unavailable financial routes must not touch D1')},batch(){dbWork++;throw Error('Unavailable financial routes must not touch D1')}};
 const routes=['/api/payments','/api/payments/init','/api/payments/webhook','/api/payments/refund','/api/transfers','/api/wallet','/api/wallet/topup','/api/escrow','/api/escrow/fund','/api/bids','/api/auctions/1042/cancel','/api/subscriptions/checkout'];
 for(const route of routes)for(const authenticated of [false,true])for(const method of ['GET','POST']){
  const headers={'Content-Type':'application/json',Origin:'https://fas.example',...(authenticated?{'oai-authenticated-user-id':'fixture-viewer'}:{})};
  const response=await worker.fetch(new Request('https://fas.example'+route,{method,headers,...(method==='POST'?{body:JSON.stringify({amount:100000,paid:true,funded:true,provider:'tbank'})}:{})}),{DB});
  assert.equal(response.status,404,method+' '+route+' is unavailable, not an invented transfer endpoint');assert.equal(dbWork,0);assert.equal(response.headers.get('Cache-Control'),'no-store, private');assert.equal(response.headers.get('Access-Control-Allow-Origin'),null);
 }
 const now=Date.now(),lot={id:999944001,name:'Контрольный Toyota Camry',category:'cars',subcategory:'cars',brand:'Toyota',bank:'Продавец',city:'Воронеж',regionCode:'36',price:100000,start:100000,step:1000,deposit:50000,status:'live',startsAt:new Date(now-3600000).toISOString(),ends:new Date(now+3600000).toISOString(),buyNowPrice:150000,demo:true,paid:true,escrowFunded:true};
 const h=integration({fixtures:[lot]});h.field('modal').appendChild(h.field('modal-content'));let financialRequests=0;const failFetch=()=>{financialRequests++;throw Error('Demonstration checkout cannot send financial requests')};h.context.fetch=failFetch;h.context.window.fetch=failFetch;
 vm.runInContext(fs.readFileSync(path.join(root,'dist/payment-ui.js'),'utf8'),h.context);h.run('openCar(999944001)');
 const form=h.field('bid-form'),bid=h.field('bid');bid.value='123000';h.field('modal').scrollTop=320;
 const before=JSON.stringify(h.records),beforeBids=h.run('JSON.stringify(bids)'),purchase=h.field('modal-content').querySelector('[data-open-lot-payment]');assert(purchase);
 // The adapter keeps original inline-main document listeners separately.
 h.dispatchClick({target:purchase,preventDefault(){}});const api=h.context.window.FasPayments,dialog=h.field('payment-dialog');assert(dialog.open);
 for(const method of ['card','sbp','digital','receipt']){
  const input=dialog.querySelector('input[value="'+method+'"]');input.value=method;dialog.dispatchEvent({type:'change',target:input});
  assert.equal(api.state().method,method);assert.equal(api.state().canPay,false);assert.equal(api.state().status,'unavailable');assert.equal(api.state().recipientVerified,false);assert.equal(api.state().sampleOnly,true);
  const continueButton=dialog.querySelector('#payment-continue');assert.equal(continueButton.disabled,true);continueButton.disabled=false;h.click(continueButton);
  const forged=api.state();forged.canPay=true;forged.status='paid';assert.equal(api.state().canPay,false,'editing a returned browser state snapshot cannot activate payments');assert.equal(api.state().status,'unavailable');
  continueButton.disabled=true;
 }
 assert.equal(financialRequests,0);assert.equal(JSON.stringify(h.records),before,'choosing methods or clicking an altered demo button cannot create financial/profile records');assert.equal(h.run('JSON.stringify(bids)'),beforeBids);assert.equal(h.run('cars.find(lot=>lot.id===999944001).status'),'live','viewing checkout does not sell a lot');
 assert.equal(dialog.querySelectorAll('input').length,4);for(const input of dialog.querySelectorAll('input'))assert.equal(input.getAttribute('type'),'radio','no card/PAN/CVV or account credentials are collected');assert(!dialog.querySelector('iframe'));assert(!dialog.querySelector('a'),'there is no invented payment URL or transfer destination');assert(dialog.innerHTML.includes('ОБРАЗЕЦ — НЕ ДЛЯ ОПЛАТЫ'));
 api.close();assert(h.field('modal').open);assert.equal(h.field('bid-form'),form);assert.equal(h.field('bid'),bid);assert.equal(bid.value,'123000');assert.equal(h.field('modal').scrollTop,320);assert.equal(JSON.stringify(h.records),before);
 console.log('PASS: unknown payment/escrow/wallet/bid/transfer APIs fail closed before DB; actual checkout routes cannot charge, reserve funds, sell a lot or acquire card data, even with forged browser paid/funded state, and preserve the typed bid. Real escrow remains unimplemented.');
})().catch(error=>{console.error(error);process.exitCode=1});
