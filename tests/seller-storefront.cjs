const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {setup}=require('./helpers/quickbar-dom.cjs');
const source=fs.readFileSync(path.join(__dirname,'../dist/seller-storefront.js'),'utf8');
const future=new Date(Date.now()+3600000).toISOString(),past=new Date(Date.now()-3600000).toISOString();
const lot=(id,extra={})=>({id,name:'Публичный лот '+id,city:'Воронеж',image:'assets/car1.jpg',price:100000,status:'live',ends:future,sellerType:'private',sellerOwnerId:'owner-a',sellerName:'Анна',privateSellerDemo:true,...extra});
function boot(lots){
 const h=setup({mobile:true}),c=h.context;c.URL=URL;c.cars=lots;c.scrollX=0;c.scrollY=600;c.scrollTo=({top})=>{c.scrollY=top};
 c.localStorage={getItem(){throw Error('public page must not read private storage')},setItem(){throw Error('public page must not write private storage')}};
 c.FasSellerUI.getProfile=()=>{throw Error('public page must not project private profile')};
 c.FasSellerRatings={get(){throw Error('personal reviews are private')}};
 c.FasAuctionHistory={state(){throw Error('private purchase ledger is private')}};
 c.isLotLive=row=>row.status==='live'&&Date.parse(row.ends)>Date.now()&&(!row.startsAt||Date.parse(row.startsAt)<=Date.now());
 c.current=row=>row.price;c.distanceToLot=row=>row.distance??Infinity;
 vm.runInContext(source,c);const api=c.FasSellerStorefront,dialog=h.document.querySelector('#seller-storefront-dialog');
 const click=selector=>{const target=dialog.querySelector(selector);assert(target,selector);dialog.dispatchEvent({type:'click',target,preventDefault(){},stopPropagation(){}})};
 return {...h,c,api,dialog,click};
}
{
 const h=boot([lot(1),lot(2,{sellerOwnerId:'owner-b',sellerName:'Анна'}),lot(3,{sellerName:'Новое публичное имя'}),lot(4,{status:'draft'}),lot(5,{status:'paused'}),lot(6,{startsAt:future}),lot(7,{status:'deleted'})]);
 assert(h.api.open(1));assert.equal(h.api.state().activeCount,2,'same owner groups, same names never group private sellers');assert.deepEqual(Array.from(h.api.state().visibleIds),[1,3]);
 assert(!h.dialog.innerHTML.includes('owner-a'));assert(!h.dialog.innerHTML.includes('owner-b'));for(const id of [4,5,6,7])assert.equal(h.api.open(id),false,'unpublished state '+id);
 h.c.cars[2].sellerOwnerId='owner-c';assert.deepEqual(Array.from(h.api.state().visibleIds),[1],'cached rows recheck identity before exposing data');
 h.c.cars=[lot(1),lot(8)];h.api.open(1);assert.deepEqual(Array.from(h.api.state().visibleIds),[1,8],'source replacement invalidates lazy index');
}
{
 const org=(id,extra={})=>lot(id,{sellerOwnerId:undefined,privateSellerDemo:false,sellerType:'bank',bank:'Общий банк',...extra});
 const h=boot([org(10,{orgId:'org-a'}),org(11,{orgId:'org-a',bank:'Новое название банка'}),org(12,{orgId:'org-b'}),org(13),org(14),org(15,{demo:true}),org(16,{demo:true}),org(17,{demo:true,demoEdited:true}),org(18,{orgId:'org-a',organizationId:'conflict'}),lot(19,{sellerOwnerId:undefined,sellerName:'Анна',demo:true}),lot(20,{sellerOwnerId:undefined,sellerName:'Анна',demo:true})]);
 h.api.open(10);assert.deepEqual(Array.from(h.api.state().visibleIds),[10,11]);h.api.open(13);assert.deepEqual(Array.from(h.api.state().visibleIds),[13],'unlinked organizations cannot merge by a name');
 h.api.open(15);assert.deepEqual(Array.from(h.api.state().visibleIds),[15,16],'immutable demo bank has stable explicit demo identity');assert(h.dialog.innerHTML.includes('демопрофиль'));
 h.api.open(18);assert.deepEqual(Array.from(h.api.state().visibleIds),[18],'conflicting canonical org ids fail closed to single listing');h.api.open(19);assert.deepEqual(Array.from(h.api.state().visibleIds),[19],'anonymous private demo does not group by name');
}
{
 const secret='PRIVATE-PASSPORT-EMAIL-WALLET';
 const h=boot([lot(30,{sellerName:'<img src=x onerror=evil()>',city:'<script>evil()</script>',phone:secret,email:secret,passport:secret,wallet:secret,notes:secret,publicContact:'+7 999 111-22-33',privateSellerDemo:false}),lot(31,{publicContact:'+7 999 111-22-33',privateSellerDemo:false})]);
 h.api.open(30);assert(!h.dialog.querySelector('script'));assert(!h.dialog.querySelector('img[onerror]'));assert(!h.dialog.innerHTML.includes(secret));assert(h.dialog.innerHTML.includes('&lt;img'));assert(!h.dialog.querySelector('a[href]'),'a phone without explicit opt-in remains private');
 h.c.cars[0].publicContactOptIn=true;h.api.open(30);assert(h.dialog.querySelector('a[href="tel:+79991112233"]'));
 h.c.cars[1].publicContactOptIn=true;h.c.cars[1].publicContact='+7 999 999-99-99';h.api.open(30);assert(!h.dialog.querySelector('a[href]'),'conflicting public contacts cannot be attributed to a seller');
 assert(!JSON.stringify(h.api.state()).includes(secret));assert(!h.dialog.innerHTML.includes('data-rating-score'));
}
{
 const h=boot([lot(40),lot(41,{status:'sold',soldAt:past,soldPrice:80000,ends:past}),lot(42,{ends:past}),lot(43,{status:'sold',soldAt:past,ends:past,privateSellerDemo:false}),lot(44,{status:'sold',soldAt:future,ends:past}),lot(45,{status:'draft',ends:past}),lot(46,{status:'sold',soldAt:past,publishedAt:past,privateSellerDemo:false,ends:past})]);
 h.api.open(40);assert.equal(h.api.state().completedCount,3,'only known published history and valid public timestamps count');h.click('[data-storefront-tab="completed"]');assert.deepEqual(Array.from(h.api.state().visibleIds).sort(),[41,42,46]);
 assert.equal(h.dialog.querySelectorAll('[data-storefront-open-lot]').length,0,'completed history is read-only because the live auction route excludes ended lots');assert(h.dialog.innerHTML.includes('Указано: продано'));assert(h.dialog.innerHTML.includes('не подтверждение покупки'));
 assert.equal(h.api.openLot(41),false);
}
{
 const h=boot(Array.from({length:27},(_,i)=>lot(100+i,{distance:27-i})));h.api.open(100);assert.equal(h.api.state().activeCount,27);assert.equal(h.api.state().visibleIds.length,12);assert.equal(h.api.state().visibleIds[0],126);
 h.click('[data-storefront-page="1"]');assert.equal(h.api.state().page,1);h.click('[data-storefront-page="1"]');assert.equal(h.api.state().visibleIds.length,3);h.click('[data-storefront-page="-1"]');assert.equal(h.api.state().page,1);
 h.c.cars[14].price=345678;h.click('[data-storefront-page="-1"]');h.click('[data-storefront-page="1"]');assert(h.dialog.innerHTML.includes('345')&&h.dialog.innerHTML.includes('678'),'display uses live quote at each render');
 h.c.cars[0].status='draft';assert.equal(h.api.open(100),false);
}
{
 let reads=0;const rows=Array.from({length:52000},(_,i)=>lot(100000+i,{sellerOwnerId:'owner-'+i})),proxy=new Proxy(rows,{get(target,key,receiver){if(/^\d+$/.test(String(key)))reads++;return Reflect.get(target,key,receiver)}});
 const h=boot(proxy);h.grid.innerHTML='<article class="card" data-lot="100000"><div class="location"><span>Продавец</span></div></article>';
 assert.equal(reads,0,'module boot does not inspect 52k inventory');assert.equal(h.api.bootstrapEntries(),1);assert.equal(reads,0,'bootstrap inspects mounted cards only');assert.equal(h.api.bootstrapEntries(),0,'bootstrap is idempotent');
 h.api.open(100000);assert(reads>=52000&&reads<52100,'first explicit open builds one bounded lazy index');const before=reads;h.api.close();h.api.open(100000);assert(reads-before<100,'opening the same source reuses index, scans current seller rows only');
}
{
 const h=boot([lot(200)]);h.modal.showModal();h.modal.classList.add('seller-dialog');h.content.innerHTML='<form><input id="private-editor"></form>';const field=h.content.querySelector('input');field.value='Несохранённый текст';h.modal.scrollTop=430;h.grid.scrollTop=2200;const original=h.content.firstChild;const opener=h.add('entry','button');opener.focus();
 h.api.open(200,opener);h.dialog.scrollTop=400;assert.equal(h.content.firstChild,original);assert.equal(field.value,'Несохранённый текст');
 h.c.FasSellerUI.prepareNavigation=()=>false;assert.equal(h.api.openLot(200),false);assert(h.dialog.open&&h.modal.open);assert.equal(field.value,'Несохранённый текст');
 h.api.close();assert.equal(h.modal.open,true);assert.equal(h.content.firstChild,original);assert.equal(h.modal.scrollTop,430);assert.equal(h.grid.scrollTop,2200);assert.equal(h.document.activeElement,opener);
 h.api.open(200);const overlay=h.add('other-overlay','dialog');overlay.showModal();h.api.close();assert(h.dialog.open,'only top dialog may close');assert.equal(h.api.openLot(200),false);assert.equal(h.api.returnFromLot(),false);
}
{
 const h=boot([lot(300,{image:'javascript:evil()'})]);h.api.open(300);assert.equal(h.dialog.querySelector('.storefront-lot').querySelector('img').getAttribute('src'),'assets/other.svg');
 h.c.cars[0].image='https://user:secret@example.org/x.jpg';h.api.open(300);assert.equal(h.dialog.querySelector('.storefront-lot').querySelector('img').getAttribute('src'),'assets/other.svg');
 const html=h.api.buttonHTML(lot(300,{sellerName:'" onclick="evil()'}));assert(html.includes('data-open-seller-storefront="300"'));assert(html.includes('&quot;'));assert(!html.includes('class="lot-partner"'),'entry never wraps existing interactive branding');assert.equal(h.api.buttonHTML({id:NaN}), '');
}
{
 const h=boot([lot(400),lot(401)]),c=h.c;h.modal.classList.add('lot-dialog');h.content.innerHTML='<div data-open-lot-id="400"><form><input id="original-bid"></form></div>';h.modal.showModal();const original=h.content.firstChild;
 c.openCar=id=>{h.content.innerHTML='<div data-open-lot-id="'+id+'">Новая карточка</div>';h.modal.classList.add('lot-dialog');h.modal.showModal()};
 h.api.open(400);assert(h.api.openLot(401));c.openCar(401);assert.equal(h.api.returnFromLot(),false,'a separately reopened same-id lot cannot consume a stale profile route');
 c.openCar(400);h.api.open(400);assert(h.api.openLot(401));c.cars[0].sellerOwnerId='different-owner';assert(h.api.returnFromLot());assert.equal(h.modal.open,false,'changed canonical ownership prevents restoration of the old bid DOM');assert.notEqual(h.content.firstChild,original);assert.equal(h.api.state().activeCount,0,'changed anchor identity clears stale public rows');assert(h.dialog.innerHTML.includes('сейчас недоступны'));
}
{
 const {integration}=require('./helpers/category-multi-harness.cjs');const h=integration({fixtures:[lot(801,{category:'cars',subcategory:'cars',startsAt:past,start:100000,step:1000,deposit:0,bids:0})],strictSelect:true});
 vm.runInContext(source,h.context);h.run('render()');const button=h.field('grid').querySelector('[data-open-seller-storefront="801"]');assert(button,'real catalog render attaches an explicit public-profile action');
 h.click(button);assert.equal(h.context.window.FasSellerStorefront.state().open,true,'real card click bubbles to delegated storefront entry');assert.equal(h.field('modal').open,false,'public profile does not need to open/replace private main cabinet');
 const html=fs.readFileSync(path.join(__dirname,'../dist/index.html'),'utf8');assert(html.indexOf('<script src="seller-storefront.js')<html.indexOf('<script>'),'module is available to the initial catalog render without a cold inventory scan');
}
console.log('PASS: public seller projection, canonical private/org isolation, honest demo and published history, explicit contact consent, escaping, live quotes, 12-row pagination, zero cold inventory scan, indexed reopens, dirty/topmost guards and real catalog render/click entry.');
