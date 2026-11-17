const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const context={window:{}};vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist/search-identifiers.js'),'utf8'),context);
const S=context.window.FasSearchIdentifiers,lot={vin:'JTNB11HK203123456',cadastralNumber:'77:08:0012345:67',serialNumber:'SN-MILL-9001',id:9001,price:1000000,name:'SN MILL'};
for(const query of ['JTNB11HK203123456','jtnb11hk203123456','JTNB-11HK-203123456','JTNB 11HK 203123456','VIN: JTNB11HK203123456','ВИН JTNB11HK203123456']){
 const compiled=S.compile(query);assert.equal(compiled.kind,'vin');assert(compiled.valid);assert(S.matches(lot,compiled),query);assert(!S.matches({...lot,vin:'JTNB11HK2031234567'},compiled),'a complete VIN does not match a longer prefix');assert(!S.matches({...lot,vin:'JTNB11HK203123457'},compiled));if(compiled.explicit)assert(!S.matches({name:query,description:query},compiled),'explicit labels use their dedicated fields');
}
assert(S.matches({VIN:'JTNB11HK203123456'},'VIN JTNB11HK203123456'));
for(const query of ['VIN № JTNB11HK203123456','VIN№JTNB11HK203123456','VIN No. JTNB11HK203123456','VIN: «JTNB11HK203123456».','«JTNB11HK203123456».']){
 const parsed=S.compile(query);assert(parsed?.valid,query);assert(S.matches(lot,parsed));assert(!S.matches({...lot,vin:'JTNB11HK2031234567'},parsed),'copied sentence punctuation cannot downgrade an exact VIN into a prefix search');
}
for(const query of ['Кадастровый номер № 77:08:0012345:67','cadastral number No. 77:08:0012345:67','«77:08:0012345:67».']){assert(S.matches(lot,query));assert(!S.matches({...lot,cadastralNumber:'77:67:0012345:08'},query))}
for(const query of ['Serial № SN-MILL-9001','Серийный номер № SN-MILL-9001','Serial No. SN-MILL-9001','SN: «SN-MILL-9001».'])assert(S.matches(lot,query),query);
assert(S.matches({serialNumber:'NO-MILL-9001'},'Serial NO-MILL-9001'),'a real NO- prefix is not mistaken for an English No. label');
for(const query of ['77:08','77:08:','77:08:0012345','77:08:0012345:']){
 const parsed=S.compile(query);assert(parsed?.valid&&parsed.partial&&parsed.kind==='cadastre');assert(S.matches(lot,parsed));
 assert(!S.matches({...lot,cadastralNumber:'77:67:0012345:08'},parsed),'partial cadastre preserves ordered components');
 assert(!S.matches({name:'77 08',price:12345},parsed),'a prefix is not assembled from unrelated numeric fields');
 assert(S.matches({description:'Объект 77:08:0012345:67 находится в Москве'},parsed),'a complete public identifier can match its ordered prefix');
}
assert(!S.matches(lot,'77:08:001'),'completed prefix components do not match the start of another quarter');
for(const query of ['77:08:0012345:67:9','77:08::67','77:08:0012345:67:']){const parsed=S.compile(query);assert(parsed&&!parsed.valid,query+' fails closed');assert(!S.matches({...lot,floor:9},parsed))}
assert(!S.compile('Кадастровый номер: 77:08').valid,'explicit labels still require complete identifiers');

