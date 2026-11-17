/* Shared auction formats. Descending prices are calculated from published terms, never mutated. */
(()=>{
 'use strict';
 const MAX_DURATION=43200,MAX_MS=MAX_DURATION*60000;
 const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
 const first=(...values)=>values.find(value=>value!==undefined);
 const present=value=>value!==undefined&&value!==null&&value!=='';
 const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
 function number(value){if(typeof value==='number')return Number.isFinite(value)?value:null;if(typeof value!=='string'||!value.trim()||!(/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/).test(value.trim()))return null;const result=Number(value);return Number.isFinite(result)?result:null}
 const positive=value=>Number.isSafeInteger(value)&&value>0;
 const timestamp=value=>typeof value==='number'&&Number.isFinite(value)?value:typeof value==='string'&&value.trim()?Date.parse(value):NaN;
 const iso=value=>Number.isFinite(value)&&Math.abs(value)<=8640000000000000?new Date(value).toISOString():null;
 const money=value=>positive(value)?value.toLocaleString('ru-RU')+' ₽':'не указана';
 function direction(lot){const value=record(lot)?lot.auctionDirection:undefined;return !present(value)?'ascending':['ascending','descending'].includes(value)?value:null}
 function validate(raw={}){
  raw=record(raw)?raw:{};const auctionDirection=direction(raw),errors={},value={auctionDirection,floorPrice:null,decreaseStep:null,decreaseIntervalMinutes:null};
  if(!auctionDirection)errors.auctionDirection='Выберите торги на повышение или на понижение.';
  if(auctionDirection==='descending'){
   const start=number(first(raw.startPrice,raw.start,raw.price)),deposit=number(first(raw.deposit,0)),duration=number(raw.durationMinutes);
   value.floorPrice=number(raw.floorPrice);value.decreaseStep=number(raw.decreaseStep);value.decreaseIntervalMinutes=number(raw.decreaseIntervalMinutes);
   if(!positive(start))errors.startPrice='Укажите положительную стартовую цену в целых рублях.';
   if(!positive(value.floorPrice)||positive(start)&&value.floorPrice>=start)errors.floorPrice='Минимальная цена должна быть больше нуля и ниже стартовой.';
   if(!Number.isSafeInteger(deposit)||deposit<0||positive(value.floorPrice)&&deposit>value.floorPrice)errors.deposit='Задаток не может превышать минимальную цену.';
   if(!positive(value.decreaseStep)||positive(start)&&positive(value.floorPrice)&&value.decreaseStep>start-value.floorPrice)errors.decreaseStep='Шаг снижения — целое число рублей от 1 до разницы стартовой и минимальной цены.';
   if(!Number.isSafeInteger(value.decreaseIntervalMinutes)||value.decreaseIntervalMinutes<1||value.decreaseIntervalMinutes>MAX_DURATION||present(raw.durationMinutes)&&(duration===null||value.decreaseIntervalMinutes>duration))errors.decreaseIntervalMinutes='Интервал снижения — от 1 минуты до срока проведения торгов.';
  }
  return {valid:Object.keys(errors).length===0,errors,value};
 }
 function priceAt(lot,value,now,starts,ends){
  const start=number(first(lot.startPrice,lot.start,lot.price));
  const elapsed=Math.max(0,Math.min(now,ends)-starts),steps=Math.floor(elapsed/(value.decreaseIntervalMinutes*60000));
  const result=BigInt(start)-BigInt(steps)*BigInt(value.decreaseStep),floor=BigInt(value.floorPrice);
  return Number(result<floor?floor:result);
 }
 function quote(lot,now=Date.now()){
  lot=record(lot)?lot:{};const validation=validate(lot),mode=validation.value.auctionDirection;
  const starts=timestamp(first(lot.startsAt,lot.starts)),ends=timestamp(lot.ends),dates=Number.isFinite(now)&&Number.isFinite(starts)&&Number.isFinite(ends)&&ends-starts>=3600000&&ends-starts<=MAX_MS;
  const scheduleValid=mode!=='descending'||dates&&validation.value.decreaseIntervalMinutes<=(ends-starts)/60000;
  let price=null,phase='invalid',next=null;
  if(mode==='ascending'){const candidate=number(first(lot.currentPrice,lot.price,lot.startPrice,lot.start));price=positive(candidate)?candidate:null}
  if(validation.valid&&dates&&scheduleValid){
   const blocked=['draft','paused','sold','cancelled','withdrawn'].includes(lot.status);
   if(blocked)phase=lot.status;
   else if(![undefined,null,'','live','scheduled'].includes(lot.status))phase='invalid';
   else phase=now>=ends?'ended':now<starts?'scheduled':'live';
   if(mode==='descending'){
    price=priceAt(lot,validation.value,now,starts,ends);
    if(price>validation.value.floorPrice&&now<ends){const elapsed=Math.max(0,now-starts),steps=Math.floor(elapsed/(validation.value.decreaseIntervalMinutes*60000));const candidate=starts+(steps+1)*validation.value.decreaseIntervalMinutes*60000;if(candidate<=ends)next=candidate}
   }
  }
  return {...validation.value,direction:mode,label:mode==='descending'?'Торги на понижение':mode==='ascending'?'Торги на повышение':'Формат торгов не указан',price,valid:validation.valid&&price!==null&&(mode==='ascending'||dates&&scheduleValid),phase,canBuy:mode==='descending'&&phase==='live'&&price!==null,startsAt:iso(starts),ends:iso(ends),nextChangeAt:iso(next),nextChangeAtMs:next};
 }
 function currentPrice(lot,now=Date.now()){return quote(lot,now).price}
 function readSettings(form){const get=name=>typeof form?.get==='function'?form.get(name):undefined;return {auctionDirection:get('auctionDirection')||'ascending',floorPrice:get('floorPrice'),decreaseStep:get('decreaseStep'),decreaseIntervalMinutes:get('decreaseIntervalMinutes')}}
 function fieldsHTML(lot={},options={}){
  lot=record(lot)?lot:{};const mode=direction(lot)||'ascending',locked=options.locked===true,disabled=locked?' disabled':'',interval=present(lot.decreaseIntervalMinutes)?lot.decreaseIntervalMinutes:30;
  const intervals=new Map([[1,'1 минута'],[5,'5 минут'],[15,'15 минут'],[30,'30 минут'],[60,'1 час'],[360,'6 часов'],[1440,'1 сутки']]);const numericInterval=number(interval);if(Number.isSafeInteger(numericInterval)&&numericInterval>=1&&numericInterval<=MAX_DURATION&&!intervals.has(numericInterval))intervals.set(numericInterval,numericInterval+' мин');
  const optionsHTML=[...intervals].sort((a,b)=>a[0]-b[0]).map(([minutes,label])=>'<option value="'+minutes+'" '+(minutes===numericInterval?'selected':'')+'>'+label+'</option>').join('');
  return '<section class="auction-mode-settings wide" aria-label="Формат торгов"><label>Формат торгов<select name="auctionDirection" data-auction-direction'+disabled+'><option value="ascending" '+(mode==='ascending'?'selected':'')+'>На повышение</option><option value="descending" '+(mode==='descending'?'selected':'')+'>На понижение</option></select><span class="seller-field-error" data-error-for="auctionDirection"></span></label><div class="auction-descending-settings" data-descending-settings'+(mode==='descending'?'':' hidden')+'><p>Цена снижается по расписанию. Покупатель выбирает текущую цену, не предлагает ставку ниже неё.</p><div class="auction-descending-grid"><label>Минимальная цена, ₽<input type="number" name="floorPrice" min="1" step="1" inputmode="numeric" value="'+escape(lot.floorPrice)+'"'+disabled+'><span class="seller-field-error" data-error-for="floorPrice"></span></label><label>Шаг снижения, ₽<input type="number" name="decreaseStep" min="1" step="1" inputmode="numeric" value="'+escape(lot.decreaseStep)+'"'+disabled+'><span class="seller-field-error" data-error-for="decreaseStep"></span></label><label>Снижать цену каждые<select name="decreaseIntervalMinutes"'+disabled+'>'+optionsHTML+'</select><span class="seller-field-error" data-error-for="decreaseIntervalMinutes"></span></label></div></div>'+(locked?'<p class="note">Формат и условия опубликованных торгов сохранены.</p>':'')+'</section>';
 }
 function syncForm(form){if(!form)return false;const field=form.elements?.namedItem?.('auctionDirection')||form.querySelector?.('[data-auction-direction]'),wrapper=form.querySelector?.('[data-descending-settings]');if(!field||!wrapper)return false;wrapper.hidden=field.value!=='descending';return !wrapper.hidden}
 function htmlSummary(lot){const validation=validate(lot),mode=validation.value.auctionDirection;if(!mode)return '<section class="auction-mode-summary"><strong>Формат торгов не указан</strong></section>';if(mode==='ascending')return '<section class="auction-mode-summary"><strong>Торги на повышение</strong><p>Участники повышают ставки по условиям продавца.</p></section>';const value=validation.value;return '<section class="auction-mode-summary is-descending"><strong>Торги на понижение</strong><p>'+(validation.valid?'Цена снижается на '+money(value.decreaseStep)+' каждые '+value.decreaseIntervalMinutes+' мин. Минимальная цена — '+money(value.floorPrice)+'.':'Условия снижения не настроены. Покупка недоступна.')+'</p></section>'}
 const api=Object.freeze({direction,validate,currentPrice,quote,fieldsHTML,readSettings,syncForm,htmlSummary});globalThis.FasAuctionModes=api;if(typeof window!=='undefined')window.FasAuctionModes=api;
})();
