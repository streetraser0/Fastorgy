const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {setup}=require('./helpers/quickbar-dom.cjs');
const read=name=>fs.readFileSync(path.join(__dirname,'../dist',name),'utf8');
function boot({origin={point:[51,39],city:'Воронеж'},category='cars'}={}){
 const h=setup({mobile:true}),section=h.add('featured-lots','section'),header=h.add('featured-heading','div',section);header.className='featured-heading';header.innerHTML='<div><h2>Лента аукционов</h2></div><button id="home-open-feed">Смотреть ленту</button><div class="featured-arrows"></div>';
 const modes=h.add('featured-modes','div',section);modes.className='featured-modes';const old=h.add('old-settings','button',modes);old.setAttribute('data-recommendation-settings','');
 const elsewhere=h.add('other-settings','button');elsewhere.setAttribute('data-recommendation-settings','');
 for(const id of ['category','region-filter','city','brand','budget','sort'])h.add(id,'select');
 const advanced=h.add('advanced-form','form'),reset=h.add('advanced-reset','button'),c=h.context;
 c.$=selector=>h.document.querySelector(selector);c.userOrigin=()=>origin;c.userRegion={code:'36',name:'Воронежская область'};
 const main=read('index.html').match(/<script>([\s\S]*?)<\/script>/)[1],idsAt=main.indexOf('const ADV_IDS='),idsEnd=main.indexOf(';',idsAt);assert(idsAt>=0);vm.runInContext(main.slice(idsAt,idsEnd+1),c);
 const ids=Array.from(vm.runInContext('ADV_IDS',c));for(const id of ids)h.add('adv-'+id,id==='radius'?'select':'input');
 h.document.querySelector('#adv-radius').innerHTML='<option value="">Любое расстояние</option><option value="30">До 30 км</option><option value="100">До 100 км</option>';
 const validationAt=main.indexOf('function readAdvancedFilters('),validationEnd=main.indexOf('\nfunction ',validationAt+10);assert(validationAt>=0&&validationEnd>validationAt);vm.runInContext(main.slice(validationAt,validationEnd),c);
 vm.runInContext(read('category-tree.js'),c);
 const taxonomy=c.FasCategories,selectionCalls=[];
 // Category selection itself has a separate integration suite. This contract
 // fixture verifies that the inline menu consumes the multipicker summary API.
 c.FasCategories={...taxonomy,selection(value){selectionCalls.push(value);return value?value.split(','):[]},label(value){return value==='cars,property'?'Автомобили и квартиры':taxonomy.label(value)}};
 h.document.querySelector('#category').value=category;
 let submissions=0,preferenceWrites=0,resets=0;const routes=[],snapshots=[];
 const controlIds=['search','category','region-filter','city','brand','budget','sort',...ids.map(id=>'adv-'+id)];
 const snapshot=()=>Object.fromEntries(controlIds.map(id=>[id,h.document.querySelector('#'+id).value]));
 advanced.onsubmit=event=>{event.preventDefault();assert.equal(c.readAdvancedFilters().error,'');submissions++;preferenceWrites++;snapshots.push(snapshot())};
 reset.onclick=()=>{resets++;h.document.querySelector('#search').value='';h.document.querySelector('#category').value='';ids.forEach(id=>{h.document.querySelector('#adv-'+id).value=''})};
 c.FasCategoryUI={open:options=>routes.push(['categories',options])};c.openRegion=()=>routes.push(['location']);c.openRecommendationSettings=()=>routes.push(['interests']);
 c.localStorage={setItem(){throw Error('The inline menu must not create its own storage flow')}};
 vm.runInContext(read('featured-settings.js'),c);
 const field=id=>h.document.querySelector('#'+id),button=selector=>section.querySelector(selector),click=target=>{target.onclick?.({target,preventDefault(){}});return h.click(target)};
 return {...h,section,header,old,elsewhere,field,button,click,routes,selectionCalls,snapshot,snapshots,api:c.FasFeaturedSettings,get submissions(){return submissions},get preferenceWrites(){return preferenceWrites},get resets(){return resets}};
}
{
 const h=boot(),toggle=h.field('featured-settings-toggle'),panel=h.field('featured-settings-panel');assert(h.api);assert.equal(toggle.getAttribute('aria-label'),'Настроить ленту');assert.equal(toggle.getAttribute('aria-expanded'),'false');assert.equal(panel.hidden,true);assert.equal(panel.getAttribute('role'),'region','the popup is an ordinary region, not another modal');assert.equal(h.section.contains(h.old),false,'the old settings mode chip is removed');assert.equal(h.elsewhere.isConnected,true,'unrelated settings links remain');
 h.modal.scrollTop=280;h.click(toggle);assert.equal(panel.hidden,false);assert.equal(toggle.getAttribute('aria-expanded'),'true');assert.equal(h.modal.scrollTop,280,'opening does not scroll the underlying page/dialog');h.click(toggle);assert.equal(panel.hidden,true);assert.strictEqual(h.document.activeElement,toggle);
 h.api.open();h.click(h.add('outside','button'));assert.equal(panel.hidden,true);assert.strictEqual(h.document.activeElement,toggle,'outside dismissal returns focus');
 h.api.open();let prevented=false;for(const listener of h.docEvents.keydown)listener({key:'Escape',preventDefault(){prevented=true},stopPropagation(){}});assert(prevented);assert.equal(panel.hidden,true);assert.strictEqual(h.document.activeElement,toggle);
}
{
 const h=boot({category:'cars,property'});const seeded={search:'Toyota RAV4','region-filter':'36',city:'Воронеж',brand:'Toyota',budget:'3000000',sort:'high','adv-price-min':'100000','adv-price-max':'9000000','adv-radius':'100','adv-year-min':'2020','adv-year-max':'2025','adv-fuel':'Бензин','adv-rooms-min':'2','adv-rooms-max':'4'};
 for(const [id,value] of Object.entries(seeded))h.field(id).value=value;
 const before=h.snapshot();h.api.open();assert.equal(h.field('featured-settings-min').value,'100000');assert.equal(h.field('featured-settings-max').value,'9000000');assert.equal(h.field('featured-settings-radius').value,'100');assert.equal(h.field('featured-settings-category-value').textContent,'Автомобили и квартиры');assert.equal(h.field('featured-settings-category-count').textContent,'Выбрано: 2');assert(h.selectionCalls.includes('cars,property'));assert.equal(h.field('featured-settings-location-value').textContent,'Воронежская область');
 h.field('featured-settings-min').value='2 000 000';h.field('featured-settings-max').value='3 000 000';h.field('featured-settings-radius').value='30';assert.equal(h.api.apply({preventDefault(){}}),true);assert.equal(h.submissions,1);assert.equal(h.preferenceWrites,1,'one existing advanced submit owns preference persistence');
 const after=h.snapshot();assert.equal(after['adv-price-min'],'2000000');assert.equal(after['adv-price-max'],'3000000');assert.equal(after['adv-radius'],'30');for(const key of Object.keys(before))if(!['adv-price-min','adv-price-max','adv-radius'].includes(key))assert.equal(after[key],before[key],'applying preserves '+key);assert.deepEqual(h.snapshots[0],after);assert.equal(h.field('featured-settings-panel').hidden,true);
}
for(const [min,max,message] of [['200','100','от'],['не число','100','корректное'],['-1','100','неотрицательное']]){
 const h=boot();h.field('search').value='Ситрак';h.field('adv-price-min').value='10';h.field('adv-price-max').value='1000';const before=h.snapshot();h.api.open();h.field('featured-settings-min').value=min;h.field('featured-settings-max').value=max;assert.equal(h.api.apply({preventDefault(){}}),false);assert.deepEqual(h.snapshot(),before,'validation restores every main filter before returning');assert.equal(h.submissions,0);assert.equal(h.preferenceWrites,0);assert.equal(h.field('featured-settings-panel').hidden,false);assert.equal(h.field('featured-settings-error').hidden,false);assert(h.field('featured-settings-error').textContent.includes(message));assert.equal(h.field('featured-settings-min').value,min,'invalid entries stay editable');
}
{
 const h=boot({origin:null});const before=h.snapshot();h.api.open();h.field('featured-settings-radius').value='30';assert.equal(h.api.apply({preventDefault(){}}),false);assert(h.field('featured-settings-error').textContent.includes('регион'));assert.deepEqual(h.snapshot(),before);assert.equal(h.routes.length,0,'missing location never requests permissions or opens region automatically');assert.equal(h.preferenceWrites,0);
}
{
 const h=boot({category:'cars,property'});h.api.open();h.click(h.button('[data-featured-settings-categories]'));assert.equal(h.field('featured-settings-panel').hidden,true);assert.equal(h.routes[0][0],'categories');assert.equal(h.routes[0][1].value,'cars,property','category route keeps the full selected set');h.field('category').value='';h.api.open();assert.equal(h.field('featured-settings-category-value').textContent,'Все категории');assert.equal(h.field('featured-settings-category-count').textContent,'Все категории');
 h.click(h.button('[data-featured-settings-location]'));assert.equal(h.routes.at(-1)[0],'location');assert.equal(h.field('featured-settings-panel').hidden,true);
 h.api.open();h.click(h.button('[data-featured-settings-interests]'));assert.equal(h.routes.at(-1)[0],'interests');assert.equal(h.field('featured-settings-panel').hidden,true);
 h.api.open();h.click(h.button('[data-featured-settings-reset]'));assert.equal(h.resets,1);assert.equal(h.field('featured-settings-panel').hidden,true);
}
{
 const h=boot();h.api.open();const before=h.snapshot();h.field('featured-settings-min').value='200';h.field('featured-settings-max').value='400';h.context.readAdvancedFilters=()=>{throw Error('validation unavailable')};assert.equal(h.api.apply({preventDefault(){}}),false);assert.deepEqual(h.snapshot(),before,'even a thrown validator restores the temporary candidates');assert.equal(h.preferenceWrites,0);
}
{
 const css=read('featured-settings.css');assert(css.includes('minmax(0,1fr) minmax(0,1fr)'),'both price fields can shrink on a small phone');assert(css.includes('calc(100vw - 32px)'),'popup stays within the viewport');assert(/16px\/1\.45/.test(css),'editable controls retain 16px type to avoid iPhone input zoom');assert(!/touchmove|overflow\s*:\s*hidden/.test(read('featured-settings.js')),'menu does not intercept native scroll');
}
console.log('PASS: inline ellipsis popup toggle/outside/Escape, ordinary focus flow, category/location/interests/reset routes, three-filter apply preserving all other criteria, validation rollback and preference ownership, missing-location errors and narrow-phone CSS.');
