const assert=require('node:assert/strict');
const {boot}=require('./helpers/category-seller-harness.cjs');
const h=boot({noMedia:true}),city=h.node('#city');
// A real HTMLSelectElement clears .value when no corresponding option exists.
// The default catalogue harness deliberately uses plain form values, so model
// that browser contract here to cover missing-city filters without a browser.
const decode=value=>String(value).replace(/&(amp|quot|#39|lt|gt);/g,(_,name)=>({amp:'&',quot:'"','#39':"'",lt:'<',gt:'>'}[name]));
const encode=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
let markup='',selected='',options=[];
Object.defineProperties(city,{
 value:{configurable:true,get(){return selected},set(value){const text=String(value??'');selected=options.some(option=>option.value===text)?text:''}},
 innerHTML:{configurable:true,get(){return markup},set(value){markup=String(value);options=[...markup.matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gi)].map(match=>{const attribute=match[1].match(/\bvalue\s*=\s*(["'])([\s\S]*?)\1/i);return {value:decode(attribute?attribute[2]:match[2].replace(/<[^>]*>/g,'')),textContent:decode(match[2].replace(/<[^>]*>/g,'')),selected:/\bselected\b/i.test(match[1])}});selected=options.find(option=>option.selected)?.value??options[0]?.value??''}},
 options:{configurable:true,get(){return options}},
 children:{configurable:true,get(){return options}}
});
city.appendChild=option=>{const value=String(option.value??option.textContent??'');markup+='<option value="'+encode(value)+'">'+encode(option.textContent??value)+'</option>';options.push({value,textContent:String(option.textContent??value)});return option};
city.append=(...items)=>items.forEach(item=>city.appendChild(item));city.add=option=>city.appendChild(option);
city.querySelectorAll=selector=>selector==='option'?options:[];
const now=Date.now(),customCity='Город «Новый» & <тест> "Юг"';
const base={category:'cars',subcategory:'cars',name:'Toyota RAV4',brand:'Toyota',model:'RAV4',price:100000,start:100000,step:1000,deposit:0,status:'live',startsAt:new Date(now-3600000).toISOString(),ends:new Date(now+3600000).toISOString(),bids:0};
const fixtures=[{...base,id:999725001,city:'Москва',regionCode:'77'},{...base,id:999725002,city:'Воронеж',regionCode:'36'},{...base,id:999725003,city:customCity,regionCode:'36'}];
h.run('cars='+JSON.stringify(fixtures)+';invalidateSubscriptionInventory();window.FasKeywordSearch.invalidate();$("#region-filter").value="";$("#category").value="";syncSearchFields();render()');
assert.equal(h.run('visibleLots.length'),3);
const search=(criteria={})=>h.run('window.FasGlobalSearch("Toyota",{criteria:'+JSON.stringify(criteria)+'})');
search({city:'Химки',sort:'nearest'});
assert.equal(city.value,'Химки','known city remains selected even without inventory');
assert(options.some(option=>option.value==='Химки'),'the requested city has a real option');
assert.equal(h.run('visibleLots.length'),0,'missing-city search must not silently show other cities');
assert(h.node('#result-query').textContent.includes('Химки'));
h.run('syncSearchFields();render()');assert.equal(city.value,'Химки','routine option refresh preserves the constraint');assert.equal(h.run('visibleLots.length'),0);
const saved=cityName=>({query:'Toyota',city:cityName,regionCode:'',category:'',brand:'',budget:'',values:{},origin:null});
h.run('applySavedSearch('+JSON.stringify(saved('Химки'))+')');assert.equal(city.value,'Химки');assert.equal(h.run('visibleLots.length'),0);
const disappeared='Посёлок без текущих предложений';
h.run('applySavedSearch('+JSON.stringify(saved(disappeared))+')');assert.equal(city.value,disappeared,'saved custom city survives removal of its last listing');assert.equal(h.run('visibleLots.length'),0);
h.run('syncSearchFields();render()');assert.equal(city.value,disappeared);assert.equal(h.run('visibleLots.length'),0);
search({city:'Неизвестный город, которого нет в справочнике'});assert.equal(city.value,'','unknown voice criteria are not guessed');assert.equal(h.run('visibleLots.length'),3);
search({city:'Москва'});assert.equal(city.value,'Москва');assert.equal(h.run('visibleLots.length'),1);assert.equal(h.run('visibleLots[0].id'),999725001);
search({city:customCity});assert.equal(city.value,customCity);assert.equal(h.run('visibleLots.length'),1);assert(!city.innerHTML.includes('<тест>'),'option labels remain escaped text');assert(city.innerHTML.includes('&lt;тест&gt;'));
h.run('applySavedSearch('+JSON.stringify(saved(customCity))+')');assert.equal(city.value,customCity);assert.equal(h.run('visibleLots.length'),1);
console.log('PASS: real select option/value semantics preserve empty-city and saved-city constraints, reject unknown criteria, and safely retain quoted city names.');
