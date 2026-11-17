const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const {setup}=require('./helpers/quickbar-dom.cjs');

function boot(values={},profile={regionCode:'77',city:'Москва'}){
 const h=setup({mobile:true}),Element=h.Element;
 const originalSet=Element.prototype.setAttribute,originalQuery=Element.prototype.querySelectorAll;
 Element.prototype.setAttribute=function(name,value){originalSet.call(this,name,value);if(['name','type','value','autocomplete'].includes(name))this[name]=String(value);if(name==='maxlength')this.maxLength=Number(value);if(name==='hidden')this.hidden=true;};
 Element.prototype.querySelectorAll=function(selector){
  if(!selector.includes(' '))return originalQuery.call(this,selector);
  const parts=selector.trim().split(/\s+/);let found=originalQuery.call(this,parts.shift());
  for(const part of parts)found=found.flatMap(node=>originalQuery.call(node,part));return found;
 };
 Object.defineProperties(Element.prototype,{options:{get(){return this.tagName==='SELECT'?this.querySelectorAll('option'):undefined},configurable:true},parentNode:{get(){return this.parentElement},configurable:true},nextElementSibling:{get(){const siblings=this.parentElement?.children||[];return siblings[siblings.indexOf(this)+1]||null},configurable:true},nodeType:{get(){return 1},configurable:true}});
 h.context.Event=class{constructor(type,options={}){this.type=type;this.bubbles=!!options.bubbles;this.cancelable=!!options.cancelable}preventDefault(){this.defaultPrevented=true}stopPropagation(){this.stopped=true}};
 Element.prototype.dispatchEvent=function(event){
  event.target??=this;let node=this;
  while(node){event.currentTarget=node;(node.events[event.type]||[]).forEach(handler=>handler(event));node['on'+event.type]?.(event);if(!event.bubbles||event.stopped)break;node=node.parentElement}
  if(event.bubbles&&!event.stopped)(h.docEvents[event.type]||[]).forEach(handler=>handler(event));return !event.defaultPrevented;
 };
 Element.prototype.click=function(){this.dispatchEvent(new h.context.Event('click',{bubbles:true,cancelable:true}))};
 const form=h.add('seller-listing-form','form',h.content);
 form.innerHTML='<section class="seller-section"><h3 id="seller-section-1">Что продаёте</h3><div class="seller-grid"><label class="seller-field">Название объявления<input name="name" maxlength="150"></label><div class="seller-field"><input name="brand"><select name="brandChoice"></select></div><label class="seller-field">Модель<input name="model"></label><label>Производитель<input name="manufacturer"></label><label>Год<select name="year"></select></label><input name="category"><input name="subcategory"><input name="startPrice"><input name="stepValue"><input name="durationValue"><input name="vin"></div></section><section class="seller-section"><h3 id="seller-section-4">Где находится имущество</h3><div class="seller-grid"><label>Регион<select name="regionCode"><option value="">Не выбран</option><option value="36">Воронежская область</option><option value="77">Москва</option></select></label><div class="seller-field" data-seller-choice-field="city"><label>Город<select name="cityChoice"></select></label><label data-seller-custom-label hidden>Укажите населённый пункт</label><input name="city" hidden></div><label>Адрес<textarea name="address"></textarea></label></div></section>';
 form.elements={namedItem:name=>form.querySelector('[name="'+name+'"]')};
 const initial={name:'',brand:'Toyota',model:'Camry',manufacturer:'',year:'2021',category:'cars',subcategory:'cars',regionCode:'36',city:'Воронеж',startPrice:'1000000',stepValue:'10000',durationValue:'7',vin:'SAVEDVIN',...values};
 for(const [name,value] of Object.entries(initial)){const field=form.elements.namedItem(name);if(field)field.value=String(value)}
 const field=name=>form.elements.namedItem(name);
 function setCities(region){field('cityChoice').innerHTML='<option value="">Выберите город</option>'+ (region==='77'?['Москва','Зеленоград']:['Воронеж']).map(city=>'<option value="'+city+'">'+city+'</option>').join('')+'<option value="__custom__">Другой город</option>';}
 setCities(initial.regionCode);field('cityChoice').value=initial.city;
 field('regionCode').addEventListener('change',()=>{field('city').value='';setCities(field('regionCode').value)});
 let inputEvents=0;form.addEventListener('input',()=>inputEvents++);
 h.context.FormData=function(){throw Error('Smart fill must not read the full form')};
 h.context.FasSellerUI={getProfile:()=>profile};
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist/smart-fill.js'),'utf8'),h.context);
 const api=h.context.FasSmartFill;
 const fire=(node,type='change')=>node.dispatchEvent(new h.context.Event(type,{bubbles:true,cancelable:true}));
 const change=(name,value,type='change')=>{field(name).value=String(value);fire(field(name),type)};
 const click=selector=>{const button=form.querySelector(selector);assert(button,'missing action '+selector);button.click()};
 return {...h,form,field,api,change,fire,click,get inputEvents(){return inputEvents}};
}

