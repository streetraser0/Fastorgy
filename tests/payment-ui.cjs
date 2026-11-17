const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const {setup}=require('./helpers/quickbar-dom.cjs');
function boot(){
 const h=setup({mobile:true}),printed=[];h.context.print=()=>printed.push(h.context.FasPayments.state());h.context.fetch=()=>{throw Error('Demo payments must not make financial requests')};
 vm.runInContext(fs.readFileSync('dist/payment-ui.js','utf8'),h.context);
 const api=h.context.FasPayments,dialog=h.document.querySelector('#payment-dialog'),field=id=>dialog.querySelector('#'+id);
 const choose=value=>{const input=dialog.querySelector('input[value="'+value+'"]');input.value=value;dialog.dispatchEvent({type:'change',target:input})};
 return {...h,api,dialog,field,choose,printed};
}
{
 const h=boot();h.modal.showModal();h.content.innerHTML='<textarea id="unsaved-editor">Сохраните форму</textarea>';const editor=h.content.firstChild;h.modal.scrollTop=380;editor.focus();
 const lot={id:1042,name:'Toyota Camry',sellerName:'Иван Иванов',buyNowPrice:2500000,currentPrice:1700000};
 const result=h.api.open(lot,{mode:'buy-now'});assert.equal(result.ok,true);assert.equal(h.api.state().amount,2500000);assert.equal(h.dialog.open,true);assert.equal(h.modal.open,true);assert.strictEqual(h.content.firstChild,editor);assert.equal(h.modal.scrollTop,380);assert.equal(h.document.activeElement,h.field('payment-title'));
 assert.equal(h.dialog.getAttribute('aria-labelledby'),'payment-title');assert.equal(h.field('payment-recipient').textContent,'Иван Иванов');assert.match(h.field('payment-receipt-recipient').textContent,/не проверен/);assert.equal(h.field('payment-continue').disabled,true);
 const again=h.api.open({id:999,name:'Другой лот',buyNowPrice:1});assert.equal(again.ok,false);assert.equal(h.api.state().lotId,'1042','repeat open cannot switch checkout underneath user');
 lot.buyNowPrice=1;lot.name='Changed';assert.equal(h.api.state().amount,2500000,'checkout uses a stable price snapshot');assert.equal(h.field('payment-lot-name').textContent,'Toyota Camry');
 for(const method of ['card','sbp','digital','receipt']){h.choose(method);assert.equal(h.api.state().method,method);assert.equal(h.api.state().canPay,false);assert.equal(h.api.state().status,'unavailable');assert.equal(h.field('payment-continue').disabled,true);assert(h.field('payment-requires').textContent)}
 assert.match(h.field('payment-method-description').textContent,/образец/);assert.equal(h.api.printSample().sampleOnly,true);assert.equal(h.printed.length,1);assert.equal(h.printed[0].canPay,false);assert.equal(h.dialog.querySelectorAll('input').length,4,'the form has method radios only, no card credentials');
 assert.match(h.dialog.innerHTML,/ОБРАЗЕЦ — НЕ ДЛЯ ОПЛАТЫ/);assert(!h.dialog.querySelector('iframe'));assert(!h.dialog.querySelector('a'),'there is no invented bank link or payment redirect');
 h.api.close();assert.equal(h.dialog.open,false);assert.equal(h.document.activeElement,editor);assert.equal(h.modal.open,true);assert(!h.body.classList.contains('payment-open'));assert.equal(h.api.printSample().ok,false);
}
{
 const h=boot();assert.equal(h.api.open(null).ok,false);assert.equal(h.api.open([]).ok,false);assert.equal(h.api.open({id:1},{mode:'refund'}).ok,false);
 for(const value of [null,undefined,0,-1,1.5,Infinity,NaN,Number.MAX_SAFE_INTEGER+1,'2500']){h.api.open({id:2,name:'Лот',buyNowPrice:value,currentPrice:8000,startPrice:6000,price:9000});assert.equal(h.api.state().amount,null,'no invalid buy-now price or current-bid fallback');h.api.close()}
 h.api.open({id:3,name:'Лот',soldPrice:870000,currentPrice:800000},{mode:'auction-settlement'});assert.equal(h.api.state().amount,null,'local sold price/current bid is not a confirmed settlement amount');h.api.close();
 h.api.open({id:3,name:'Лот',settlement:{amount:870000}},{mode:'auction-settlement'});assert.equal(h.api.state().amount,870000);assert.equal(h.api.state().canPay,false);h.api.close();
}
{
 const h=boot(),attack='<img src=x onerror=alert(1)>';h.api.open({id:attack,name:attack,bank:attack,buyNowPrice:300});
 assert.equal(h.field('payment-lot-name').textContent,attack);assert.equal(h.field('payment-recipient').textContent,attack);assert.equal(h.dialog.querySelectorAll('img').length,1,'untrusted lot/recipient data is never HTML');
 assert(!h.dialog.innerHTML.includes(attack));
 for(const svg of h.dialog.querySelectorAll('svg')){
  const decoration=svg.getAttribute('data-payment-decoration');
  if(decoration){assert(['card','sbp','digital','receipt'].includes(decoration),'payment illustrations have a known method');assert.equal(svg.getAttribute('aria-hidden'),'true');assert.equal(svg.getAttribute('focusable'),'false')}
  else assert(svg.closest('[data-payment-close]'),'other SVGs must belong to the close control, not an invented payment QR');
 }
 assert(!h.dialog.querySelector('canvas,iframe,a,[data-payment-qr],[data-qr]'),'demo has no QR renderer, provider frame or payment destination');
 assert.equal(h.dialog.querySelectorAll('input').length,4,'only the four method selectors accept input');
 for(const input of h.dialog.querySelectorAll('input')){assert.equal(input.getAttribute('type'),'radio');assert.equal(input.getAttribute('name'),'payment-method')}
 h.context.print=()=>{h.api.printSample();throw Error('Print unavailable')};const failed=h.api.printSample();assert.equal(failed.ok,false);assert.equal(failed.reason,'print-failed');assert.match(h.field('payment-print-status').textContent,/Не удалось/);assert.equal(h.api.state().canPay,false);
}
const css=fs.readFileSync('dist/payment-ui.css','utf8');assert.match(css,/@media print/);assert.match(css,/payment-open>\*:not\(#payment-dialog\)/);assert.match(css,/payment-watermark/);
(async()=>{
 const lot={id:1042,name:'Toyota Camry',sellerName:'Иван Иванов',buyNowPrice:2500000,ownerId:'PRIVATE-OWNER',phone:'PRIVATE-PHONE',cardNumber:'PRIVATE-CARD',profile:{secret:'PRIVATE-PROFILE'}};
 {
  const h=boot();h.api.open(lot);assert.equal(h.field('payment-share').disabled,false,'manual copying remains available without sharing APIs');const result=await h.api.shareSample();assert.equal(result.reason,'unsupported');assert.equal(result.manual,true);assert.equal(h.field('payment-share-manual').hidden,false);assert.match(h.field('payment-share-manual').value,/ОБРАЗЕЦ — НЕ ДЛЯ ОПЛАТЫ/);h.context.FasNativeShare={share:async()=>{}};assert.equal((await h.api.shareSample()).method,'share','a bridge installed after initialization is detected at click time');h.api.close();
 }
 {
  const h=boot(),shared=[],clipboard=[];h.context.navigator={share(){throw Error('native share must be preferred')},clipboard:{writeText:async text=>clipboard.push(text)}};h.context.FasNativeShare={share:async data=>shared.push(data)};
  h.modal.showModal();h.content.innerHTML='<textarea id="preserved-sharing-editor">Черновик</textarea>';const editor=h.content.firstChild;h.api.open(lot);h.choose('receipt');const result=await h.api.shareSample();
  assert.equal(result.ok,true);assert.equal(result.method,'share');assert.equal(shared.length,1);assert.equal(clipboard.length,0);assert.deepEqual(Object.keys(shared[0]).sort(),['text','title']);
  const text=shared[0].text;assert.equal(text.split('ОБРАЗЕЦ — НЕ ДЛЯ ОПЛАТЫ').length-1,2);assert(text.startsWith('ОБРАЗЕЦ — НЕ ДЛЯ ОПЛАТЫ'));assert(text.endsWith('ОБРАЗЕЦ — НЕ ДЛЯ ОПЛАТЫ'));for(const value of ['Иван Иванов','Toyota Camry','1042','КПП получателя','БИК банка','Расчётный счёт','Корреспондентский счёт','Назначение платежа','Не предоставлен','Банковская квитанция'])assert(text.includes(value),value);
  for(const value of ['PRIVATE-OWNER','PRIVATE-PHONE','PRIVATE-CARD','PRIVATE-PROFILE'])assert(!text.includes(value),'only public frozen quote fields may be shared');
  assert.equal(h.api.state().canPay,false);assert.equal(h.api.state().status,'unavailable');assert.equal(h.modal.open,true);assert.strictEqual(h.content.firstChild,editor);assert.equal(h.field('payment-share').disabled,false);assert.match(h.field('payment-share-status').textContent,/Окно отправки закрыто/);
 }
 {
  const h=boot(),shared=[];h.context.navigator={share:async data=>shared.push(data)};h.api.open(lot);assert.equal(h.field('payment-share').disabled,false);await h.api.shareSample();assert.equal(shared.length,1,'web share works without native bridge');
 }
 {
  const h=boot();let copied=0;h.context.navigator={share:async()=>{const e=Error('cancel');e.name='AbortError';throw e},clipboard:{writeText:async()=>copied++}};h.api.open(lot);const result=await h.api.shareSample();assert.equal(result.cancelled,true);assert.equal(copied,0,'cancel must not initiate a fallback');assert.equal(h.field('payment-share-manual').hidden,true);assert.equal(h.field('payment-share').disabled,false);assert.match(h.field('payment-share-status').textContent,/отменена/);
  h.context.FasNativeShare={share:async()=>({cancelled:true})};assert.equal((await h.api.shareSample()).cancelled,true);assert.equal(copied,0);
  for(const message of ['Share canceled','Share cancelled']){h.context.FasNativeShare={share:async()=>{throw Error(message)}};const nativeCancel=await h.api.shareSample();assert.equal(nativeCancel.cancelled,true,message+' is native cancellation');assert.equal(copied,0,'native cancel must not fall back to clipboard');assert.equal(h.field('payment-share-manual').hidden,true,'native cancel must not reveal manual fallback')}
  h.context.FasNativeShare={share:async()=>{throw Error('Share failed: request canceled by server')}};assert.equal((await h.api.shareSample()).manual,true,'unrelated provider failures are not mistaken for user cancellation');assert.equal(copied,0);
 }
 {
  const h=boot(),copied=[];h.context.navigator={clipboard:{writeText:async text=>copied.push(text)}};h.api.open(lot);const result=await h.api.shareSample();assert.equal(result.method,'clipboard');assert.equal(copied.length,1);assert.match(copied[0],/НЕ ДЛЯ ОПЛАТЫ/);assert.match(h.field('payment-share-status').textContent,/Вставьте его в сообщение/);
  h.context.navigator.clipboard.writeText=async()=>{throw Error('blocked')};const fallback=await h.api.shareSample();assert.equal(fallback.manual,true);assert.equal(h.field('payment-share-manual').hidden,false);assert.equal(h.field('payment-share-manual').value,copied[0]);assert.equal(h.api.state().canPay,false);
 }
 {
  const h=boot();let reject,count=0;h.context.FasNativeShare={share:()=>{count++;return new Promise((resolve,fail)=>{reject=fail})}};h.api.open(lot);const pending=h.api.shareSample();assert.equal(h.field('payment-share').disabled,true);assert.equal(h.api.state().sharing,true);assert.equal((await h.api.shareSample()).reason,'busy');assert.equal(count,1);h.choose('digital');assert.equal(h.api.state().method,'card','method cannot change during pending share');
  h.api.close();h.context.FasNativeShare={share:async()=>{}};h.api.open({id:1043,name:'Новый лот',bank:'Другой продавец',buyNowPrice:700});const before=h.field('payment-share-status').textContent;reject(Error('late response'));const late=await pending;assert.equal(late.stale,true);assert.equal(h.api.state().lotId,'1043');assert.equal(h.api.state().sharing,false);assert.equal(h.field('payment-share-status').textContent,before,'old share may not affect a reopened payment dialog');assert.equal(h.field('payment-share-manual').hidden,true);
 }
 {
  // HTML dialog queues its close event. Reopening before that task runs must
  // not let the previous session clear the new overlay/receipt ownership.
  const h=boot(),queued=[];h.dialog.close=function(){this.open=false;this.removeAttribute('open');queued.push(()=>this.dispatchEvent({type:'close'}))};
  h.api.open(lot);h.api.close();h.api.open({id:1043,name:'Новый лот после возврата',buyNowPrice:700});
  let finish;h.context.FasNativeShare={share:()=>new Promise(resolve=>finish=resolve)};const sharing=h.api.shareSample();
  queued.shift()();assert(h.body.classList.contains('payment-open'),'stale queued close cannot expose the page beneath a reopened checkout');
  assert.equal(h.api.state().sharing,true,'stale close cannot unlock the new share operation');assert.equal(h.api.state().lotId,'1043');
  finish();assert.equal((await sharing).ok,true,'stale close cannot invalidate the new quote epoch');assert.equal(h.api.state().sharing,false);
 }
 {
  const h=boot(),shared=[];h.context.navigator={share:async data=>shared.push(data)};h.api.open({id:2,name:'<img src=x>\nБИК:FAKE',sellerName:'Продавец\u202e\nСчёт:FAKE',buyNowPrice:500});await h.api.shareSample();assert.equal(h.dialog.querySelectorAll('img').length,1);assert(!shared[0].text.includes('\nБИК:FAKE'),'embedded newlines cannot forge receipt rows');assert(!shared[0].text.includes('\u202e'),'direction controls are not propagated');assert.equal(h.api.state().canPay,false);
 }
 console.log('PASS: demo payment semantics and sample printing; native/web receipt sharing, plain-text public snapshot, clipboard/manual fallback, cancellation, repeat/stale guards and preserved editor.');
})().catch(error=>{console.error(error);process.exitCode=1});
