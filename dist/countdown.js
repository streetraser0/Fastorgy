/* Calendar-month countdown. UTC keeps one auction deadline consistent across regions. */
(()=>{
 'use strict';
 if(window.FasCountdown)return;
 const UNITS=[['months','мес.',['месяц','месяца','месяцев']],['days','дн.',['день','дня','дней']],['hours','ч.',['час','часа','часов']],['minutes','мин.',['минута','минуты','минут']],['seconds','сек.',['секунда','секунды','секунд']]];
 const cache=new WeakMap();
 function time(value){return typeof value==='number'?value:value instanceof Date?value.getTime():typeof value==='string'?Date.parse(value):NaN}
 function addMonths(anchor,months){
  const date=new Date(0),absolute=anchor.getUTCFullYear()*12+anchor.getUTCMonth()+months,year=Math.floor(absolute/12),month=absolute-year*12;
  const leap=year%4===0&&(year%100!==0||year%400===0),last=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31][month];
  date.setUTCFullYear(year,month,Math.min(anchor.getUTCDate(),last));
  date.setUTCHours(anchor.getUTCHours(),anchor.getUTCMinutes(),anchor.getUTCSeconds(),anchor.getUTCMilliseconds());
  return date.getTime();
 }
 function parts(end,now=Date.now()){
  const until=time(end),from=time(now),valid=Number.isFinite(until)&&Number.isFinite(from)&&!Number.isNaN(new Date(until).getTime())&&!Number.isNaN(new Date(from).getTime());
  const result={months:0,days:0,hours:0,minutes:0,seconds:0,expired:valid&&until<=from,valid};
  if(!valid||until<=from)return result;
  const anchor=new Date(from),target=new Date(until);
  let months=Math.max(0,(target.getUTCFullYear()-anchor.getUTCFullYear())*12+target.getUTCMonth()-anchor.getUTCMonth()),cursor=addMonths(anchor,months);
  if((!Number.isFinite(cursor)||cursor>until)&&months){months--;cursor=addMonths(anchor,months)}
  let seconds=Math.max(0,Math.floor((until-cursor)/1000));
  result.months=months;result.days=Math.floor(seconds/86400);seconds%=86400;
  result.hours=Math.floor(seconds/3600);seconds%=3600;result.minutes=Math.floor(seconds/60);result.seconds=seconds%60;return result;
 }
 const digits=(key,value)=>key==='months'||key==='days'?String(value):String(value).padStart(2,'0');
 function word(value,forms){const last=value%100;return forms[last>=11&&last<=14?2:value%10===1?0:value%10>=2&&value%10<=4?1:2]}
 function label(value){if(!value.valid)return 'Срок окончания не указан';if(value.expired)return 'Торги завершены';return 'До завершения: '+UNITS.map(([key,,forms])=>value[key]+' '+word(value[key],forms)).join(', ')}
 function text(end,now=Date.now()){const value=parts(end,now);return UNITS.map(([key,short])=>digits(key,value[key])+' '+short).join(' ')}
 function markup(value){return '<span class="countdown-units" role="timer" aria-live="off" aria-label="'+label(value)+'">'+UNITS.map(([key,short])=>'<span class="countdown-unit"><b class="countdown-number" data-countdown-part="'+key+'" aria-hidden="true">'+digits(key,value[key])+'</b><small aria-hidden="true">'+short+'</small></span>').join('')+'</span>'}
 function html(end,now=Date.now()){return markup(parts(end,now))}
 function update(node,end,now=Date.now()){
  if(!node||typeof node.querySelector!=='function')return false;
  const value=parts(end,now);let entry=cache.get(node);
  if(!entry||entry.wrapper.parentNode!==node){
   let wrapper=node.querySelector('.countdown-units'),numbers=wrapper?UNITS.map(([key])=>wrapper.querySelector('[data-countdown-part="'+key+'"]')):[];
   if(!wrapper||numbers.some(part=>!part)||numbers.length!==UNITS.length){node.innerHTML=markup(value);wrapper=node.querySelector('.countdown-units');numbers=wrapper?UNITS.map(([key])=>wrapper.querySelector('[data-countdown-part="'+key+'"]')):[]}
   if(!wrapper||numbers.some(part=>!part)||numbers.length!==UNITS.length)return false;
   entry={wrapper,numbers,label:wrapper.getAttribute('aria-label')};cache.set(node,entry);
  }
  let changed=false;
  UNITS.forEach(([key],index)=>{const next=digits(key,value[key]);if(entry.numbers[index].textContent!==next){entry.numbers[index].textContent=next;changed=true}});
  const nextLabel=label(value);if(entry.label!==nextLabel){entry.wrapper.setAttribute('aria-label',nextLabel);entry.label=nextLabel;changed=true}return changed;
 }
 window.FasCountdown=Object.freeze({parts,text,html,update});
})();
