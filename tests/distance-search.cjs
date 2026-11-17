const assert=require('node:assert/strict'),fs=require('node:fs');
const {boot}=require('./helpers/category-seller-harness.cjs');
const h=boot(),run=h.run;
run("userGeo={point:[0,0],approximate:false};window.distanceLot={id:999990123,category:'other',price:1000,deposit:0,latitude:0,longitude:0,city:'',regionCode:''};window.radiusValues=Object.fromEntries(ADV_IDS.map(id=>[id,'']));");
const original=run('distanceFromOrigin');
for(const radius of [5,10,30,50,100,300,500,1000]){
 h.context.window.testDistance=radius-.1;
 run('distanceFromOrigin=()=>window.testDistance');
 assert(run('advancedMatches(window.distanceLot,{category:"",values:{...window.radiusValues,radius:"'+radius+'"}}, {point:[0,0]})'));
 h.context.window.testDistance=radius+.1;
 assert(!run('advancedMatches(window.distanceLot,{category:"",values:{...window.radiusValues,radius:"'+radius+'"}}, {point:[0,0]})'));
}
for(const [km,expected] of [[999,false],[1000,false],[1000.1,true],[2000,true],[Infinity,false],[NaN,false]]){
 h.context.window.testDistance=km;
 assert.equal(run('advancedMatches(window.distanceLot,{category:"",values:{...window.radiusValues,radius:"gt1000"}}, {point:[0,0]})'),expected);
}
// Restore the real function through the VM global binding.
h.context.window.savedDistanceFunction=original;run('distanceFromOrigin=window.savedDistanceFunction');
assert(Math.abs(run('kmBetween([0,0],[0,1])')-111.195)<.01);
run('window.distanceLot.longitude=1');
assert(run('lotDistanceHTML(window.distanceLot)').includes('111'));
assert(run('lotDistanceHTML(window.distanceLot)').includes('Расстояние до имущества'));
assert(run('lotDistanceHTML(window.distanceLot)').includes('без учёта маршрута'));
const mapPanel=run('lotDistanceHTML(window.distanceLot,{point:[0,3],approximate:false,label:"<img src=x>"})');
assert(mapPanel.includes('222')&&mapPanel.includes('Точка отсчёта: &lt;img src=x&gt;'));
assert(!mapPanel.includes('от вашего местоположения'),'a picked map reference must not impersonate user geolocation');
assert(run('lotDistanceHTML(window.distanceLot,{point:[999,0],label:"bad"})').includes('111'),'invalid map references fall back to the real origin');
run("cars.push({...window.distanceLot,name:'Имущество на карте',start:1000,step:100,bank:'Демо',ends:new Date(Date.now()+3600000).toISOString()});openCar(window.distanceLot.id,{mapOrigin:{point:[0,3],approximate:false,label:'Из карты'}})");
assert(h.node('#modal-content').innerHTML.includes('222')&&h.node('#modal-content').innerHTML.includes('Точка отсчёта: Из карты'),'the real lot dialog keeps the reference passed from the map');
run('openCar(window.distanceLot.id)');
assert(h.node('#modal-content').innerHTML.includes('111')&&!h.node('#modal-content').innerHTML.includes('Точка отсчёта: Из карты'),'a later ordinary lot opening uses the user origin rather than a stale map reference');
run("userGeo=null;userRegion={code:'36',scope:'region'};window.distanceLot.city='Воронеж';window.distanceLot.regionCode='36';window.distanceLot.latitude='';window.distanceLot.longitude=''");
const approximate=run('lotDistanceHTML(window.distanceLot)');
assert(approximate.includes('Примерно')&&approximate.includes('центра города'));
assert(!approximate.includes('В вашем регионе'),'the dedicated lot panel shows numeric distance even with a regional reference');
run("userRegion={code:'',scope:'all'}");
assert(run('lotDistanceHTML(window.distanceLot)').includes('data-location'));
run("$('#adv-radius').value='5'");assert(run('readAdvancedFilters().error').includes('местоположение'));
const html=fs.readFileSync('dist/index.html','utf8');
for(const value of ['5','10','30','50','100','500','1000','gt1000'])assert(html.includes('<option value="'+value+'">'));
console.log('PASS: all requested radius boundaries, over-1000 exclusions, unknown distances, real geographic calculation and explicit lot distance with an approximate-location explanation.');
