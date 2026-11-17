const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const {setup}=require('./helpers/quickbar-dom.cjs');
const source=fs.readFileSync('dist/car-catalog.js','utf8');
const data={version:1,makes:[{id:'toyota',name:'Toyota',aliases:['Тойота'],models:[{name:'Camry'},{name:'Corolla'}]},{id:'lada',name:'LADA',aliases:['ВАЗ','Лада'],models:[{name:'Vesta'},{name:'Granta'}]},{id:'rare',name:'Odd <brand>',aliases:[],models:[{name:'A <script>'}]}]};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}};
data.makes.push({id:'sitrak',name:'SITRAK',aliases:['Ситрак'],vehicleTypes:['trucks'],models:[{name:'C7H'},{name:'C9H'}]},{id:'faw',name:'FAW',aliases:['ФАВ'],models:[{name:'Bestune T77',vehicleTypes:['cars']},{name:'J7',vehicleTypes:['trucks']}]});
data.makes.push({id:'chery',name:'Chery',aliases:['Чери'],models:[{name:'Tiggo 7 Pro'},{name:'Arrizo 8'},...Array.from({length:16},(_,i)=>({name:'Model '+(i+1)}))]});
function boot(options={}){
 const h=setup(),timers=new Map(),requests=[];let tick=0;
 h.Element.prototype.replaceWith=function(node){const p=this.parentElement,i=p.children.indexOf(this);p.children[i]=node;node.parentElement=p;this.parentElement=null};
 h.context.setTimeout=(fn)=>{const id=++tick;timers.set(id,fn);return id};h.context.clearTimeout=id=>timers.delete(id);
 h.context.fetch=(url,options)=>{const request=deferred();requests.push({url,options,...request});return request.promise};
 if(options.keywordSearch){vm.runInContext(fs.readFileSync('dist/search-intent.js','utf8'),h.context);vm.runInContext(fs.readFileSync('dist/keyword-search.js','utf8'),h.context);}
 vm.runInContext(source,h.context);
 function form(values={},admin=false){
  const previous=h.document.querySelector('#seller-listing-form,#lot-form');previous?.remove();
  const form=h.add(admin?'lot-form':'seller-listing-form','form',h.content),fields={};
  function input(name,value,parent=form,tag='input'){const node=new h.Element(tag);node.name=name;node.value=String(value??'');parent.appendChild(node);fields[name]=node;return node}
  input('category',values.category||'cars');input('subcategory',values.subcategory||'cars');
  const box=admin?new h.Element('label'):new h.Element('div',{'data-seller-choice-field':'brand'});form.appendChild(box);
  let brandSelect=null;if(!admin){brandSelect=input('brandChoice','',box,'select');brandSelect.dataset.sellerChoice='brand';brandSelect.innerHTML='<option>Toyota</option>';const customLabel=new h.Element('label',{'data-seller-custom-label':''});box.appendChild(customLabel)}input('brand',values.brand||'',box);
  const modelLabel=new h.Element('label');form.appendChild(modelLabel);input('model',values.model||'',modelLabel);modelLabel.appendChild(new h.Element('span',{'data-error-for':'model'}));
  const query=form.querySelector.bind(form);form.querySelector=selector=>{const parts=selector.split(' ');return parts.length===2?query(parts[0])?.querySelector(parts[1])||null:query(selector)};
  form.elements={namedItem:name=>fields[name]||form.querySelectorAll('input,select').find(node=>node.name===name)||null};
  // Existing seller change handler runs first and writes the canonical values.
  if(!admin)form.addEventListener('change',event=>{const name=event.target.dataset.sellerChoice;if(!name)return;const canonical=form.elements.namedItem(name);canonical.value=event.target.value==='__custom__'?'':event.target.value;canonical.hidden=event.target.value!=='__custom__'});
  const change=(name,value)=>{const node=form.elements.namedItem(name);node.value=value;(form.events.change||[]).forEach(fn=>fn({target:node}))};
  return {form,fields,box,brandSelect,change};
 }
 const resolve=(request,payload=data)=>request.resolve({ok:true,json:async()=>payload});
 const flush=()=>{for(const [id,fn]of [...timers]){timers.delete(id);fn()}};
 return {...h,requests,makeForm:form,resolve,flush,api:h.context.FasCarCatalog};
}

