const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),context={window:{},console,Date,performance,setTimeout,clearTimeout};vm.createContext(context);
for(const file of ['category-tree.js','search-typos.js','search-identifiers.js','search-intent.js','keyword-search.js'])vm.runInContext(fs.readFileSync(path.join(root,'dist',file),'utf8'),context);
const S=context.window.FasKeywordSearch,T=context.window.FasCategories;
const base={city:'Воронеж',regionCode:'36',price:1000000,start:1000000,step:1000,deposit:0,status:'live',bids:0,ends:new Date(Date.now()+86400000).toISOString(),latitude:51.66,longitude:39.2};
const car=(id,model)=>({...base,id,category:'cars',subcategory:'cars',name:'Автомобиль Mitsubishi '+model,brand:'Mitsubishi',model,fuel:'diesel'});
const fixtures=[car(998620001,'Pajero'),car(998620002,'Outlander'),{...base,id:998620003,category:'trucks',subcategory:'trucks',name:'Грузовик Mitsubishi Canter',brand:'Mitsubishi',model:'Canter'},
 {...base,id:998620004,category:'other',subcategory:'home_appliances',name:'Кондиционер Mitsubishi Electric MSZ',manufacturer:'Mitsubishi Electric',model:'MSZ',price:60000},
 {...base,id:998620005,category:'cars',subcategory:'cars',name:'Toyota Camry',brand:'Toyota',model:'Camry'},
 {...car(998620006,'i-MiEV'),fuel:'electric'},car(998620007,'Pajero Sport')];
const mitsubishi=fixtures.filter(lot=>lot.id!==998620005),electric=fixtures.find(lot=>lot.id===998620004);
const brands=['Mitsubishi','МИЦУБИСИ','Мицубиси','Митсубиси','Мицубиши','Митсубиши'];
for(const query of brands){
 assert.equal(S.compile(query).corrections.length,0,'legitimate Russian brand variants are aliases: '+query);
 for(const lot of mitsubishi)assert(S.matches(lot,query),query+' matches '+lot.name);
 assert(!S.matches(fixtures[4],query),'a brand alias does not invent a Toyota match');
}
const cases=[['Митсубиси Паджеро',[998620001,998620007]],['Мицубиси Паджэро',[998620001,998620007]],['Mitsubishi Pajero',[998620001,998620007]],['Митсубиши Паджеро Спорт',[998620007]],['Mitsubishi Pajero Sport',[998620007]],['Митсубиси Аутлендер',[998620002]],['Мицубиси Аутлэндер',[998620002]],['Mitsubishi Outlander',[998620002]],['Мицубиси Кантер',[998620003]],['Митсубиши Кэнтер',[998620003]],['Mitsubishi Canter',[998620003]]];
for(const [query,ids]of cases){
 assert.deepEqual(fixtures.filter(lot=>S.matches(lot,query)).map(lot=>lot.id),ids,query);
 for(const id of ids){const inferred=S.inferCategory(query);assert(!inferred||T.matches(fixtures.find(lot=>lot.id===id),inferred),'category must cover the actual vehicle: '+query)}
}
for(const [model,query]of [['Lancer','Мицубиси Лансер'],['ASX','Митсубиси АСХ'],['L200','Мицубиси Л200'],['Eclipse Cross','Митсубиси Эклипс Кросс'],['Galant','Мицубиси Галант'],['Colt','Митсубиши Кольт']]){
 const lot=car(998620100,model);assert(S.matches(lot,query),query);assert(!S.matches(fixtures[4],query));
}
for(const query of ['Mitsubishi Electric','Мицубиси Электрик','Митсубиси Электрик','Мицубиши Электрик','Митсубиши Электрик','Митсубиси Электрик MSZ']){
 assert.deepEqual(fixtures.filter(lot=>S.matches(lot,query)).map(lot=>lot.id),[electric.id],query+' names the appliance manufacturer, not an electric Mitsubishi car');
 const inferred=S.inferCategory(query);assert(!inferred||T.matches(electric,inferred),'the appliance company must not force a car category');
}
const {boot}=require('./helpers/category-seller-harness.cjs'),h=boot(),run=h.run;
// The shipped inventory is observed rather than fixed at zero: future genuine
// Mitsubishi demo listings may be added without weakening any matching checks.
const inventoryObservation=run('cars.filter(lot=>/mitsubishi|ми[цт]суби[сш]и/i.test([lot.name,lot.brand,lot.manufacturer,lot.model].join(" "))).length');
const initialTotal=run('cars.length');
run('cars='+JSON.stringify(fixtures)+';ends.length=0;cars.forEach(lot=>ends.push(Date.parse(lot.ends)));window.FasKeywordSearch.invalidate();window.FasSubscriptionCache.invalidate();userGeo={point:[51.66,39.2],approximate:false}');
for(const query of brands){run('applyKeywordSearch('+JSON.stringify(query)+')');assert.equal(run('visibleLots.length'),mitsubishi.length);assert.equal(h.node('#category').value,'','mixed actual car/truck/appliance matches stay broad');assert(!run('visibleLots.some(lot=>lot.id===998620005)'))}
for(const [query,ids]of cases){run('applyKeywordSearch('+JSON.stringify(query)+')');assert.deepEqual(Array.from(run('visibleLots.map(lot=>lot.id)')),ids);const selected=h.node('#category').value;assert(ids.every(id=>!selected||T.matches(fixtures.find(lot=>lot.id===id),selected)),query+' real control retains the matching type')}
for(const query of ['Mitsubishi Electric','Мицубиси Электрик','Митсубиси Электрик MSZ']){run('applyKeywordSearch('+JSON.stringify(query)+')');assert.deepEqual(Array.from(run('visibleLots.map(lot=>lot.id)')),[electric.id]);assert.equal(h.node('#category').value,'home_appliances')}
assert.equal(run('cars.length'),fixtures.length,'search does not manufacture inventory');
console.log('PASS: Mitsubishi Russian make/model variants, separate Electric appliance entity, strict brand/model matches and real main filtering; observed '+inventoryObservation+' Mitsubishi-labelled lots among '+initialTotal+' shipped entries.');
