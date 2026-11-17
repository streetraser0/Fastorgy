/* One read-only engine presentation for the catalogue, feeds and lot details. */
(()=>{
 'use strict';
 if(globalThis.FasVehicleEngineFacts)return;
 const HP_TO_KW=.73549875; // Metric horsepower (л.с.), not mechanical/imperial hp.
 const vehicles=new Set(['cars','motorcycles','trucks','machinery','vessels','snowmobiles','atvs']);
 const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
 const format=(value,digits=1)=>value.toLocaleString('ru-RU',{maximumFractionDigits:value<1?Math.max(digits,3):digits});
 const text=value=>typeof value==='string'?value.trim().slice(0,500):'';
 function isVehicle(lot){
  if(!lot||typeof lot!=='object'||Array.isArray(lot)||!lot.category&&!lot.subcategory||lot.assetKind==='trailer')return false;
  const tree=globalThis.FasCategories||globalThis.window?.FasCategories,leaf=tree?.canonicalId?.(lot)||lot.subcategory||lot.category;
  return vehicles.has(leaf);
 }
 function positive(value,max=1e7){
  if(typeof value!=='number'&&typeof value!=='string')return null;
  if(typeof value==='string'){const raw=value.trim().replace(/[\s\u00a0\u202f]/g,'').replace(',','.');if(!/^\d+(?:\.\d+)?$/.test(raw))return null;value=Number(raw)}
  return Number.isFinite(value)&&value>0&&value<=max?value:null;
 }
 const powerHpPattern=/(?:^|[\s·,;/(:])(\d+(?:[.,]\d+)?)\s*(?:л\.?\s*с\.?|лошадиных\s+сил)(?=$|[\s·,;/)])/i;
 const powerKwPattern=/(?:^|[\s·,;/(:])(\d+(?:[.,]\d+)?)\s*(?:кВт|kW)(?![\s·⋅*]*(?:ч|h)(?=$|[\s·,;/)]))(?=$|[\s·,;/)])/i;
 function explicitPower(value,pattern){const match=text(value).match(pattern);return match?positive(match[1]):null}
 function volume(value){
  const match=text(value).match(/(?:^|[\s·,;/(:])(\d+(?:[.,]\d+)?)\s*(л(?!\.?\s*с(?:\.|$|[\s·,;/)]))|литр(?:а|ов)?|L|см[³3]|cc|cm[³3])(?=$|[\s·,;/)])/i);if(!match)return null;
  const amount=positive(match[1],1e6);return amount===null?null:/^(?:см|cc|cm)/i.test(match[2])?amount/1000:amount<=1000?amount:null;
 }
 function type(value){
  const raw=text(value).toLocaleLowerCase('ru').replace(/ё/g,'е');
  const direct={petrol:'Бензиновый',gasoline:'Бензиновый',diesel:'Дизельный',electric:'Электрический',hybrid:'Гибридный',gas:'Газовый',lpg:'Газовый',cng:'Газовый'};
  if(Object.hasOwn(direct,raw))return direct[raw];
  if(/(?:^|[^а-яa-z])гибрид/.test(raw))return 'Гибридный';
  const matches=[[/бензин/,'Бензиновый'],[/дизел/,'Дизельный'],[/электрич|электродвигател/,'Электрический'],[/(?:^|[^а-яa-z])газ(?:овый|овое|обаллонный)?(?:$|[^а-яa-z])/,'Газовый']].filter(([pattern])=>pattern.test(raw));
  return matches.length===1?matches[0][1]:null;
 }
 function read(lot){
  if(!isVehicle(lot))return null;
  const legacy=text(lot.engine),engineType=type(lot.fuel)||type(lot.engineType)||type(legacy);
  // engineVolume is explicitly litres in the seller schema. Legacy aliases have
  // no declared unit: consume them only when their text includes an actual unit.
  const litres=engineType==='Электрический'?null:positive(lot.engineVolume,1000)??volume(lot.engineVolume)??volume(lot.engineCapacity)??volume(lot.displacement)??volume(legacy);
  let hp=positive(lot.powerHp)??explicitPower(lot.powerHp,powerHpPattern),kw=positive(lot.powerKw)??explicitPower(lot.powerKw,powerKwPattern);
  if(hp===null&&kw===null){hp=explicitPower(legacy,powerHpPattern);kw=explicitPower(legacy,powerKwPattern)}
  const derived=hp===null&&kw!==null?'hp':kw===null&&hp!==null?'kw':null;
  if(hp===null&&kw!==null)hp=kw/HP_TO_KW;else if(kw===null&&hp!==null)kw=hp*HP_TO_KW;
  return {type:engineType,litres,hp,kw,derived,rows:[
   {key:'type',label:'Тип двигателя',value:engineType||'Не указано'},
   {key:'volume',label:'Объём двигателя',value:engineType==='Электрический'?'Не применим':litres===null?'Не указано':format(litres,3)+' л'},
   {key:'power',label:'Мощность двигателя',value:hp===null&&kw===null?'Не указано':format(hp)+' л.с. / '+format(kw)+' кВт'}
  ]};
 }
 const conversionTitle=facts=>facts.derived?' title="'+esc('Пересчёт: 1 метрическая л.с. = 0,73549875 кВт. '+(facts.derived==='hp'?'Л.с.':'кВт')+' рассчитаны из указанной мощности.')+'"':'';
 function rowsHTML(lot){const facts=read(lot);return facts?facts.rows.map(row=>'<dt data-engine-label="'+row.key+'">'+esc(row.label)+'</dt><dd data-engine-fact="'+row.key+'"'+(row.key==='power'?conversionTitle(facts):'')+'>'+esc(row.value)+'</dd>').join(''):''}
 function summaryHTML(lot,{compact=false}={}){
  const facts=read(lot);if(!facts)return '';
  return '<dl class="vehicle-engine-summary'+(compact?' vehicle-engine-compact':'')+'" data-vehicle-engine aria-label="Двигатель">'+facts.rows.map(row=>'<div><dt>'+esc(row.label)+'</dt><dd data-engine-fact="'+row.key+'"'+(row.key==='power'?conversionTitle(facts):'')+'>'+esc(row.value)+'</dd></div>').join('')+'</dl>';
 }
 const api=Object.freeze({isVehicle,read,summaryHTML,rowsHTML});globalThis.FasVehicleEngineFacts=api;if(typeof window!=='undefined')window.FasVehicleEngineFacts=api;
})();
