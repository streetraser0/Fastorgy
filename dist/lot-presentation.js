/* Concise lot facts, read from the seller's fields without invented advantages. */
(()=>{
 'use strict';
 if(globalThis.FasLotPresentation)return;
 const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
 const text=value=>typeof value==='string'?value.trim():'';
 const conditions={new:'Новое',used:'Бывшее в эксплуатации',repair:'Требует ремонта'},fuels={petrol:'Бензин',diesel:'Дизель',electric:'Электричество',hybrid:'Гибрид'},transmissions={auto:'Автомат',manual:'Механика'};
 const label=(values,key)=>typeof key==='string'&&Object.hasOwn(values,key)?values[key]:'';
 function number(value,{integer=false,minimum=0,maximum=1e12}={}){
  if(typeof value!=='number'&&typeof value!=='string')return null;
  if(typeof value==='string'){if(!value.trim())return null;value=Number(value.trim().replace(/[\s\u00a0\u202f]/g,'').replace(',','.'))}
  return Number.isFinite(value)&&value>=minimum&&value<=maximum&&(!integer||Number.isInteger(value))?value:null;
 }
 const format=value=>value.toLocaleString('ru-RU',{maximumFractionDigits:2});
 function family(lot){
  const taxonomy=globalThis.FasCategories||globalThis.window?.FasCategories;
  const node=taxonomy?.get?.(lot.subcategory)||taxonomy?.get?.(lot.category),group=node?.groupId||(node?.kind==='group'?node.id:'');
  if(group==='real_estate'||['property','commercial'].includes(lot.category))return 'property';
  if(group==='transport'||['cars','trucks','machinery','vessels'].includes(lot.category))return 'vehicle';
  return 'equipment';
 }
 function facts(lot){
  const rows=[],add=(key,label,value,essential=false)=>rows.push({key,label,value,essential});
  const condition=label(conditions,lot.condition);
  if(condition)add('condition','Состояние',condition,lot.condition==='repair');
  const year=number(lot.year,{integer:true,minimum:1800,maximum:new Date().getUTCFullYear()+2});
  if(year!==null)add('year','Год',year+' год');
  const kind=family(lot);
  if(kind==='vehicle'){
   const mileage=number(lot.mileage)??number(lot.km);
   if(mileage!==null)add('mileage','Пробег',format(mileage)+' км');
   const engineFacts=(globalThis.FasVehicleEngineFacts||globalThis.window?.FasVehicleEngineFacts)?.isVehicle(lot),fuel=engineFacts?'':label(fuels,lot.fuel);
   if(fuel)add('fuel','Топливо',fuel);
   const transmission=label(transmissions,lot.transmission);
   if(transmission)add('transmission','Коробка',transmission);
   const power=engineFacts?null:number(lot.powerHp,{minimum:.01,maximum:1e6});if(power!==null)add('power','Мощность',format(power)+' л.с.');
  }else if(kind==='property'){
   const area=number(lot.area,{minimum:.001});if(area!==null)add('area','Площадь',format(area)+' м²');
   const leaf=lot.subcategory||lot.category,rooms=number(lot.rooms,{integer:true,maximum:1000});
   if(rooms!==null&&!['land','garages','commercial'].includes(leaf))add('rooms','Комнат',rooms===0?'Студия':format(rooms)+' комн.');
  }else{
   const power=number(lot.powerKw,{minimum:.001,maximum:1e9});if(power!==null)add('power','Мощность',format(power)+' кВт');
   const manufacturer=text(lot.manufacturer).slice(0,72);if(manufacturer)add('manufacturer','Производитель',manufacturer);
  }
  return rows;
 }
 function priorityHTML(lot){
  if(!lot||typeof lot!=='object'||Array.isArray(lot))return '';
  const condition=label(conditions,lot.condition),parts=[];
  if(condition)parts.push('<span class="lot-priority-condition'+(lot.condition==='repair'?' lot-fact-warning':'')+'" data-priority-condition>'+esc(condition)+'</span>');
  if(number(lot.deposit)===0)parts.push('<span class="lot-priority-deposit" data-priority-deposit>Без задатка</span>');
  return parts.length?'<div class="lot-priority-facts" data-lot-priority>'+parts.join('')+'</div>':'';
 }
 function html(lot,{compact=false,omitPriority=false}={}){
  if(!lot||typeof lot!=='object'||Array.isArray(lot))return '';
  const rows=facts(lot).filter(row=>!omitPriority||row.key!=='condition').slice(0,compact?2:4),terms=[];
  // A missing/null amount is not a zero deposit. Delivery requires an explicit boolean.
  if(!omitPriority&&number(lot.deposit)===0)terms.push('Без задатка');
  if(lot.delivery===true)terms.push('Доставка по условиям продавца');
  const defects=!!text(lot.defects),essential=rows.some(row=>row.essential)||defects;
  if(!rows.length&&!terms.length&&!defects)return '';
  const list=rows.length?'<ul class="lot-presentation-facts" aria-label="Ключевые характеристики">'+rows.map(row=>'<li class="lot-fact'+(row.essential?' lot-fact-warning':'')+'" data-lot-fact="'+row.key+'"'+(row.essential?' data-essential-fact':'')+' aria-label="'+esc(row.label+': '+row.value)+'">'+esc(row.value)+'</li>').join('')+'</ul>':'';
  const termList=terms.length?'<div class="lot-presentation-terms">'+terms.slice(0,compact?1:2).map(value=>'<span>'+esc(value)+'</span>').join('')+'</div>':'';
  const disclosure=defects?'<p class="lot-presentation-disclosure" data-essential-fact>Сведения о недостатках — в описании</p>':'';
  const demo=lot.specsDemo&&rows.some(row=>row.key!=='condition')?'<small class="lot-presentation-demo">'+(compact?'Демоданные':'Характеристики демонстрационные')+'</small>':'';
  return '<div class="lot-presentation'+(compact?' lot-presentation-compact':'')+(essential?' has-essential-facts':'')+'" data-lot-presentation>'+list+termList+disclosure+demo+'</div>';
 }
 const api=Object.freeze({html,priorityHTML});globalThis.FasLotPresentation=api;if(typeof window!=='undefined')window.FasLotPresentation=api;
})();
