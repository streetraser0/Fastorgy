const assert=require('assert/strict'),fs=require('fs'),vm=require('vm');
const {boot,raw,acceptedAgreementForFixture}=require('./helpers/category-seller-harness.cjs');

function setup(extra={}){
 const initial={...raw,subcategory:'cars',brand:'Toyota',model:'Camry',address:'Площадка хранения',...extra};
 const workspace={version:1,profile:{id:'seller-owner',displayName:'Продавец имущества',phone:'+79991234567',regionCode:'36',city:'Воронеж',agreementAcceptance:acceptedAgreementForFixture()},drafts:[{id:'draft-location',ownerId:'seller-owner',data:initial,mediaRefs:[{id:'idb:image-12345678',kind:'image',size:1024}],updatedAt:new Date().toISOString()}]};
 const h=boot({records:{'fas-seller-workspace-v1':JSON.stringify(workspace)}}),fields=new Map(),controls=new Map(),timers=new Map(),requests=[];let sequence=0;
 vm.runInContext(fs.readFileSync('dist/lot-location.js','utf8'),h.context);
 const field=name=>{if(!fields.has(name)){const value=initial[name]??'';fields.set(name,{name,value:String(value),checked:!!value,hidden:false,dataset:{},focus(){},closest(){return {hidden:false}}})}return fields.get(name)};
 for(const name of Object.keys(initial))field(name);
 for(const name of ['brand','manufacturer','city']){field(name+'Choice').dataset.sellerChoice=name;field(name+'Choice').value='__custom__'}
 const control=selector=>{if(!controls.has(selector))controls.set(selector,{hidden:false,innerHTML:'',attributes:{},setAttribute(name,value){this.attributes[name]=String(value)},getAttribute(name){return this.attributes[name]??null}});return controls.get(selector)};
 const form=h.node('#seller-listing-form');form.elements={namedItem:field};form.querySelector=selector=>{const match=selector.match(/^\[data-seller-choice="([^"]+)"\]$/);return match?field(match[1]+'Choice'):control(selector)};
 h.context.FormData=function(target){assert.equal(target,form);return [...fields].map(([name,node])=>[name,node.value])};
 h.context.setTimeout=(fn,delay)=>{const id=++sequence;timers.set(id,{fn,delay});return id};h.context.clearTimeout=id=>timers.delete(id);
 h.context.navigator.geolocation={getCurrentPosition(success,error,options){requests.push({success,error,options})}};
 h.run('window.FasSellerUI.openEditor("draft-location")');
 const input=(name,value)=>{field(name).value=value;form.events.input({target:field(name)})};
 return {h,form,field,requests,input,api:h.context.window.FasLotLocation,async locate(){await h.click({sellerLocation:'1'})},flush(){for(const [id,timer]of [...timers])if(timer.delay===600){timers.delete(id);timer.fn()}}};
}

(async()=>{
 const h=setup(),api=h.api;
 assert.deepEqual(Array.from(api.parse('55,7558','37,6173')),[55.7558,37.6173]);
 assert.deepEqual(Array.from(api.parse(' -33,865143 ','151.2099')),[-33.865143,151.2099]);
 assert.deepEqual(Array.from(api.parse(0,'0')),[0,0]);
 for(const point of [[91,37],[55,181],['',37],[null,37],[false,37],[[],37],[{},37],['1e2',37],['Infinity',37],['<img src=x>',37]])assert.equal(api.parse(...point),null,'invalid coordinate pair '+String(point));
 const link=new URL(api.url({latitude:'55,7558',longitude:'37,6173'}));
 assert.equal(link.origin,'https://yandex.ru');assert.equal(link.searchParams.get('pt'),'37.6173,55.7558','map pin uses longitude then latitude');assert.equal(link.searchParams.get('z'),'16');
 const html=api.html({latitude:'55,7558',longitude:'37,6173',name:'<img src=x onerror=alert(1)>'});
 assert(html.includes('rel="noopener noreferrer"'));assert(html.includes('target="_blank"'));assert(!html.includes('<img'));assert.equal(api.html({latitude:'javascript:alert(1)',longitude:37}),'');
 assert.equal(h.requests.length,0,'opening the seller form never requests location automatically');
 const content=h.h.node('#modal-content').innerHTML,section=content.slice(content.indexOf('aria-labelledby="seller-section-4"'),content.indexOf('aria-labelledby="seller-section-5"'));
 assert(section.includes('Местоположение'));assert(section.includes('name="latitude"'));assert(section.includes('name="longitude"'));assert(!section.includes('<details'),'coordinates are visible without an extra disclosure');
 await h.locate();await h.locate();assert.equal(h.requests.length,1,'repeat taps do not request location twice');
 assert.equal(h.h.node('[data-seller-location]').disabled,true);assert.equal(h.requests[0].options.timeout,15000);
 h.requests[0].success({coords:{latitude:55.75581234,longitude:37.61731234}});
 assert.equal(h.field('latitude').value,'55.755812');assert.equal(h.field('longitude').value,'37.617312');assert.equal(h.field('address').value,'Площадка хранения','GPS never fabricates/replaces the address');
 assert.equal(h.h.node('[data-seller-location]').disabled,false);assert(h.h.node('#seller-location-preview').innerHTML.includes('https://yandex.ru/maps/'));
 h.flush();const saved=JSON.parse(h.h.records['fas-seller-workspace-v1']).drafts.find(d=>d.id==='draft-location');assert.equal(saved.data.latitude,'55.755812');

 await h.locate();const stale=h.requests.at(-1);h.input('latitude','-10,5');h.input('longitude','20,25');stale.success({coords:{latitude:1,longitude:2}});
 assert.equal(h.field('latitude').value,'-10,5');assert.equal(h.field('longitude').value,'20,25','late GPS cannot overwrite manual coordinates');
 await h.locate();const denied=h.requests.at(-1);denied.error({code:1});assert.match(h.h.node('#seller-location-status').textContent,/запрещён/);assert.equal(h.h.node('[data-seller-location]').disabled,false);
 await h.locate();const closed=h.requests.at(-1);h.h.run('window.FasSellerUI.openDashboard()');const screen=h.h.node('#modal-content').innerHTML;closed.success({coords:{latitude:2,longitude:3}});assert.equal(h.h.node('#modal-content').innerHTML,screen,'late callback cannot replace another view');

 const published=setup({latitude:'55,7558',longitude:'37,6173'});let capturedAfterSave=false;published.h.context.window.FasSalesAnalytics={captureSales(lots){capturedAfterSave=JSON.parse(published.h.records['fas-lots']).some(saved=>saved.id===lots.at(-1).id);throw Error('Analytics unavailable')}};await published.h.publish();assert(capturedAfterSave,'analytics sees only a durably saved publication and cannot undo it');
 const lot=published.h.run('cars.find(c=>c.sellerOwnerId==="seller-owner")');assert(lot,'valid comma coordinates publish');assert.equal(lot.latitude,55.7558);assert.equal(lot.longitude,37.6173);
 const invalid=setup({latitude:'91',longitude:'37'}),before=invalid.h.run('cars.length');await invalid.h.publish();assert.equal(invalid.h.run('cars.length'),before,'invalid coordinates block publication');assert.match(invalid.h.node('[data-error-for="latitude"]').textContent,/координаты/);
 console.log('PASS: visible coordinates, validated map pins, comma/negative/zero values, explicit GPS, duplicate/stale/manual-safe callbacks, draft persistence and publication.');
})().catch(error=>{console.error(error);process.exitCode=1});
