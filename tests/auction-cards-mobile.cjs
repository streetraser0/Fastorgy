/* Generated DOM and layout constraints, not a browser/device screenshot test. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {boot}=require('./helpers/category-seller-harness.cjs'),{setup}=require('./helpers/quickbar-dom.cjs');
const read=name=>fs.readFileSync('dist/'+name,'utf8'),css=read('auction-cards.css'),featuredCSS=read('featured-lots.css');
const now=Date.now(),end=new Date(now+4*3600000+20*60000).toISOString();
const base={category:'cars',subcategory:'cars',name:'Toyota Camry — длинное название автомобиля',city:'Воронеж',regionCode:'36',bank:'Продавец',price:1000000,start:1000000,startPrice:1000000,step:10000,stepValue:10000,stepMode:'fixed',deposit:0,status:'live',startsAt:new Date(now-3600000).toISOString(),ends:end,demo:true,tag:'Демонстрационный лот',bids:0};
const lots=[{...base,id:98761001,buyNowPrice:1500000},{...base,id:98761002},{...base,id:98761003,sellerOwnerId:'other-profile',buyNowPrice:1600000},{...base,id:98761004,sellerOwnerId:'seller-owner',buyNowPrice:1700000}];
const app=boot({noMedia:true,fixtureInventory:lots});
const actions=id=>app.run('lotPurchaseActions(cars.find(lot=>lot.id==='+id+'))');
{
 const direct=actions(lots[0].id);assert(direct.includes('data-instant-buy'));assert(direct.includes('<span>Купить лот</span><small>'+app.run('money(1500000)')));
 const ordinary=actions(lots[1].id);assert(ordinary.includes('Покупка по итогам торгов'));assert(!ordinary.includes('data-instant-buy'));assert(ordinary.includes('data-lot-buy-kind="auction"'));assert(!ordinary.includes('data-open-lot-payment'),'auction entry opens conditions without pretending an instant purchase exists');
 const privateBuy=actions(lots[2].id);assert(privateBuy.includes('data-lot-buy-kind="fixed"'));assert(privateBuy.includes(app.run('money(1600000)')));assert.equal(actions(lots[3].id),'','own listing has no purchase CTA');
 app.run('openCar('+lots[0].id+')');const detail=app.node('#modal-content').innerHTML;
 assert(detail.includes('data-instant-buy'));assert(detail.includes('id="bid-form"'));assert(detail.includes('purchase-submit'));
 assert(detail.includes(app.run('money(1000000)'))&&detail.includes(app.run('money(1500000)')),'current auction price and distinct buy price both remain visible');
 const card=app.run('cardHTML(cars.find(lot=>lot.id==='+lots[0].id+'))');
 assert(card.includes('Текущая цена'));assert(card.includes('До завершения'));assert.equal((card.match(/class="countdown-unit"/g)||[]).length,5);assert(card.includes('data-location'),'a visitor without location has a visible way to obtain distance');
 assert(card.includes('data-open-lot-map="'+lots[0].id+'"'));assert(card.includes('data-fav="'+lots[0].id+'"'));assert(card.includes('gallery-track'),'photo browsing remains available');
 app.run('cars.find(lot=>lot.id==='+lots[0].id+').buyNowPrice=999999');assert(!actions(lots[0].id).includes('data-instant-buy'),'a stale buy price below current quote loses instant-purchase emphasis');
}
{
 vm.runInContext(read('auction-modes.js'),app.context);
 app.run('cars.push('+JSON.stringify({...base,id:98761005,auctionDirection:'descending',floorPrice:600000,decreaseStep:50000,decreaseIntervalMinutes:30})+')');
 const down=actions(98761005);assert(down.includes('data-descending-buy="98761005"'));assert(down.includes('<span>Купить лот</span>'));assert(!down.includes('lot-action-pair'));
 app.run('openCar(98761005)');assert(!app.node('#modal-content').innerHTML.includes('id="bid-form"'),'a descending purchase never gets an ascending bid action');
}
{
 const h=setup({mobile:true}),section=h.add('featured-lots','section'),track=h.add('featured-track','div',section);
 h.add('featured-note','p',section);h.add('featured-empty','p',section);track.scrollLeft=0;track.clientWidth=250;track.scrollWidth=1000;
 const c=h.context;c.URL=URL;c.cars=lots.slice(0,3);c.bids={};c.categoryNames={cars:'Автомобили'};
 let scans=0;c.isLotLive=lot=>{scans++;return lot.status==='live'&&Date.parse(lot.ends)>now};c.current=lot=>Math.max(lot.price,c.bids[lot.id]?.price||0);c.userOrigin=()=>({point:[51,39]});c.distanceFromOrigin=()=>12;c.image=()=> 'assets/photos/cars-1.jpg?view=1';c.escapeText=value=>String(value??'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');c.money=value=>value.toLocaleString('ru-RU')+' ₽';
 vm.runInContext(read('responsive-media.js'),c);vm.runInContext(read('featured-lots.js'),c);
 const cards=track.querySelectorAll('[data-featured-lot]');assert.equal(cards.length,3);
 for(const card of cards){
  assert.equal(card.querySelector('.featured-price-label').textContent,'Текущая цена');
  assert(card.querySelector('.featured-price').textContent.includes('1 000 000'),'the current auction amount is not replaced with the buy-now amount');
  assert(card.querySelector('.featured-location').textContent.includes('12 км'));
  const deadline=card.querySelector('time');assert.equal(deadline.getAttribute('datetime'),end);assert(deadline.textContent.startsWith('До '));assert(deadline.getAttribute('aria-label').includes('по местному времени'));assert.equal(Date.parse(deadline.getAttribute('datetime')),Date.parse(end));
 }
 const images=track.querySelectorAll('img');assert.equal(images.filter(img=>img.getAttribute('fetchpriority')==='high').length,2);assert(images.every(img=>img.getAttribute('sizes')==='(max-width:700px) calc(50vw - 38px), 190px'));
 const before=scans,first=track.querySelector('img');c.FasFeaturedLots.refresh();assert.equal(scans-before,3,'cached refresh only rechecks the three selected live rows');assert.strictEqual(track.querySelector('img'),first,'added labels and deadlines do not replace a stable card');
 for(const type of ['touchstart','touchmove','pointerdown','pointermove','wheel'])assert.equal(track.events[type],undefined,'native horizontal movement remains free of '+type+' handlers');
 c.bids={[lots[0].id]:{price:1200000}};c.FasFeaturedLots.refresh();assert.equal(track.querySelector('[data-current-lot-price="'+lots[0].id+'"]').textContent,c.money(1200000),'canonical bid updates refresh the visible price without replacing the photo rail');
}
{
 const sizing=featuredCSS.match(/flex:\s*0\s+0\s+calc\((\d+)%\s*-\s*(\d+)px\)/);assert(sizing);
 const sectionPadding=Number(featuredCSS.match(/\.discovery-catalog > #featured-lots\.featured-lots\s*\{[^}]*padding:\s*(\d+)px/s)[1]);
 for(const viewport of [320,360,375,390,430,700]){
  const section=viewport-36,trackContent=section-2-sectionPadding*2-4,card=trackContent*Number(sizing[1])/100-Number(sizing[2]);
  assert(card>=120,'two full photo cards retain useful width at '+viewport);assert(Math.abs(card*2+10-trackContent)<.001,'two cards plus gap fit without clipping at '+viewport);
  assert(Math.abs(card-(viewport*.5-38))<.001,'image sizes agrees with actual two-card CSS constraints at '+viewport);
  const countdownContent=viewport-36-2-34-28-2,unit=(countdownContent-4*4)/5;assert(unit>=40,'all five time units have room in the wide result card at '+viewport);
 }
 assert(!/touch-action|\.gallery/.test(css),'polish does not redefine native photo or gesture areas');
 const feedActionSelectors=new Set(['body.reels #grid .card-bottom.has-buy-action','body.reels #grid .card-bottom.has-buy-action > :is(.primary, .feed-buy-lot)','body.reels #grid .card-bottom.has-buy-action > .feed-buy-lot','body.reels #grid .feed-buy-lot small','body.reels #grid .card-bottom.has-buy-action > .bids']);
 for(const [,raw]of css.replace(/\/\*[\s\S]*?\*\//g,'').matchAll(/([^{}]+)\{[^{}]*\}/g)){const selector=raw.trim();if(/\.reels\s+#grid/.test(selector))assert(feedActionSelectors.has(selector),'only the explicitly requested feed action pair may change fullscreen styles: '+selector)}
 assert(/#modal\.lot-dialog #bid-form > \.purchase-submit[\s\S]*min-height:\s*54px/.test(css));
 assert(css.includes('[data-instant-buy]')&&css.includes('[data-descending-buy]')&&css.includes('.seller-buy-now'));
 const rgb=hex=>hex.match(/[a-f\d]{2}/gi).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4),contrast=hex=>{const [r,g,b]=rgb(hex);return 1.05/(.2126*r+.7152*g+.0722*b+.05)};
 assert(contrast('12685A')>=4.5&&contrast('0D4CD3')>=4.5,'both prominent action colors keep readable white text');
}
console.log('PASS: mobile card width constraints at 320–700px, truthful current price/deadline/distance, distinct legitimate buy/bid prices, honest after-auction payment, own/descending guards, responsive priorities and native horizontal movement. No browser geometry or device QA claimed.');
