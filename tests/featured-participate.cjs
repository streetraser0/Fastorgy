const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {integration}=require('./helpers/category-multi-harness.cjs');
const now=Date.now(),base={name:'Участие из верхней ленты',category:'cars',subcategory:'cars',city:'Москва',regionCode:'77',bank:'Продавец',sellerType:'bank',status:'live',price:100000,start:100000,step:1000,deposit:0,startsAt:new Date(now-3600000).toISOString(),ends:new Date(now+86400000).toISOString(),comparables:[],bids:0};
const rows=[{...base,id:999884921},{...base,id:999884922,auctionDirection:'descending',floorPrice:50000,decreaseStep:5000,decreaseIntervalMinutes:60},{...base,id:999884923,sellerOwnerId:'seller-owner'},{...base,id:999884924,sellerOwnerId:'other-seller',buyNowPrice:100500}];
const h=integration({fixtures:rows,strictSelect:true}),c=h.context,modal=h.field('modal'),content=h.field('modal-content');
modal.appendChild(content);
for(const file of ['auction-modes.js','payment-ui.js'])vm.runInContext(fs.readFileSync('dist/'+file,'utf8'),c);
const section=h.field('featured-lots');for(const id of ['featured-track','featured-note','featured-empty'])section.appendChild(h.field(id));
vm.runInContext(fs.readFileSync('dist/featured-lots.js','utf8'),c);c.window.FasFeaturedLots.setModes([]);
const button=id=>section.querySelector('[data-featured-participate="'+id+'"]');
assert.equal(section.querySelectorAll('[data-featured-participate]').length,section.querySelectorAll('[data-featured-lot]').length);
const state=()=>h.run('JSON.stringify({bids,lots:cars.map(c=>({id:c.id,price:c.price,status:c.status,bids:c.bids}))})');
const before=state(),payment=c.window.FasPayments;
for(const row of rows) {
 const action=button(row.id);assert(action);assert.equal(action.getAttribute('type'),'button');assert.equal(action.querySelector('span').textContent,'Участвовать в торгах');
 h.click(action);assert.equal(modal.open,true);assert.equal(Number(content.querySelector('[data-open-lot-id]').dataset.openLotId),row.id);
 assert.equal(state(),before,'opening participation never changes bids or lot prices');assert.equal(payment.state().open,false,'participation never starts payment');
 if(row.id===rows[0].id)assert.strictEqual(h.document.activeElement,h.field('bid'),'normal auction goes directly to its bid input');
 if(row.auctionDirection==='descending')assert(!content.querySelector('#bid-form'),'descending auction retains its existing offer');
 if(row.sellerOwnerId==='seller-owner')assert(!content.querySelector('[data-lot-buy]'),'own listing keeps participation protections');
 const currentId=Number(content.querySelector('[data-open-lot-id]').dataset.openLotId);
 h.click(button(rows.find(item=>item.id!==row.id).id));
 assert.equal(Number(content.querySelector('[data-open-lot-id]').dataset.openLotId),currentId,'hidden background CTA cannot replace the open dialog');
 modal.close();
}
const stale=button(rows[0].id);
h.run('cars.find(c=>c.id==='+rows[0].id+').status="sold"');h.click(stale);
assert.equal(modal.open,false,'stale sold lot cannot reopen');assert.equal(button(rows[0].id),null,'unavailable card is removed');
assert.equal(payment.state().open,false);
console.log('PASS: each featured lot has a keyboard-native CTA; correct lot and bid focus; no automatic bid/payment; descending/own/buy-now protections; background dialog guard; stale lot rejection.');

