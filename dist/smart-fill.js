/* Helpers use only values entered by the seller or stored in their local profile. */
(()=>{
 'use strict';
 const forms=new WeakMap();
 const field=(form,name)=>form?.elements?.namedItem(name)||null;
 const value=(form,name)=>String(field(form,name)?.value??'').trim();
 const sources=new Set(['category','subcategory','brand','brandChoice','manufacturer','manufacturerChoice','model','modelChoice','year','area','rooms','itemType','usage','material']);
 function attribute(node,name,text){if(node&&node.getAttribute(name)!==text)node.setAttribute(name,text)}
 function profile(){try{const p=window.FasSellerUI?.getProfile?.();return p&&typeof p==='object'?p:null}catch{return null}}
 function titleFor(form){
  const data={category:value(form,'category'),subcategory:value(form,'subcategory')},profile=window.FasSellerRules?.listingProfile?.(data),category=profile?.id||data.subcategory||data.category;
  if(['property','houses','land','garages','commercial'].includes(category)){
   const area=Number(value(form,'area')),roomText=value(form,'rooms'),rooms=Number(roomText);
   if(!(Number.isFinite(area)&&area>0)&&!(category==='property'&&roomText!==''&&Number.isSafeInteger(rooms)&&rooms>=0))return '';
   const label={property:roomText!==''&&Number.isSafeInteger(rooms)&&rooms>=0?(rooms===0?'Квартира-студия':rooms+'-комнатная квартира'):'Квартира',houses:'Дом',land:'Земельный участок',garages:'Гараж',commercial:'Коммерческое помещение'}[category];
   return label+(Number.isFinite(area)&&area>0?', '+area.toLocaleString('ru-RU')+' м²':'');
  }
  const brand=value(form,'brand')||value(form,'manufacturer'),model=value(form,'model');
  const type=value(form,'itemType');if(!brand&&!model)return type?type.slice(0,150):'';
  const lower=text=>text.toLocaleLowerCase('ru').replace(/\s+/g,' ').trim();
  const duplicate=brand&&model&&(lower(model)===lower(brand)||lower(model).startsWith(lower(brand)+' '));
  let title=brand&&model&&!duplicate?brand+' '+model:model||brand;
  const year=value(form,'year');if(/^\d{4}$/.test(year))title+=', '+year+' г.';
  return title.slice(0,150);
 }
 function message(state,text){if(state.status.textContent!==text)state.status.textContent=text}
 function emitInput(node,state){
  if(!node)return;state.applying=true;
  try{node.dispatchEvent(new Event('input',{bubbles:true}))}finally{state.applying=false}
 }
 function updateTitle(form,state,force=false){
  const name=field(form,'name');if(!name||name.disabled||name.readOnly||form.isConnected===false)return false;
  const current=String(name.value||'');
  if(!force&&current&&current!==state.autoTitle)return false;
  const next=titleFor(form);
  if(!next){
   if(!force&&current&&current===state.autoTitle){name.value='';state.autoTitle='';emitInput(name,state);message(state,'')}
   if(force)message(state,'Сначала заполните основные характеристики имущества.');return false;
  }
  if(current===next){state.autoTitle=next;if(force)message(state,'Название уже соответствует заполненным данным.');return true}
  if(force){state.undo={value:current,autoTitle:state.autoTitle};state.undoButton.hidden=false}
  name.value=next;state.autoTitle=next;emitInput(name,state);
  message(state,'Название составлено из заполненных полей. Его можно изменить.');return true;
 }
 function optionExists(select,wanted){return Array.from(select?.options||[]).some(option=>String(option.value)===wanted)}
 function fillLocation(form,state){
  const p=profile(),region=field(form,'regionCode'),city=field(form,'city');
  const code=typeof p?.regionCode==='string'?p.regionCode.trim():'',place=typeof p?.city==='string'?p.city.trim().slice(0,100):'';
  if(!code||!place||!region||!city){message(state,'Сначала заполните регион и город в профиле.');return false}
  if(!optionExists(region,code)){message(state,'Проверьте регион в профиле.');return false}
  region.value=code;region.dispatchEvent(new Event('change',{bubbles:true}));
  const choice=field(form,'cityChoice');
  if(choice){
   const custom=!optionExists(choice,place);choice.value=custom?'__custom__':place;
   city.hidden=!custom;
   const container=choice.closest('[data-seller-choice-field]'),label=container?.querySelector('[data-seller-custom-label]');
   if(label)label.hidden=!custom;
  }
  city.value=place;emitInput(city,state);message(state,'Регион и город заполнены из вашего профиля.');return true;
 }
 function button(action,text){const node=document.createElement('button');node.type='button';node.className='seller-action-link';node.setAttribute(action,'');node.textContent=text;return node}
 function autocomplete(form,listing=false){
  attribute(field(form,'displayName'),'autocomplete','name');
  attribute(field(form,'phone'),'autocomplete','tel');attribute(field(form,'phone'),'inputmode','tel');
  attribute(field(form,'email'),'autocomplete','email');attribute(field(form,'email'),'inputmode','email');
  attribute(field(form,'regionCode'),'autocomplete','address-level1');attribute(field(form,'city'),'autocomplete','address-level2');
  attribute(field(form,'address'),'autocomplete','street-address');
  if(listing)for(const name of ['name','brand','model','manufacturer'])attribute(field(form,name),'autocomplete','off');
 }
 function enhanceProfile(form){if(!form?.elements)return false;autocomplete(form);return true}
 function enhance(form){
  if(!form?.elements||!field(form,'name'))return false;
  autocomplete(form,true);if(forms.has(form))return true;
  const name=field(form,'name'),label=name.closest('label');if(!label?.parentElement)return false;
  const host=document.createElement('div');host.className='seller-field smart-title-field';
  label.parentElement.insertBefore(host,label);host.appendChild(label);
  const actions=document.createElement('div');actions.className='smart-fill-actions';
  const create=button('data-smart-title','Составить название'),undo=button('data-smart-title-undo','Вернуть прежнее название');undo.hidden=true;
  actions.appendChild(create);actions.appendChild(undo);host.appendChild(actions);
  const status=document.createElement('small');status.className='smart-fill-status';status.setAttribute('data-smart-status','');status.setAttribute('role','status');host.appendChild(status);
  const state={autoTitle:null,undo:null,undoButton:undo,status,applying:false};forms.set(form,state);
  create.addEventListener('click',()=>updateTitle(form,state,true));
  undo.addEventListener('click',()=>{if(!state.undo)return;name.value=state.undo.value;state.autoTitle=state.undo.autoTitle;state.undo=null;undo.hidden=true;emitInput(name,state);message(state,'Предыдущее название восстановлено.')});
  const p=profile(),heading=form.querySelector('#seller-section-4');
  if(heading&&typeof p?.regionCode==='string'&&p.regionCode.trim()&&typeof p.city==='string'&&p.city.trim()){
   const location=document.createElement('div');location.className='smart-fill-location';
   const fill=button('data-smart-location','Заполнить регион и город из профиля');location.appendChild(fill);
   heading.parentElement.insertBefore(location,heading.nextElementSibling);
   fill.addEventListener('click',()=>fillLocation(form,state));
  }
  updateTitle(form,state);return true;
 }
 function onChange(event){
  const target=event.target,form=target?.closest?.('#seller-listing-form'),state=form&&forms.get(form);
  if(!state||state.applying||form.isConnected===false)return;
  if(target.name==='name'){state.autoTitle=null;state.undo=null;state.undoButton.hidden=true;message(state,'');return}
  if(sources.has(target.name))updateTitle(form,state);
 }
 document.addEventListener('input',onChange);document.addEventListener('change',onChange);
 function refresh(form){const state=forms.get(form);if(!state)return enhance(form);return updateTitle(form,state)}
 window.FasSmartFill=Object.freeze({enhance,enhanceProfile,refresh});
})();
