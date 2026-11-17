const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),context={window:{},console,Date,setTimeout,clearTimeout,performance};vm.createContext(context);
for(const file of ['category-tree.js','search-typos.js','search-identifiers.js','search-intent.js','keyword-search.js'])vm.runInContext(fs.readFileSync(path.join(root,'dist',file),'utf8'),context);
const S=context.window.FasKeywordSearch,T=context.window.FasCategories,data=JSON.parse(fs.readFileSync(path.join(root,'dist/data/car-catalog.json'),'utf8'));
let models=0,typedFixtures=0,matchingChecks=0,aliases=0,id=32000000;
for(const make of data.makes){
 let representative;
 for(const model of make.models){models++;for(const type of model.vehicleTypes){
  const lot={id:id++,category:type,subcategory:type,name:make.name+' '+model.name,brand:make.name,model:model.name,city:'Воронеж',price:4500000};representative??=lot;typedFixtures++;
  for(const query of [make.name,model.name,make.name+' '+model.name]){assert(S.matches(lot,query),make.name+' / '+model.name+' must match '+query);matchingChecks++}
  for(const query of [make.name,make.name+' '+model.name]){
   const inferred=S.inferCategory(query);
   // The vehicle upstream classifies construction machines as car/van/truck.
   // These two established machinery makes retain the actual asset category.
   if(['jcb','kubota'].includes(make.id))assert.equal(inferred,'machinery',query);
   else assert(!inferred||T.matches(lot,inferred),query+' must not exclude '+type+' by selecting '+inferred);
  }
 }}
 for(const alias of make.aliases){assert(S.matches(representative,alias),make.name+' alias '+alias);aliases++;matchingChecks++}
}
assert.equal(data.makes.length,521);assert.equal(models,8117);assert.equal(typedFixtures,8278);assert.equal(matchingChecks,24997);assert.equal(aliases,163);

const car={id:1,category:'cars',subcategory:'cars',name:'Audi A6',brand:'Audi',model:'A6'};
const stereo={id:2,category:'other',subcategory:'audio_video',name:'Audio amplifier',description:'Аудио усилитель и колонки'};
for(const query of ['Audi','Ауди','Audi A6']){assert(S.matches(car,query));assert(!S.matches(stereo,query),query+' is not a prefix of audio');assert.equal(S.inferCategory(query),'cars')}
for(const query of ['audio','аудио'])assert(!S.matches(car,query),'audio is not the Russian stem of Audi');
for(const [make,model,type] of [['Mercedes-Benz','Sprinter','trucks'],['BMW','Alpina B8 Gran','cars'],['Chevrolet','Bolt','cars'],['Ferrari','Roma','cars'],['Toyota','Commuter','cars'],['Geely','Atlas','cars'],['Renault','Master','trucks'],['Volkswagen','Multivan','cars']]){
 const lot={id:3,category:type,subcategory:type,name:make+' '+model,brand:make,model};
 assert.equal(S.compile(lot.name).corrections.length,0,'known model words are not misspellings: '+lot.name);
 assert(S.matches(lot,lot.name));const inferred=S.inferCategory(lot.name);assert(!inferred||T.matches(lot,inferred),lot.name);
}
assert.equal(S.inferCategory('Geely'),'transport','a make name is not its identically named truck model');
assert.equal(S.inferCategory('Iveco'),'transport','historical passenger and commercial models remain visible');
assert.equal(S.inferCategory('DAF'),'transport');assert.equal(S.inferCategory('Solaris'),'transport');assert.equal(S.inferCategory('Solaris Urbino'),'trucks');

for(const [query,lot,category] of [
 ['легковая машина',{category:'cars',subcategory:'cars',name:'BMW 530i'},'cars'],
 ['грузовая машина',{category:'trucks',subcategory:'trucks',name:'SITRAK C7H'},'trucks'],
 ['серверное оборудование',{category:'other',subcategory:'computer_parts',name:'Стоечное серверное оборудование'},'computer_parts'],
 ['компьютерная техника',{category:'other',subcategory:'computers',name:'Ноутбук'},'computers'],
 ['фотооборудование',{category:'other',subcategory:'cameras',name:'Canon EOS'},'cameras'],
 ['parking space',{category:'commercial',subcategory:'garages',name:'Машино-место'},'garages'],
 ['машиноместо',{category:'commercial',subcategory:'garages',name:'Парковочное место'},'garages']
]){assert(S.matches(lot,query),query);assert.equal(S.inferCategory(query),category,query)}
assert(!S.matches({category:'commercial',subcategory:'garages',name:'Гаражный бокс',description:'Закрытый гараж для хранения имущества'},'parking space'),'a shared category label does not turn every garage into a parking space');

for(const [query,yes,no] of [
 ['JTNB11HK203123456',{vin:'JTNB11HK203123456'},{vin:'JTNB11HK2031234567'}],
 ['77:08:0012345:67',{cadastralNumber:'77:08:0012345:67'},{cadastralNumber:'77:67:0012345:08'}],
 ['SN-MILL-9001',{serialNumber:'SN-MILL-9001'},{name:'SN MILL',serialNumber:'9001-OTHER'}]
]){assert(S.compile(query).identifier,query+' has a structured identifier profile');assert(S.matches(yes,query));assert(!S.matches(no,query),'complete identifiers cannot match by fragments: '+query)}
assert.equal(S.compile('MAZ-5336-A5').identifier,null,'a known make followed by model codes is not forced into a serial-only lookup');
(async()=>{
 const identifiers=context.FasSearchIdentifiers;let scans=0;
 context.FasSearchIdentifiers={...identifiers,matches(lot,profile){scans++;return identifiers.matches(lot,profile)}};
 const rows=Array.from({length:250},(_,index)=>({id:100000+index,serialNumber:'SN-ROUND-'+(9001+index),description:'Shared public description '.repeat(40)}));
 S.invalidate();const prepared=await S.prepare(rows,'SN-ROUND-9001');
 assert.equal(prepared.cancelled,false);assert.equal(prepared.prepared,rows.length);assert(prepared.chunks>=3,'identifier matching yields after at most 100 rows');assert.equal(scans,rows.length);
 assert(S.matches(rows[0],'SN-ROUND-9001'));for(const lot of rows.slice(1))assert(!S.matches(lot,'SN-ROUND-9001'));
 assert.equal(scans,rows.length,'rendering reuses prepared identifier matches');
 rows[0].serialNumber='SN-ROUND-OTHER';S.invalidate();assert(!S.matches(rows[0],'SN-ROUND-9001'));assert.equal(scans,rows.length+1,'an edit invalidates prepared identifier results');
 console.log('PASS: all 521 makes / 8117 models / 24,997 canonical and alias matches; qualified categories, protected words, Audi precision, asset phrases, identifiers and yielding prepared identifier results.');
})().catch(error=>{console.error(error);process.exitCode=1});
