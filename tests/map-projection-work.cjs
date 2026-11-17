const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {boot}=require('./helpers/category-seller-harness.cjs');
const h=boot({noMedia:true}),lots=h.run('cars'),locate=h.run('lotLocation'),isLive=h.run('isLotLive');
let calculations=0;const math=Object.create(Math);math.asin=value=>{calculations++;return Math.asin(value)};
const context={window:{},Math:math};vm.createContext(context);vm.runInContext(fs.readFileSync('dist/property-map.js','utf8'),context);
const api=context.window.FasPropertyMap,plain=value=>JSON.parse(JSON.stringify(value));

// A direct per-lot reference establishes exact distances and ordering independently
// of the projection's reuse map, including the existing rounded marker grouping.
function reference(input,origin,options={}){
 const seen=new Set(),rows=[];let withoutLocation=0;
 for(const lot of input){
  if(!lot||!Number.isSafeInteger(lot.id)||lot.id<=0||seen.has(lot.id)||options.isLive&&!options.isLive(lot)||options.matches&&!options.matches(lot))continue;
  seen.add(lot.id);const exact=api.point([lot.latitude,lot.longitude]),position=exact||api.point(options.locate?.(lot)?.point);
  if(!position){withoutLocation++;continue}
  const distance=api.distance(origin,position);if(!api.radiusMatches(distance,options.radius))continue;
  rows.push({id:lot.id,point:position,approximate:!exact,distance,key:position.map(value=>value.toFixed(5)).join(',')});
 }
 rows.sort((a,b)=>a.distance-b.distance||a.id-b.id);
 const groups=new Map();for(const row of rows){if(!groups.has(row.key))groups.set(row.key,{key:row.key,point:row.point,ids:[],distance:row.distance,approximate:true});const group=groups.get(row.key);group.ids.push(row.id);group.approximate&&=row.approximate}
 return {rows,groups:[...groups.values()],withoutLocation};
}
function signature(projection){return {rows:projection.rows.map(row=>({id:row.lot.id,point:row.point,approximate:row.approximate,distance:row.distance,key:row.key})),groups:projection.groups.map(group=>({key:group.key,point:group.point,ids:group.rows.map(row=>row.lot.id),distance:group.distance,approximate:group.approximate})),withoutLocation:projection.withoutLocation}}
function check(input,origin,options={}){const expected=plain(reference(input,origin,options));calculations=0;const actual=api.project(input,origin,options),count=calculations;assert.deepEqual(plain(signature(actual)),expected);return {actual,count}}
const options={locate,isLive},origin=[51.66,39.2];
assert(lots.length>=52785,'exercise the complete regional inventory');
const full=check(lots,origin,options),positions=new Set(full.actual.rows.map(row=>row.point.join(',')));
assert(positions.size<1024);assert.equal(full.count,positions.size,'one Haversine per exact coordinate pair across the full inventory');
assert(full.count<200,'regional assets reuse their shared storage/city points');

const fixture=[
 {id:6,latitude:51.660004,longitude:39.2},
 {id:5,latitude:51.660001,longitude:39.2},
 {id:4,latitude:'51,660001',longitude:'39.2'},
 {id:3,city:'Воронеж'},
 {id:2,latitude:999,longitude:999,city:'Воронеж'},
 {id:1,city:'Unknown'},
 {id:5,latitude:0,longitude:0},
];
const fixtureOptions={locate:lot=>lot.city==='Воронеж'?{point:origin,approximate:true}:null};
const nearby=check(fixture,origin,fixtureOptions);assert.equal(nearby.count,3,'comma-normalized coordinates reuse their exact pair');
assert(nearby.actual.rows.find(row=>row.lot.id===6).distance>nearby.actual.rows.find(row=>row.lot.id===5).distance,'points sharing a rounded marker key retain distinct exact distances');
assert.deepEqual(plain(nearby.actual.rows.map(row=>row.lot.id)),[2,3,4,5,6]);
for(const radius of ['5','10','30','50','100','500','1000','gt1000'])check(fixture,origin,{...fixtureOptions,radius});
check(fixture,[55.756,37.617],fixtureOptions);check(fixture,null,fixtureOptions);
fixture[0].latitude=0;fixture[0].longitude=0;check(fixture,origin,fixtureOptions);
assert.equal(api.project(fixture,origin,fixtureOptions).rows.at(-1).lot.id,6,'editing an existing object starts a fresh position pass');

const distinct=Array.from({length:1110},(_,index)=>({id:index+10000,latitude:51.66+index*.0001,longitude:39.2+index*.0001}));
distinct.push({...distinct[0],id:20000},{...distinct.at(-1),id:20001});
check(distinct,origin);check(distinct,[55.756,37.617]);
console.log('PASS: complete inventory reuses exact map distances while preserving every row/group/order/radius/precision, fresh origins/edits and positions beyond cache capacity.');
