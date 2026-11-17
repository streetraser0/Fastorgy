const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const {integration,settle}=require('./helpers/category-multi-harness.cjs');
const context={window:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../dist/category-tree.js'),'utf8'),context);const T=context.window.FasCategories;
const plain=value=>JSON.parse(JSON.stringify(value));
assert.deepEqual(plain(T.selection('property,cars,cars')),['cars','property']);
assert.equal(T.selectionValue(['property','cars','cars']),'cars,property');
assert.deepEqual(plain(T.selection(['transport','cars','property'])),['transport','property']);
assert.equal(T.selectionValue(T.groups().map(group=>group.id)),'');assert.equal(T.selectionValue(T.leaves().map(leaf=>leaf.id)),'');
for(const value of ['unknown','cars,,property','cars,<img>',['cars','unknown'],[7],{category:'cars'}])assert.equal(T.selection(value),null,'invalid mixed selections fail closed');
assert(!T.matches({category:'cars'},'cars,unknown'));assert(T.matches({category:'cars'},'cars,property'));assert(T.matches({category:'property',subcategory:'property'},'cars,property'));assert(!T.matches({category:'other',subcategory:'kitchenware'},'cars,property'));
assert.equal(T.filterFamily('cars,trucks'),'vehicle');assert.equal(T.filterFamily('property,houses'),'property');assert.equal(T.filterFamily('cars,property'),'general');assert.deepEqual(new Set(T.filterFamilies('cars,property')),new Set(['vehicle','property']));
assert(T.label('cars,property').includes('Квартиры'));assert.equal(T.get('cars,property'),null,'single-node get is unchanged');assert(T.optionsHTML('cars,property',{includeAll:true}).includes('value="cars,property" selected'));assert(T.optionsHTML(['transport','cars'],{includeAll:true,includeGroups:true}).includes('value="transport" selected'));
const now=Date.now(),base={bank:'Тестовый банк',sellerType:'bank',city:'Воронеж',regionCode:'36',year:2022,status:'live',start:100000,step:1000,deposit:0,ends:new Date(now+86400000).toISOString(),description:'Контроль имущества',price:2000000};
const fixtures=[
 {...base,id:999681001,category:'cars',subcategory:'cars',name:'Дизельный автомобиль',brand:'Toyota',fuel:'diesel',mileage:50000},
 {...base,id:999681002,category:'cars',subcategory:'cars',name:'Бензиновый автомобиль',brand:'Toyota',fuel:'petrol',mileage:40000},
 {...base,id:999681003,category:'property',subcategory:'property',name:'Двухкомнатная квартира',rooms:2,area:60,price:3000000},
 {...base,id:999681004,category:'property',subcategory:'property',name:'Трёхкомнатная квартира',rooms:3,area:80,price:4000000},
 {...base,id:999681005,category:'property',subcategory:'houses',name:'Дом с участком',rooms:2,area:100,price:4000000},
 {...base,id:999681006,category:'other',subcategory:'kitchenware',name:'Кухонный набор',price:1000},
 {...base,id:999681007,category:'other',subcategory:'phones',name:'Смартфон',price:30000},
 {...base,id:999681008,category:'trucks',subcategory:'trucks',name:'Грузовой автомобиль',fuel:'diesel',price:3000000}
];
function choose(h,selector){h.click(h.document.querySelector('#category-picker').querySelector(selector))}
function change(h,id){const node=h.field(id);return node.onchange?.({target:node})}
(async()=>{
 const h=integration({fixtures,strictSelect:true}),UI=h.context.window.FasCategoryUI;
 h.field('category').value='cars,property';assert.equal(h.field('category').value,'','browser-like native select rejects a composite without its synthetic option');
 assert.equal(UI.setValue('cars,property'),'cars,property');assert.equal(h.field('category').value,'cars,property');
 UI.selectBrowse('property');await settle(h);
 for(const [id,value]of Object.entries({'search':'контроль','region-filter':'36',city:'Воронеж',budget:'5000000',sort:'high','adv-price-min':'50000','adv-rooms-min':'2','adv-rooms-max':'2'}))h.field(id).value=value;
 h.run('window.FasRestoreManualKeywordCategory($("#search").value);render()');
 UI.open({value:h.field('category').value});choose(h,'[data-category-node="transport"]');choose(h,'[data-category-toggle="cars"]');
 assert(h.document.querySelector('#category-picker').open,'checkboxes stage a choice without replacing the current list');
 assert.equal(h.field('category').value,'property');choose(h,'[data-category-apply]');await settle(h);
 assert.equal(h.field('category').value,'cars,property');
 for(const [id,value]of Object.entries({'search':'контроль','region-filter':'36',city:'Воронеж',budget:'5000000',sort:'high','adv-price-min':'50000','adv-rooms-min':'2','adv-rooms-max':'2'}))assert.equal(h.field(id).value,value,'applying multiple categories preserves '+id);
 assert.equal(h.field('advanced-vehicle').hidden,false);assert.equal(h.field('advanced-property').hidden,false);
 h.field('adv-fuel').value='diesel';h.run('render()');assert.deepEqual(Array.from(h.run('visibleLots.map(lot=>lot.id)')),[999681003,999681001],'room constraints apply to property, fuel constraints to transport, with global price sorting');
 // New query text cannot silently replace the explicit multi-category choice.
 h.run('window.FasSyncKeywordCategory("контроль имущества");render()');assert.equal(h.field('category').value,'cars,property');
 h.run('saveCurrentSearch()');assert.equal(h.run('pendingSavedSearch.category'),'cars,property');
 assert(h.run('matchesSavedSearch(pendingSavedSearch,cars.find(lot=>lot.id===999681001))'));assert(h.run('matchesSavedSearch(pendingSavedSearch,cars.find(lot=>lot.id===999681003))'));assert(!h.run('matchesSavedSearch(pendingSavedSearch,cars.find(lot=>lot.id===999681006))'));
 assert.equal(h.field('sub-category').value,'cars,property','subscription form keeps its synthetic composite option selected');h.run('$("#subscription-form").onsubmit({preventDefault(){}})');assert.equal(h.run('subscriptions[0].category'),'cars,property');assert(h.field('modal-content').innerHTML.includes(T.label('cars,property')),'subscription rows show a friendly multi-category label');
 h.run('applySavedSearch(subscriptions[0].search)');assert.equal(h.field('category').value,'cars,property','saved searches restore the native composite option');
 h.run('render()');const preferences=JSON.parse(h.records['fas-search-preferences-v1']);assert.equal(preferences.basic.category,'cars,property');assert.equal(preferences.categoryAutomatic,false);
 const reloaded=integration({fixtures,strictSelect:true,records:{'fas-search-preferences-v1':JSON.stringify(preferences)}});await settle(reloaded);
 assert.equal(reloaded.field('category').value,'cars,property','real native-value constraints do not broaden restored multi-selection to all');assert.equal(reloaded.field('search').value,'','reload clears text while keeping the chosen categories and other filters');assert.equal(reloaded.field('sort').value,'high');assert.equal(reloaded.field('adv-fuel').value,'diesel');assert.deepEqual(Array.from(reloaded.run('visibleLots.map(lot=>lot.id)')),[999681003,999681001]);
 const longSelection=T.selectionValue(T.leaves().filter((_,index)=>index%2===0).map(node=>node.id));assert(longSelection.length>100);
 const many=integration({fixtures,strictSelect:true,records:{'fas-search-preferences-v1':JSON.stringify({version:1,categoryAutomatic:false,basic:{category:longSelection},advanced:{},tab:'all'})}});await settle(many);assert.equal(many.field('category').value,longSelection,'large category combinations are not truncated to 100 characters');
 const invalid=integration({fixtures,strictSelect:true,records:{'fas-search-preferences-v1':JSON.stringify({version:1,basic:{category:'cars,unknown',search:'контроль'},advanced:{},tab:'all'})}});await settle(invalid);assert.equal(invalid.run('visibleLots.length'),0,'invalid stored composites fail closed instead of silently broadening to all');
 // Full groups and all categories can be toggled, and cancellation is reversible.
 UI.open({value:h.field('category').value});choose(h,'[data-category-clear-all]');assert(h.document.querySelector('[data-category-apply]').disabled);choose(h,'[data-category-select-all]');choose(h,'[data-category-apply]');await settle(h);assert.equal(h.field('category').value,'');assert.equal(h.field('search').value,'контроль');assert.equal(h.field('adv-fuel').value,'diesel');assert.equal(h.field('adv-rooms-min').value,'2');
 UI.open({value:''});choose(h,'[data-category-clear-all]');choose(h,'[data-category-toggle="real_estate"]');choose(h,'[data-category-apply]');await settle(h);assert.equal(h.field('category').value,'real_estate');assert.equal(h.field('adv-rooms-min').value,'2');assert.equal(h.field('adv-fuel').value,'','incompatible transport fields clear only when that family is explicitly removed');
 UI.open({value:'real_estate'});choose(h,'[data-category-clear-all]');choose(h,'[data-category-close]');assert.equal(h.field('category').value,'real_estate','closing a staged picker does not change applied criteria');
 UI.selectBrowse('transport');await settle(h);h.run('window.FasSyncKeywordCategory("грузовой автомобиль");render()');assert.equal(h.field('category').value,'transport','an explicitly selected full group is not lost when new keywords infer one child');
 // Placement remains single-category and preserves its surrounding editor.
 h.field('modal').open=true;h.field('modal-content').innerHTML='<form id="multi-editor"><textarea>Не потерять</textarea></form>';const editor=h.field('modal-content').innerHTML;let selected;
 UI.open({purpose:'sell',onSelect:id=>{selected=id}});assert.equal(h.document.querySelector('#category-picker').querySelector('[data-category-toggle]'),null);assert.equal(h.document.querySelector('#category-picker').querySelector('[data-category-apply]'),null);choose(h,'[data-category-node="real_estate"]');choose(h,'[data-category-node="houses"]');assert.equal(selected,'houses');assert.equal(h.field('modal-content').innerHTML,editor);

 const allChoice=integration({fixtures,strictSelect:true});allChoice.context.window.FasCategoryUI.selectBrowse('');await settle(allChoice);
 assert.equal(allChoice.run('window.FasCatalogBuyerContext().explicitAll'),true,'an explicit All selection overrides older personalized category restrictions');
 const allPrefs=JSON.parse(allChoice.records['fas-search-preferences-v1']);assert.equal(allPrefs.categoryExplicit,true);
 const allReload=integration({fixtures,strictSelect:true,records:{'fas-search-preferences-v1':JSON.stringify(allPrefs)}});await settle(allReload);
 assert.equal(allReload.run('window.FasCatalogBuyerContext().explicitAll'),true,'explicit all survives native-select preference restoration');
 allReload.run('$("#advanced-reset").onclick()');assert.equal(allReload.run('window.FasCatalogBuyerContext().explicitAll'),false,'reset returns to automatic category suggestions');
 console.log('PASS: canonical multi-category OR, groups/all/invalid selections, real browse checkboxes/apply/cancel, compatible family filters, exact saved queries and strict native-select restoration; seller selection stays single.');
})().catch(error=>{console.error(error);process.exitCode=1});
