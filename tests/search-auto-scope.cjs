const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module');
const {boot}=require('./helpers/category-seller-harness.cjs');
const h=boot(),run=h.run;
const base={bank:'Тестовый продавец',sellerType:'private',status:'live',city:'Воронеж',regionCode:'36',price:100000,start:100000,step:1000,deposit:0,ends:new Date(Date.now()+86400000).toISOString(),demo:false,latitude:51.66};
const definitions=[
 ['equipment','equipment','Механизм Ситрк','',''],
 ['trucks','trucks','Седельный тягач SITRAK C7H','SITRAK','C7H'],
 ['other','phones','Телефон Xiaomi Redmi Note 13','Xiaomi','Redmi Note 13'],
 ['cars','cars','Xiaomi SU7','Xiaomi','SU7'],
 ['other','home_appliances','Кондиционер Mitsubishi Electric','Mitsubishi','Electric'],
 ['machinery','machinery','Экскаватор XCMG XE215','XCMG','XE215'],
 ['machinery','machinery','Автокран SANY STC250','SANY','STC250'],
 ['other','furniture','Шкаф MINI','',''],
 ['cars','cars','MINI Cooper','MINI','Cooper'],
 ['other','phones','Телефон Smart','',''],
 ['cars','cars','Smart Fortwo','Smart','Fortwo'],
 ['equipment','equipment','Fuel tank 1000L','',''],
 ['cars','cars','TANK 300','TANK','300'],
 ['trucks','trucks','Самосвал HOWO T5G','HOWO','T5G']
];
const fixtures=definitions.map(([category,subcategory,name,brand,model],index)=>({...base,id:991190000+index,category,subcategory,name,brand,manufacturer:brand,model,longitude:39.2+index*.01}));
Object.assign(fixtures[3],{regionCode:'77',city:'Москва',latitude:55.756,longitude:37.617});
run('cars='+JSON.stringify(fixtures)+';ends.length=0;cars.forEach(lot=>ends.push(Date.parse(lot.ends)));window.FasSubscriptionCache.invalidate();window.FasKeywordSearch.invalidate();userGeo={point:[51.66,39.2],approximate:false};$("#sort").value="nearest";');
const ids=()=>Array.from(run('visibleLots.map(lot=>lot.id)'));
const search=query=>run('applyKeywordSearch('+JSON.stringify(query)+')');
const direct=query=>Array.from(run('cars.filter(lot=>window.FasKeywordSearch.matches(lot,'+JSON.stringify(query)+')).map(lot=>lot.id)'));
for(const [query,expected] of [
 ['Ситрк',[991190000,991190001]],['Ситрак',[991190001]],
 ['Xiaomi',[991190002,991190003]],['Mitsubishi',[991190004]],
 ['XCMG',[991190005]],['SANY',[991190006]],
 ['MINI',[991190007,991190008]],['Шкаф Mini',[991190007]],
 ['Smart',[991190009,991190010]],['Телефон Smart',[991190009]],
 ['Tank',[991190011,991190012]],['Fuel tank',[991190011]]
]){
 assert.deepEqual(direct(query),expected,'keyword engine has the genuine '+query+' matches');
 search(query);assert.deepEqual(ids(),expected,'automatic category cannot hide '+query+' matches');
 assert(run('visibleLots.every((lot,index)=>!index||distanceToLot(visibleLots[index-1])<=distanceToLot(lot))'));
}
assert.equal(typeof h.context.window.FasKeywordCategoryScope,'function');
// An unambiguous current result may select a leaf, while its automatic scope
// stays open to a future matching listing in another asset category.
search('XCMG');assert.equal(h.node('#category').value,'machinery');
assert.equal(run('window.FasKeywordCategoryScope($("#search").value,$("#category").value)'), '');
run('saveCurrentSearch()');assert.equal(run('pendingSavedSearch.category'),'');
assert(run('matchesSavedSearch(pendingSavedSearch,{...cars[5],id:991199001,category:"trucks",subcategory:"trucks",name:"Грузовик XCMG"})'),'automatic saved searches include future matching categories');
search('Xiaomi');run('saveCurrentSearch()');assert.equal(run('pendingSavedSearch.category'),'');
for(const id of [991190002,991190003])assert(run('matchesSavedSearch(pendingSavedSearch,cars.find(lot=>lot.id==='+id+'))'));
// Empty saved constraints must not fall through to the current display leaf or
// the user's preferred region when the follow-search form is constructed.
run('window.scopeAuditAllLots=cars;cars=cars.filter(lot=>lot.id!==991190003);ends.length=0;cars.forEach(lot=>ends.push(Date.parse(lot.ends)));invalidateSubscriptionInventory();window.FasKeywordSearch.invalidate();');
search('Xiaomi');assert.equal(h.node('#category').value,'phones');
run('userRegion={code:"36",scope:"region"};$("#region-filter").value="";saveCurrentSearch()');
assert.equal(run('pendingSavedSearch.category'),'');assert.equal(run('pendingSavedSearch.regionCode'),'');
const subscriptionHTML=h.node('#modal-content').innerHTML;
const categoryOptions=subscriptionHTML.match(/<select id="sub-category">([\s\S]*?)<\/select>/)?.[1],regionOptions=subscriptionHTML.match(/<select id="sub-region">([\s\S]*?)<\/select>/)?.[1];
assert(categoryOptions&&regionOptions);
assert(!/<option\b(?=[^>]*value="phones")(?=[^>]*\bselected\b)[^>]*>/.test(categoryOptions),'automatic display category is not selected in the all-category saved-search form');
assert(!/<option\b(?=[^>]*value="36")(?=[^>]*\bselected\b)[^>]*>/.test(regionOptions),'empty saved region does not select the profile region');
h.node('#sub-category').value='';h.node('#sub-region').value='';h.node('#sub-budget').value='';h.node('#subscription-form').onsubmit({preventDefault(){}});
assert.equal(run('subscriptions.length'),1);assert.equal(run('subscriptions[0].category'),'');assert.equal(run('subscriptions[0].regionCode'),'');
assert.equal(run('subscriptions[0].search.category'),'');assert.equal(run('subscriptions[0].search.regionCode'),'');
const durable=JSON.parse(h.records['fas-subscriptions']);assert.equal(durable[0].category,'');assert.equal(durable[0].regionCode,'');
run('cars=window.scopeAuditAllLots;delete window.scopeAuditAllLots;ends.length=0;cars.forEach(lot=>ends.push(Date.parse(lot.ends)));invalidateSubscriptionInventory();window.FasKeywordSearch.invalidate();');
search('Xiaomi');assert(run('lotNotices.some(notice=>notice.lotId===991190003)'),'a later matching car reaches the search originally saved from a phone-only result');
// The same query submitted after an explicit category selection must retain it.
h.node('#category').value='cars';h.node('#category').onchange();
assert.equal(run('window.FasKeywordCategoryScope($("#search").value,$("#category").value)'),'cars');
assert.deepEqual(ids(),[991190003]);h.node('#filters').onsubmit({preventDefault(){}});assert.deepEqual(ids(),[991190003]);
run('saveCurrentSearch()');assert.equal(run('pendingSavedSearch.category'),'cars');
assert(!run('matchesSavedSearch(pendingSavedSearch,cars.find(lot=>lot.id===991190002))'));
// A new vehicle query cannot inherit a contradictory manufacturer restriction.
search('Ситрак');h.node('#brand').value='SITRAK';h.node('#city').value='Воронеж';h.node('#region-filter').value='36';h.node('#budget').value='150000';h.node('#adv-price-min').value='50000';run('render()');
const filters=Number(h.node('#advanced-filter-count').textContent.match(/\d+/)?.[0]||0);assert(filters>=3,'brand and city are visible in the active advanced filter count');
assert(h.node('#keyword-search-feedback').innerHTML.includes('SITRAK'));assert(h.node('#keyword-search-feedback').innerHTML.includes('Воронеж'));
h.node('#search').value='HOWO';run('window.FasSyncKeywordCategory("HOWO");render()');
assert.equal(h.node('#brand').value,'');assert.deepEqual(ids(),[991190013]);
assert.equal(h.node('#region-filter').value,'36');assert.equal(h.node('#budget').value,'150000');assert.equal(h.node('#adv-price-min').value,'50000');

