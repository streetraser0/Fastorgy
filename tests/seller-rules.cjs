const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const context={window:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../dist/seller-rules.js'),'utf8'),context);const R=context.window.FasSellerRules;
const now=Date.UTC(2026,10,12,12,0,0);
const raw={category:'cars',name:'Toyota Camry',description:'Автомобиль в хорошем состоянии, один собственник, осмотр по записи.',condition:'used',regionCode:'36',city:'Воронеж',startPrice:'1000000',stepMode:'fixed',stepValue:'10000',durationMinutes:'60',startMode:'now',pickup:true};
const validate=(changes={},options={})=>R.validateListing({...raw,...changes},{now,...options});
let result=validate();assert(result.valid,JSON.stringify(result.errors));assert.equal(result.value.start,1000000);assert.equal(Date.parse(result.value.ends)-Date.parse(result.value.starts),3600000);
for(const duration of [60,90,60.5,10080,43200])assert(validate({durationMinutes:duration}).valid,'valid duration '+duration);
for(const duration of [0,-1,59.999,43200.001,Infinity,NaN,'Infinity','abc',''])assert(!validate({durationMinutes:duration}).valid,'invalid duration '+duration);
assert.equal(R.normalise({...raw,durationMinutes:undefined},{now}).durationMinutes,10080);
result=R.validateListing({...raw,durationMinutes:undefined,durationHours:1.5},{now});assert(result.valid);assert.equal(result.value.durationMinutes,90);
assert(!validate({startMode:'scheduled',startsAt:new Date(now-1).toISOString()}).valid);
result=validate({startMode:'scheduled',startsAt:new Date(now+86400000).toISOString(),durationMinutes:43200});assert(result.valid);assert.equal(Date.parse(result.value.ends),now+86400000+R.MAX_AUCTION_MS);
assert(!validate({startMode:'scheduled',startsAt:'invalid'}).valid);assert(!validate({auctionType:'dutch'}).valid);
for(const price of [0,-1,1.2,'',null,NaN,Infinity,'Infinity','no','0x10'])assert(!validate({startPrice:price}).valid,'invalid start '+price);
assert(!validate({stepValue:0}).valid);assert(!validate({stepValue:1.5}).valid);
for(const percent of [0.1,1,12.5,50])assert(validate({stepMode:'percent',stepValue:percent}).valid);
for(const percent of [0,-1,0.099,50.01,Infinity,NaN])assert(!validate({stepMode:'percent',stepValue:percent}).valid);
assert(!validate({reservePrice:'999999'}).valid);assert(validate({reservePrice:'1000000'}).valid);
assert(!validate({reservePrice:'1200000',buyNowPrice:'1100000'}).valid);assert(validate({reservePrice:'1200000',buyNowPrice:'1200000'}).valid);
assert(!validate({deposit:'1000001'}).valid);assert(validate({deposit:'1000000'}).valid);assert(!validate({deposit:-1}).valid);
assert(!validate({pickup:false,delivery:false}).valid);assert(validate({pickup:false,delivery:true}).valid);
assert(!validate({category:'property',area:0}).valid);assert(validate({category:'property',area:1.5}).valid);assert(!validate({category:'property',area:20,floor:10,totalFloors:9}).valid);
assert(!validate({regionCode:'99'},{regionCodes:['36','77']}).valid);assert(!validate({category:'unknown'}).valid);
assert(!validate({ends:new Date(now+7200000).toISOString()}).valid);
const lot={...validate({antiSniping:true,antiSnipingWindowMinutes:2,antiSnipingExtensionMinutes:2}).value,status:'live'};
assert.equal(R.getAuctionState(lot,now),'live');assert.equal(R.getAuctionState(lot,now-1),'scheduled');assert.equal(R.getAuctionState(lot,now+3600000),'ended');assert.equal(R.getAuctionState({...lot,status:'draft'},now),'draft');assert.equal(R.getAuctionState({...lot,status:'paused'},now),'paused');assert.equal(R.getAuctionState({...lot,status:'sold'},now),'sold');assert.equal(R.getAuctionState({...lot,status:'cancelled'},now),'cancelled');
assert.equal(R.nextBid(lot,1000000),1010000);assert(R.validateBid(lot,1010000,now).valid);assert(!R.validateBid(lot,1000000,now).valid);assert(!R.validateBid(lot,1010001,now).valid);assert(!R.validateBid({...lot,status:'paused'},1010000,now).valid);
for(const [price,percent,step] of [[10000,7,700],[1000,1.1,11],[100000,0.7,700],[99,0.1,1]])assert.equal(R.increment({...lot,stepMode:'percent',stepValue:percent},price),step,'decimal percent rounding');
const percentage={...lot,stepMode:'percent',stepValue:0.1,currentPrice:1000001};assert.equal(R.increment(percentage),1001);assert.equal(R.nextBid(percentage),1001002);assert(R.validateBid(percentage,1001003,now).valid);
assert.equal(Date.parse(R.extendedEnd(lot,now+3590000)),now+3590000+120000);
const maximum={...lot,ends:new Date(now+R.MAX_AUCTION_MS).toISOString(),durationMinutes:43200};assert.equal(R.extendedEnd(maximum,now+R.MAX_AUCTION_MS-1000),maximum.ends);
assert.equal(R.extendedEnd(lot,now+3600000),lot.ends);assert.equal(R.extendedEnd({...lot,antiSniping:false},now+3590000),lot.ends);
for(const fields of [{antiSnipingWindowMinutes:0},{antiSnipingExtensionMinutes:31}])assert(!validate({antiSniping:true,...fields}).valid);
const edited=R.validateListing({...raw,startPrice:1,stepValue:1,durationMinutes:60,startsAt:new Date(now+86400000).toISOString(),description:raw.description+' Новое описание.'},{now:now+10000,existing:maximum});assert(edited.valid,JSON.stringify(edited.errors));assert.equal(edited.value.starts,maximum.starts);assert.equal(edited.value.ends,maximum.ends);assert.equal(edited.value.maxEnds,maximum.maxEnds);assert.equal(edited.value.start,maximum.start);assert.equal(edited.value.stepValue,maximum.stepValue);
assert(!R.validateListing({...raw,startPrice:Number.MAX_SAFE_INTEGER,stepValue:1},{now}).valid);
assert.equal(R.nextBid({...lot,currentPrice:Number.MAX_SAFE_INTEGER}),null);
console.log('PASS: 1h–30d durations, scheduled dates, money/step/reserve/buy-now/deposit rules, properties, statuses, fixed/percentage bids, bounded anti-sniping, immutable published auction terms.');
const tooShort={...lot,ends:new Date(now+60000).toISOString()};assert.equal(R.getAuctionState(tooShort,now),'unavailable');assert.equal(R.validateBid(tooShort,R.nextBid(tooShort),now).valid,false);
const pausedFuture={...lot,status:'paused',starts:new Date(now+86400000).toISOString(),startsAt:new Date(now+86400000).toISOString(),ends:new Date(now+90000000).toISOString()};assert.equal(R.getAuctionState(pausedFuture,now),'paused');assert.equal(R.getAuctionState({...pausedFuture,status:'live'},now),'scheduled');assert.equal(R.getAuctionState(pausedFuture,now+90000000),'ended');
console.log('PASS: corrupted sub-hour auctions fail closed; paused scheduled auctions retain pause state until their original deadline.');

assert.equal(R.validateBid({...lot,buyNowPrice:1020000},1020000,now).valid,false);assert.equal(R.validateBid({...lot,buyNowPrice:1020000},1010000,now).valid,true);

// Profiles remain usable before the optional taxonomy script is available.
for(const id of ['cars','trucks','machinery','equipment','property','commercial','vessels','other'])assert.equal(R.listingProfile(id).id,id);
assert.equal(R.listingProfile({category:'property',subcategory:'houses'}).id,'houses');assert.equal(R.listingProfile('unknown').id,'other');
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../dist/category-tree.js'),'utf8'),context);
const T=context.window.FasCategories,leaves=T.auctionLeaves(),plain=value=>JSON.parse(JSON.stringify(value));
assert.equal(leaves.length,31);assert(Object.isFrozen(R.CHARACTERISTIC_FIELDS));
for(const leaf of leaves){
 const profile=R.listingProfile({category:leaf.legacyCategory,subcategory:leaf.id});
 assert.equal(profile.id,leaf.id);assert.equal(profile.label,leaf.label);assert(profile.titleExample.length>=3);assert(Object.isFrozen(profile)&&Object.isFrozen(profile.primary)&&Object.isFrozen(profile.additional)&&Object.isFrozen(profile.conditionOptions));
 assert.deepEqual(Object.keys(profile.conditionOptions).sort(),['new','repair','used']);
 const definitions=[...profile.primary,...profile.additional],names=definitions.map(definition=>definition.name);assert.equal(new Set(names).size,names.length,leaf.id+' has no duplicate fields');assert(profile.primary.length>=2);
 const input={...raw,category:leaf.legacyCategory,subcategory:leaf.id,name:profile.titleExample};
 for(const definition of definitions){
  assert(Object.isFrozen(definition));assert(['text','number','select','year','textarea'].includes(definition.type));assert(R.CHARACTERISTIC_FIELDS.includes(definition.name));assert(definition.label);
  if(['number','year'].includes(definition.type))input[definition.name]=String(definition.type==='year'?2020:Math.max(1,definition.min));
  else if(definition.type==='select'){assert(Object.isFrozen(definition.options));input[definition.name]=Object.keys(definition.options).find(value=>value!=='')}
  else input[definition.name]='Проверенное значение';
 }
 const checked=R.validateListing(input,{now});assert(checked.valid,leaf.id+': '+JSON.stringify(checked.errors));
 const roundtrip=R.normalise(checked.value,{now});
 for(const definition of definitions){const key=definition.name,expected=['number','year'].includes(definition.type)?Number(input[key]):input[key];assert.equal(checked.value[key],expected,leaf.id+' persists '+key);assert.equal(roundtrip[key],expected,leaf.id+' roundtrips '+key)}
 for(const key of R.CHARACTERISTIC_FIELDS)if(!names.includes(key))assert(!Object.hasOwn(checked.value,key),leaf.id+' never persists an inapplicable '+key);
 for(const definition of definitions){
  if(['number','year'].includes(definition.type)){
   assert(R.validateListing({...input,[definition.name]:'bad'},{now}).errors[definition.name],leaf.id+' rejects malformed '+definition.name);
   assert(R.validateListing({...input,[definition.name]:definition.max+1},{now}).errors[definition.name],leaf.id+' bounds '+definition.name);
   if(definition.step===1)assert(R.validateListing({...input,[definition.name]:definition.min+0.5},{now}).errors[definition.name],leaf.id+' needs integral '+definition.name);
  }else if(definition.type==='select')assert(R.validateListing({...input,[definition.name]:'unsupported-value'},{now}).errors[definition.name],leaf.id+' validates enum '+definition.name);
  else assert(R.validateListing({...input,[definition.name]:'x'.repeat(definition.maxLength+1)},{now}).errors[definition.name],leaf.id+' bounds text '+definition.name);
 }
 if(['property','houses','land','garages','commercial'].includes(leaf.id))assert(R.validateListing({...input,area:''},{now}).errors.area,leaf.id+' requires area');
}
const apartment=R.listingProfile('property');assert.deepEqual(Array.from(apartment.primary,definition=>definition.name),['area','rooms','floor','totalFloors','buildingType']);
for(const id of ['property','houses','land','garages','commercial','furniture','kitchenware','home_textiles','building_materials','garden','ready_business','business_materials','other']){
 const names=[...R.listingProfile(id).primary,...R.listingProfile(id).additional].map(definition=>definition.name);
 for(const key of ['mileage','fuel','transmission','drive','powerHp','vin'])assert(!names.includes(key),id+' never asks for vehicle '+key);
}
{
 const input={...raw,category:'property',subcategory:'property',name:'Квартира с лоджией',area:'54',rooms:'2',floor:'5',totalFloors:'9',brand:'Toyota',model:'Camry',mileage:'не число',fuel:'unsupported',transmission:'unsupported',drive:'unsupported',powerHp:-1,vin:'OLDVIN',engineVolume:'bad',serialNumber:'old',manufacturer:'old',make:'old',km:'old',description:raw.description,mediaRefs:[{id:'idb:image'}],profile:{displayName:'Продавец'},latitude:51.66,longitude:39.2,address:'Улица',ownershipConsent:true,customCommon:'сохранить'};
 const before=plain(input),clean=R.sanitizeCharacteristics(input);
 for(const key of ['brand','model','mileage','fuel','transmission','drive','powerHp','vin','engineVolume','serialNumber','manufacturer','make','km'])assert(!Object.hasOwn(clean,key),'category change drops '+key);
 for(const key of ['startPrice','stepMode','stepValue','durationMinutes','condition','description','regionCode','city','address','latitude','longitude','mediaRefs','profile','ownershipConsent','customCommon'])assert.deepEqual(plain(clean[key]),plain(input[key]),'sanitization preserves common '+key);
 assert.deepEqual(plain(input),before,'sanitization never mutates its input');assert.notStrictEqual(clean,input);assert.equal(clean.area,'54');assert.equal(clean.rooms,'2');
 const checked=R.validateListing(input,{now});assert(checked.valid,JSON.stringify(checked.errors));assert(!Object.hasOwn(checked.value,'brand'));assert(!Object.hasOwn(checked.value,'vin'));
 const changed=R.sanitizeCharacteristics({...clean,category:'cars',subcategory:'cars',brand:'Toyota'});for(const key of ['area','rooms','floor','totalFloors'])assert(!Object.hasOwn(changed,key));assert.equal(changed.brand,'Toyota');
}
assert(validate({brand:'Toyota',model:'Camry',year:'2021',fuel:'petrol',transmission:'auto',drive:'front'}).valid,'existing car fields remain valid');
assert(validate({category:'property',area:54,rooms:2,floor:5,totalFloors:9}).valid,'minimal legacy apartments still work');
assert(!validate({fuel:'unrecognized'}).valid,'allowed car enums are validated');
console.log('PASS: all 31 immutable category profiles, characteristic schema roundtrips and limits, real-estate area requirements, stale vehicle-field removal, common-field preservation and legacy cars/apartments.');
