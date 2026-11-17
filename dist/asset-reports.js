/* Official third-party reports: no automatic requests, payments or invented reports. */
(()=>{
 'use strict';
 if(window.FasAssetReports)return;
 const SERVICES=Object.freeze({car:{url:'https://autoteka.ru/',label:'Купить отчёт Автотека'},property:{url:'https://www.gosuslugi.ru/600359/1/form',label:'Запросить выписку ЕГРН'}});
 const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
 const clean=(value,max=500)=>typeof value==='string'?value.trim().slice(0,max):'';
 const records=new Map(),pending=new WeakSet();let sequence=0;
 function kind(lot){
  if(!lot||typeof lot!=='object'||Array.isArray(lot))return null;
  const tree=window.FasCategories;
  if(tree){const id=tree.canonicalId(lot);if(id==='cars')return 'car';if(tree.groupOf(lot)?.id==='real_estate')return 'property';return null}
  const id=lot.subcategory||lot.category;if(id==='cars')return 'car';return ['property','houses','land','garages','commercial'].includes(id)?'property':null;
 }
 function descriptor(lot){
  const type=kind(lot);if(!type)return null;
  const demo=lot.demo===true&&!lot.demoEdited;
  if(type==='car'){
   const vin=clean(lot.vin||lot.VIN,80).replace(/\s/g,'').toUpperCase(),valid=/^[A-HJ-NPR-Z0-9]{17}$/.test(vin);
   return {type,...SERVICES[type],copy:!demo&&valid?vin:'',copyLabel:'Скопировать VIN',fieldLabel:'VIN',demo};
  }
  const cadastral=clean(lot.cadastralNumber,100),address=clean(lot.address);
  const valid=/^\d{2}:\d{2}:\d{6,7}:\d{1,10}$/.test(cadastral);
  return {type,...SERVICES[type],copy:demo?'':valid?cadastral:address,copyLabel:valid?'Скопировать кадастровый номер':'Скопировать адрес',fieldLabel:valid?'Кадастровый номер':'Адрес объекта',demo};
 }
 function actionsHTML(lot){
  const info=descriptor(lot);if(!info)return '';
  const token='asset-report-'+(++sequence);records.set(token,Object.freeze(info));if(records.size>64)records.delete(records.keys().next().value);
  const title=info.type==='car'?'История автомобиля':'Официальные сведения о недвижимости';
  const note=info.type==='car'?'Отчёт покупается в Автотеке. После перехода вставьте данные автомобиля и выберите отчёт на официальном сайте.':'Запрос выписки Росреестра откроется на Госуслугах. Войдите в свою учётную запись, вставьте данные объекта и выберите нужный вид выписки.';
  const missing=info.demo?(info.type==='car'?'Это демонстрационный лот. Для отчёта нужен настоящий VIN автомобиля.':'Это демонстрационный лот. Для запроса нужны настоящие данные объекта.'):(info.type==='car'?'Корректный VIN продавец пока не указал. Его можно ввести самостоятельно в Автотеке.':'Кадастровый номер и адрес продавец пока не указал. Уточните объект перед запросом.');
  return `<section class="asset-report" data-asset-report="${token}" aria-label="${title}"><h3>${title}</h3><p>${note}</p>${info.copy?`<div class="asset-report-identifier"><span>${info.fieldLabel}</span><strong>${escape(info.copy)}</strong></div><p class="asset-report-source">Данные указаны продавцом. При переходе попробуем скопировать их для вставки в форму сервиса. Проверьте данные перед запросом.</p>`:`<p class="asset-report-missing">${missing}</p>`}<div class="asset-report-actions"><a class="outline" data-asset-report-open="${token}" href="${info.url}" target="_blank" rel="noopener noreferrer">${info.label}<span aria-hidden="true"> ↗</span></a>${info.copy?`<button class="outline" type="button" data-asset-report-copy="${token}">${info.copyLabel}</button>`:''}</div><p class="asset-report-status" data-asset-report-status role="status" aria-live="polite"></p>${info.copy?`<textarea class="asset-report-manual" data-asset-report-manual readonly hidden aria-label="${info.fieldLabel} для ручного копирования">${escape(info.copy)}</textarea>`:''}<small>Откроется официальный сервис. Стоимость и доступные сведения определяет сервис; ФАС торги не списывает деньги за отчёт.</small></section>`;
 }
 function current(section,token,info){return records.get(token)===info&&document.querySelector('[data-asset-report="'+token+'"]')===section}
 function manual(section,info){const field=section.querySelector('[data-asset-report-manual]');if(field){field.hidden=false;field.value=info.copy;field.focus?.({preventScroll:true});field.select?.()}section.querySelector('[data-asset-report-status]').textContent='Скопируйте данные из поля ниже и вставьте их в официальном сервисе.'}
 document.addEventListener('click',async event=>{
  const button=event.target.closest?.('[data-asset-report-copy],[data-asset-report-open]');if(!button)return;
  const opens=button.hasAttribute('data-asset-report-open');
  // Keep the original synchronous link navigation (including Capacitor's
  // capture-phase external-browser handler). Never await before opening it.
  if(!opens)event.preventDefault();
  const token=button.dataset.assetReportCopy||button.dataset.assetReportOpen,info=records.get(token),section=button.closest('[data-asset-report]');
  if(!info?.copy||!section||!current(section,token,info)||pending.has(button))return;
  pending.add(button);button.disabled=true;
  try{
   if(typeof navigator.clipboard?.writeText!=='function'){manual(section,info);return}
   await navigator.clipboard.writeText(info.copy);
   if(current(section,token,info))section.querySelector('[data-asset-report-status]').textContent='Данные скопированы — вставьте их в поле официального сервиса. Если страница не открылась, нажмите ссылку ещё раз.';
  }catch{if(current(section,token,info))manual(section,info)}
  finally{pending.delete(button);if(current(section,token,info))button.disabled=false}
 },true);
 window.FasAssetReports=Object.freeze({actionsHTML});
})();
