/* Exercise real openCar markup, with the browser's strict insertBefore contract. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {boot}=require('./helpers/category-seller-harness.cjs');
const {setup}=require('./helpers/quickbar-dom.cjs');
const root=path.resolve(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,'dist',file),'utf8');
const lot={id:999884291,name:'Проверка вложенной карточки',category:'cars',subcategory:'cars',bank:'Проверочный продавец',sellerType:'bank',demo:true,status:'live',price:1000000,start:1000000,step:10000,deposit:0,condition:'used',year:2022,city:'Москва',regionCode:'77',ends:'2099-01-01T00:00:00Z',description:'Описание продавца',docs:'Осмотр по записи'};
const renderer=boot({fixtureInventory:[],noMedia:true});
vm.runInContext(read('lot-presentation.js'),renderer.context);
renderer.run('cars='+JSON.stringify([lot])+';openCar('+lot.id+')');
const realHTML=renderer.node('#modal-content').innerHTML;
assert(realHTML.includes('lot-detail-offer')&&realHTML.includes('lot-detail-facts'),'test uses actual current nested lot output');

for(const mode of ['actual','actual-without-seller-links','legacy-flat','legacy-nested-price']){
 const h=setup({mobile:true}),ctx=h.context,records={};
 // The shared lightweight DOM normally appends on an invalid reference. Real
 // browsers throw; enforcing that rule prevents this exact integration bug.
 h.Element.prototype.insertBefore=function(node,before){
  if(before!=null&&(before.parentElement!==this||!this.children.includes(before)))throw new Error('NotFoundError: insertBefore reference is not a direct child');
  if(node.parentElement)node.parentElement.children=node.parentElement.children.filter(item=>item!==node);
  node.parentElement=this;const index=before==null?-1:this.children.indexOf(before);
  if(index<0)this.children.push(node);else this.children.splice(index,0,node);return node;
 };
 Object.assign(ctx,{URL,URLSearchParams,navigator:{},location:{href:'https://example.test/',search:''},cars:[lot],isLotLive:item=>item.status==='live',current:item=>item.price,money:value=>String(value)+' ₽',image:()=> 'assets/cars.svg',localStorage:{getItem:key=>records[key]??null,setItem:(key,value)=>records[key]=String(value),removeItem:key=>delete records[key]}});
 ctx.FasSellerUI.getProfile=()=>({id:'qa-owner'});
 let originalPrice,originalForm;
 ctx.openCar=()=>{
  const flat='<div class="purchase-body" data-open-lot-id="'+lot.id+'"><h2>Лот</h2><div class="purchase-location"></div>'+ (mode==='legacy-nested-price'?'<section class="price-wrapper">':'')+'<div class="purchase-price"></div>'+(mode==='legacy-nested-price'?'</section>':'')+'<form id="bid-form" data-lot-id="'+lot.id+'"><input id="bid" value="1010000"></form></div>';
  h.content.innerHTML=mode.startsWith('actual')?realHTML:flat;
  if(mode==='actual-without-seller-links')h.content.querySelector('.seller-public-links')?.remove();
  h.modal.classList.add('lot-dialog');h.modal.open=true;
  originalPrice=h.content.querySelector('.purchase-price');originalForm=h.content.querySelector('#bid-form');
 };
 for(const file of ['buyer-tools.js','seller-ratings.js','messages.js'])vm.runInContext(read(file),ctx,{filename:file});
 assert.doesNotThrow(()=>ctx.openCar(lot.id),mode+' initial decoration must respect real DOM ancestry');
 assert.doesNotThrow(()=>{h.notify();ctx.FasSellerRatings.refresh();ctx.FasMessages.decorate();h.notify();},mode+' repeated mutation/price refresh');
 for(const selector of ['.buyer-lot-tools','.seller-rating-line','[data-message-lot]'])assert.equal(h.content.querySelectorAll(selector).length,1,mode+' one '+selector);
 assert.equal(h.content.querySelector('.purchase-price'),originalPrice,'price node survives decoration');
 assert.equal(h.content.querySelector('#bid-form'),originalForm,'bid form and handlers are not replaced');
 if(mode.startsWith('actual')){
  const facts=h.content.querySelector('.lot-detail-facts'),offer=h.content.querySelector('.lot-detail-offer');
  assert.equal(offer.firstChild,originalPrice,'current price stays first in the offer column');
  assert(facts.contains(h.content.querySelector('.buyer-lot-tools'))&&facts.contains(h.content.querySelector('.seller-rating-line')),'auxiliary actions belong to the facts column');
  assert(facts.contains(h.content.querySelector('[data-message-lot]')),'message action works with or without seller links');
  const secondary=facts.querySelector('.lot-detail-secondary');if(secondary){for(const selector of ['.buyer-lot-tools','.seller-rating-line','[data-message-lot]'])assert(secondary.contains(h.content.querySelector(selector)),selector+' stays below the primary specifications');const specifications=facts.querySelector('.lot-detail-specifications');assert(specifications?.contains(facts.querySelector('.object-attributes')));assert(facts.children.indexOf(secondary)>facts.children.indexOf(specifications),'secondary tools follow the specifications in mobile reading/focus order')}
 }
 console.log('PASS: '+mode+' inserts buyer/rating/message controls once without replacing price or bid form.');
}
