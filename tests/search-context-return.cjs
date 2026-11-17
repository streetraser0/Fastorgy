const assert=require('node:assert/strict');
const {integration,settle}=require('./helpers/category-multi-harness.cjs');
const plain=value=>JSON.parse(JSON.stringify(value));
const base={bank:'Контрольный продавец',sellerType:'bank',status:'live',city:'Воронеж',regionCode:'36',price:1000000,start:1000000,step:1000,deposit:0,condition:'used',ends:'2099-01-01T00:00:00Z',demo:false,latitude:51.66,longitude:39.2};
const fixtures=[
 {id:999791001,category:'cars',subcategory:'cars',name:'Toyota Camry',brand:'Toyota',model:'Camry'},
 {id:999791002,category:'cars',subcategory:'cars',name:'BMW 320',brand:'BMW',model:'320',latitude:51.661},
 {id:999791003,category:'property',subcategory:'property',name:'Квартира',area:60,rooms:2},
 {id:999791004,category:'cars',subcategory:'cars',name:'Toyota RAV4',brand:'Toyota',model:'RAV4',latitude:60}
].map(lot=>({...base,...lot}));
(async()=>{
 const h=integration({fixtures}),field=h.field,run=h.run;
 const submit=async id=>{await field(id).onsubmit({preventDefault(){}});await settle(h)};
 function fromFeed(){run('openLocalFeed();showSearch()');assert.equal(run('reelsMode'),false);assert.equal(run('searchReturnToFeed'),true)}
 async function remainsCatalogue(label){assert.equal(run('searchReturnToFeed'),false,label+' cancels the old return intent');field('adv-price-min').value='1';await submit('advanced-form');assert.equal(run('reelsMode'),false,label+' cannot reopen the old feed')}
 // Real main handlers remain wrapped by app-ui's preparation/persistence layer.
 fromFeed();await submit('advanced-form');assert.equal(run('reelsMode'),true,'advanced search opened from a feed returns to that feed');assert.equal(run('searchReturnToFeed'),false,'the return intent is consumed once');run('setReels(false)');
 fromFeed();await submit('filters');await remainsCatalogue('Ordinary Find');
 fromFeed();run('applyKeywordSearch("Toyota")');await remainsCatalogue('A new global keyword search');
 fromFeed();run('applySavedSearch({category:"cars",query:"",values:{},brand:"",city:"",regionCode:"",budget:""})');await remainsCatalogue('A saved search');
 fromFeed();field('advanced-reset').onclick();await remainsCatalogue('Reset filters');
 fromFeed();field('home-show-all').onclick({preventDefault(){}});await remainsCatalogue('Home: all lots');
 fromFeed();run('openLocalFeed();setReels(false)');await remainsCatalogue('A new feed session');
 // Invalid advanced criteria retain the intent until the user can correct them.
 fromFeed();field('adv-price-min').value='200';field('adv-price-max').value='100';await submit('advanced-form');assert.equal(run('searchReturnToFeed'),true);assert.equal(run('reelsMode'),false);field('adv-price-max').value='2000000';await submit('advanced-form');assert.equal(run('reelsMode'),true);run('setReels(false);$("#advanced-reset").onclick()');
 // A cancelled asynchronous Find still ends its old return intent immediately.
 fromFeed();field('search').value='Toyota';const keyword=h.context.window.FasKeywordSearch,jobs=[];
 h.context.window.FasKeywordSearch={...keyword,prepare(){return new Promise(resolve=>jobs.push(resolve))}};
 const pendingFind=field('filters').onsubmit({preventDefault(){}});
 assert.equal(run('searchReturnToFeed'),false,'Find ends the old feed intent before asynchronous preparation');
 const pendingAdvanced=field('advanced-form').onsubmit({preventDefault(){}});
 assert.equal(jobs.length,2);jobs[1]({cancelled:false});await pendingAdvanced;await settle(h);
 assert.equal(run('reelsMode'),false,'a quick advanced submission cannot inherit the cancelled Find intent');
 jobs[0]({cancelled:true});await pendingFind;await settle(h);assert.equal(run('reelsMode'),false);
 h.context.window.FasKeywordSearch=keyword;run('$("#advanced-reset").onclick()');
 console.log('PASS: feed search return is one-time; ordinary/global/saved/reset/home/new-feed paths cannot inherit it, including actual app-ui wrappers and invalid-range recovery.');

 const map=h.context.window.FasPropertyMap;
 map.configure({getLots:()=>fixtures,getAllLots:()=>fixtures,getOrigin:()=>({point:[51.66,39.2],approximate:true})});map.open();
 field('property-map-category').value='cars';field('property-map-category').onchange();field('property-map-radius').value='30';field('property-map-radius').onchange();map.setOrigin([51.66,39.2],'Контрольная точка',false);
 field('search').value='Основной поиск';field('sort').value='high';
 const main=()=>plain(run('({query:$("#search").value,category:$("#category").value,sort:$("#sort").value,region:$("#region-filter").value,visible:visibleLots.map(lot=>lot.id)})'));
 const originalMain=main(),originalMap=plain(map.state());
 async function pickerSearch(query,enter=true){field('property-map-category-trigger').onclick();const picker=field('category-picker'),input=picker.querySelector('#category-tree-search');input.oninput({target:{value:query}});if(enter)input.onkeydown({key:'Enter',preventDefault(){}});else h.click(picker.querySelector('[data-search-keywords]'));await settle(h);assert.equal(picker.open,false);assert.equal(field('property-map-dialog').open,true)}
 await pickerSearch('Toyota');assert.equal(map.state().query,'Toyota');assert.equal(field('property-map-query').value,'Toyota');assert.equal(map.state().total,1,'map query also respects its category and radius');assert.equal(map.state().category,originalMap.category);assert.equal(map.state().radius,originalMap.radius);assert.equal(map.state().scope,originalMap.scope);assert.deepEqual(plain(map.state().reference),originalMap.reference);assert.deepEqual(main(),originalMain,'map keyword action never mutates global search/results');
 await pickerSearch('BMW',false);assert.equal(map.state().query,'BMW');assert.equal(map.state().total,1,'the visible keyword action has the same local behavior as Enter');assert.deepEqual(main(),originalMain);
 // A callback from an older map view cannot change a newly opened map.
 let stale;const ui=h.context.window.FasCategoryUI;h.context.window.FasCategoryUI={...ui,open(options){stale=options.onSearch;return ui.open(options)}};field('property-map-category-trigger').onclick();field('category-picker').close();map.close();map.open();const reopened=plain(map.state());stale('Toyota');await settle(h);assert.deepEqual(plain(map.state()),reopened);assert.deepEqual(main(),originalMain);map.close();
 console.log('PASS: nested map category keywords apply locally through Enter and the action button, preserving category/radius/origin/scope, global results and stale-view protection.');
})().catch(error=>{console.error(error);process.exitCode=1});
