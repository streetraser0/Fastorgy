const assert=require('node:assert/strict');
const {boot}=require('./helpers/category-seller-harness.cjs');
const h=boot({noMedia:true}),run=h.run;
let clock=Date.parse('2026-11-13T12:00:00.000Z');
class FixedDate extends Date {constructor(...args){super(...(args.length?args:[clock]))}static now(){return clock}}
h.context.Date=FixedDate;
const hour=3600000,day=24*hour;
const base={category:'cars',subcategory:'cars',name:'Тестовый автомобиль',city:'Воронеж',regionCode:'36',price:100000,start:100000,step:1000,deposit:0,status:'live',latitude:51.66,longitude:39.2,bids:0,demo:false};
const fixtures=[
 {id:999721001,remaining:hour},
 {id:999721002,remaining:day-60000},
 {id:999721003,remaining:day},
 {id:999721004,remaining:day+1000},
 {id:999721005,remaining:-1},
 {id:999721006,remaining:2*hour,status:'scheduled',startsAt:new Date(clock+hour).toISOString()},
 {id:999721007,remaining:3*hour,status:'paused'},
 {id:999721008,remaining:0}
].map(({remaining,...lot},index)=>({...base,...lot,longitude:39.2+index*.01,ends:new Date(clock+remaining).toISOString()}));
run('cars='+JSON.stringify(fixtures)+';ends.length=0;cars.forEach(lot=>ends.push(Date.parse(lot.ends)));invalidateSubscriptionInventory();window.FasKeywordSearch.invalidate();userGeo={point:[51.66,39.2],approximate:false};$("#sort").value="nearest";tab="all";render();');
const ids=()=>Array.from(run('visibleLots.map(lot=>lot.id)'));
assert.deepEqual(ids(),[999721001,999721002,999721003,999721004],'baseline excludes expired, future and paused auctions');
run('setTab("soon")');
assert.deepEqual(ids(),[999721001,999721002],'soon means strictly less than 24 hours, including 23h59 but excluding exactly 24h');
assert.equal(h.node('#result-count').textContent,'2 лота');
run('setReels(true)');
assert.equal(run('reelsMode'),true);
assert.equal(run('tab'),'soon');
assert.deepEqual(ids(),[999721001,999721002],'fullscreen feed retains the ending-soon selection');
assert(run('Array.from($("#grid").innerHTML.matchAll(/data-lot="(\\d+)"/g),match=>Number(match[1])).every(id=>visibleLots.some(lot=>lot.id===id))'),'recycled feed never introduces nonmatching auctions');
run('setReels(false)');
assert.deepEqual(ids(),[999721001,999721002],'returning to catalogue preserves the selected deadlines');
clock+=2*hour;
run('render()');
assert.deepEqual(ids(),[999721002,999721003,999721004],'deadline membership updates with actual time; just-expired and paused lots remain excluded');
run('setTab("all")');
assert.deepEqual(ids(),[999721002,999721003,999721004]);
console.log('PASS: ending-soon uses strict 24-hour boundary, excludes expired/future/paused lots, refreshes deadlines and retains the filtered fullscreen feed.');
