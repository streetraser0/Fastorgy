const assert=require('assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
const {boot,raw,acceptedAgreementForFixture}=require('./helpers/category-seller-harness.cjs');
const modeSource=fs.readFileSync(path.resolve(__dirname,'../dist/auction-modes.js'),'utf8');
const down={...raw,auctionDirection:'descending',floorPrice:'700000',decreaseStep:'50000',decreaseIntervalMinutes:'15',durationPreset:'60'};

function setup(data=down,records){
 const stored={version:1,profile:{id:'seller-owner',displayName:'Частный Продавец',phone:'+79991234567',regionCode:'36',city:'Воронеж',agreementAcceptance:acceptedAgreementForFixture()},drafts:[{id:'draft-down',ownerId:'seller-owner',data,mediaRefs:[{id:'idb:image-12345678',kind:'image',size:1024}],updatedAt:new Date().toISOString()}]};
 const h=boot({records:records||{'fas-seller-workspace-v1':JSON.stringify(stored)}});
 vm.runInContext(modeSource,h.context);
 const fields=new Map(),controls=new Map(),labels=new Map(),form=h.node('#seller-listing-form');
 const field=name=>{if(!fields.has(name))fields.set(name,{name,value:String(data[name]??''),checked:!!data[name],disabled:false,dataset:{},closest(){if(!labels.has(name))labels.set(name,{hidden:false});return labels.get(name)}});return fields.get(name)};
 Object.keys(data).forEach(field);
 const control=selector=>{if(!controls.has(selector))controls.set(selector,{hidden:false,innerHTML:'',attributes:{},setAttribute(name,value){this.attributes[name]=String(value)},getAttribute(name){return this.attributes[name]??null}});return controls.get(selector)};
 form.elements={namedItem:field};form.querySelector=control;
 h.context.FormData=function(target){assert.equal(target,form);return [...fields].filter(([,node])=>!node.disabled).map(([name,node])=>[name,node.value])};
 function change(name,value){const target=field(name);target.value=String(value);form.events.change({target})}
 return {h,form,field,control,labels,change};
}

(async()=>{
 let s=setup(),{h}=s;h.run('window.FasSellerUI.openEditor("draft-down")');
 const html=h.node('#modal-content').innerHTML;
 assert.equal(s.control('[data-category-form="seller"]').getAttribute('aria-disabled'),'false','a new draft exposes its editable category through real DOM attributes');
 for(const name of ['auctionDirection','floorPrice','decreaseStep','decreaseIntervalMinutes'])assert(html.includes('name="'+name+'"'));
 assert.equal(s.control('[data-descending-settings]').hidden,false);
 assert.equal(s.field('stepValue').disabled,true,'ascending-only controls are excluded from browser FormData');
 assert.equal(s.field('floorPrice').disabled,false);
 assert(h.node('#seller-publish-summary').innerHTML.includes('Торги на понижение'));
 s.change('auctionDirection','ascending');assert.equal(s.control('[data-descending-settings]').hidden,true);assert.equal(s.field('floorPrice').disabled,true);assert.equal(s.field('stepValue').disabled,false);
 s.change('auctionDirection','descending');
 await h.click({sellerSave:''});
 const draft=JSON.parse(h.records['fas-seller-workspace-v1']).drafts[0].data;
 assert.equal(draft.auctionDirection,'descending');assert.equal(draft.floorPrice,'700000');assert.equal(draft.decreaseStep,'50000');assert.equal(draft.decreaseIntervalMinutes,'15');assert.equal(draft.antiSniping,false);
 await h.publish();
 let lot=JSON.parse(h.records['fas-lots']).find(item=>item.sellerOwnerId);
 assert(lot,'descending private lot is publishable');
 assert.equal(lot.auctionDirection,'descending');assert.equal(lot.auctionType,'dutch');assert.equal(lot.step,50000);assert.equal(lot.floorPrice,700000);assert.equal(lot.decreaseIntervalMinutes,15);assert.equal(lot.antiSniping,false);assert.equal(lot.buyNowPrice,null);assert.equal(lot.reservePrice,null);
 assert.equal(h.run('window.FasSellerRules.nextBid(cars.find(c=>c.sellerOwnerId))'),null);
 assert.equal(h.run('window.FasSellerRules.validateBid(cars.find(c=>c.sellerOwnerId),1050000).valid'),false);
 assert.equal(h.run('window.FasSellerUI.details(cars.find(c=>c.sellerOwnerId)).includes("data-seller-buy-now")'),false,'descending uses the generic current-price purchase flow');
 const starts=Date.parse(lot.startsAt);
 h.context.testLot=lot;h.context.testNow=starts+30*60000;
 assert.equal(h.run('window.FasAuctionModes.currentPrice(testLot,testNow)'),900000);
 assert.equal(lot.price,1000000,'quote never mutates the published baseline');
 h.context.testLot={...lot,decreaseIntervalMinutes:61,durationMinutes:undefined};
 assert.equal(h.run('window.FasSellerRules.getAuctionState(testLot,testNow)'),'unavailable','actual-time invalid schedules cannot be bought or resumed');
 h.context.testLot={...lot,decreaseIntervalMinutes:60,durationMinutes:undefined};assert.equal(h.run('window.FasSellerRules.getAuctionState(testLot,testNow)'),'live');

 // A forged edit cannot alter the fixed terms of an already published descending lot.
 const original=lot;
 s=setup({...down,auctionDirection:'ascending',floorPrice:'1',decreaseStep:'1',decreaseIntervalMinutes:'1',startPrice:'1',durationValue:'30',durationUnit:'days',description:raw.description+' Уточнение.'},h.records);h=s.h;
 h.run('window.FasSellerUI.openEditor('+original.id+')');await h.publish();
 lot=JSON.parse(h.records['fas-lots']).find(item=>item.id===original.id);
 for(const key of ['auctionDirection','floorPrice','decreaseStep','decreaseIntervalMinutes','startPrice','startsAt','ends'])assert.equal(lot[key],original[key],key+' remains immutable');
 assert.equal(lot.description,raw.description+' Уточнение.');

 for(const overrides of [{floorPrice:''},{decreaseStep:''},{decreaseIntervalMinutes:'61'}]){
  s=setup({...down,...overrides});h=s.h;h.run('window.FasSellerUI.openEditor("draft-down")');await h.publish();
  assert.equal(h.run('cars.some(c=>c.sellerOwnerId)'),false,'incomplete or invalid lowering settings do not publish');
  assert(h.node('#seller-error').textContent);
 }
 console.log('PASS: seller direction switching, browser-disabled controls, down draft/publication, computed purchase price, bid rejection, actual schedule guard and immutable published terms.');
})().catch(error=>{console.error(error);process.exitCode=1});
