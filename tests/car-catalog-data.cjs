const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const directory=path.join(__dirname,'../dist/data');
const bytes=fs.readFileSync(path.join(directory,'car-catalog.json'));
const data=JSON.parse(bytes),source=JSON.parse(fs.readFileSync(path.join(directory,'car-catalog-source.json'),'utf8'));
const license=fs.readFileSync(path.join(directory,'car-catalog-LICENSE.txt'),'utf8');
const normalized=value=>value.normalize('NFKC').toLocaleLowerCase('ru').replace(/ё/g,'е').replace(/\s+/g,' ').trim();
assert.equal(data.version,1);assert.match(data.updatedAt,/^\d{4}-\d{2}-\d{2}$/);
assert(bytes.length<1024*1024,'catalog remains small enough for lazy loading');
assert(data.makes.length>=350,'broad catalog is not a short hand-written sample');
const makeIds=new Set(),modelIds=new Set(),lookup=new Map();let count=0;
for(const make of data.makes){
 assert.equal(typeof make.id,'string');assert(make.id.length>0&&make.id.length<200);assert(!makeIds.has(make.id));makeIds.add(make.id);
 assert.equal(typeof make.name,'string');assert(make.name.trim()===make.name&&make.name.length>0&&make.name.length<=100);
 assert(Array.isArray(make.aliases));assert(make.models.length>0);
 for(const alias of [make.name,...make.aliases]){assert.equal(typeof alias,'string');assert(alias.trim()&&alias.length<=150);const key=normalized(alias);assert(!lookup.has(key)||lookup.get(key)===make.id,'unambiguous make alias: '+alias);lookup.set(key,make.id)}
 const names=new Set();
 for(const model of make.models){assert.equal(typeof model.id,'string');assert(model.id&&model.id.length<=250);assert(!modelIds.has(model.id),'unique model identifier: '+model.id);modelIds.add(model.id);assert.equal(typeof model.name,'string');assert(model.name.trim()===model.name&&model.name.length>0&&model.name.length<=150);assert(!names.has(normalized(model.name)),'no duplicate model names within make');names.add(normalized(model.name));count++}
}
assert(count>=6400);assert.equal(source.coverage.makes,data.makes.length);assert.equal(source.coverage.models,count);assert.equal(source.coverage.bytes,bytes.length);
assert.equal(lookup.get(normalized('ВАЗ')),'lada');assert.equal(lookup.get(normalized('Лада')),'lada');assert.equal(lookup.get(normalized('VAZ')),'lada');assert.equal(lookup.get(normalized('УАЗ')),'uaz');assert.equal(lookup.get(normalized('ГАЗ')),'gaz');assert.equal(lookup.get(normalized('БМВ')),'bmw');assert.equal(lookup.get(normalized('Мерседес')),'mercedes-benz');assert.equal(lookup.get(normalized('Skoda')),'skoda');
const expect=(id,names)=>{const make=data.makes.find(item=>item.id===id);assert(make,id+' exists');for(const name of names)assert(make.models.some(item=>normalized(item.name)===normalized(name)),id+' → '+name)};
expect('toyota',['Camry','Corolla']);expect('bmw',['3 Series','5 Series','X5']);expect('mercedes-benz',['C-Class','E-Class','S-Class']);
expect('sitrak',['C7H','C7H MAX','C9H','G7S']);expect('howo',['T5G','G2W']);expect('shacman',['F3000','L3000','X3000','X5000','X6000']);expect('faw',['J6','J6L','J7','JH6']);expect('jac',['N35','N56','N80','N90','N120','N200']);
expect('aito',['M5','M7','M9']);expect('lixiang',['L6','L7','L8','L9','MEGA','i6','i8']);expect('avatr',['06','07','11','12']);expect('omoda',['C5','C7','S5']);expect('roewe',['D6','D7 EV','i5','RX5']);expect('changan',['CS35 Plus','CS55 Plus','UNI-Z','UNI-V','UNI-K']);
assert.equal(lookup.get(normalized('Ситрак')),'sitrak');assert.equal(lookup.get(normalized('Шакман')),'shacman');assert.equal(lookup.get(normalized('Li Auto')),'lixiang');
for(const make of data.makes)for(const model of make.models)assert(model.vehicleTypes?.length&&model.vehicleTypes.every(type=>['cars','trucks'].includes(type)),'each model has an explicit vehicle type');
assert(data.makes.find(make=>make.id==='sitrak').models.every(model=>model.vehicleTypes.includes('trucks')&&!model.vehicleTypes.includes('cars')));
assert(data.makes.find(make=>make.id==='faw').models.some(model=>model.name==='J7'&&model.vehicleTypes.includes('trucks')));
assert(source.coverage.kinds.includes('truck')&&source.coverage.kinds.includes('bus'));
expect('lada',['Granta','Vesta','Iskra','Aura','Niva Travel']);expect('moskvich',['3','3е','6','8']);expect('exeed',['LX','TXL','RX','VX']);expect('belgee',['X50','X50+','X70','S50']);expect('solaris',['HS','HC','KRS','KRX']);expect('knewstar',['001']);expect('haval',['Jolion','F7','F7x','Dargo']);expect('geely',['Atlas','Monjaro','Coolray','Cityray']);
for(const [id,name]of [['bmw','Cooper'],['bmw','John Cooper Works'],['mercedes-benz','Smart'],['mercedes-benz','Automatic'],['hyundai','Tuscon']])assert(!data.makes.find(make=>make.id===id).models.some(model=>model.name===name),'obvious register noise excluded');
assert.equal(data.sources[0].name,'VehiclesDB');assert.equal(data.sources[0].license,'CC-BY-4.0');assert.match(data.sources[0].commit,/^[a-f0-9]{40}$/);assert.equal(data.sources[0].commit,source.upstream.commit);
assert(license.includes('Vehicle data by VehiclesDB'));assert(license.includes('https://vehiclesdb.com'));assert(license.includes('Creative Commons Attribution 4.0'));assert(license.includes('Contains DNRPA vehicle registration data'));assert(license.includes('Open Government Licence'));assert(source.upstream.files.every(file=>/^https:\/\//.test(file.url)&&/^[a-f0-9]{64}$/.test(file.sha256)));
assert(source.coverage.claim.includes('not an exhaustive guarantee'));
console.log(`PASS: ${data.makes.length} makes / ${count} models, small offline dataset, aliases and make/model relations, current Russia-market facts, excluded register noise and pinned license attribution.`);
