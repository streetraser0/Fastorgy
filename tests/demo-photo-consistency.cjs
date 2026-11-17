const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const context={console,Date};vm.createContext(context);
for(const file of ['category-tree.js','demo-profiles.js','catalog-data.js'])vm.runInContext(fs.readFileSync('dist/'+file,'utf8'),context);
const api=context.FasDemoPhotos;
const car={demo:true,category:'cars',name:'Mercedes-Benz AMG GT',brand:'Mercedes-Benz',model:'AMG GT',image:'assets/photos/cars-3.jpg',demoPhotoProfile:'assets/photos/cars-3.jpg',photoExample:true};
assert.equal(api.resolve(car),car.image);
for(const [name,model,path,category]of [['BMW M550i','M550i','cars-1.jpg','cars'],['BMW M5 CS550i','M550i','cars-1.jpg','cars'],['Mercedes-Benz AMG GTS','AMG GTS','cars-3.jpg','cars'],['SITRAK C7HS','C7HS','trucks-type-sitrak-c7h.jpg','trucks']]){const lot={demo:true,name,model,category,brand:name.startsWith('BMW')?'BMW':name.startsWith('SITRAK')?'SITRAK':'Mercedes-Benz'};assert.equal(api.accepts(lot,'assets/photos/'+path),false,'model tokens cannot borrow a prefix photograph: '+model)}
for(const [name,model,path,brand,category]of [['BMW M5 · 07','BMW M5','cars-1.jpg','BMW','cars'],['Porsche Panamera','Panamera','cars-2.jpg','Porsche','cars'],['Mercedes-Benz AMG GT','AMG-GT','cars-3.jpg','Mercedes-Benz','cars'],['Mercedes-Benz AMG GT','AMGGT','cars-3.jpg','Mercedes-Benz','cars'],['SITRAK C7H · 01','C7H','trucks-type-sitrak-c7h.jpg','SITRAK','trucks']])assert(api.accepts({demo:true,name,model,brand,category},'assets/photos/'+path),'a complete model token with flexible separators remains accepted: '+model);
for(const suffix of ['', '?view=1','?view=2']){
 const wrong={...car,name:'Mercedes-Benz E 200',model:'E 200'};
 assert.equal(api.accepts(wrong,car.image+suffix),false,'a different model never inherits the stock photograph or its crops');
 assert.equal(api.resolve(wrong,car.image+suffix),'assets/cars.svg');
}
for(const wrong of [{...car,brand:'Kia'},{...car,model:'C 200'},{...car,category:'trucks'},{...car,demoEdited:true},{...car,sellerOwnerId:'owner'},{...car,demo:false}])assert.equal(api.accepts(wrong,car.image),false);
assert.equal(api.resolve({...car,name:'Toyota Camry',brand:'Toyota',model:'Camry'},'https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?crop=right'),'assets/cars.svg','known remote stock variants are checked too');
assert.equal(api.isKnownStock('https://unrelated.example/photo-1618843479313-40f8afb4b4d8'),false,'only the actual source host identifies a stock photograph');
const uploaded={...car,sellerOwnerId:'owner',demoEdited:true,image:'https://seller.example/actual-car.jpg'};
assert.equal(api.resolve(uploaded),uploaded.image,'a seller photograph is retained');
assert.equal(api.accepts(uploaded,'blob:trusted-upload'),true,'media URL safety remains the media module’s responsibility');
const cached={...car,demoCatalogVersion:3,name:'Спортивное купе Mercedes-Benz · 07',model:'Спортивное купе Mercedes-Benz',engine:'Дизель / Бензин'};
context.normalizePhotoDemo(cached);
assert.equal(cached.name,'Mercedes-Benz AMG GT · 07');assert.equal(cached.model,'Mercedes-Benz AMG GT');assert.equal(cached.engine,'Бензин · демоданные');
for(const overrides of [{demoEdited:true},{sellerOwnerId:'owner'}]){const lot={...cached,...overrides,demoCatalogVersion:2,name:'Мой Mercedes-Benz E200',model:'E200',engine:'2.0 л'},before=JSON.stringify(lot);context.normalizePhotoDemo(lot);assert.equal(JSON.stringify(lot),before,'normalization never changes edited or owned records')}
const original={...car,id:1043,name:'Mercedes-Benz E 200',model:'E 200',price:3790000};const before=JSON.stringify(original);context.addDemoPhotos(original);assert.equal(JSON.stringify(original),before,'a named original demo is not relabelled to fit another car’s photo');assert.equal(api.resolve(original),'assets/cars.svg');
const lots=context.seedDemoLots([]);
assert.equal(lots.length,52870);
for(const lot of lots){if(api.isKnownStock(lot.image))assert(api.accepts(lot,lot.image),'generated photo identity matches '+lot.id+' '+lot.name)}
const gt=lots.filter(lot=>lot.category==='cars'&&lot.image==='assets/photos/cars-3.jpg');assert(gt.length);assert(gt.every(lot=>lot.name.includes('AMG GT')&&lot.brand==='Mercedes-Benz'));
assert.equal(api.resolve({demo:true,category:'cars',name:'Unknown',img:'unverified-random-photo'}),'assets/cars.svg','unknown legacy stock never becomes a random car background');
// Exercise the real feed/gallery/featured entry points, not a resolver-only mock.
{
 const {boot}=require('./helpers/category-seller-harness.cjs'),h=boot({noMedia:true});
 const now=Date.now(),base={id:999625001,category:'cars',subcategory:'cars',name:'Toyota RAV4 продавца',brand:'Toyota',model:'RAV4',sellerOwnerId:'another-seller',city:'Воронеж',regionCode:'36',price:50000,start:50000,step:1000,deposit:0,status:'live',startsAt:new Date(now-3600000).toISOString(),ends:new Date(now+3600000).toISOString(),image:'assets/photos/cars-1.jpg',media:[{url:'https://seller.example/walkaround.mp4',type:'video'},{url:'https://seller.example/front.jpg',type:'image'},{url:'assets/photos/cars-1.jpg?view=1',type:'image'},{url:'javascript:alert(1)',type:'image'}]};
 h.context.window.photoFixture=base;
 assert.equal(h.run('image(window.photoFixture)'),'https://seller.example/front.jpg','feed background uses actual uploaded photo before the category/library fallback');
 const media=JSON.parse(h.run('JSON.stringify(lotMedia(window.photoFixture))'));
 assert.deepEqual(media.map(item=>item.url),['https://seller.example/walkaround.mp4','https://seller.example/front.jpg']);
 assert.equal(media[0].type,'video','the first uploaded video stays first without a generic image ahead of it');
 const card=h.run('cardHTML(window.photoFixture)');assert(card.includes('https://seller.example/front.jpg'));assert(!card.includes('cars-1.jpg'));assert(!card.includes('javascript:'));
 h.context.window.photoFixture={...base,demo:true,sellerOwnerId:undefined,name:'Mercedes-Benz E 200',brand:'Mercedes-Benz',model:'E 200',image:'assets/photos/cars-3.jpg',media:[{url:'assets/photos/cars-3.jpg?view=1'},{url:'assets/photos/cars-3.jpg?view=2'}]};
 const wrongCard=h.run('cardHTML(window.photoFixture)');assert(!wrongCard.includes('cars-3.jpg'),'a wrong stock car cannot reappear on another gallery slide');assert(wrongCard.includes('assets/cars.svg'));
 h.context.window.photoFixture={...base,sellerOwnerId:undefined,demo:false,image:'https://seller.example/walkaround.mp4',media:[]};
 assert.equal(h.run('image(window.photoFixture)'),'assets/cars.svg','a standalone video is never inserted as an image thumbnail');
 const onlyVideo=JSON.parse(h.run('JSON.stringify(lotMedia(window.photoFixture))'));assert.equal(onlyVideo[0].url,'https://seller.example/walkaround.mp4');assert.equal(onlyVideo[0].type,'video','legacy standalone video remains playable');
 h.run('cars=[window.photoFixture]');h.context.window.photoFixture=base;h.run('cars=[window.photoFixture]');
 vm.runInContext(fs.readFileSync('dist/featured-lots.js','utf8'),h.context);
 assert(h.node('#featured-track').innerHTML.includes('https://seller.example/front.jpg'),'the horizontal selection uses the same actual-photo resolver');
 assert(!h.node('#featured-track').innerHTML.includes('cars-1.jpg'),'the horizontal selection cannot restore a mismatched stock photo');
}
console.log('PASS: exact photographed vehicle identities, all stock crops/source URLs, legacy and edited ownership preservation, and full demo catalogue correspondence.');
