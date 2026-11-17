const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {boot}=require('./helpers/category-seller-harness.cjs'),{setup}=require('./helpers/quickbar-dom.cjs');
const h=boot({noMedia:true,fixtureInventory:[]});vm.runInContext(fs.readFileSync('dist/lot-presentation.js','utf8'),h.context);
const now=Date.now(),base={id:999882801,name:'Проверяемый лот',bank:'Продавец',city:'Москва',regionCode:'77',price:1000000,start:1000000,step:10000,deposit:0,year:2022,condition:'used',status:'live',startsAt:new Date(now-3600000).toISOString(),ends:new Date(now+86400000).toISOString(),comparables:[],description:'Описание от продавца',docs:'Осмотр по записи',specsDemo:true};
for(const fields of [
 {category:'cars',subcategory:'cars',name:'Toyota Camry',model:'Camry',km:62000,fuel:'petrol',transmission:'auto',powerHp:150,expected:'Мощность, л.с.',absent:'Площадь, м²'},
 {category:'property',subcategory:'houses',name:'Жилой дом',area:140,rooms:4,floor:1,totalFloors:2,expected:'Площадь, м²',absent:'Мощность, л.с.'},
 {category:'equipment',subcategory:'equipment',name:'Промышленный станок',manufacturer:'Производитель',powerKw:8,expected:'Мощность, кВт',absent:'Комнат'}
]){
 const {expected,absent,...data}=fields,lot={...base,...data};h.run('cars=['+JSON.stringify(lot)+'];bids={};');const before=h.run('JSON.stringify(cars[0])');h.run('openCar('+base.id+')');
 const html=h.node('#modal-content').innerHTML,dom=setup(),content=dom.add('detail-fixture');content.innerHTML=html;
 const layout=content.querySelector('.lot-detail-layout'),body=layout.querySelector('.purchase-body'),heading=body.querySelector('.lot-detail-heading'),offer=body.querySelector('.lot-detail-offer'),facts=body.querySelector('.lot-detail-facts');
 assert(layout&&heading&&offer&&facts);assert(layout.children[0].classList.contains('lot-swipe-surface'),'the original gallery remains the first mobile block');
 assert.deepEqual(body.children.map(node=>node.getAttribute('class')),['lot-detail-heading','lot-detail-offer','lot-detail-facts'],'mobile reading and focus order put the offer before detailed specifications');
 assert.equal(body.getAttribute('data-open-lot-id'),String(lot.id),'existing lot identity remains on purchase-body');assert(heading.querySelector('h2').textContent.includes(lot.name));
 assert.equal(content.querySelectorAll('#bid-form').length,1);assert(offer.querySelector('#bid-form'));assert(offer.querySelector('.purchase-submit'));assert.equal(facts.querySelector('#bid-form'),null);
 assert(offer.querySelector('.purchase-demo').textContent.includes('Реальные торги и покупка ещё не подключены'),'the actual demo/payment limitation stays next to the CTA');
 const overview=facts.querySelector('.lot-detail-overview'),specifications=facts.querySelector('.lot-detail-specifications'),secondary=facts.querySelector('.lot-detail-secondary'),more=facts.querySelector('.lot-detail-more');
 assert(overview&&specifications&&secondary&&more);assert.deepEqual(facts.children.map(node=>node.getAttribute('class')),['lot-detail-overview','lot-detail-specifications','lot-detail-secondary','lot-detail-more'],'desktop grouping retains mobile reading order: summary, facts, seller/contact, additional terms');
 const attributes=facts.querySelector('.object-attributes');assert(attributes);assert(specifications.contains(attributes));assert(more.contains(facts.querySelector('[data-open-support]')),'legal/help details remain after the seller block');assert.equal(attributes.closest('details'),null,'type-specific specifications are visible without expanding legal details');
 assert(attributes.children.some(node=>node.textContent.includes(expected)),fields.category+' retains its actual field labels');assert(!attributes.children.some(node=>node.textContent.includes(absent)),fields.category+' does not inherit another type’s fields');
 assert(html.includes('Характеристики демонстрационные'));assert(html.includes('Числовые характеристики демонстрационные'));assert(html.includes('Описание от продавца'));assert(html.includes('Осмотр по записи'));assert(facts.querySelector('[data-open-support]'));
 assert.equal(h.run('JSON.stringify(cars[0])'),before,'layout rendering does not modify the lot');
 h.node('#bid').value=0;h.node('#bid-form').onsubmit({preventDefault(){}});assert(h.node('#bid-error').textContent,'the original bid validation still handles the grouped form');assert.equal(h.node('#modal').open,true);assert.deepEqual(JSON.parse(h.run('JSON.stringify(bids)')),{});
}
console.log('PASS: actual lot rendering keeps gallery/identity, one validated CTA form, visible type-specific facts, honest demo limits, seller descriptions and mobile reading order without mutating lot data. Browser QA verifies column geometry.');
