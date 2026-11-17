const assert=require('assert/strict');
const {boot,raw,acceptedAgreementForFixture}=require('./helpers/category-seller-harness.cjs');

function setup(data={}){
 const initial={...raw,subcategory:'cars',brand:'Редкая марка',manufacturer:'Малый завод',year:'2021',durationPreset:'60',...data};
 const stored={version:1,profile:{id:'seller-owner',displayName:'Частный Продавец',phone:'+79991234567',regionCode:'36',city:'Воронеж',agreementAcceptance:acceptedAgreementForFixture()},drafts:[{id:'draft-options',ownerId:'seller-owner',data:initial,mediaRefs:[{id:'idb:image-12345678',kind:'image',size:1024}],updatedAt:new Date().toISOString()}]};
 const h=boot({records:{'fas-seller-workspace-v1':JSON.stringify(stored)}}),fields=new Map(),labels=new Map(),timers=new Map();
 let reads=0,sequence=0;
 const field=name=>{if(!fields.has(name)){const value=initial[name]??'';fields.set(name,{name,value:String(value),checked:!!value,hidden:false,dataset:{},focus(){this.focused=true},closest(){if(!labels.has(name))labels.set(name,{hidden:false});return labels.get(name)}})}return fields.get(name)};
 for(const key of Object.keys(initial))field(key);
 for(const key of ['brand','manufacturer','city']){const select=field(key+'Choice');select.dataset.sellerChoice=key;select.value='__custom__';select.innerHTML='';}
 const controls=new Map(),control=selector=>{if(!controls.has(selector))controls.set(selector,{hidden:false,innerHTML:'',attributes:{},setAttribute(name,value){this.attributes[name]=String(value)},getAttribute(name){return this.attributes[name]??null}});return controls.get(selector)};
 const form=h.node('#seller-listing-form');form.elements={namedItem:field};
 form.querySelector=selector=>{const match=selector.match(/^\[data-seller-choice="([^"]+)"\]$/);return match?field(match[1]+'Choice'):control(selector)};
 h.context.FormData=function(target){reads++;assert.equal(target,form);return [...fields].map(([key,node])=>[key,node.value])};
 h.context.setTimeout=(fn,delay)=>{const id=++sequence;timers.set(id,{fn,delay});return id};
 h.context.clearTimeout=id=>timers.delete(id);
 h.run('window.FasSellerUI.openEditor("draft-options")');
 function change(name,value){const node=field(name);node.value=String(value);form.events.change({target:node})}
 function input(name,value){const node=field(name);node.value=String(value);form.events.input({target:node})}
 function flush(){const tasks=[...timers].filter(([,task])=>task.delay===600);assert.equal(tasks.length,1,'only one pending draft save');for(const [id,task]of tasks){timers.delete(id);task.fn()}}
 return {h,form,field,control,change,input,flush,timers,get reads(){return reads}};
}

(async()=>{
 const s=setup(),{h,field}=s,html=h.node('#modal-content').innerHTML;
 assert.equal(s.control('[data-category-form="seller"]').getAttribute('aria-disabled'),'false','draft category remains editable and exposes its accessibility state');
 for(const name of ['year','brandChoice','manufacturerChoice','cityChoice','durationPreset'])assert(new RegExp('<select[^>]*name="'+name+'"').test(html),name+' has a dropdown');
 const yearSelect=html.match(/<select name="year"[^>]*>([\s\S]*?)<\/select>/)[1];
 assert(yearSelect.indexOf('value="'+(new Date().getFullYear()+1)+'"')<yearSelect.indexOf('value="1900"'),'recent years come first');
 assert(html.includes('value="Редкая марка"'),'unlisted draft brand is preserved');
 assert(html.includes('value="Малый завод"'),'unlisted draft manufacturer is preserved');

 s.change('durationPreset','60');assert.equal(field('durationValue').value,'1');assert.equal(field('durationUnit').value,'hours');assert.equal(s.control('[data-duration-custom]').hidden,true);
 assert(h.node('#seller-publish-summary').innerHTML.includes('Срок: <b>1 ч</b>'));
 s.change('durationPreset','43200');assert.equal(field('durationValue').value,'30');assert.equal(field('durationUnit').value,'days');
 assert(h.node('#seller-publish-summary').innerHTML.includes('Срок: <b>720 ч</b>'));
 s.change('durationPreset','custom');assert.equal(s.control('[data-duration-custom]').hidden,false);
 s.change('durationUnit','hours');s.input('durationValue','1.5');
 assert(h.node('#seller-publish-summary').innerHTML.includes('Срок: <b>1.5 ч</b>'),'custom 90-minute summary updates immediately');

 s.change('brandChoice','Toyota');assert.equal(field('brand').value,'Toyota');assert.equal(field('brand').hidden,true);
 s.change('brandChoice','__custom__');assert.equal(field('brand').value,'');assert.equal(field('brand').hidden,false);assert.equal(field('brand').focused,true);
 s.input('brand','Мой небольшой бренд');
 s.change('manufacturerChoice','__custom__');s.input('manufacturer','Индивидуальный изготовитель');
 s.change('regionCode','77');assert.equal(field('city').value,'','changing region clears the old city');
 assert(field('cityChoice').innerHTML.includes('Москва'));assert(!field('cityChoice').innerHTML.includes('Воронеж'));
 s.change('cityChoice','__custom__');s.input('city','Новый населённый пункт');s.change('year','2020');
 s.change('stepMode','percent');assert.equal(h.node('[data-step-label]').textContent,'Размер шага, %');s.change('stepMode','fixed');assert.equal(h.node('[data-step-label]').textContent,'Размер шага, ₽');

 const beforeReads=s.reads,beforeSummary=h.node('#seller-publish-summary').innerHTML;
 for(let i=0;i<20;i++)s.input('description',raw.description+' '+i);
 assert.equal(s.reads,beforeReads,'description typing does not rebuild full FormData');
 assert.equal(h.node('#seller-publish-summary').innerHTML,beforeSummary,'description typing does not rebuild auction summary');
 s.flush();assert.equal(s.reads,beforeReads+1,'one deferred save reads the form once');
 let draft=JSON.parse(h.records['fas-seller-workspace-v1']).drafts[0].data;
 assert.equal(draft.durationMinutes,90);assert.equal(draft.brand,'Мой небольшой бренд');assert.equal(draft.manufacturer,'Индивидуальный изготовитель');assert.equal(draft.city,'Новый населённый пункт');assert.equal(draft.regionCode,'77');assert.equal(draft.year,'2020');
 await h.publish();const lot=JSON.parse(h.records['fas-lots']).find(lot=>lot.sellerOwnerId);
 assert(lot,'custom and dropdown data can publish normally');
 assert.equal(lot.durationMinutes,90);assert.equal(lot.brand,'Мой небольшой бренд');assert.equal(lot.city,'Новый населённый пункт');assert.equal(lot.year,2020);
 const reload=boot({records:h.records});assert.equal(reload.run('cars.find(c=>c.id==='+lot.id+').brand'),'Мой небольшой бренд');assert.equal(reload.run('cars.find(c=>c.id==='+lot.id+').durationMinutes'),90);
 const switched=setup(),sh=switched.h;let categoryPicker;
 sh.context.window.FasCategoryUI={open(options){categoryPicker=options}};
 const categoryButton={matches:selector=>selector==='[data-category-form="seller"]',querySelector:()=>({textContent:''}),parentElement:{querySelector:()=>({textContent:''})}};
 sh.dispatchClick({target:{closest:selector=>selector==='button,a'?categoryButton:null},preventDefault(){}});assert(categoryPicker,'the real editor handler opens its category picker');
 categoryPicker.onSelect('property',sh.context.window.FasCategories.get('property'));
 const propertyFields=sh.node('#seller-characteristics-main').innerHTML,propertyExtra=sh.node('#seller-characteristics-extra').innerHTML;
 assert(propertyFields.includes('name="area"')&&propertyFields.includes('name="rooms"'),'switching a live editor replaces its characteristic inputs');
 assert(!/name="(?:brand|model|vin)"/.test(propertyFields+propertyExtra),'old car fields do not remain in an apartment editor');
 switched.input('area','65');switched.input('rooms','2');switched.flush();
 const propertyDraft=JSON.parse(sh.records['fas-seller-workspace-v1']).drafts.find(row=>row.id==='draft-options').data;
 assert.equal(propertyDraft.category,'property');assert.equal(propertyDraft.subcategory,'property');assert.equal(propertyDraft.area,'65');assert.equal(propertyDraft.rooms,'2');
 assert(!Object.hasOwn(propertyDraft,'brand')&&!Object.hasOwn(propertyDraft,'model')&&!Object.hasOwn(propertyDraft,'manufacturer'),'saving a changed-category draft removes stale vehicle characteristics');
 assert.equal(propertyDraft.description,raw.description);assert.equal(propertyDraft.startPrice,raw.startPrice,'category changes preserve common text and auction settings');
 categoryPicker.onSelect('cars',sh.context.window.FasCategories.get('cars'));
 const carFields=sh.node('#seller-characteristics-main').innerHTML;
 assert(carFields.includes('name="brand"')&&carFields.includes('name="model"')&&carFields.includes('name="year"'),'switching back restores the vehicle field set');assert(!carFields.includes('name="area"'));
 const media=setup(),mh=media.h,camera=mh.node('#seller-camera'),gallery=mh.node('#seller-files');let cameraOpens=0,galleryOpens=0,calls=0,finishUpload;
 camera.click=()=>cameraOpens++;gallery.click=()=>galleryOpens++;
 const mediaMarkup=mh.node('#modal-content').innerHTML;assert(mediaMarkup.includes('id="seller-camera" type="file" accept="image/*" capture="environment" hidden'),'the explicit camera action requests capture rather than a file-only picker');assert(mediaMarkup.includes('id="seller-files" type="file" multiple'),'gallery selection remains multiple');assert(mediaMarkup.includes('<summary>Документы</summary>'));
 const pick=source=>{const button={dataset:{sellerMediaSource:source},matches:selector=>selector==='[data-seller-media-source]'};mh.dispatchClick({target:{closest:selector=>selector==='button,a'?button:null},preventDefault(){}})};
 assert.equal(cameraOpens+galleryOpens,0,'opening an editor never opens the camera or gallery automatically');
 pick('camera');assert.equal(cameraOpens,1);pick('gallery');assert.equal(galleryOpens,1);
 const selected=[{name:'Camera.jpg'}];camera.files=[];await camera.events.change({target:camera});assert.equal(calls,0,'cancelling the picker does not begin an upload');
 mh.context.window.FasSellerMedia.storeFiles=(files,owner,options)=>{calls++;assert.equal(owner,'seller-owner');assert.equal(files.length,1);return new Promise(resolve=>finishUpload=()=>resolve([{id:'idb:camera_12345678_'+calls,kind:'image',type:'image/jpeg',size:100,name:files[0].name}]))};
 camera.files=selected;camera.value='chosen';const saving=camera.events.change({target:camera});assert.equal(camera.disabled,true);assert.equal(gallery.disabled,true);pick('gallery');assert.equal(galleryOpens,1,'busy media preparation prevents another picker');
 finishUpload();await saving;assert.equal(camera.value,'');assert.equal(camera.disabled,false);assert.equal(mh.node('#seller-publish').disabled,false);assert(mh.node('#seller-media-grid').innerHTML.includes('blob:trusted-idb:camera_12345678_1'),'saved captures receive their normal preview');
 camera.files=selected;const repeated=camera.events.change({target:camera});finishUpload();await repeated;assert.equal(calls,2,'selecting the same file again is handled after input reset');
 mh.context.window.FasSellerMedia.storeFiles=async()=>{throw Error('Формат не поддерживается')};gallery.files=selected;gallery.value='chosen';await gallery.events.change({target:gallery});assert.equal(gallery.value,'');assert.equal(gallery.disabled,false);assert.equal(mh.node('#seller-publish').disabled,false);assert(mh.node('#seller-error').textContent.includes('Формат не поддерживается'),'file preparation errors stay actionable');
 media.form.contains=target=>target===camera||target===gallery;const stale={files:selected,value:'old'};await camera.events.change({target:stale});assert.equal(stale.value,'old','a late selection from an old editor is ignored');
 console.log('PASS: year/brand/manufacturer/city/duration dropdowns, custom values, region changes, exact1h/30d/custom90m, publication/reload and coalesced description autosave.');
})().catch(error=>{console.error(error);process.exitCode=1});
