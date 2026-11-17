const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const context={window:{},console,Date,performance,setTimeout,clearTimeout};vm.createContext(context);
for(const file of ['category-tree.js','search-typos.js','search-intent.js','keyword-search.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist',file),'utf8'),context);
const S=context.window.FasKeywordSearch,T=context.window.FasCategories;
const sitrak={id:2001,category:'trucks',subcategory:'trucks',name:'Седельный тягач SITRAK C7H',brand:'SITRAK',model:'C7H',city:'Воронеж',regionCode:'36',price:4200000};
const howo={...sitrak,id:2002,name:'Самосвал HOWO T5G',brand:'HOWO',model:'T5G'};
const shacman={...sitrak,id:2003,name:'Седельный тягач SHACMAN X3000',brand:'SHACMAN',model:'X3000'};
for(const query of ['Ситрак','СИТРАК','SITRAK','Sitrak','Си трак','Ситрак C7H','Ситрак С7Н','C7H','С7Н','Ситрак тягач','Ситрк','Ситарк','Sitrack','cbnhfr','ышекфл','Куплю Ситрак','Хочу купить Ситрк C7H в Воронеже']){
 assert.equal(S.inferCategory(query),'trucks',query+' identifies freight vehicles');assert(S.matches(sitrak,query),query+' matches the real make/model fields');
 assert(!S.matches(howo,query),query+' does not relabel HOWO as SITRAK');assert(!S.matches(shacman,query),query+' does not relabel SHACMAN as SITRAK');
}
for(const [model,query] of [['C9H','Ситрак С9Н'],['G7S','Ситрак Г7С'],['C7H MAX','Ситрак С7Н МАХ']]){const lot={...sitrak,id:2010,name:'Тягач SITRAK '+model,model};assert(S.matches(lot,query),query+' uses an explicit known model alias');assert(!S.matches(sitrak,query),query+' cannot match another model');assert.equal(S.inferCategory(query),'trucks')}
for(const [query,category] of [['Хово','trucks'],['Шакман','trucks'],['Синотрак','trucks'],['КамАЗ','trucks'],['JAC','transport'],['FAW','transport'],['Фотон','transport'],['Донгфенг','transport'],['JAC N120','trucks'],['Джак T9','cars'],['FAW J7','trucks'],['Toyota','transport'],['Toyota RAV4','cars'],['Toyota погрузчик','machinery'],['SITRAK фургон','trucks'],['грузовик диван',null],['объявления',null]])assert.equal(S.inferCategory(query),category,query);
for(const query of ['Ситрак','Ситрк','SITRAK','cbnhfr']){
 assert(S.matchesCategory(T.get('trucks'),query,'Транспорт'));
 assert(S.matchesCategory(T.get('transport'),query,'Транспорт'));
 assert(!S.matchesCategory(T.get('cars'),query,'Транспорт'),'truck-only make must not suggest passenger cars');
 assert(!S.matchesCategory(T.get('phones'),query,'Электроника'));
}
assert.doesNotThrow(()=>S.matchesCategory(T.get('trucks'),'150 hp','Транспорт'));
assert.equal(S.compile('Ситрак').corrections.length,0,'exact make names are unchanged');
const correction=S.compile('Ситрк');assert.equal(correction.originalText,'Ситрк');assert.equal(correction.corrections[0].from,'Ситрк');assert.match(correction.corrections[0].to,/sitrak/i);
assert.equal(S.compile('cbnhfr').corrections[0].reason,'keyboard-layout');
assert.equal(S.compile('до 1 000 000 Ситрк').corrections[0].from,'Ситрк','numeric grouping does not corrupt the displayed source word');
for(const text of ['C7H','C7HX','LNV-22-XY','JTNB11HK203123456','1000000'])assert.equal(S.compile(text).corrections.length,0,'identifiers and prices are protected: '+text);
const ownWord={id:2004,category:'equipment',name:'Механизм Ситрк',price:1000};assert(S.matches(ownWord,'Ситрк'),'an exact seller word remains searchable alongside the correction');
const again=S.compile('Ситрк');assert.equal(again,correction,'compiled-query identity remains cached');
// Run the actual application filtering/inference path, using the real regional demo data.
const {boot}=require('./helpers/category-seller-harness.cjs'),h=boot();
h.run('userGeo={point:[51.66,39.2],approximate:false}');
for(const query of ['Ситрак','SITRAK','Ситрк','cbnhfr']){
 h.run('applyKeywordSearch('+JSON.stringify(query)+')');
 assert.equal(h.node('#category').value,'trucks',query+' automatically updates the real category control');
 assert.equal(h.run('visibleLots.length'),85,query+' finds the seeded SITRAK in each region');
 assert(h.run("visibleLots.every(lot=>lot.brand==='SITRAK'&&lot.subcategory==='trucks')"));
 assert.equal(h.run('visibleLots[0].city'),'Воронеж','real query results start with the nearest asset');
}
h.run('applyKeywordSearch("Хочу купить Ситрк C7H в Воронеже")');
assert.equal(h.run('visibleLots.length'),1);assert.equal(h.run('visibleLots[0].city'),'Воронеж');
assert(h.node('#keyword-search-feedback').innerHTML.includes('SITRAK'),'the real search feedback explains the spelling correction');
console.log('PASS: commercial brand/model classification, Russian/English aliases, cautious spelling/layout correction, natural queries, distinct brands, numeric/ID protection and original text preservation.');