// Exercise the actual asynchronous UI preparation layer with the production
// scope helper, so it does not warm only the misleading automatic leaf.
const filename=path.resolve('tests/search-preferences.cjs'),source=fs.readFileSync(filename,'utf8');
const sandbox={module:{exports:{}},require:createRequire(filename),__dirname:path.dirname(filename),console,URLSearchParams};vm.createContext(sandbox);vm.runInContext(source.slice(0,source.indexOf('\nlet e=run'))+'\nmodule.exports={run};',sandbox);
const settle=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve()};
function preparationUI(category){
 const ui=sandbox.module.exports.run(null),jobs=[];
 ui.context.cars=fixtures.filter(lot=>[991190002,991190003].includes(lot.id));
 ui.context.categoryMatches=(lot,value)=>lot.subcategory===value;ui.context.getRegionCode=lot=>lot.regionCode;
 ui.context.FasKeywordCategoryScope=h.context.window.FasKeywordCategoryScope;
 ui.context.FasKeywordSearch={prepare(lots,query,options){return new Promise(resolve=>jobs.push({lots,query,options,resolve}))}};
 ui.el('category').value=category;ui.el('search').value='Xiaomi';return{...ui,jobs};
}
function installActualUI(env){
 env.node('#modal-content').querySelector=()=>null;
 for(const selector of ['#modal','#grid'])env.node(selector).removeAttribute=function(name){delete this[name]};
 const keyword=env.context.window.FasKeywordSearch;
 env.context.window.FasKeywordSearch={...keyword,prepare:()=>Promise.resolve({cancelled:false})};
 vm.runInContext(fs.readFileSync('dist/app-ui.js','utf8'),env.context);
}
(async()=>{
 search('Xiaomi');let ui=preparationUI('phones');ui.dispatch('search','input');ui.advance(180);
 assert.equal(ui.jobs.length,1);assert.deepEqual(Array.from(ui.jobs[0].lots.map(lot=>lot.id)),[991190002,991190003],'automatic preparation includes all matching asset categories');
 ui.jobs[0].resolve({cancelled:false});await settle();
 h.node('#category').value='cars';h.node('#category').onchange();
 ui=preparationUI('cars');ui.dispatch('search','input');ui.advance(180);
 assert.deepEqual(Array.from(ui.jobs[0].lots.map(lot=>lot.id)),[991190003],'explicit manual scope still bounds asynchronous work');
 ui.jobs[0].resolve({cancelled:false});await settle();
 // Persist an actual manual choice, then restore it in a newly booted app.
 h.node('#region-filter').value='';h.node('#budget').value='';search('Xiaomi');h.node('#category').value='phones';h.node('#category').onchange();
 installActualUI(h);run('persist(["fas-lots"]);render()');
 const preferences=JSON.parse(h.records['fas-search-preferences-v1']);
 assert.equal(preferences.categoryAutomatic,false);assert.equal(preferences.basic.category,'phones');
 const restored=boot({records:{...h.records}});installActualUI(restored);await settle();
 assert.equal(restored.node('#category').value,'phones','an explicitly selected category survives reload');
 assert.equal(restored.run('window.FasKeywordCategoryScope($("#search").value,$("#category").value)'),'phones');
 assert.deepEqual(Array.from(restored.run('visibleLots.filter(lot=>lot.brand==="Xiaomi").map(lot=>lot.id)')),[991190002]);
 await restored.node('#filters').onsubmit({preventDefault(){}});await settle();
 assert.equal(restored.node('#category').value,'phones');
 assert.deepEqual(Array.from(restored.run('visibleLots.filter(lot=>lot.brand==="Xiaomi").map(lot=>lot.id)')),[991190002],'same-query submit after reload preserves the manual category');
 // Version-1 preferences without provenance still repair the old stale-category case.
 const legacyCar={...base,id:991190099,category:'cars',subcategory:'cars',name:'Toyota RAV4',brand:'Toyota',model:'RAV4',longitude:39.21};
 const legacy=boot({records:{...h.records,'fas-lots':JSON.stringify([...fixtures,legacyCar]),'fas-search-preferences-v1':JSON.stringify({version:1,basic:{search:'Тойота Рав 4 Воронеж',category:'cameras','region-filter':'36',brand:'Canon',sort:'nearest'},advanced:{model:'EOS'},tab:'all'})}});
 installActualUI(legacy);await settle();
 assert.equal(legacy.node('#search').value,'','new pages ignore old saved keywords');
 assert.equal(legacy.node('#category').value,'','the category from an old query is cleared too');
 legacy.node('#search').value='Тойота Рав 4 Воронеж';await legacy.node('#filters').onsubmit({preventDefault(){}});await settle();
 assert.equal(legacy.node('#category').value,'cars','a newly submitted query repairs the old contradictory camera fields');
 assert.equal(legacy.node('#brand').value,'');assert.equal(legacy.node('#adv-model').value,'');
 assert.equal(legacy.run('window.FasKeywordCategoryScope($("#search").value,$("#category").value)'),'', 'legacy reconciliation marks the repaired category as automatic');
 assert(legacy.run('visibleLots.some(lot=>lot.id===991190099)'));
 console.log('PASS: automatic category suggestions preserve exact/fuzzy/mixed-manufacturer matches, explicit scopes and saved searches, nearest ordering, async preparation and visible contradictory-filter recovery.');
})().catch(error=>{console.error(error);process.exitCode=1});
