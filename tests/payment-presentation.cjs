/* State and source-structure checks for the compact payment surface.
   The DOM harness does not measure browser/device geometry. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {setup}=require('./helpers/quickbar-dom.cjs');
const source=fs.readFileSync('dist/payment-ui.js','utf8');
const css=fs.readFileSync('dist/payment-ui.css','utf8').replace(/\/\*[\s\S]*?\*\//g,'');
const polish=fs.readFileSync('dist/visual-polish.css','utf8');
const main=fs.readFileSync('dist/index.html','utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
// Exercise the same source and URL policy as the lot gallery, including its
// photographed-object check. These helpers are deliberately not reimplemented.
const gallerySource=['lotMediaItem','image','lotMedia'].map(name=>{
 const start=main.indexOf('function '+name+'(');assert(start>=0,'gallery exposes '+name);
 return main.slice(start,main.indexOf('\n',start));
}).join('\n');
function boot(options={}){
 const h=setup({mobile:true});h.context.print=()=>{};
 h.context.fetch=()=>{throw Error('Presentation must not request a payment')};
 if(options.gallery){
  h.context.URL=URL;
  h.context.categoryNames={cars:'Легковые автомобили',other:'Прочее имущество'};
  h.context.FasSellerMedia={isSafeObjectUrl:url=>url==='blob:checkout-trusted-photo'};
  vm.runInContext(fs.readFileSync('dist/demo-profiles.js','utf8'),h.context);
  vm.runInContext(gallerySource,h.context);
 }
 vm.runInContext(source,h.context);
 const api=h.context.FasPayments,dialog=h.document.querySelector('#payment-dialog'),field=id=>dialog.querySelector('#'+id);
 const choose=value=>{const input=dialog.querySelector('input[value="'+value+'"]');input.value=value;dialog.dispatchEvent({type:'change',target:input})};
 return {...h,api,dialog,field,choose};
}
function rule(selector){
 const escaped=selector.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const match=css.match(new RegExp('(?:^|})\\s*'+escaped+'\\s*\\{([^}]+)\\}'));
 assert(match,'stylesheet contains '+selector);return match[1];
}
function assertUnavailable(h){
 assert.equal(h.api.state().canPay,false);assert.equal(h.api.state().status,'unavailable');assert.equal(h.field('payment-continue').disabled,true);
}
function thumbnail(h){return h.field('payment-lot-thumbnail').querySelector('img')}
function photoLot(overrides={}){return {id:49,name:'Фотография продавца',category:'cars',sellerOwnerId:'another-seller',buyNowPrice:500,...overrides}}
{
 const h=boot({gallery:true}),lot=photoLot({image:'https://seller.example/cover.jpg',media:[
  {url:'https://seller.example/walkaround.mp4',type:'video'},
  {url:'https://seller.example/front.jpg',type:'image'},
  {url:'https://seller.example/rear.jpg',type:'image'}
 ]}),before=JSON.stringify(lot);
 h.api.open(lot);
 const box=h.field('payment-lot-thumbnail'),img=thumbnail(h);
 assert(img,'checkout presents the first gallery photograph after a video');
 assert.equal(img.getAttribute('src'),'https://seller.example/front.jpg','gallery order wins over an unrelated cover field');
 assert.equal(box.getAttribute('aria-hidden'),'true','the repeated photograph is decorative beside the lot name');
 assert.equal(img.getAttribute('alt'),'');assert.equal(img.getAttribute('decoding'),'async');
 assert.equal(img.getAttribute('referrerpolicy'),'no-referrer','seller image requests do not receive the checkout URL');
 assert.equal(img.getAttribute('width'),'72');assert.equal(img.getAttribute('height'),'72');
 assert(box.classList.contains('has-photo'));assert.equal(box.querySelectorAll('img').length,1);
 assert(!box.querySelector('video,button,a'),'the summary does not copy gallery playback or controls');
 assert.equal(JSON.stringify(lot),before,'thumbnail selection does not mutate the lot or its media');assertUnavailable(h);
 lot.media[1].url='https://seller.example/replaced.jpg';h.choose('sbp');
 assert.equal(thumbnail(h).getAttribute('src'),'https://seller.example/front.jpg','method changes preserve the opened lot snapshot');
 assert.equal(h.api.state().amount,500);
}
{
 const h=boot({gallery:true});
 for(const url of ['blob:checkout-trusted-photo','assets/cars.svg','assets/photos/checkout-fixture.jpg?view=2']){
  h.api.open(photoLot({media:[{url,type:'image'}]}));
  assert.equal(thumbnail(h)?.getAttribute('src'),url,'safe gallery source remains supported: '+url);h.api.close();
 }
 const demo={id:50,category:'cars',demo:true,name:'Mercedes-Benz AMG GT',brand:'Mercedes-Benz',model:'AMG GT',image:'assets/photos/cars-3.jpg',media:[{url:'assets/photos/cars-3.jpg?view=1'}],buyNowPrice:600};
 h.api.open(demo);assert.equal(thumbnail(h)?.getAttribute('src'),'assets/photos/cars-3.jpg','demo primary photo comes through the shared resolver');h.api.close();
 h.api.open({...demo,name:'Mercedes-Benz E 200',model:'E 200'});
 assert.equal(thumbnail(h)?.getAttribute('src'),'assets/cars.svg','checkout cannot restore a mismatched stock photograph from another slide');h.api.close();
 for(const url of ['javascript:alert(1)','data:image/svg+xml,<svg onload=alert(1)>','http://seller.example/photo.jpg','//seller.example/photo.jpg','https://user:secret@seller.example/photo.jpg','blob:unregistered-photo','assets/../private.svg']){
  h.api.open(photoLot({image:url,media:[{url,type:'image'}]}));
  assert.equal(thumbnail(h)?.getAttribute('src'),'assets/cars.svg','unsafe sources retain the gallery fallback: '+url);
  assert(!h.field('payment-lot-thumbnail').innerHTML.includes(url),'a rejected URL is not interpolated into markup');h.api.close();
 }
 h.api.open(photoLot({image:'https://seller.example/only.mp4',media:[{url:'https://seller.example/only.mp4',type:'video'}]}));
 assert.equal(thumbnail(h),null,'video-only galleries use the summary placeholder');
 assert(!h.field('payment-lot-thumbnail').classList.contains('has-photo'));assertUnavailable(h);
}
{
 const h=boot();h.api.open(photoLot({image:'https://seller.example/raw.jpg',media:['https://seller.example/raw.jpg']}));
 assert.equal(thumbnail(h),null,'missing gallery helpers cannot enable a raw media fallback');assertUnavailable(h);
 for(const helper of ['lotMedia','lotMediaItem']){
  const broken=boot({gallery:true});broken.context[helper]=()=>{throw Error('gallery source unavailable')};
  assert.doesNotThrow(()=>broken.api.open(photoLot({media:['https://seller.example/front.jpg']})));
  assert.equal(thumbnail(broken),null,'a failed '+helper+' leaves the placeholder');assertUnavailable(broken);
 }
 const checked=boot({gallery:true});checked.context.lotMedia=()=>[{type:'image',url:'javascript:alert(1)'}];
 checked.api.open(photoLot());assert.equal(thumbnail(checked),null,'the chosen gallery item is revalidated before its URL reaches img');
}
{
 const h=boot({gallery:true});h.api.open(photoLot({media:['https://seller.example/first.jpg']}));
 const old=thumbnail(h);h.api.close();h.api.open(photoLot({id:51,name:'Другой лот',media:['https://seller.example/second.jpg']}));
 const current=thumbnail(h),box=h.field('payment-lot-thumbnail');assert.notStrictEqual(current,old,'each checkout owns a fresh image element');
 assert.equal(box.querySelectorAll('img').length,1,'switching lots removes the old photograph');
 old.dispatchEvent({type:'error',target:old});
 assert.strictEqual(thumbnail(h),current,'a late error from an earlier lot cannot erase the new photograph');assert(box.classList.contains('has-photo'));
 current.dispatchEvent({type:'error',target:current});
 assert.equal(thumbnail(h),null,'a failed current image returns to the summary placeholder');assert(!box.classList.contains('has-photo'));assertUnavailable(h);
 h.api.close();h.api.open(photoLot({id:52,media:['https://seller.example/third.jpg']}));
 assert.equal(thumbnail(h)?.getAttribute('src'),'https://seller.example/third.jpg','an earlier image failure does not block a fresh checkout');
}
{
 const h=boot(),lot={id:42,name:'Лот без подтверждённой суммы',soldPrice:870000,currentPrice:800000,price:900000};
 h.api.open(lot,{mode:'auction-settlement'});
 assert.equal(h.api.state().amount,null,'auction and local sale prices are not a confirmed settlement');
 assert.equal(h.field('payment-amount').textContent,'После завершения торгов','unknown settlement explains when a sum is expected');
 assert(h.field('payment-total').classList.contains('is-pending'),'missing sum gets its quieter presentation');
 assert(!h.field('payment-total').classList.contains('is-large'));
 assert(!/[₽\d]/.test(h.field('payment-amount').textContent),'missing sum cannot look like a payable amount');
 assert.equal(h.field('payment-receipt-amount').textContent,'Не определена','receipt does not invent an amount');
 assert.equal(h.document.activeElement,h.field('payment-title'),'opening announces the dialog title');
 assert.equal(h.field('payment-title').getAttribute('tabindex'),'-1');
 assertUnavailable(h);
 lot.settlement={amount:999999};h.choose('sbp');
 assert.equal(h.api.state().amount,null,'choosing another method keeps the original quote');
 assert.equal(h.field('payment-amount').textContent,'После завершения торгов');
 h.api.close();h.api.open(lot,{mode:'auction-settlement'});
 assert.equal(h.api.state().amount,999999,'a fresh opening may use a newly provided settlement');
 assert(!h.field('payment-total').classList.contains('is-pending'),'known amounts clear the missing-sum style');
 assert.match(h.field('payment-amount').textContent,/₽/);assertUnavailable(h);
 h.api.close();h.api.open({id:43,name:'Нет цены выкупа',currentPrice:7000});
 assert.equal(h.api.state().amount,null);assert.equal(h.field('payment-amount').textContent,'Цена пока не указана');
 assert(h.field('payment-total').classList.contains('is-pending'));assertUnavailable(h);
}
{
 const h=boot(),lot={id:44,name:'Цена зафиксирована',buyNowPrice:2500000};h.api.open(lot);
 const displayed=h.field('payment-amount').textContent;
 assert.match(displayed,/₽/);assert.equal(h.api.state().amount,2500000);
 assert(!h.field('payment-total').classList.contains('is-pending'));assert(!h.field('payment-total').classList.contains('is-large'));
 lot.buyNowPrice=1;h.choose('receipt');assert.equal(h.field('payment-amount').textContent,displayed,'method selection cannot replace the displayed snapshot');
 assert.equal(h.api.state().amount,2500000);assertUnavailable(h);
 h.api.close();h.api.open({id:45,name:'Очень большая цена',buyNowPrice:Number.MAX_SAFE_INTEGER});
 assert.equal(h.api.state().amount,Number.MAX_SAFE_INTEGER);
 assert(h.field('payment-total').classList.contains('is-large'),'large supported amounts receive their compact numeric style');
 assert(!h.field('payment-total').classList.contains('is-pending'));assertUnavailable(h);
 h.api.close();h.api.open({id:46,name:'Снова обычная цена',buyNowPrice:500});
 assert(!h.field('payment-total').classList.contains('is-large'),'reopening clears the preceding large-sum style');
}
{
 const h=boot();h.api.open({id:47,name:'Способы оплаты',buyNowPrice:500});
 const labels={card:'Банковская карта',sbp:'СБП',digital:'Цифровой рубль',receipt:'По квитанции'};
 const documentLabels={...labels,sbp:'Система быстрых платежей',receipt:'Банковская квитанция'};
 const group=h.dialog.querySelector('.payment-methods');
 assert.equal(group.parentElement.tagName,'FIELDSET','method list remains one labeled radio group');
 assert.equal(group.querySelectorAll('[data-payment-option]').length,4);
 for(const [key,label] of Object.entries(labels)){
  const option=group.querySelector('[data-payment-option="'+key+'"]');
  assert.equal(option.querySelector('strong').textContent,label,'method labels remain short and scannable');
  const radio=option.querySelector('input');assert.equal(radio.getAttribute('type'),'radio');assert.equal(radio.getAttribute('name'),'payment-method');
  h.choose(key);assert.equal(h.field('payment-method-title').textContent,label);
  assert.equal(h.field('payment-receipt-method').textContent,documentLabels[key],'sample documents keep the full method name');assertUnavailable(h);
 }
 const preview=h.field('payment-receipt-preview');assert.equal(preview.open,false,'sample document utilities start behind one disclosure');
 assert(preview.contains(h.field('payment-print'))&&preview.contains(h.field('payment-share')),'document actions are grouped with their sample');
 assert.equal(preview.parentElement,h.dialog.querySelector('.payment-body'),'printable receipt disclosure is not hidden inside another utility wrapper');
}
assert.match(rule('#payment-dialog #payment-title:focus'),/outline:\s*none\b/,'heading focus does not paint an input-like frame');
const suppressions=[...css.matchAll(/([^{}]+)\{([^{}]*outline:\s*(?:none|0)\b[^{}]*)\}/g)];
assert(suppressions.length>0);
for(const [,selector] of suppressions)assert.equal(selector.trim(),'#payment-dialog #payment-title:focus','only the title may suppress the focus outline');
assert.match(rule('#payment-dialog :is(button,input,summary,textarea):focus-visible'),/outline:\s*3px\s+solid\b/,'interactive controls retain a visible keyboard focus cue');
assert.match(polish,/:where\(button,a\[href\],summary,\[tabindex\]\):focus-visible/,'the late generic focus cue is present in the cascade the title fix must override');
assert.match(rule('.payment-total.is-pending #payment-amount'),/color:[^;]+;[^}]*font-size:/,'unknown amounts have a separate text presentation from numeric prices');
assert.match(rule('.payment-total.is-large #payment-amount'),/font-size:/,'large amounts have a compact treatment');
const groupRule=rule('.payment-methods'),rowRule=rule('.payment-method');
assert.match(groupRule,/grid-template-columns:\s*minmax\(0,\s*1fr\)/,'payment methods form one column even before mobile overrides');
assert.match(groupRule,/gap:\s*0\b/,'methods share a grouped surface');
assert.match(rowRule,/border:\s*0\b/,'method rows do not become separately bordered cards');
assert.match(rowRule,/border-bottom:/,'method rows retain a divider within the group');
const print=css.slice(css.indexOf('@media print'));
assert.match(print,/\.payment-body>\s*:not\(\.payment-receipt-preview\)\s*\{display:none!important/,'print removes checkout content outside the receipt disclosure');
assert.match(print,/\.payment-receipt-preview>\s*:not\(\.payment-receipt\)\s*\{display:none!important/,'print removes share, copy and status utilities within the disclosure');
assert.match(print,/\.payment-receipt\s*\{display:block!important/,'the sample document itself stays printable');
assert.match(print,/\.payment-watermark\s*\{[^}]*break-inside:avoid/,'sample watermark remains a printable unit');
(async()=>{
 for(const failingClipboard of [false,true]){
  const h=boot();if(failingClipboard)h.context.navigator={clipboard:{writeText:async()=>{throw Error('blocked')}}};
  h.api.open({id:48,name:'Ручной образец',buyNowPrice:500});
  const preview=h.field('payment-receipt-preview');assert.equal(preview.open,false);
  const result=await h.api.shareSample();assert.equal(result.manual,true);
  assert.equal(preview.open,true,'manual fallback opens its ancestor disclosure');
  assert.equal(h.field('payment-share-manual').hidden,false);assert.equal(h.field('payment-share-manual-label').hidden,false);
  assert(preview.contains(h.field('payment-share-manual')));assert.equal(h.document.activeElement,h.field('payment-share-manual'));
  assert.match(h.field('payment-share-manual').value,/ОБРАЗЕЦ — НЕ ДЛЯ ОПЛАТЫ/);assertUnavailable(h);
 }
 console.log('PASS: safe shared-gallery thumbnails, source order and image failure/session isolation; pending/real/large amounts, immutable quotes, compact methods, sample utilities, scoped focus and print-only document structure. Browser geometry is not simulated.');
})().catch(error=>{console.error(error);process.exitCode=1});
