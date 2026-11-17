const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('dist/vehicle-engine-facts.js','utf8'),c={console,window:{}};vm.createContext(c);vm.runInContext(fs.readFileSync('dist/category-tree.js','utf8'),c);vm.runInContext(source,c);const api=c.FasVehicleEngineFacts,car=fields=>({category:'cars',subcategory:'cars',...fields}),values=lot=>Array.from(api.read(lot)?.rows||[],row=>row.value);
assert(Object.isFrozen(api));assert.strictEqual(api,c.window.FasVehicleEngineFacts);
for(const value of [null,undefined,{},[],5,'car'])assert.equal(api.read(value),null);
for(const category of ['cars','trucks','machinery','vessels','motorcycles','snowmobiles','atvs'])assert(api.isVehicle({category}),category);
for(const lot of [{category:'property',fuel:'diesel',powerHp:150},{category:'other',subcategory:'phones',powerKw:2},{category:'equipment',powerKw:7},{category:'trucks',subcategory:'trailers'},{category:'trucks',assetKind:'trailer'},{category:'trucks',name:'Полуприцеп'}]){assert.equal(api.read(lot),null);assert.equal(api.summaryHTML(lot),'');assert.equal(api.rowsHTML(lot),'')}
assert.deepEqual(values(car({fuel:'petrol',engineVolume:'2,5',powerHp:150})),['Бензиновый','2,5 л','150 л.с. / 110,3 кВт']);
assert.deepEqual(values({category:'trucks',fuel:'diesel',engineVolume:12.4,powerKw:300}),['Дизельный','12,4 л','407,9 л.с. / 300 кВт']);
assert.deepEqual(values(car({fuel:'electric',engineVolume:2,powerKw:'150'})),['Электрический','Не применим','203,9 л.с. / 150 кВт']);
assert.deepEqual(values(car({fuel:'hybrid',engineVolume:1.8,powerHp:122})),['Гибридный','1,8 л','122 л.с. / 89,7 кВт']);
assert.deepEqual(values(car({name:'Camry 2.5 150',model:'2.5 150 л.с.',brand:'Toyota',engine:'Camry 2.5'})),['Не указано','Не указано','Не указано'],'model/name/brand are never a source for engine numbers');
assert.deepEqual(values(car({engine:'Бензин · 2,0 л · 150 л.с.'})),['Бензиновый','2 л','150 л.с. / 110,3 кВт']);
assert.deepEqual(values(car({engine:'Бензин 180 л с'})),['Бензиновый','Не указано','180 л.с. / 132,4 кВт'],'horsepower written with spaces cannot become litres');
assert.deepEqual(values({category:'motorcycles',engine:'Бензиновый двигатель · 400 см³ · 35 кВт'}),['Бензиновый','0,4 л','47,6 л.с. / 35 кВт']);
assert.equal(values(car({engineCapacity:'1598 cc'}))[1],'1,598 л');assert.equal(values(car({displacement:'50 см3'}))[1],'0,05 л');
assert.equal(values(car({displacement:2000,engineCapacity:2}))[1],'Не указано','unitless legacy aliases have no declared schema unit');
assert.deepEqual(values(car({engine:'Дизель / Бензин'})),['Не указано','Не указано','Не указано'],'ambiguous legacy types remain unknown');
assert.equal(api.read(car({powerHp:150})).derived,'kw');assert.equal(api.read(car({powerKw:100})).derived,'hp');
const explicit=api.read(car({powerHp:150,powerKw:110}));assert.equal(explicit.hp,150);assert.equal(explicit.kw,110);assert.equal(explicit.derived,null,'two explicit source amounts are retained rather than silently rewritten');
assert(api.summaryHTML(car({powerHp:150})).includes('0,73549875'));assert(!api.summaryHTML(car({powerHp:150,powerKw:110})).includes('рассчитаны'));
for(const value of [null,undefined,'',false,[],{},-1,0,NaN,Infinity,'-150 л.с.','1e999','<img onerror=bad()>']){
 const f=api.read(car({powerHp:value,powerKw:value,engineVolume:value}));assert.equal(f.hp,null);assert.equal(f.kw,null);assert.equal(f.litres,null);
}
for(const engine of ['-2 л · -150 л.с.','75 кВтч','75 кВт·ч','75 кВт ч','75 kWh','75 kW h']){const f=api.read(car({engine}));assert.equal(f.hp,null,engine+' is not power');assert.equal(f.kw,null);assert.equal(f.litres,null)}
assert.equal(values(car({fuel:'electric',engine:'Аккумулятор 75 кВт·ч'}))[2],'Не указано','battery energy cannot become engine power');
assert.equal(values(car({fuel:'petrol',engineVolume:2,powerHp:150,engine:'Дизель · 3 л · 250 л.с.'}))[0],'Бензиновый','structured fields take precedence');
const unsafe=api.summaryHTML(car({engineType:'<img src=x onerror=alert(1)>',engineVolume:'<script>',powerHp:'<script>'}));assert(!unsafe.includes('<img'));assert(!unsafe.includes('<script>'));
const original=car({fuel:'petrol',engineVolume:2.4,powerHp:150}),before=JSON.stringify(original);api.summaryHTML(original);api.rowsHTML(original);assert.equal(JSON.stringify(original),before,'display and conversion never write derived fields into the lot');
vm.runInContext(source,c);assert.strictEqual(api,c.FasVehicleEngineFacts);
console.log('PASS: one read-only vehicle engine contract; explicit type/litres/metric hp-kW, honest missing/EV values, strict units and legacy aliases, no model inference/kWh confusion, transport-only scope and escaping.');