for(const query of ['77:08:0012345:67','77 : 08 : 0012345 : 67','Кадастровый номер: 77:08:0012345:67','cadastral number 77:08:0012345:67']){
 const parsed=S.compile(query);assert.equal(parsed.kind,'cadastre');assert(S.matches(lot,parsed));assert(!S.matches({...lot,cadastralNumber:'77:67:0012345:08'},parsed),'cadastral component order is preserved');assert(!S.matches({...lot,cadastralNumber:'77:08:12345:67'},parsed),'leading zeros are preserved');assert(!S.matches({name:'77 08 0012345',price:67},parsed),'components cannot be assembled across fields');
}
for(const query of ['SN-MILL-9001','sn_mill_9001','SN/MILL/9001','SN MILL 9001','serial: SN-MILL-9001','SN: SN-MILL-9001','Серийник: SN-MILL-9001','Серийный номер SN-MILL-9001']){
 const parsed=S.compile(query);assert.equal(parsed.kind,'serial');assert(S.matches(lot,parsed),query);assert(!S.matches({...lot,serialNumber:'SN-MILL-9002'},parsed));assert(!S.matches({...lot,name:'SN MILL',serialNumber:'9001-OTHER'},parsed),'serial cannot be assembled from name and another serial');if(parsed.explicit)assert(!S.matches({name:'SN-MILL-9001',id:9001},parsed));
}
assert(S.matches({serialNumber:'AB-1234-XY'},'AB-1234-XY'));
for(const field of ['model','engine','registrationNumber','name','description']){
 assert(S.matches({[field]:'EA-211-TSI'},'EA-211-TSI'),field+' can contain a complete structured code');
 assert(S.matches({[field]:'Узел EA-211-TSI установлен'},'EA-211-TSI'),field+' can contain a code with token boundaries');
 assert(!S.matches({[field]:'EA-TSI-211'},'EA-211-TSI'),'ordered components remain required');
 assert(!S.matches({[field]:'PREFIX_EA-211-TSI'},'EA-211-TSI'),'code suffix cannot masquerade as a complete token');
 assert(!S.matches({[field]:'EA-211-TSI_EXTRA'},'EA-211-TSI'),'code prefix cannot masquerade as a complete token');
}
assert(S.matches({description:'Серийный код SN MILL 9001 указан на табличке'},'SN-MILL-9001'));
assert(S.matches({description:'VIN JTNB11HK203123456 проверен'},'JTNB11HK203123456'));
assert(!S.matches({description:'VIN JTNB11HK2031234567 проверен'},'JTNB11HK203123456'));
assert(S.matches({description:'Кадастровый номер 77:08:0012345:67 указан в документе'},'77:08:0012345:67'));
assert(!S.matches({description:'Кадастровый номер 77:67:0012345:08'},'77:08:0012345:67'));
assert(!S.matches({sellerOwnerId:'EA-211-TSI',privateNotes:'SN-MILL-9001'},'EA-211-TSI'),'private fields are never indexed');
assert(S.matches({model:'Узел SN MILL9001 смонтирован'},'SN-MILL-9001'),'separator grouping does not alter a full identifier');
assert(S.matches({model:'Узел SNMILL 9001 смонтирован'},'SN-MILL-9001'));
assert(S.matches({serialNumber:'00123456'},'Serial: 00123456'),'explicit numeric serials are not treated as lot IDs or prices');
assert(!S.matches({serialNumber:'123456'},'Serial: 00123456'),'numeric serial leading zeros are retained');
assert(S.matches({serialNumber:'ABCDEF'},'Serial: ABCDEF'),'explicit letter-only serials are valid');
for(const query of ['',null,undefined,1000000,'1000000','1 000 000','2021','150 hp','C7H','C9H','G7S','X5','E 200','Toyota Camry','Ситрак C7H','16:9','4:3','SN-MILL','JTNB11HK20312345','JTNB11HK2031234567'])assert.equal(S.compile(query),null,'ordinary and partial search stays available: '+query);
const model='MAZ-5336-A5';assert(S.compile(model),'an opaque structured value can be a serial');assert.equal(S.compile(model,{protected:(query,kind)=>query===model&&kind==='serial'}),null,'the search engine can protect known make/model phrases');
assert.equal(S.compile('JTNB11HK203123456',{protected:()=>true}),null);assert(S.compile('VIN: JTNB11HK203123456',{protected:()=>true}).explicit,'an explicit identifier label outranks model protection');
for(const query of ['VIN: INVALID123','Кадастровый номер: 77:08:123','Serial: invalid?value']){const parsed=S.compile(query);assert(parsed&&!parsed.valid,'malformed explicit identifiers fail closed');assert(!S.matches(lot,parsed))}
assert.equal(S.match(lot,'C7H').recognized,false);assert.equal(S.match(lot,'77:08:0012345:67').matched,true);assert(Object.isFrozen(S.compile('SN-MILL-9001')));assert(Object.isFrozen(S.match(lot,'SN-MILL-9001')));
assert.equal(S.matches(lot,{kind:'vin',value:lot.vin,valid:true}),false,'caller-created objects are not accepted as trusted compiled profiles');
const mutable={model:'EA-211-TSI'};assert(S.matches(mutable,'EA-211-TSI'));mutable.model='EA-212-TSI';assert(!S.matches(mutable,'EA-211-TSI'),'field edits cannot read a stale object cache');mutable.model='EA-211-TSI';assert(S.matches(mutable,'EA-211-TSI'));
const cachedBefore=S.stats();S.matches({description:'Узел EA-211-TSI смонтирован'},'EA-211-TSI');S.matches({description:'Узел EA-211-TSI смонтирован'},'EA-211-TSI');assert(S.stats().cacheHits>cachedBefore.cacheHits,'repeated immutable public text reuses bounded work');
for(let i=0;i<1500;i++)S.matches({description:'Уникальное описание объекта '+i},'SN-MILL-9001');const bounded=S.stats();assert(bounded.cachedFields<=1024);assert(bounded.cachedCharacters<=1024*2048);
const long='Очень длинное описание. '.repeat(200),beforeLong=S.stats();S.matches({description:long},'EA-211-TSI');S.matches({description:long},'EA-211-TSI');assert.equal(S.stats().cacheHits,beforeLong.cacheHits,'long descriptions do not occupy the shared text cache');assert.equal(S.stats().cachedFields,beforeLong.cachedFields);
console.log('PASS: complete VIN/cadastral/serial matching within exact fields, case/separator normalization, protected ordinary queries and no reordered/prefix/cross-field false positives.');