(async()=>{
 const h=boot(),first=h.makeForm({brand:'Тойота',model:'Camry'}),pending=h.api.enhance(first.form);
 assert.equal(h.requests.length,1);assert.equal(h.requests[0].url,'data/car-catalog.json?v=20261113-smart-search1');assert.equal(h.requests[0].options.credentials,'same-origin');
 first.fields.model.value='Редкая модификация';h.resolve(h.requests[0]);assert.equal(await pending,true);
 assert.equal(first.fields.brand.value,'Тойота','initial alias must not rewrite the draft');assert.equal(first.fields.model.value,'Редкая модификация','late data preserves current typed model');
 assert.equal(first.form.elements.namedItem('modelChoice').value,'__custom__');assert.equal(first.fields.model.hidden,false);
 assert(first.brandSelect.innerHTML.includes('Toyota'));assert(first.brandSelect.innerHTML.includes('Odd &lt;brand&gt;'));
 assert(first.form.querySelector('.car-catalog-credit').innerHTML.includes('Vehicle data by VehiclesDB'));
 first.change('brandChoice','Toyota');assert.equal(first.fields.model.value,'Редкая модификация','same make alias keeps existing model');
 first.change('brandChoice','LADA');assert.equal(first.fields.model.value,'','changing make clears the previous model');
 const models=first.form.elements.namedItem('modelChoice');assert(models.innerHTML.includes('Vesta'));assert(!models.innerHTML.includes('Camry'));
 first.change('modelChoice','Vesta');assert.equal(first.fields.model.value,'Vesta');assert.equal(first.fields.model.hidden,true);
 first.change('modelChoice','__custom__');first.fields.model.value='Свой вариант';await h.api.refresh(first.form);assert.equal(first.fields.model.value,'Свой вариант');assert.equal(models.value,'__custom__');
 const search=first.form.querySelector('#seller-car-brand-search');search.value='Toy';search.events.input[0]({isComposing:false});h.flush();assert(first.brandSelect.innerHTML.includes('Toyota'));assert(first.brandSelect.innerHTML.includes('LADA'),'selected make stays available during filtering');assert(!first.brandSelect.innerHTML.includes('Odd &lt;brand&gt;'));
 first.fields.category.value='equipment';first.fields.subcategory.value='equipment';await h.api.refresh(first.form);assert.equal(first.fields.model.hidden,false);assert.equal(models.hidden,true);assert.equal(first.fields.model.value,'Свой вариант');
 first.fields.category.value='cars';first.fields.subcategory.value='cars';await h.api.refresh(first.form);assert.equal(models.hidden,false);assert.equal(h.requests.length,1,'catalogue is reused without repeated requests');

 const stale=boot(),old=stale.makeForm({brand:'Toyota',model:'Camry'}),oldLoad=stale.api.enhance(old.form),newForm=stale.makeForm({brand:'LADA',model:'Vesta'}),newLoad=stale.api.enhance(newForm.form);
 assert.equal(stale.requests.length,1,'parallel editors share one request');stale.resolve(stale.requests[0]);assert.equal(await oldLoad,false);assert.equal(await newLoad,true);assert.equal(newForm.fields.brand.value,'LADA');assert.equal(newForm.fields.model.value,'Vesta');

 const offline=boot(),fallback=offline.makeForm({brand:'Малый завод',model:'Уникальная модель'}),attempt=offline.api.enhance(fallback.form);offline.requests[0].reject(Error('offline'));assert.equal(await attempt,false);assert.equal(fallback.fields.brand.value,'Малый завод');assert.equal(fallback.fields.model.value,'Уникальная модель');assert.equal(fallback.fields.model.hidden,false);assert.equal(fallback.form.querySelector('.car-catalog-retry').hidden,false);
 const retry=offline.api.refresh(fallback.form);assert.equal(offline.requests.length,2);offline.resolve(offline.requests[1]);assert.equal(await retry,true);assert.equal(fallback.fields.model.value,'Уникальная модель');
 const bank=boot(),admin=bank.makeForm({brand:'Toyota',model:'Camry'},true),adminLoad=bank.api.enhance(admin.form);bank.resolve(bank.requests[0]);assert.equal(await adminLoad,true);
 assert(admin.form.elements.namedItem('brandChoice'),'bank plain brand input gains a selector');assert.equal(admin.fields.brand.value,'Toyota');assert.equal(admin.fields.model.value,'Camry');
 admin.change('brandChoice','LADA');assert.equal(admin.fields.brand.value,'LADA');assert.equal(admin.fields.model.value,'');admin.change('modelChoice','Vesta');assert.equal(admin.fields.model.value,'Vesta');assert.equal(admin.fields.model.hidden,true);
 admin.change('modelChoice','__custom__');admin.fields.model.value='Индивидуальная версия';await bank.api.refresh(admin.form);assert.equal(admin.fields.model.value,'Индивидуальная версия');
 const canonical=Object.fromEntries(admin.form.querySelectorAll('input,select').filter(node=>node.name).map(node=>[node.name,node.value]));assert.equal(canonical.brand,'LADA');assert.equal(canonical.model,'Индивидуальная версия','bank submission uses canonical fields');
 admin.fields.category.value='equipment';admin.fields.subcategory.value='equipment';await bank.api.refresh(admin.form);assert.equal(admin.fields.brand.hidden,false);assert.equal(admin.form.elements.namedItem('brandChoice').hidden,true);assert.equal(admin.fields.model.hidden,false);
 // Commercial makes and mixed makers use the same dependent lists, with type-safe models.
 const commercial=boot(),truck=commercial.makeForm({category:'trucks',subcategory:'trucks',brand:'Ситрак',model:'C7H'}),truckLoad=commercial.api.enhance(truck.form);commercial.resolve(commercial.requests[0]);assert.equal(await truckLoad,true);
 assert.equal(truck.fields.brand.value,'Ситрак','a saved Cyrillic brand remains intact');assert.equal(truck.fields.model.value,'C7H');
 assert(truck.brandSelect.innerHTML.includes('SITRAK'));assert(!truck.brandSelect.innerHTML.includes('Toyota'),'passenger-only makes do not appear in truck choices');
 assert(truck.form.elements.namedItem('modelChoice').innerHTML.includes('C9H'));
 const truckSearch=truck.form.querySelector('#seller-car-brand-search');truckSearch.value='ситрак';truckSearch.events.input[0]({isComposing:false});commercial.flush();assert(truck.brandSelect.innerHTML.includes('SITRAK'),'Cyrillic search finds the Latin make name');assert(!truck.brandSelect.innerHTML.includes('FAW'));
 truckSearch.value='';truckSearch.events.input[0]({isComposing:false});commercial.flush();truck.change('brandChoice','FAW');const truckModels=truck.form.elements.namedItem('modelChoice');assert(truckModels.innerHTML.includes('J7'));assert(!truckModels.innerHTML.includes('Bestune T77'));truck.change('modelChoice','J7');assert.equal(truck.fields.model.value,'J7');
 truck.fields.category.value='cars';truck.fields.subcategory.value='cars';await commercial.api.refresh(truck.form);assert(truckModels.innerHTML.includes('Bestune T77'));assert(!truckModels.innerHTML.includes('<option value="J7"'),'previous truck model remains an editable custom value rather than a car model choice');assert.equal(truck.fields.model.value,'J7','changing type never silently discards a saved model');
 // Search comparison reuses bilingual aliases, without changing canonical option values.
 const bilingual=boot({keywordSearch:true}),chinese=bilingual.makeForm({brand:'Chery'}),chineseLoad=bilingual.api.enhance(chinese.form);bilingual.resolve(bilingual.requests[0]);await chineseLoad;
 const chineseModelSearch=chinese.form.querySelector('#seller-car-model-search'),chineseModels=chinese.form.elements.namedItem('modelChoice');
 assert.equal(chineseModelSearch.parentElement.hidden,false);
 chineseModelSearch.value='Тигго';chineseModelSearch.events.input[0]({isComposing:false});bilingual.flush();assert(chineseModels.innerHTML.includes('value="Tiggo 7 Pro"'));assert(!chineseModels.innerHTML.includes('Arrizo 8'));assert.equal(chinese.fields.model.value,'','search alone cannot choose or rewrite a model');
 chinese.change('modelChoice','Tiggo 7 Pro');assert.equal(chinese.fields.model.value,'Tiggo 7 Pro');
 chinese.fields.category.value='trucks';chinese.fields.subcategory.value='trucks';chinese.fields.brand.value='SITRAK';chinese.fields.model.value='';await bilingual.api.refresh(chinese.form);
 chineseModelSearch.value='С7Н';chineseModelSearch.events.input[0]({isComposing:false});bilingual.flush();assert(chineseModels.innerHTML.includes('value="C7H"'));assert(!chineseModels.innerHTML.includes('value="C9H"'),'homoglyph matching must preserve the numeric model code');
 console.log('PASS: dependent make/model lists, aliases and custom values, draft preservation, one lazy request, safe filtering, stale editors, category changes and offline retry and bank editor canonical fields.');
 {
 const rebuilt=boot(),dynamic=rebuilt.makeForm({brand:'Toyota',model:'Camry'}),oldLoad=rebuilt.api.enhance(dynamic.form),oldModel=dynamic.fields.model;
 dynamic.form.innerHTML='';
 function replaceField(name,value,parent=dynamic.form,tag='input'){const node=new rebuilt.Element(tag);node.name=name;node.value=value;parent.appendChild(node);dynamic.fields[name]=node;return node}
 replaceField('category','trucks');replaceField('subcategory','trucks');
 const brandBox=new rebuilt.Element('div',{'data-seller-choice-field':'brand'});dynamic.form.appendChild(brandBox);
 const select=replaceField('brandChoice','SITRAK',brandBox,'select');select.dataset.sellerChoice='brand';brandBox.appendChild(new rebuilt.Element('label',{'data-seller-custom-label':''}));replaceField('brand','SITRAK',brandBox);
 const modelBox=new rebuilt.Element('label');dynamic.form.appendChild(modelBox);replaceField('model','C7H',modelBox);
 const newLoad=rebuilt.api.refresh(dynamic.form);assert.equal(rebuilt.requests.length,1,'rebuilding characteristics reuses the pending catalogue request');rebuilt.resolve(rebuilt.requests[0]);await Promise.all([oldLoad,newLoad]);
 assert(dynamic.form.elements.namedItem('modelChoice').innerHTML.includes('C9H'),'the rebuilt form receives its own truck choices');assert.equal(dynamic.fields.model.value,'C7H');assert.equal(oldModel.value,'Camry','late catalogue work cannot rewrite detached controls');
 assert.equal(dynamic.form.querySelectorAll('.car-model-field').length,1);dynamic.change('brandChoice','FAW');assert.equal(dynamic.fields.model.value,'');assert(dynamic.form.elements.namedItem('modelChoice').innerHTML.includes('J7'));
 }
})().catch(error=>{console.error(error);process.exitCode=1});
