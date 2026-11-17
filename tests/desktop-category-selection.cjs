const assert=require('node:assert/strict');
const {integration,settle}=require('./helpers/category-multi-harness.cjs');
const base={bank:'Проверка',sellerType:'company',city:'Воронеж',regionCode:'36',status:'live',price:100000,start:100000,step:1000,deposit:0,ends:new Date(Date.now()+86400000).toISOString(),description:'Контроль имущества'};
const fixtures=[
 {...base,id:999695001,name:'Автомобиль контроль',category:'cars',subcategory:'cars'},
 {...base,id:999695002,name:'Стол контроль',category:'other',subcategory:'furniture'},
 {...base,id:999695003,name:'Чайник контроль',category:'other',subcategory:'home_appliances'},
 {...base,id:999695004,name:'Телефон контроль',category:'other',subcategory:'phones'},
 {...base,id:999695005,name:'Компьютер контроль',category:'other',subcategory:'computers'},
 {...base,id:999695006,name:'Квартира контроль',category:'property',subcategory:'property'},
 {...base,id:999695007,name:'Дом контроль',category:'property',subcategory:'houses'}
];
const picker=h=>h.document.querySelector('#category-picker');
const click=(h,selector)=>h.click(picker(h).querySelector(selector));
function eligible(h,id){return fixtures.filter(lot=>h.context.window.FasCategories.matches(lot,id)).map(lot=>lot.id).sort()}
async function applied(h,id){await settle(h);assert.equal(h.field('category').value,id);assert.deepEqual(Array.from(h.run('visibleLots.map(lot=>lot.id)')).sort(),eligible(h,id));}
(async()=>{
 const h=integration({fixtures,strictSelect:true}),UI=h.context.window.FasCategoryUI;h.context.window.FasDesktopWeb={active:()=>true};
 for(const [group,child]of [['home_garden','furniture'],['electronics','phones'],['real_estate','houses']]){
  h.run('$("#advanced-reset").onclick()');
  // The genuine home-tile event applies the section before a child is chosen.
  h.click(h.document.querySelector('[data-home-category="'+group+'"]'));await applied(h,group);assert(picker(h).open);assert(picker(h).querySelector('[data-category-node="'+child+'"]'));
  click(h,'[data-category-back]');assert(picker(h).open);await applied(h,group);
  click(h,'[data-category-close]');await applied(h,group);
  // Entering a section from the full picker also filters immediately.
  UI.open({value:group});click(h,'[data-category-node="'+group+'"]');await applied(h,group);
  click(h,'[data-category-node="'+child+'"]');assert(!picker(h).open);await applied(h,child);
 }
 console.log('PASS: desktop tiles and picker groups apply home, electronics and property immediately; child refinement and back/close preserve actual catalog filtering.');
 h.run('$("#advanced-reset").onclick()');h.field('search').value='контроль';h.field('search').oninput({});
 UI.open({value:''});click(h,'[data-category-node="home_garden"]');await applied(h,'home_garden');assert.equal(h.field('search').value,'контроль');
 // Checkboxes remain staged; cancel does not silently broaden the selection.
 click(h,'[data-category-toggle="furniture"]');await applied(h,'home_garden');click(h,'[data-category-close]');await applied(h,'home_garden');
 console.log('PASS: pending keyword search completes in the selected section; checkbox staging remains unapplied until confirmation.');
 let selected=null;UI.open({purpose:'sell',group:'real_estate',onSelect:id=>selected=id});await applied(h,'home_garden');click(h,'[data-category-node="houses"]');assert.equal(selected,'houses');await applied(h,'home_garden');
 UI.open({group:'electronics',onSelect:id=>selected=id});await applied(h,'home_garden');click(h,'[data-category-back]');click(h,'[data-category-node="real_estate"]');await applied(h,'home_garden');click(h,'[data-category-use="real_estate"]');assert.equal(selected,'real_estate');await applied(h,'home_garden');
 console.log('PASS: seller and callback-owned pickers never change the public catalog as a side effect.');
 h.context.window.FasDesktopWeb={active:()=>false};UI.open({group:'electronics',value:'home_garden'});await applied(h,'home_garden');click(h,'[data-category-back]');click(h,'[data-category-node="real_estate"]');await applied(h,'home_garden');click(h,'[data-category-close]');
 delete h.context.window.FasDesktopWeb;UI.open({group:'electronics'});await applied(h,'home_garden');click(h,'[data-category-close]');
 console.log('PASS: mobile/native/inactive or absent desktop gate retain the original staged category navigation.');
})().catch(error=>{console.error(error);process.exitCode=1});
