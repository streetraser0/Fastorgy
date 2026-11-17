const assert=require('assert/strict');
const fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.resolve(__dirname,'..'),context={Date,console};vm.createContext(context);
for(const file of ['category-tree.js','demo-profiles.js','catalog-data.js'])vm.runInContext(fs.readFileSync(path.join(root,'dist',file),'utf8'),context);
const expired=new Date(Date.now()-86400000).toISOString();
const edited={id:100000,category:'cars',subcategory:'cars',demo:true,demoEdited:true,name:'Моё отредактированное объявление',city:'Воронеж',regionCode:'36',price:1234567,image:'https://example.com/my-photo.jpg',description:'Моё описание, которое нельзя переписывать',ends:expired,media:[{url:'https://example.com/my-second-photo.jpg'}]};
const custom={id:1000100,category:'other',subcategory:'phones',demo:false,name:'Мой телефон',city:'Москва',regionCode:'77',price:15000,description:'Оригинальное описание собственника',image:'https://example.com/phone.jpg',ends:expired};
const privateDemo={id:9900001,category:'other',subcategory:'tools',demo:true,sellerOwnerId:'local-owner',name:'Локальный демолот продавца',city:'Казань',regionCode:'16',price:3000,description:'Описание из кабинета',ends:expired};
const snapshots=[edited,custom,privateDemo].map(lot=>JSON.stringify(lot));
const lots=context.seedDemoLots([edited,custom,privateDemo]);
for(let i=0;i<snapshots.length;i++)assert.equal(JSON.stringify([edited,custom,privateDemo][i]),snapshots[i],'saved or seller-owned object is preserved byte for byte');
assert.equal(new Set(lots.map(lot=>lot.id)).size,lots.length,'custom collisions do not create duplicate IDs');
assert.equal(lots.find(lot=>lot.id===1000100),custom,'a new-demo namespace collision preserves existing seller inventory');
const taxonomy=context.FasCategories,counts=new Map();
for(const lot of lots){if(!lot.demo||lot.sellerOwnerId)continue;const key=lot.regionCode+'|'+taxonomy.canonicalId(lot);counts.set(key,(counts.get(key)||0)+1)}
const regions=vm.runInContext('RF_REGIONS',context);for(const region of regions)for(const leaf of taxonomy.auctionLeaves())assert((counts.get(region.code+'|'+leaf.id)||0)>=20,region.code+' '+leaf.id);
const ids=lots.map(lot=>lot.id).join(',');assert.equal(context.seedDemoLots(lots).map(lot=>lot.id).join(','),ids,'rehydration with custom collisions is idempotent');
for(let i=0;i<snapshots.length;i++)assert.equal(JSON.stringify([edited,custom,privateDemo][i]),snapshots[i]);

const sample=JSON.parse(JSON.stringify(lots.find(lot=>lot.demoVehicleSample==='sitrak-c7h')));
assert(sample,'regional commercial examples exist');
const editedTruck={...sample,demoEdited:true,name:'Мой отредактированный SITRAK',brand:'Марка из редактора',model:'Модель из редактора',price:7654321,description:'Описание, сохранённое продавцом',image:'https://example.com/own-sitrak.jpg',media:[{url:'https://example.com/own-sitrak-side.jpg'}],ends:expired};
const editedTruckSnapshot=JSON.stringify(editedTruck);
function baseIdentity(list){const base=list.filter(lot=>lot.demo&&!lot.demoVehicleSample&&!lot.sellerOwnerId).sort((a,b)=>a.id-b.id);assert.equal(base.length,52700,'an edited commercial sample does not consume the original regional quota');return require('crypto').createHash('sha256').update(base.map(lot=>lot.id).join(',')).digest('hex')}
{
 const list=context.seedDemoLots([editedTruck]);assert.equal(list.length,52870);assert.equal(list.find(lot=>lot.id===editedTruck.id),editedTruck);assert.equal(JSON.stringify(editedTruck),editedTruckSnapshot,'every saved SITRAK field and expired deadline is preserved');
 assert.equal(baseIdentity(list),'03b9947a0b114d1a80a0ee35a82b7a11753921a2166856d46b2d3459d0417488');
 for(const region of regions)assert.equal(list.filter(lot=>lot.demoVehicleSample==='sitrak-c7h'&&lot.regionCode===region.code).length,1,'edited SITRAK is not duplicated in '+region.code);
 const order=list.map(lot=>lot.id).join(',');assert.equal(context.seedDemoLots(list).map(lot=>lot.id).join(','),order);assert.equal(JSON.stringify(editedTruck),editedTruckSnapshot);
}
{
 const collision={...custom,id:9000000},before=JSON.stringify(collision),list=context.seedDemoLots([collision]);assert.equal(list.length,52871);assert.equal(list.find(lot=>lot.id===9000000),collision);assert.equal(JSON.stringify(collision),before,'the commercial namespace never overwrites a user lot');
 assert.equal(new Set(list.map(lot=>lot.id)).size,list.length);const regional=list.find(lot=>lot.demoVehicleSample==='sitrak-c7h'&&lot.regionCode===regions[0].code);assert(regional&&regional.id!==collision.id,'commercial collision receives an unused ID');
 const order=list.map(lot=>lot.id).join(',');assert.equal(context.seedDemoLots(list).map(lot=>lot.id).join(','),order,'commercial collision resolution is stable after rehydration');assert.equal(JSON.stringify(collision),before);
}
{
 const sparse={...sample};delete sparse.demoCatalogLeaf;delete sparse.demoCatalogVersion;
 const identity=JSON.stringify({name:sparse.name,image:sparse.image,brand:sparse.brand,model:sparse.model,media:sparse.media});
 context.seedDemoLots([sparse]);assert.equal(JSON.stringify({name:sparse.name,image:sparse.image,brand:sparse.brand,model:sparse.model,media:sparse.media}),identity,'older sparse commercial records keep the correct title and photograph');
}
console.log('PASS: edited demos, private listings and SITRAK fields/expiry preserved; original regional quotas, commercial namespace collisions and repeat/sparse migrations remain safe.');
