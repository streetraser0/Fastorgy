const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {integration}=require('./helpers/category-multi-harness.cjs');
const now=Date.now(),base={name:'Лот с едиными действиями',category:'cars',subcategory:'cars',city:'Москва',regionCode:'77',bank:'Продавец',sellerType:'bank',status:'live',price:100000,start:100000,step:1000,deposit:0,startsAt:new Date(now-3600000).toISOString(),ends:new Date(now+86400000).toISOString(),comparables:[],bids:0};
const rows=[{...base,id:999884901},{...base,id:999884902,buyNowPrice:150000},{...base,id:999884903,sellerOwnerId:'seller-owner'}, {...base,id:999884904,sellerOwnerId:'other-seller',buyNowPrice:100500},{...base,id:999884905,auctionDirection:'descending',floorPrice:50000,decreaseStep:5000,decreaseIntervalMinutes:60}];
const h=integration({fixtures:rows,strictSelect:true}),c=h.context;
for(const file of ['auction-modes.js','payment-ui.js'])vm.runInContext(fs.readFileSync('dist/'+file,'utf8'),c);
const api=c.window.FasPayments,modal=h.field('modal'),content=h.field('modal-content');
// Match the real page containment; the small integration adapter creates ID nodes independently.
modal.appendChild(content);
function click(target){assert(target);const event={target,preventDefault(){this.prevented=true},stopPropagation(){this.stopped=true}};h.dispatchClick(event);return event}
function pair(){const box=content.querySelector('.lot-action-pair');assert(box);const buttons=box.querySelectorAll('button');assert.equal(buttons.length,2);assert(buttons.every(b=>b.classList.contains('primary')));assert.equal(buttons[0].textContent,'Участвуйте в торгах');assert.equal(buttons[1].querySelector('span').textContent,'Купить лот');assert(content.querySelector('#bid-form'));assert(content.querySelector('.purchase-demo').textContent.includes('Деньги не списываются'));for(const node of [...buttons,h.field('bid')])node.disabled=node.hasAttribute('disabled');return buttons}
// The actual catalogue click and the featured story click both reach openCar.
h.field('grid').onclick({target:h.field('grid').querySelector('[data-open="'+rows[0].id+'"]')});let [participate,buy]=pair();
const before=h.run('JSON.stringify({cars,bids})'),bid=h.field('bid'),form=h.field('bid-form');bid.value='123000';let submits=0;const submit=form.onsubmit;form.onsubmit=()=>{submits++};
click(participate);assert(h.document.activeElement===bid,'participation focuses the bid field');assert.equal(submits,0);assert.equal(bid.value,'123000');
click(buy.querySelector('span'));assert.equal(api.state().open,false);assert(h.document.activeElement===bid);assert.equal(submits,0);assert(h.field('toast').textContent.includes('по итогам торгов'));assert.equal(h.run('JSON.stringify({cars,bids})'),before);form.onsubmit=submit;modal.close();
const section=h.field('featured-lots');for(const id of ['featured-track','featured-note','featured-empty'])section.appendChild(h.field(id));
vm.runInContext(fs.readFileSync('dist/featured-lots.js','utf8'),c);c.window.FasFeaturedLots.setModes([]);
const story=section.querySelector('[data-featured-open="'+rows[0].id+'"]');assert(story);h.click(story);pair();modal.close();
h.run('reelsMode=true;document.body.classList.add("reels")');h.field('grid').innerHTML=h.run('cars.map(cardHTML).join("")');h.field('grid').onclick({target:h.field('grid').querySelector('[data-open="'+rows[0].id+'"]')});pair();modal.close();h.run('reelsMode=false;document.body.classList.remove("reels")');
// Fixed purchase uses the configured amount, and preserves the existing bid draft.
h.run('openCar('+rows[1].id+')');[participate,buy]=pair();h.field('bid').value='124000';const fixedButton=buy;click(buy);assert.equal(api.state().mode,'buy-now');assert.equal(api.state().amount,150000);assert.equal(api.state().canPay,false);assert.equal(h.field('payment-continue').disabled,true);api.close();assert.equal(h.field('bid').value,'124000');
// A stale fixed button cannot turn the current auction price into a purchase.
h.run('bids[cars[1].id]={price:160000,count:1}');click(fixedButton);assert.equal(api.state().open,false);assert(h.field('toast').textContent.includes('Условия выкупа изменились'));assert(h.document.activeElement===h.field('bid'));h.run('bids={}');
c.window.FasDialogLifecycle={top:()=>h.field('payment-dialog')};assert.equal(click(fixedButton).prevented,undefined,'a child dialog owns the interaction');assert.equal(api.state().open,false);delete c.window.FasDialogLifecycle;
modal.close();assert.equal(click(fixedButton).prevented,undefined,'closed lot actions are inert');
h.run('openCar('+rows[0].id+')');assert.equal(click(fixedButton).prevented,undefined,'detached previous lot actions are inert');modal.close();
h.run('openCar('+rows[3].id+')');[participate,buy]=pair();assert(participate.disabled);assert(h.field('bid').disabled);assert.equal(click(participate).prevented,undefined);click(buy);assert.equal(api.state().amount,100500);api.close();modal.close();
h.run('openCar('+rows[2].id+')');assert(!content.querySelector('.lot-action-pair'));assert(!content.querySelector('[data-lot-buy]'));modal.close();
h.run('openCar('+rows[4].id+')');assert(!content.querySelector('.lot-action-pair'));assert(!content.querySelector('#bid-form'));const descending=content.querySelector('[data-descending-buy]');assert(descending);assert.equal(descending.querySelector('span').textContent,'Купить лот');click(descending);assert.equal(api.state().mode,'buy-now');assert.equal(api.state().amount,h.run('current(cars[4])'));assert.equal(api.state().canPay,false);api.close();modal.close();
for(const change of ['cars[1].status="sold"','cars[1].ends=new Date(Date.now()-1000).toISOString()','cars[1].sellerOwnerId="seller-owner"']){
 h.run('cars[1].status="live";cars[1].ends=new Date(Date.now()+3600000).toISOString();delete cars[1].sellerOwnerId;openCar('+rows[1].id+')');buy=content.querySelector('[data-lot-buy]');h.run(change);click(buy);assert.equal(api.state().open,false);modal.close();
}
console.log('PASS: catalogue/story/reels entry shares the actual two-action lot block; participation only focuses the retained bid form; auction buy shows conditions; fixed/instant-only/descending routes preserve configured prices and demo limits; own/sold/expired/detached controls cannot purchase.');
