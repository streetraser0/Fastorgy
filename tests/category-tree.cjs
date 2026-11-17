const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const context={window:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../dist/category-tree.js'),'utf8'),context);const T=context.window.FasCategories;
const activeGroups=['transport','real_estate','home_garden','electronics','business'];
const retiredGroups=['work','services','personal','parts','hobby','animals'];
const retiredLeaves=['work_vacancies','work_resumes','services_repair','services_transport','services_business','services_household','services_training','clothing','shoes','personal_accessories','watches_jewelry','beauty_health','kids_clothing','kids_goods','auto_parts','tires_wheels','vehicle_accessories','motorcycle_parts','oils_fluids','sports','bicycles','books','collectibles','musical_instruments','fishing','pets','farm_animals','pet_supplies'];
assert.deepEqual(Array.from(T.groups(),g=>g.id),activeGroups);
assert.equal(T.groups().length,5);assert.equal(T.leaves().length,31);
assert.equal(T.get('home_garden').label,'Товары для дома');assert.equal(T.leaves('home_garden').length,7);
const ids=[...T.groups(),...T.leaves()].map(node=>node.id);assert.equal(new Set(ids).size,ids.length);
for(const old of ['cars','trucks','machinery','equipment','property','commercial','vessels','other']){assert(T.get(old));assert(T.get(old).auction);assert.equal(T.legacyCategory(old),old)}
for(const node of T.leaves()){assert(T.get(node.groupId));assert(T.get(node.groupId).children.includes(node));assert(node.legacyCategory);assert.equal(T.groupOf(node.id).id,node.groupId)}
for(const id of [...retiredGroups,...retiredLeaves]){assert.equal(T.get(id),null,id+' is removed');assert.equal(T.canonicalId(id),null,id+' is not a selectable category');assert.equal(T.isAuction(id),false);assert(!T.auctionLeaves().some(node=>node.id===id));assert(!T.leaves(id).length)}
assert(T.isAuction('electronics'));assert(T.isAuction('phones'));
const cases=[
 [{category:'property',name:'Дом с участком'},'houses','real_estate'],
 [{category:'property',name:'Трёхкомнатная квартира'},'property','real_estate'],
 [{category:'property',name:'Жилая недвижимость · интерьер'},'property','real_estate'],
 [{category:'property',name:'Дача на участке'},'houses','real_estate'],
 [{category:'commercial',name:'Земельный участок'},'land','real_estate'],
 [{category:'commercial',name:'Гаражный бокс'},'garages','real_estate'],
 [{category:'commercial',name:'Складское помещение со стеллажами'},'commercial','real_estate'],
 [{category:'trucks',name:'Тентованный полуприцеп',assetKind:'trailer'},'trailers','transport'],
 [{category:'other',name:'Ноутбук в алюминиевом корпусе'},'computers','electronics'],
 [{category:'other',name:'Стоечное серверное оборудование'},'computer_parts','electronics'],
 [{category:'other',name:'Комплект офисной мебели'},'furniture','home_garden'],
 [{category:'other',name:'Мотоцикл'},'motorcycles','transport'],
 [{category:'other',name:'Ресторанное оборудование'},'equipment','business'],
 [{category:'equipment',name:'Фрезерный станок с ЧПУ'},'equipment','business'],
 [{category:'other',name:'Квартира в названии упаковки',subcategory:'shoes'},'other','business'],
 [{category:'phones',name:'Мой телефон'},'phones','electronics']
];
for(const [source,leaf,group] of cases){const lot={id:123,...source},before=JSON.stringify(lot);assert.equal(T.canonicalId(lot),leaf);assert.equal(JSON.stringify(lot),before,'pure lookup');assert(T.matches(lot,leaf));assert(T.matches(lot,group));assert.equal(T.groupOf(lot).id,group);assert.equal(T.normalizeLot(lot),lot);assert.equal(lot.subcategory,leaf);assert.equal(lot.category,source.category);assert.equal(lot.id,123);assert(T.matches(lot,group))}
assert(!T.matches({category:'property',name:'Домофон'},'houses'));assert(!T.matches({category:'property',name:'Двухкомнатная квартира'},'houses'));
assert(T.matches({category:'cars'},''));assert(!T.matches({category:'cars'},['hobby','cars']),'a mixed invalid category selection fails closed');assert(!T.matches({category:'cars'},'unknown'));assert.equal(T.get('unknown'),null);assert.equal(T.groupOf('unknown'),null);
assert.equal(T.normalizeLot(null),null);assert.equal(T.canonicalId(null),null);assert.equal(T.legacyCategory('transport'),null);
const html=T.optionsHTML('houses',{includeAll:true,auctionOnly:true,includeGroups:true});assert(html.includes('value="houses" selected'));assert(html.includes('Все категории'));assert(html.includes('value="electronics"'));assert(html.includes('value="phones"'));for(const id of [...retiredGroups,...retiredLeaves])assert(!html.includes('value="'+id+'"'),id+' is absent from options');
// Old lots/drafts remain recoverable without making retired sections selectable again.
for(const subcategory of retiredLeaves){const lot={id:321,category:'other',subcategory,name:'Сохранённый объект',description:'Описание собственника',mediaRefs:[{id:'saved-photo'}]},original=JSON.parse(JSON.stringify(lot));assert.equal(T.canonicalId(lot),'other');assert.deepEqual(lot,original,'lookup preserves saved data');T.normalizeLot(lot);assert.equal(lot.subcategory,'other');assert.equal(lot.previousSubcategory,subcategory);assert.deepEqual({...lot,subcategory,previousSubcategory:undefined},{...original,previousSubcategory:undefined});const normalized=JSON.stringify(lot);T.normalizeLot(lot);assert.equal(JSON.stringify(lot),normalized,'migration is idempotent')}
for(const leaf of T.leaves('home_garden')){const lot={id:654,category:'other',subcategory:'other',previousSubcategory:leaf.id,name:'Сохранённый объект',description:'Описание',mediaRefs:[{id:'saved-photo'}]},before=JSON.stringify(lot);assert.equal(T.canonicalId(lot),leaf.id);assert.equal(JSON.stringify(lot),before,'restoration lookup is pure');T.normalizeLot(lot);assert.equal(lot.subcategory,leaf.id);assert.equal(lot.previousSubcategory,leaf.id);assert.equal(lot.id,654);assert.equal(lot.description,'Описание');assert.equal(lot.mediaRefs[0].id,'saved-photo');const normalized=JSON.stringify(lot);T.normalizeLot(lot);assert.equal(JSON.stringify(lot),normalized,'restored migration is idempotent')}
for(const subcategory of ['phones','kitchenware','cars']){const lot={category:'other',subcategory,previousSubcategory:'furniture'};assert.equal(T.canonicalId(lot),subcategory);T.normalizeLot(lot);assert.equal(lot.subcategory,subcategory,'explicit active subcategory wins over historical metadata')}
console.log('PASS: five active categories, home restored, retired choices hidden, preserved metadata and idempotent restoration.');

for(const [id,family] of [["transport","vehicle"],["motorcycles","vehicle"],["real_estate","property"],["houses","property"],["business","equipment"],["electronics","equipment"],["phones","equipment"],...retiredGroups.map(id=>[id,'general'])])assert.equal(T.filterFamily(id),family,id);
// Every selectable auction leaf has regional inventory; normalization preserves IDs and legacy categories.
const seededContext={Date,URL,window:{}};vm.createContext(seededContext);for(const file of ['category-tree.js','demo-profiles.js','catalog-data.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist',file),'utf8'),seededContext);
const seeded=seededContext.seedDemoLots([]),regions=vm.runInContext('RF_REGIONS.map(region=>region.code)',seededContext),baseExpected=regions.length*T.auctionLeaves().length*20,expected=baseExpected+2*regions.length,original=seeded.map(lot=>[lot.id,lot.category].join(':')).join('|');
assert.equal(baseExpected,52700);assert.equal(expected,52870);assert.equal(seeded.length,expected);const inventory=new Map(),lotIds=new Set();
for(const lot of seeded){T.normalizeLot(lot);assert(T.get(lot.subcategory));assert(T.isAuction(lot.subcategory));assert.equal(activeGroups.filter(id=>T.matches(lot,id)).length,1);assert(!lotIds.has(lot.id),'demo IDs are unique');lotIds.add(lot.id);const key=lot.regionCode+'|'+lot.subcategory;inventory.set(key,(inventory.get(key)||0)+1)}assert.equal(seeded.map(lot=>[lot.id,lot.category].join(':')).join('|'),original);
for(const region of regions)for(const leaf of T.auctionLeaves())assert.equal(inventory.get(region+'|'+leaf.id),leaf.id==='trucks'?22:20,region+' / '+leaf.id+' retains twenty base demos and two explicit commercial examples');
// The original 13,600 IDs remain addressable for existing favorites, bids and links.
for(let region=0;region<regions.length;region++)for(let group=0;group<8;group++)for(let slot=0;slot<20;slot++)assert(lotIds.has(100000+region*1000+group*50+slot),'original regional lot remains available');
const counts=Object.fromEntries(activeGroups.map(id=>[id,seeded.filter(lot=>T.matches(lot,id)).length]));for(const group of T.groups())assert.equal(counts[group.id],regions.length*group.children.length*20+(group.id==='transport'?2*regions.length:0));assert.equal(Object.values(counts).reduce((total,count)=>total+count,0),expected);for(const id of retiredGroups)assert.equal(seeded.filter(lot=>T.matches(lot,id)).length,0);
console.log('PASS: all 31 auction leaves retain twenty base lots per region, with additional SITRAK and KamAZ trucks; original 13,600 IDs are preserved and no duplicate or retired inventory appears.');
