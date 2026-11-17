/* Local make/model catalogue. Canonical form values remain editable and survive catalogue failures. */
(()=>{
 'use strict';
 const states=new WeakMap(),CUSTOM='__custom__';let catalogue=null,pending=null;
 const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
 const norm=value=>String(value??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('ru').replace(/ё/g,'е').replace(/[\s._-]+/g,'');
 const searchMatches=(value,query)=>!norm(query)||norm(value).includes(norm(query))||!!window.FasKeywordSearch?.matchesText?.(value,query);
 const named=(form,name)=>form.elements.namedItem(name);
 const vehicleType=form=>named(form,'subcategory')?.value||named(form,'category')?.value;
 const isCar=form=>['cars','trucks'].includes(vehicleType(form));
 const current=state=>states.get(state.form)===state&&state.form.isConnected!==false&&['seller-listing-form','lot-form'].includes(state.form.id)&&document.querySelector('#'+state.form.id)===state.form&&isCar(state.form);
 function parse(data){
  if(data?.version!==1||!Array.isArray(data.makes))throw Error('Invalid catalogue');
  const makes=[],byName=new Map();
  for(const raw of data.makes){
   if(typeof raw?.name!=='string'||!raw.name.trim()||!Array.isArray(raw.models))continue;
   const names=new Set(),modelTypes=new Map(),models=[];
   for(const item of raw.models){const value=typeof item==='string'?item:item?.name;if(typeof value!=='string'||!value.trim())continue;const name=value.trim(),key=norm(name),types=(Array.isArray(item?.vehicleTypes)?item.vehicleTypes:Array.isArray(raw.vehicleTypes)?raw.vehicleTypes:['cars']).filter(type=>['cars','trucks'].includes(type));modelTypes.set(key,[...new Set([...(modelTypes.get(key)||[]),...types])]);if(names.has(key))continue;names.add(key);models.push(name)}
   models.sort((a,b)=>a.localeCompare(b,'ru',{numeric:true}));
   const make={id:String(raw.id||norm(raw.name)),name:raw.name.trim(),aliases:Array.isArray(raw.aliases)?raw.aliases.filter(alias=>typeof alias==='string'):[],models,modelTypes};
   makes.push(make);for(const alias of [make.name,...make.aliases])if(norm(alias))byName.set(norm(alias),make);
  }
  if(!makes.length)throw Error('Empty catalogue');
  makes.sort((a,b)=>a.name.localeCompare(b.name,'ru',{numeric:true}));return {makes,byName};
 }
 function load(){
  if(catalogue)return Promise.resolve(catalogue);
  if(!pending)pending=fetch('data/car-catalog.json?v=20261113-smart-search1',{credentials:'same-origin'}).then(response=>{if(!response.ok)throw Error('Catalogue unavailable');return response.json()}).then(parse).then(value=>catalogue=value).catch(error=>{pending=null;throw error});
  return pending;
 }
 const makeFor=value=>catalogue?.byName.get(norm(value))||null;
 const modelsFor=(make,form)=>make?.models.filter(name=>make.modelTypes.get(norm(name))?.includes(vehicleType(form)))||[];
 const brandKey=value=>makeFor(value)?.id||norm(value);
 function options(names,value,empty,query=''){
  const selected=String(value??''),matches=names.filter(name=>searchMatches(name,query));
  if(selected&&names.includes(selected)&&!matches.includes(selected))matches.unshift(selected);
  return '<option value="">'+empty+'</option>'+matches.map(name=>'<option value="'+esc(name)+'"'+(name===selected?' selected':'')+'>'+esc(name)+'</option>').join('')+'<option value="'+CUSTOM+'"'+(selected&&!names.includes(selected)?' selected':'')+'>Другой вариант — указать вручную</option>';
 }
 function labelElement(text,forId){const label=document.createElement('label');label.textContent=text;label.htmlFor=forId;return label}
 function searchField(id,labelText){
  const box=document.createElement('div');box.className='car-catalog-search';const label=labelElement(labelText,id),input=document.createElement('input');input.id=id;input.type='search';input.autocomplete='off';input.placeholder='Начните вводить название';input.setAttribute('aria-label',labelText);box.append(label,input);return {box,input};
 }
 function setup(form){
  const brand=named(form,'brand'),model=named(form,'model'),bank=form.id==='lot-form',prefix=bank?'bank':'seller';let brandSelect=named(form,'brandChoice');if(!brand||!model)return null;
  let brandTitle=null,brandCustomLabel=null,ownsBrand=false;
  if(!brandSelect){
   const oldBrandBox=brand.closest('label');if(!oldBrandBox)return null;
   const wrapper=document.createElement('div');wrapper.className='seller-field car-brand-field';wrapper.setAttribute('data-seller-choice-field','brand');
   brandSelect=document.createElement('select');brandSelect.name='brandChoice';brandSelect.id=prefix+'-brand-choice';brandSelect.dataset.sellerChoice='brand';brandSelect.innerHTML=options([],brand.value,'Выберите марку');brandSelect.value=brand.value?CUSTOM:'';
   brandTitle=labelElement('Марка автомобиля',brandSelect.id);brand.id=prefix+'-brand-custom';brandCustomLabel=labelElement('Укажите марку',brand.id);brandCustomLabel.setAttribute('data-seller-custom-label','');
   wrapper.append(brandTitle,brandSelect,brandCustomLabel);oldBrandBox.replaceWith(wrapper);wrapper.appendChild(brand);for(const child of [...oldBrandBox.children])wrapper.appendChild(child);ownsBrand=true;
  }
  const brandBox=brandSelect.closest('[data-seller-choice-field="brand"]'),oldModelBox=model.closest('label');if(!brandBox||!oldModelBox)return null;
  const state={form,brand,brandSelect,brandTitle,brandCustomLabel,ownsBrand,model,request:0,lastBrand:brandKey(brand.value),brandTimer:null,modelTimer:null};
  state.handlers=[];const listenChange=handler=>{state.handlers.push(handler);form.addEventListener('change',handler)};
  const brandSearch=searchField(prefix+'-car-brand-search','Найти марку в справочнике');brandBox.insertBefore(brandSearch.box,brandSelect);state.brandSearch=brandSearch;
  const wrapper=document.createElement('div');wrapper.className='seller-field car-model-field';wrapper.setAttribute('data-seller-choice-field','model');
  const title=labelElement('Модель автомобиля',prefix+'-model-choice'),modelSearch=searchField(prefix+'-car-model-search','Найти модель в справочнике'),select=document.createElement('select');select.id=prefix+'-model-choice';select.name='modelChoice';select.dataset.sellerChoice='model';
  const customLabel=labelElement('Укажите модель',prefix+'-model-custom');customLabel.setAttribute('data-seller-custom-label','');model.id=prefix+'-model-custom';
  wrapper.append(title,modelSearch.box,select,customLabel);oldModelBox.replaceWith(wrapper);wrapper.appendChild(model);
  for(const child of [...oldModelBox.children])wrapper.appendChild(child);
  const status=document.createElement('p');status.className='car-catalog-status';status.setAttribute('role','status');const retry=document.createElement('button');retry.type='button';retry.className='car-catalog-retry';retry.textContent='Загрузить справочник ещё раз';retry.hidden=true;
  const credit=document.createElement('small');credit.className='car-catalog-credit';credit.innerHTML='<a href="https://vehiclesdb.com" target="_blank" rel="noopener noreferrer">Vehicle data by VehiclesDB</a> · <a href="data/car-catalog-LICENSE.txt" target="_blank" rel="noopener noreferrer">Источники и лицензия</a>';
  wrapper.append(status,retry,credit);Object.assign(state,{wrapper,modelTitle:title,modelSelect:select,customLabel,modelSearch,status,retry,credit});states.set(form,state);
  function schedule(kind){const key=kind+'Timer';clearTimeout(state[key]);state[key]=setTimeout(()=>{state[key]=null;if(current(state)&&catalogue)(kind==='brand'?renderBrands:renderModels)(state)},100)}
  brandSearch.input.addEventListener('input',event=>{if(!event.isComposing)schedule('brand')});brandSearch.input.addEventListener('compositionend',()=>schedule('brand'));
  modelSearch.input.addEventListener('input',event=>{if(!event.isComposing)schedule('model')});modelSearch.input.addEventListener('compositionend',()=>schedule('model'));
  retry.onclick=()=>refresh(form);
  // The bank editor has no private seller choice handler, so normalize its
  // selector values before make changes rebuild the dependent model options.
  if(bank)listenChange(event=>{
   if(!current(state))return;const name=event.target.dataset.sellerChoice;if(name!=='brand'&&name!=='model')return;
   const input=named(form,name),custom=event.target.value===CUSTOM;input.value=custom?'':event.target.value;input.hidden=!custom;
   const label=form.querySelector('[data-seller-choice-field="'+name+'"] [data-seller-custom-label]');if(label)label.hidden=!custom;if(custom)input.focus?.();
  });
  // Installed after the seller handler, which writes the canonical brand/model first.
  listenChange(event=>{
   if(!current(state))return;
   if(event.target===brandSelect||event.target===brand){const next=brandKey(brand.value),changed=next!==state.lastBrand;state.lastBrand=next;if(changed){model.value='';modelSearch.input.value=''}if(catalogue){renderBrands(state);renderModels(state)}else manualModel(state)}
  });
  return state;
 }
 function renderBrands(state){
  const value=state.brand.value,make=makeFor(value),query=state.brandSearch.input.value,available=catalogue.makes.filter(item=>modelsFor(item,state.form).length),names=available.filter(item=>[item.name,...item.aliases].some(alias=>searchMatches(alias,query))).map(item=>item.name);
  if(make&&modelsFor(make,state.form).length&&!names.includes(value))names.unshift(value);
  state.brandSelect.innerHTML=options(names,value,'Выберите марку');state.brandSelect.value=value&&names.includes(value)?value:value?CUSTOM:'';
  state.brand.hidden=state.brandSelect.value!==CUSTOM;const customLabel=state.form.querySelector('[data-seller-choice-field="brand"] [data-seller-custom-label]');if(customLabel)customLabel.hidden=state.brand.hidden;
 }
 function manualModel(state){state.modelSelect.innerHTML=options([],state.model.value,'Выберите марку или укажите модель');state.modelSelect.value=state.model.value?CUSTOM:'';state.model.hidden=!state.model.value;state.customLabel.hidden=state.model.hidden;state.modelSearch.box.hidden=true}
 function renderModels(state){
  const make=makeFor(state.brand.value),names=modelsFor(make,state.form),value=state.model.value;
  const matched=names.find(name=>norm(name)===norm(value));const choices=matched&&value!==matched?[value,...names]:names;
  state.modelSelect.innerHTML=options(choices,value,make?'Выберите модель':'Сначала выберите марку',state.modelSearch.input.value);state.modelSelect.value=value&&choices.includes(value)?value:value?CUSTOM:'';
  state.model.hidden=state.modelSelect.value!==CUSTOM;state.customLabel.hidden=state.model.hidden;state.customLabel.textContent='Укажите модель';state.modelSearch.box.hidden=names.length<16;
 }
 async function refresh(form){
  if(!form)return false;let state=states.get(form);if(state&&(named(form,'brand')!==state.brand||named(form,'model')!==state.model)){state.request++;clearTimeout(state.brandTimer);clearTimeout(state.modelTimer);for(const handler of state.handlers)form.removeEventListener?.('change',handler);states.delete(form);state=null}if(!state){if(!isCar(form))return false;state=setup(form);if(!state)return false}
  const request=++state.request,active=isCar(form);state.brandSearch.box.hidden=!active;state.modelTitle.hidden=!active;state.modelSelect.hidden=!active;state.modelSearch.box.hidden=!active;state.status.hidden=!active;state.retry.hidden=true;state.credit.hidden=!active;
  if(state.ownsBrand){state.brandTitle.hidden=!active;state.brandSelect.hidden=!active;if(!active){state.brand.hidden=false;state.brandCustomLabel.hidden=false;state.brandCustomLabel.textContent='Марка / производитель'}else state.brandCustomLabel.textContent='Укажите марку'}
  if(!active){state.model.hidden=false;state.customLabel.hidden=false;state.customLabel.textContent='Модель / назначение';return false}
  state.modelTitle.hidden=false;state.modelSelect.hidden=false;
  if(catalogue){state.lastBrand=brandKey(state.brand.value);renderBrands(state);renderModels(state);state.status.textContent='';state.status.hidden=true;return true}
  manualModel(state);state.status.textContent='Загружаем справочник марок и моделей…';
  try{await load();if(request!==state.request||!current(state))return false;state.lastBrand=brandKey(state.brand.value);renderBrands(state);renderModels(state);state.status.textContent='';state.status.hidden=true;return true}
  catch{if(request!==state.request||!current(state))return false;state.status.textContent='Справочник сейчас недоступен. Можно выбрать другую марку или модель и указать свой вариант вручную.';state.retry.hidden=false;return false}
 }
 window.FasCarCatalog=Object.freeze({enhance:refresh,refresh,load});
})();
