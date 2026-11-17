const assert=require('assert/strict');
const fs=require('fs'),path=require('path'),vm=require('vm'),crypto=require('crypto');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'dist/catalog-data.js'),'utf8');
function environment({legacy=false,taxonomy=true}={}){
 const context={Date,console};vm.createContext(context);
 if(taxonomy)vm.runInContext(fs.readFileSync(path.join(root,'dist/category-tree.js'),'utf8'),context);
 vm.runInContext(fs.readFileSync(path.join(root,'dist/demo-profiles.js'),'utf8'),context);
 vm.runInContext(legacy?source.replace('return completeDemoCatalog(list,now)','return list'):source,context);
 return context;
}
const baseline=environment({legacy:true}).seedDemoLots([]);
assert.equal(baseline.length,13600,'legacy regional IDs remain the starting inventory');
const snapshots=new Map(baseline.map(lot=>[lot.id,{name:lot.name,image:lot.image,price:lot.price,brand:lot.brand}]));
const context=environment(),taxonomy=context.FasCategories,regions=vm.runInContext('RF_REGIONS',context);
const lots=context.seedDemoLots(baseline),leaves=taxonomy.auctionLeaves();
assert.equal(leaves.length,31);const baseTotal=regions.length*leaves.length*20;assert.equal(baseTotal,52700);assert.equal(lots.length,baseTotal+2*regions.length);assert.equal(lots.length,52870);
assert.equal(new Set(lots.map(lot=>lot.id)).size,lots.length);
// These digests record the 52,700 demos published before the additional commercial truck examples.
const baseLots=lots.filter(lot=>!lot.demoVehicleSample).sort((a,b)=>a.id-b.id),digest=value=>crypto.createHash('sha256').update(value).digest('hex');
assert.equal(baseLots.length,52700);
assert.equal(digest(baseLots.map(lot=>lot.id).join(',')),'03b9947a0b114d1a80a0ee35a82b7a11753921a2166856d46b2d3459d0417488','every previously published demo ID remains addressable');
assert.equal(digest(JSON.stringify(baseLots.map(({id,category,subcategory,name,image,price,brand})=>({id,category,subcategory,name,image,price,brand})))),'063fc593e956d6e64de557694f6ece3f72faae8b41d564fca09228fea37478f0','the photographed AMG GT has its model name while original IDs/photos/prices stay stable');
// The only authorized identity correction is the previously generic Mercedes
// coupe label. Reversing that display-name change reproduces the old contract.
assert.equal(digest(JSON.stringify(baseLots.map(({id,category,subcategory,name,image,price,brand})=>({id,category,subcategory,name:category==='cars'&&image==='assets/photos/cars-3.jpg'?name.replace(/^Mercedes-Benz AMG GT(?= · )/,'Спортивное купе Mercedes-Benz'):name,image,price,brand})))),'7daaac43fe2e753a9a9befc952a9831be4073a1b356cefeecf50e2cda5bc29bc','no unrelated identity or photograph changes accompany the explicit Mercedes model correction');
const commercial=lots.filter(lot=>lot.demoVehicleSample==='sitrak-c7h');assert.equal(commercial.length,regions.length);
for(const region of regions){const matches=commercial.filter(lot=>lot.regionCode===region.code);assert.equal(matches.length,1,'one SITRAK example in '+region.code);const lot=matches[0];assert.equal(lot.category,'trucks');assert.equal(lot.subcategory,'trucks');assert.equal(lot.brand,'SITRAK');assert.equal(lot.model,'C7H');assert(lot.name.includes('SITRAK C7H'));assert.equal(lot.image,'assets/photos/trucks-type-sitrak-c7h.jpg');assert(lot.completeness.includes('не фото имущества, находящегося в указанном регионе'),'the illustrative photo is not represented as local inventory');assert(lot.docs.includes('CC BY-SA 4.0'))}
assert.equal(fs.readFileSync(path.join(root,'dist',commercial[0].image)).subarray(0,2).toString('hex'),'ffd8','SITRAK uses the attributed photograph rather than an unrelated category image');
const counts=new Map();
for(const lot of lots){
 const leaf=taxonomy.canonicalId(lot),key=lot.regionCode+'|'+leaf;
 counts.set(key,(counts.get(key)||0)+1);
 assert(taxonomy.get(leaf)?.auction,'real selectable auction leaf');
 assert.equal(lot.category,taxonomy.legacyCategory(leaf));
 assert(lot.demo&&lot.specsDemo&&lot.demoCatalogVersion===3);
 assert(lot.description.length>200&&lot.description.includes('демонстрационное объявление')&&lot.name&&lot.city,'meaningful asset description and separate title/location are retained');
 for(const key of ['condition','defects','completeness','inspection','deliveryNotes','docs'])assert(lot[key],lot.id+' '+key);
 assert(!lot.vin&&!lot.cadastralNumber,'no invented identifiers');
 assert(Number.isSafeInteger(lot.price)&&lot.price>0);
 assert(Date.parse(lot.ends)>Date.now());
 assert(fs.existsSync(path.join(root,'dist',lot.image)),'local image exists: '+lot.image);
 if(lot.image.endsWith('.svg')){const svg=fs.readFileSync(path.join(root,'dist',lot.image),'utf8');if(lot.demoVehicleSample==='kamaz-5490'){assert.equal(lot.image,'assets/trucks.svg');assert(svg.includes('FAS')&&svg.includes('DEMO'));assert(!lot.photoExample&&lot.description.includes('иллюстрац'),'the generic silhouette is disclosed, never represented as the truck photo')}else assert(svg.includes('ДЕМО · ИЛЛЮСТРАЦИЯ КАТЕГОРИИ'),'missing-photo examples are explicit category illustrations')}
 if(!['cars','trucks','motorcycles','snowmobiles','atvs'].includes(leaf))assert.equal(lot.mileage,null,'no unrelated road mileage for '+leaf);
 if(snapshots.has(lot.id))for(const [key,value]of Object.entries(snapshots.get(lot.id)))assert.equal(lot[key],value,'legacy '+lot.id+' '+key);
}
for(const region of regions)for(const leaf of leaves)assert.equal(counts.get(region.code+'|'+leaf.id),leaf.id==='trucks'?22:20,region.code+' '+leaf.id);
assert.equal(snapshots.size,13600);
const commercialSnapshots=new Map(commercial.map(lot=>[lot.id,JSON.stringify({name:lot.name,image:lot.image,model:lot.model,brand:lot.brand,media:lot.media})]));
const ids=lots.map(lot=>lot.id).join(','),repeat=context.seedDemoLots(lots);
assert.equal(repeat.length,lots.length);assert.equal(repeat.map(lot=>lot.id).join(','),ids,'repeat hydration keeps order and IDs');
for(const lot of repeat.filter(lot=>lot.demoVehicleSample==='sitrak-c7h'))assert.equal(JSON.stringify({name:lot.name,image:lot.image,model:lot.model,brand:lot.brand,media:lot.media}),commercialSnapshots.get(lot.id),'SITRAK title and actual model photo survive rehydration');
const fresh=environment().seedDemoLots([]);
assert.equal(fresh.map(lot=>lot.id).join(','),ids,'a restart regenerates the same IDs without saved demo inventory');
// Old isolated consumers that do not load the taxonomy still get the same data.
const standalone=environment({taxonomy:false}).seedDemoLots([]);
assert.equal(standalone.map(lot=>lot.id).join(','),ids);
for(const lot of standalone)assert.equal(taxonomy.canonicalId(lot),lot.subcategory);
// Generic enrichment and photo migration must not overwrite complete descriptors.
vm.runInContext(fs.readFileSync(path.join(root,'dist/search-data.js'),'utf8'),context);
for(const id of ['land','garages','kitchenware','phones','houses','trailers']){
 const lot=lots.find(lot=>lot.subcategory===id),before=JSON.stringify(lot);
 context.enrichDemoSearch(lot);context.normalizePhotoDemo(lot);
 assert.equal(JSON.stringify(lot),before,'full demo attributes survive old enrichment for '+id);
}
console.log('PASS: original 52,700 IDs/identities preserved plus 85 SITRAK photo examples and 85 explicitly illustrated KamAZ examples; all categories/regions retain their quota and repeat/restart stability.');
