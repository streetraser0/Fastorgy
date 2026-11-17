const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const {setup}=require('./helpers/quickbar-dom.cjs');
const code=fs.readFileSync('dist/asset-reports.js','utf8');
function boot(clipboard){
 const h=setup({mobile:true});h.context.navigator={clipboard};h.context.fetch=()=>{throw Error('Reports must not request third-party data automatically')};h.context.open=()=>{throw Error('Use the original user-clicked official link, never an automatic popup')};
 vm.runInContext(fs.readFileSync('dist/category-tree.js','utf8'),h.context);vm.runInContext(code,h.context);
 const api=h.context.FasAssetReports;
 const render=lot=>{h.content.innerHTML=api.actionsHTML(lot);return h.content.querySelector('[data-asset-report]')};
 const act=(section,open=false)=>{const event={target:section.querySelector(open?'[data-asset-report-open]':'[data-asset-report-copy]'),preventDefault(){this.prevented=true}};const result=h.docEvents.click.at(-1)(event);return {event,result}};
 const copy=section=>act(section).result;
 return {...h,api,render,act,copy};
}
(async()=>{
 const copied=[],h=boot({async writeText(text){copied.push(text)}});
 let section=h.render({id:1,category:'cars',vin:'1hgcm82633a004352',reportUrl:'javascript:alert(1)'});
 const link=section.querySelector('a');assert.equal(link.getAttribute('href'),'https://autoteka.ru/');assert.equal(link.getAttribute('target'),'_blank');assert.equal(link.getAttribute('rel'),'noopener noreferrer');
 assert.equal(section.querySelectorAll('a').length,1);assert(!link.getAttribute('href').includes('1HG'),'VIN is not disclosed through an automatic query or invented deep link');
 await h.copy(section);assert.deepEqual(copied,['1HGCM82633A004352']);assert.match(section.querySelector('[data-asset-report-status]').textContent,/скопированы/);
 const oneClick=h.act(section,true);assert.equal(copied.length,2,'the explicit service-link click starts copying immediately');assert(!oneClick.event.prevented,'normal link opens within the original gesture, including native external-browser handling');await oneClick.result;
 assert.match(section.querySelector('[data-asset-report-status]').textContent,/вставьте/,'the interface never pretends to fill a cross-origin form');
 for(const id of ['property','houses','land','garages','commercial']){
  section=h.render({id:2,category:'property',subcategory:id,cadastralNumber:'77:01:0004012:123'});
  assert(section,id);assert.equal(section.querySelector('a').getAttribute('href'),'https://www.gosuslugi.ru/600359/1/form');assert(h.content.innerHTML.includes('Запросить выписку ЕГРН'));
 }
 const cadastralAction=h.act(section,true);await cadastralAction.result;assert.equal(copied.at(-1),'77:01:0004012:123');assert(!cadastralAction.event.prevented);
 section=h.render({id:3,category:'property',address:'Воронеж, ул. Ленина, 10'});await h.copy(section);assert.equal(copied.at(-1),'Воронеж, ул. Ленина, 10');
 for(const lot of [{category:'cars',subcategory:'motorcycles'},{category:'trucks'},{category:'machinery'},{category:'equipment'},{category:'other',subcategory:'phones'},{category:'other',subcategory:'furniture'},null,[]])assert.equal(h.api.actionsHTML(lot),'','only supported passenger cars and real estate get these reports');
 for(const vin of ['',null,'invalid','1IGCM82633A004352','1OGCM82633A004352','1QGCM82633A004352']){section=h.render({category:'cars',vin});assert(section.querySelector('a'));assert(!section.querySelector('[data-asset-report-copy]'),'invalid/missing VIN must not be copied as an official vehicle identifier');const action=h.act(section,true);await action.result;assert(!action.event.prevented,'missing identifiers do not block the official service')}
 section=h.render({category:'cars',demo:true,vin:'1HGCM82633A004352'});assert(!section.querySelector('[data-asset-report-copy]'),'generated demo identifiers are not forwarded');assert.match(h.content.innerHTML,/демонстрационный/);
 section=h.render({category:'property',demo:true,cadastralNumber:'77:01:0004012:123',address:'Демо-адрес'});assert(!section.querySelector('[data-asset-report-copy]'));
 section=h.render({category:'cars',demo:true,demoEdited:true,vin:'1HGCM82633A004352'});assert(section.querySelector('[data-asset-report-copy]'),'explicitly edited public data remains usable');
 const attack='</textarea><img src=x onerror=alert(1)>';
 section=h.render({category:'property',address:attack});assert.equal(section.querySelectorAll('img').length,0);assert(!h.content.innerHTML.includes(attack));assert(h.content.innerHTML.includes('&lt;img'));

 const manual=boot();section=manual.render({category:'cars',vin:'1HGCM82633A004352'});await manual.copy(section);assert.equal(section.querySelector('[data-asset-report-manual]').hidden,false);assert.equal(section.querySelector('[data-asset-report-manual]').value,'1HGCM82633A004352');
 const denied=boot({async writeText(){throw Error('Denied')}});section=denied.render({category:'property',address:'Адрес объекта'});await denied.copy(section);assert.equal(section.querySelector('[data-asset-report-manual]').hidden,false);

 let resolve,writes=0;const stale=boot({writeText(){writes++;return new Promise(done=>{resolve=done})}});
 const old=stale.render({category:'cars',vin:'1HGCM82633A004352'}),first=stale.copy(old),duplicate=stale.copy(old);await duplicate;assert.equal(writes,1,'pending clipboard operation ignores repeat taps');
 const next=stale.render({category:'property',address:'Новый объект'});resolve();await first;assert.equal(next.querySelector('[data-asset-report-status]').textContent,'','late clipboard completion cannot update the replacement lot');
 console.log('PASS: official report links by asset type, explicit one-click copy/open, no automatic disclosure/payment or invented prefill, validated/demo identifiers, safe text and clipboard/manual/repeat/stale guards.');
})().catch(error=>{console.error(error);process.exitCode=1});
