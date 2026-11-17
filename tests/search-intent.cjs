const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const context={window:{}};vm.createContext(context);for(const file of ['category-tree.js','search-identifiers.js','search-intent.js','keyword-search.js'])vm.runInContext(fs.readFileSync('dist/'+file,'utf8'),context);
const P=context.FasQueryIntent,S=context.FasKeywordSearch,plain=value=>JSON.parse(JSON.stringify(value)),parse=(query,options={})=>P.parse(query,options),criteria=(query,options={})=>plain(parse(query,options).criteria);
for(const [query,wanted]of [
 ['седан до 2 млн',{priceMax:2000000}],['квартира от 4 до 5 миллионов',{priceMin:4000000,priceMax:5000000}],['цена от 100 до 200 рублей',{priceMin:100,priceMax:200}],
 ['двухкомнатная квартира',{roomsMin:2,roomsMax:2}],['квартира от 40 до 80 м2',{areaMin:40,areaMax:80}],['квартира от 40 м² до 80 м²',{areaMin:40,areaMax:80}],
 ['ноутбук 16 гб',{ramGbMin:16,ramGbMax:16}],['ноутбук SSD512гб',{storageGbMin:512,storageGbMax:512}],['ноутбук RAM от 16 до 32 ГБ SSD 1 ТБ',{ramGbMin:16,ramGbMax:32,storageGbMin:1024,storageGbMax:1024}],
 ['экскаватор мощность от 100 до 200 л.с.',{powerHpMin:100,powerHpMax:200}],['компрессор мощность 30 кВт',{powerKwMin:30,powerKwMax:30}],['экскаватор пробег до 150 тыс км',{mileageMax:150000}]
]){const actual=parse(query);assert.equal(actual.error,'',query);assert.deepEqual(plain(actual.criteria),wanted,query);assert(!/млн|миллион|(?:^|\s)(?:до|от|гб|gb|м2|л\.с\.|квт)(?:$|\s)/i.test(actual.residual),'units/operators do not remain as literal blockers: '+query)}
for(const query of ['квартира от 5 до 2 миллионов','квартира от 80 до 40 м2','квартира до -2 млн','квартира цена 1.5 руб','экскаватор пробег от 150 до 100 тыс км','ноутбук SSD от 1 гб до 512 тб'])assert(parse(query,{vehicleContext:true}).error,'invalid explicit constraint reports an error: '+query);
for(const query of ['Toyota RAV4','BMW 318i','ГАЗ 3302','BMW 2002','2020','лот 2020','VIN JTNB11HK203123456','Canon EOS R5','150 hp','1.6 kw','23000 km']){
 const compiled=S.compile(query);assert(!compiled.intent?.error,query);assert.equal(compiled.intent?.criteria.priceMin,undefined,query);assert.equal(compiled.intent?.criteria.priceMax,undefined,query);assert.equal(compiled.intent?.criteria.yearMin,undefined,query);
}
for(const [make,model]of [['Alfa Romeo','1900 Css'],['Austin','10 Hp'],['BMW','2002']]){const lot={category:'cars',subcategory:'cars',name:make+' '+model,brand:make,model,price:1500000};for(const query of [model,make+' '+model]){assert(S.matches(lot,query),'literal model does not require invented year/power fields: '+query);assert.deepEqual(plain(S.compile(query).intent.criteria),{},query)}}
for(const query of ['BMW 2002 Turbo']){const lot={category:'cars',subcategory:'cars',name:'BMW 2002 Turbo',brand:'BMW',model:'2002'};assert(S.matches(lot,query),'recognized numeric model and trim are not a production year: '+query);assert.equal(S.compile(query).intent.criteria.yearMin,undefined)}
assert.equal(S.compile('Alfa Romeo 1900 Css до 2 млн').intent.criteria.priceMax,2000000);assert.equal(S.compile('Alfa Romeo 1900 Css до 2 млн').intent.criteria.yearMin,undefined);
assert.equal(S.compile('Alfa Romeo 1900 Css год 1960').intent.criteria.yearMin,1960,'explicit year remains independent from a numeric model');
assert.equal(S.compile('BMW 2020').intent.criteria.yearMin,2020,'an unrelated unqualified numeric model cannot mask a make-qualified year');
assert.deepEqual(plain(S.compile('BMW 2020 автомат').intent.criteria),{transmission:'auto',yearMax:2020,yearMin:2020});
assert.deepEqual(plain(S.compile('Toyota RAV4 2020').intent.criteria),{yearMax:2020,yearMin:2020});
assert.deepEqual(plain(S.compile('BMW 2002 цена 2002 рублей').intent.criteria),{priceMax:2002},'repeated numeric model does not swallow explicit money');
assert.equal(S.compile('BMW 2002 цена 2002 рублей').intent.residual,'BMW 2002');
assert.equal(parse('Ситрк до 2 млн').residual,'Ситрк','residual preserves original case for spelling feedback');
const laptop={id:1,category:'other',subcategory:'computers',name:'Ноутбук',ramGb:16,storageGb:512,price:65000};
assert(S.matches(laptop,'ноутбук 16 гб'));assert(!S.matches({...laptop,ramGb:8,storageGb:16},'ноутбук 16 гб'),'disk16 is not RAM16');assert(!S.matches({...laptop,ramGb:null,name:'Ноутбук 16 ГБ'},'ноутбук 16 гб'),'explicit unknown RAM is not guessed');assert(S.matches(laptop,'ноутбук SSD 512 гб'));assert(!S.matches({...laptop,storageGb:16,ramGb:512},'ноутбук SSD512гб'));
const apartment={id:2,category:'property',name:'Квартира',rooms:2,area:60,price:4500000};
assert(S.matches(apartment,'двухкомнатная квартира до 5 миллионов'));assert(!S.matches({...apartment,area:null},'квартира от 40 до 80 м2'));assert(!S.matches({...apartment,subcategory:'houses',category:'property',name:'Дом'},'квартира от 40 до 80 м2'),'property subtype remains a lexical AND');
assert(S.matches({category:'property',name:'Двухкомнатная квартира'},'2 room apartment'),'unambiguous title is public evidence when rooms absent');
for(const name of ['Квартира: обмен 2-комнатной на 3-комнатную','Квартира, 2 этаж'])assert(!S.matches({category:'property',name},'двухкомнатная квартира'),'ambiguous/incidental numbers do not establish room count');
assert(!S.matches({category:'property',name:'Двухкомнатная квартира',rooms:null},'2 room apartment'),'explicit unknown room count wins over title');
const excavator={id:3,category:'machinery',name:'Экскаватор',powerHp:150,powerKw:100,condition:'repair',engine:'Дизель, АКПП',price:2700000};
assert(S.matches(excavator,'экскаватор дизель до 3 млн'),'public engine is evidence without fuel field');assert(!S.matches({...excavator,fuel:null},'экскаватор дизель'),'explicit unknown fuel wins over engine');assert(!S.matches({...excavator,engine:'Бензин',description:'Раньше дизель'},'экскаватор дизель'),'incidental description is not fuel evidence');assert(!S.matches({...excavator,engine:'Дизель / бензин'},'экскаватор дизель'),'ambiguous engine fuel is unknown');assert(S.matches(excavator,'экскаватор требует ремонта мощность от 100 до 200 л.с.'));assert(!S.matches({...excavator,powerHp:null},'экскаватор мощность 150 л.с.'));assert(!S.matches({...excavator,category:'property'},'экскаватор мощность 150 л.с.'));
assert(parse('BMW дизель бензин',{vehicleContext:true}).error);assert(parse('BMW не дизель',{vehicleContext:true}).error);
let price=1900000,reads=0;const intent=parse('до 2 млн'),options={category:'cars',price(){reads++;return price}};assert(P.matches({price:1},intent,options));price=2100000;assert(!P.matches({price:1},intent,options));assert.equal(reads,2,'live quote callback is evaluated on every match');
assert.deepEqual(criteria('универсал рядом'),{sort:'nearest'});assert.equal(parse('Subaru Legacy Москва').residual,'Subaru Legacy Москва','parser never infers location or removes explicit city');
assert(!S.matchesText('BMW 2018','BMW 2020'),'plain model/manufacturer fields preserve raw numeric meaning');assert(S.matchesText('BMW 2020','BMW 2020'));assert(!S.matchesText('Квартира 90 м2','Квартира от 40 до 80 м2'),'structured parsing never silently removes manual field criteria');
console.log('PASS: shared pure structured intent, dimensions before money, numeric model/year guards, RAM/storage, bounded ranges, public evidence precedence, current prices and original text.');
