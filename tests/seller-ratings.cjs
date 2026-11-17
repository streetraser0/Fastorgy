const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const {setup}=require('./helpers/quickbar-dom.cjs');
const source=fs.readFileSync(path.resolve(__dirname,'../dist/seller-ratings.js'),'utf8');
const KEY='fas-seller-ratings-v1';
function boot(options={}){
 const h=setup({mobile:true}),records={...(options.records||{})},ctx=h.context;let fail=false,writes=0;
 ctx.localStorage={getItem:key=>records[key]??null,setItem(key,value){if(fail)throw Error('quota');writes++;records[key]=value}};
 ctx.cars=[{id:1,bank:'Тестовый Банк',sellerType:'bank'},{id:2,bank:'  тестовый   банк ',sellerType:'bank'},{id:3,bank:'Тестовый Банк',sellerType:'leasing'},{id:4,bank:'Частный продавец',sellerOwnerId:'other-owner'},{id:5,bank:'Моё объявление',sellerOwnerId:'my-owner'},{id:6}];
 ctx.FasSellerUI.getProfile=()=>({id:'my-owner'});
 h.grid.innerHTML='<article class="card" data-lot="1"><div class="card-body"><div class="location">Город</div><div class="bidrow">Цена</div></div></article>';
 vm.runInContext(source,ctx);h.api=ctx.FasSellerRatings;h.dialog=h.document.querySelector('#seller-rating-dialog');h.records=records;h.fail=value=>fail=value;h.writes=()=>writes;return h;
}
function radios(group){
 // The small DOM harness parses attributes, while browsers also expose native radio properties.
 const inputs=group.querySelectorAll('input');for(const input of inputs){input.type='radio';input.value=input.getAttribute('value');input.checked=input.hasAttribute('checked')}
 return inputs;
}
function assertStars(group,score,message=''){
 assert(group,message+' scale is mounted');const inputs=radios(group),labels=group.querySelectorAll('label');
 assert.equal(inputs.length,5,message+' has five choices');assert.equal(labels.filter(label=>label.classList.contains('is-filled')).length,score,message+' filled count');
 assert.deepEqual(inputs.filter(input=>input.checked).map(input=>Number(input.value)),score?[score]:[],message+' exactly one selected native radio');
 labels.forEach((label,index)=>assert.equal(label.classList.contains('is-filled'),index<score,message+' cumulative fill order'));
}
function inlineChoice(h,id,score,detail=false){
 const surface=detail?h.content:h.grid,group=surface.querySelector('[data-rating-lot="'+id+'"]'),inputs=radios(group),input=inputs[score-1];
 inputs.forEach(item=>item.checked=item===input);for(const handler of h.docEvents.change||[])handler({type:'change',target:input});h.flush();
 return surface.querySelector('[data-rating-lot="'+id+'"]');
}

