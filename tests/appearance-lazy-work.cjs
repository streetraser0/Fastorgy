const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const metrics={sets:0},context={console,metrics,Set:class extends Set{constructor(values){super(values);metrics.sets++}}};context.window=context;vm.createContext(context);
for(const file of ['search-typos.js','search-identifiers.js','search-intent.js','keyword-search.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist',file),'utf8'),context);
const S=context.FasKeywordSearch,ordinary=S.compile('SITRAK');
const rows=Array.from({length:250},(_,index)=>({id:999796000+index,category:'cars',name:'BMW контроль '+index,brand:'BMW',bodyType:index%2?'SUV':'sedan',color:index%2?'blue':'red'}));
metrics.sets=0;for(const row of rows)assert(!S.matches(row,ordinary));assert(metrics.sets<=2,'250 distinct names do not parse body/color or allocate appearance Sets for an ordinary query');
// The same cached base documents must hydrate each facet only when it is needed.
assert(S.matches(rows[0],'седан'));assert(!S.matches(rows[1],'седан'));assert(S.matches(rows[1],'SUV'));assert(S.matches(rows[0],'красная'));assert(!S.matches(rows[1],'красная'));assert(S.matches(rows[1],'синяя'));assert(S.matches(rows[0],'красный седан'));assert(!S.matches(rows[1],'красный седан'));
// Appearance hydration must never mutate the shared category/flag tag set.
assert(!S.matches({id:999797000,category:'cars',name:'BMW неизвестный кузов'},'седан'));assert(!S.matches({id:999797001,category:'cars',name:'BMW неизвестный цвет'},'красный'));
rows[0].bodyType='wagon';rows[0].color='white';S.invalidate();assert(!S.matches(rows[0],'седан'));assert(!S.matches(rows[0],'красный'));assert(S.matches(rows[0],'белый универсал'),'invalidation hydrates updated public metadata rather than reusing stale facet tags');
console.log('PASS: ordinary queries allocate at most two shared Sets across 250 distinct lots; cached documents lazily hydrate isolated body/color facets and refresh changed metadata after invalidation.');