{
 const h=boot();h.api.enhance(h.form);h.change('model','Camry','input');
 assert(h.field('name').value.includes('Toyota'));assert(h.field('name').value.includes('Camry'));assert(h.field('name').value.includes('2021'));
 h.change('year','2022');assert(h.field('name').value.includes('2022'),'auto title follows supplied facts');
 h.change('model','TOYOTA Camry');assert.equal((h.field('name').value.match(/toyota/gi)||[]).length,1,'brand prefix is not duplicated');
 h.change('brand','');h.change('model','');assert.equal(h.field('name').value,'','removing all source facts clears their generated title');
 h.change('brand','Toyota');h.change('model','Camry');assert(h.field('name').value.includes('Camry'),'new facts can refill an empty automatic title');
 h.change('name','Моё точное название','input');h.change('year','2020');assert.equal(h.field('name').value,'Моё точное название','manual title is never overwritten automatically');
 const titleCount=h.form.querySelectorAll('[data-smart-title]').length,locationCount=h.form.querySelectorAll('[data-smart-location]').length;
 h.api.enhance(h.form);assert.equal(h.form.querySelectorAll('[data-smart-title]').length,titleCount);assert.equal(h.form.querySelectorAll('[data-smart-location]').length,locationCount);
 assert(h.inputEvents>0,'programmatic values notify the existing draft saver');
 assert.notEqual(h.field('name').getAttribute('autocomplete'),'name','asset title cannot receive the browser personal name');
}
{
 const h=boot({name:'Название владельца'});h.api.enhance(h.form);h.change('model','Corolla');assert.equal(h.field('name').value,'Название владельца');
 h.click('[data-smart-title]');
 if(h.field('name').value!=='Название владельца'){
  assert(h.form.querySelector('[data-smart-title-undo]'),'replacing a manual title needs an undo action');h.click('[data-smart-title-undo]');assert.equal(h.field('name').value,'Название владельца');
 }
 h.click('[data-smart-title]');h.change('name','Финальное название продавца','input');
 const undo=h.form.querySelector('[data-smart-title-undo]');if(undo){assert.equal(undo.hidden,true,'manual changes clear an obsolete undo action');undo.click();assert.equal(h.field('name').value,'Финальное название продавца');}
 const financial=Object.fromEntries(['startPrice','stepValue','durationValue','vin'].map(name=>[name,h.field(name).value]));
 h.click('[data-smart-location]');assert.equal(h.field('regionCode').value,'77');assert.equal(h.field('city').value,'Москва');assert.equal(h.field('cityChoice').value,'Москва');
 for(const [name,value] of Object.entries(financial))assert.equal(h.field(name).value,value,'autofill must preserve '+name);
 assert.equal(h.field('city').getAttribute('autocomplete'),'address-level2');assert.equal(h.field('regionCode').getAttribute('autocomplete'),'address-level1');assert.equal(h.field('address').getAttribute('autocomplete'),'street-address');
}
{
 const h=boot({}, {regionCode:'77',city:'Новый населённый пункт'});let focus=0;h.field('city').focus=()=>focus++;
 h.api.enhance(h.form);h.click('[data-smart-location]');assert.equal(h.field('cityChoice').value,'__custom__');assert.equal(h.field('city').value,'Новый населённый пункт');assert.equal(h.field('city').hidden,false);assert.equal(h.form.querySelector('[data-seller-custom-label]').hidden,false);assert.equal(focus,0,'filling a custom city does not open the keyboard');
}
{
 const h=boot({name:'',brand:'',model:'',manufacturer:'',year:''},{}) ;h.api.enhance(h.form);assert.equal(h.field('name').value,'','missing facts are not invented');
 const location=h.form.querySelector('[data-smart-location]');assert(!location||location.disabled,'an empty profile must not offer a usable fill action');
}
{
 const h=boot(),profile=h.add('seller-profile-form','form',h.content);profile.innerHTML='<input name="displayName"><input name="phone"><input name="email"><select name="regionCode"></select><input name="city">';profile.elements={namedItem:name=>profile.querySelector('[name="'+name+'"]')};
 h.api.enhanceProfile(profile);h.api.enhanceProfile(profile);
 for(const [name,token] of Object.entries({displayName:'name',phone:'tel',email:'email',regionCode:'address-level1',city:'address-level2'}))assert.equal(profile.elements.namedItem(name).getAttribute('autocomplete'),token);
}
console.log('PASS: factual title autofill/manual safety, explicit profile location/custom cities, unchanged financial data, idempotence and browser autocomplete.');
{
 const h=boot({category:'property',subcategory:'property'});
 for(const [name,value]of [['area','65'],['rooms','2']]){const input=h.add('property-'+name,'input',h.form);input.setAttribute('name',name);input.value=value}
 h.api.enhance(h.form);assert.equal(h.field('name').value,'2-комнатная квартира, 65 м²','apartment titles use rooms and area rather than a stale car make/model');
 h.change('rooms','0');assert.equal(h.field('name').value,'Квартира-студия, 65 м²');
 h.change('name','Моя квартира у парка','input');h.change('area','70');assert.equal(h.field('name').value,'Моя квартира у парка','manual property titles remain untouched');
 h.change('name','','input');h.change('subcategory','houses');assert.equal(h.field('name').value,'Дом, 70 м²','category changes refresh the generated object type');
 h.change('subcategory','land');assert.equal(h.field('name').value,'Земельный участок, 70 м²');
}