for(const data of ['broken','null','{}','[]','{"version":1,"ratings":null}','{"version":1,"ratings":[null,{"seller":"seller:bank:тестовый банк","score":9,"note":"bad"}]}']){
 const h=boot({records:{[KEY]:data}});assert.equal(h.api.get(1),null,'malformed ratings ignored');
}
{
 const h=boot();assert.equal(h.api.get(1),null);assert.equal(h.grid.querySelectorAll('.seller-rating-line').length,1);
 assert(h.grid.querySelector('.seller-rating-line').innerHTML.includes('Нет подтверждённых отзывов'));
 assert.equal(h.api.save(1,4,'  Быстро отвечает  ').ok,true);assert.equal(h.api.get(2).score,4,'same seller across lots');assert.equal(h.api.get(2).note,'Быстро отвечает');
 assert.equal(h.api.get(3),null,'seller type separates bank and leasing');assert.equal(h.api.get(4),null,'private identities stay separate');
 const copy=h.api.get(1);copy.score=1;assert.equal(h.api.get(1).score,4,'API returns a value copy');
 assert.equal(h.api.save(2,2,'Изменённая заметка').ok,true);assert.equal(h.api.get(1).score,2);assert.equal(JSON.parse(h.records[KEY]).ratings.length,1,'editing replaces the seller assessment');
 const reload=boot({records:h.records});assert.equal(reload.api.get(1).score,2);assert.equal(reload.api.get(2).note,'Изменённая заметка');
 assert.equal(h.api.save(5,5,'').ok,false);assert.equal(h.api.get(5),null,'own seller cannot be assessed');
 assert.equal(h.api.save(6,5,'').ok,false);assert.equal(h.api.save(999,5,'').ok,false);
 for(const score of [0,6,2.5,NaN,''])assert.equal(h.api.save(1,score,'').ok,false);
 assert.equal(h.api.save(1,3,'x'.repeat(1001)).ok,false);
 h.fail(true);assert.equal(h.api.save(1,5,'Не записалось').ok,false);assert.equal(h.api.get(1).score,2,'failed save leaves previous score');assert.equal(h.api.remove(1).ok,false);assert.equal(h.api.get(2).score,2,'failed delete preserves rating');
 h.fail(false);assert.equal(h.api.remove(2).ok,true);assert.equal(h.api.get(1),null);assert.equal(JSON.parse(h.records[KEY]).ratings.length,0);
}
{
 const h=boot();h.content.innerHTML='<form id="untouched-editor"><textarea>Мой несохранённый текст</textarea></form>';h.modal.open=true;h.modal.scrollTop=430;h.grid.scrollTop=2200;const before=h.content.innerHTML;
 const opener=h.add('rating-opener','button');opener.focus();
 assert.equal(h.api.open(1),true);assert.equal(h.modal.open,true);assert.equal(h.content.innerHTML,before,'nested dialog preserves editor');assert.equal(h.modal.scrollTop,430);assert.equal(h.grid.scrollTop,2200);
 assert.equal(h.dialog.open,true);assert.equal(h.dialog.querySelectorAll('input[name="sellerRatingScore"]').length,5);
 assert(!h.dialog.querySelectorAll('input[name="sellerRatingScore"]').some(input=>input.hasAttribute('checked')),'no suggested score before user choice');
 assert(h.dialog.innerHTML.includes('Другие пользователи их не видят'));
 const form=h.dialog.querySelector('#seller-rating-form');form.onsubmit({preventDefault(){}});assert.equal(h.dialog.open,true);assert(h.dialog.querySelector('[data-rating-error]').textContent.includes('от 1 до 5'));
 const radio=h.dialog.querySelectorAll('input[name="sellerRatingScore"]')[3];radio.checked=true;radio.value='4';h.dialog.querySelector('#seller-rating-note').value='Проверить документы';
 h.fail(true);form.onsubmit({preventDefault(){}});assert.equal(h.dialog.open,true);assert(h.dialog.querySelector('[data-rating-error]').textContent.includes('не сохранена'));assert.equal(h.api.get(1),null);
 h.fail(false);form.onsubmit({preventDefault(){}});assert.equal(h.dialog.open,false);assert.equal(h.api.get(1).score,4);assert.equal(h.document.activeElement,opener,'close restores focus');
 h.api.open(1);assert(h.dialog.querySelectorAll('input[name="sellerRatingScore"]')[3].hasAttribute('checked'));assert(h.dialog.querySelector('[data-rating-delete]'));
 h.dialog.querySelector('[data-rating-delete]').onclick();assert.equal(h.api.get(1),null);assert.equal(h.dialog.open,false);
 h.api.open(5);assert(!h.dialog.querySelector('#seller-rating-form'));assert(h.dialog.innerHTML.includes('Оценивать себя нельзя'));
}
{
 const h=boot();h.context.cars[0]={id:1,bank:'<img src=x onerror=evil()>',sellerType:'bank'};
 assert.equal(h.api.save(1,3,'</textarea><script>evil()</script>').ok,true);h.api.open(1);
 assert(!h.dialog.querySelector('script'));assert(!h.dialog.querySelector('img[onerror]'));assert(h.dialog.innerHTML.includes('&lt;script&gt;'));assert(h.dialog.innerHTML.includes('&lt;img'));
 h.notify();assert.equal(h.grid.querySelectorAll('.seller-rating-line').length,1,'observer does not duplicate assessment actions');const row=h.grid.querySelector('.seller-rating-line'),button=row.firstChild;h.notify();assert.equal(row.firstChild,button,'unchanged mounted card does not rebuild');
 h.context.cars[0]={id:1,bank:'Другой банк',sellerType:'bank'};assert.equal(h.api.get(1),null,'index lookup sees same-length lot replacement');h.api.refresh();assert(row.innerHTML.includes('Оценить продавца'));assert(!row.innerHTML.includes('Ваша оценка'));
 h.context.cars[0]={id:1};h.api.refresh();assert.equal(h.grid.querySelectorAll('.seller-rating-line').length,0,'unknown seller action is removed');
}
{
 const h=boot();
 h.grid.innerHTML=[1,2,3,5].map(id=>'<article class="card" data-lot="'+id+'"><div class="card-body"><div class="location">Город</div></div></article>').join('');h.api.refresh();
 assertStars(h.grid.querySelector('[data-rating-lot="1"]'),0,'unrated seller');assert.equal(h.grid.querySelector('[data-rating-lot="5"]'),null,'own lot has no selectable stars');
 h.api.save(1,3,'Сохранённая личная заметка');
 for(const score of [1,5,2]){
  const writes=h.writes();assertStars(inlineChoice(h,1,score),score,'inline '+score);assert.equal(h.writes(),writes+1,'one change makes one durable write');
  assertStars(h.grid.querySelector('[data-rating-lot="2"]'),score,'same seller on another card');assertStars(h.grid.querySelector('[data-rating-lot="3"]'),0,'different seller type stays unrated');
  assert.equal(h.api.get(2).score,score);assert.equal(h.api.get(2).note,'Сохранённая личная заметка','inline stars preserve the saved note');
 }
 const saved=h.records[KEY],reload=boot({records:h.records});assertStars(reload.grid.querySelector('[data-rating-lot="1"]'),2,'saved reload');assert.equal(reload.api.get(1).note,'Сохранённая личная заметка');
 h.fail(true);const writes=h.writes(),failed=inlineChoice(h,1,5);assert.equal(h.writes(),writes);assert.equal(h.records[KEY],saved);assert.equal(h.api.get(1).score,2);
 // A failed write rolls back the live properties as well as the fill class; do not rehydrate them here.
 assert.deepEqual(failed.querySelectorAll('input').filter(input=>input.checked).map(input=>Number(input.value)),[2]);assert.equal(failed.querySelectorAll('label').filter(label=>label.classList.contains('is-filled')).length,2);
 assertStars(h.grid.querySelector('[data-rating-lot="2"]'),2,'storage failure cannot update another card');assert(h.calls.some(call=>call[0]==='toast'&&call[1].includes('не сохранена')));
}
{
 const h=boot();h.api.save(1,2,'Сохранено раньше');const stored=h.records[KEY],writes=h.writes();h.api.open(1);
 const options=h.dialog.querySelector('.rating-options'),inputs=radios(options);
 for(const score of [1,5,2,4]){
  inputs.forEach(input=>input.checked=Number(input.value)===score);options.onchange({target:inputs[score-1]});
  assert.equal(options.querySelectorAll('label').filter(label=>label.classList.contains('is-filled')).length,score,'modal draft fills cumulatively');
  assert.deepEqual(inputs.filter(input=>input.checked).map(input=>Number(input.value)),[score],'modal draft retains one selected radio');
  assert.equal(h.api.get(1).score,2);assert.equal(h.writes(),writes,'previewing modal stars never saves');
 }
 h.dialog.querySelector('#seller-rating-note').value='Несохранённый черновик';h.dialog.querySelector('[data-rating-close]').onclick();assert.equal(h.records[KEY],stored);assert.equal(h.api.get(1).note,'Сохранено раньше');
 h.api.open(1);assertStars(h.dialog.querySelector('.rating-options'),2,'reopened modal uses saved score');assert(h.dialog.innerHTML.includes('Сохранено раньше'));assert(!h.dialog.innerHTML.includes('Несохранённый черновик'));
}
{
 const h=boot();
 // Descending auctions have no bid form; seller assessments still belong to the displayed lot.
 h.content.innerHTML='<div class="purchase-body" data-open-lot-id="2"><div class="lot-detail-secondary"></div></div>';h.api.refresh();
 assertStars(h.content.querySelector('[data-rating-lot="2"]'),0,'descending/no-bid detailed lot');
 assertStars(inlineChoice(h,2,5,true),5,'detail selection');assertStars(h.grid.querySelector('[data-rating-lot="1"]'),5,'detail saves across seller cards');
 h.content.innerHTML='<div class="purchase-body" data-open-lot-id="5"><div class="lot-detail-secondary"></div></div>';h.api.refresh();
 assert.equal(h.content.querySelector('[data-rating-lot]'),null,'own detail does not expose self-rating');assert(h.content.querySelector('.seller-rating-line').innerHTML.includes('Ваше объявление'));assert.equal(h.api.save(5,5,'').ok,false);
}
{
 const h=boot(),main=fs.readFileSync(path.resolve(__dirname,'../dist/index.html'),'utf8'),start=main.indexOf("$('#grid').onclick="),end=main.indexOf(";$('#filters').onsubmit=",start),timers=new Map();let timerId=0;
 assert(start>=0&&end>start,'use the production catalogue click handler');h.context.$=selector=>h.document.querySelector(selector);
 vm.runInContext(main.slice(start,end)+';',h.context);
 h.context.setTimeout=handler=>{const id=++timerId;timers.set(id,handler);return id};h.context.clearTimeout=id=>timers.delete(id);
 vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../dist/lot-gestures.js'),'utf8'),h.context);h.context.installFasLotGestures();
 for(const score of [1,5,2]){
  const group=h.grid.querySelector('[data-rating-lot="1"]'),input=radios(group)[score-1],label=input.parentElement;
  // A label/SVG click bubbles first, then native label activation clicks its radio.
  for(const target of [label.querySelector('svg'),input]){const event={type:'click',target,detail:1,button:0,clientX:100,clientY:100,preventDefault(){}};h.grid.onclick(event);for(const handler of h.docEvents.click||[])handler(event)}
  inlineChoice(h,1,score);for(const [id,handler]of [...timers]){timers.delete(id);handler()}
  assertStars(h.grid.querySelector('[data-rating-lot="1"]'),score,'production click routing');assert.equal(h.calls.filter(call=>call[0]==='open').length,0,'star activation never opens the lot card');assert(!h.dialog.open,'inline selection does not open the assessment modal');
 }
}
console.log('PASS: cumulative inline/modal stars (1→5→2), one checked score, same-seller card/detail sync, durable reload, note preservation, unsaved modal cancellation, self-rating/storage guards, escaping and stable updates.');
