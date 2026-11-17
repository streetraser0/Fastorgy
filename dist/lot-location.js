/* Only explicit, valid asset coordinates form an external map link. */
(()=>{
 'use strict';
 function value(raw){
  if(typeof raw==='number')return Number.isFinite(raw)?raw:null;
  if(typeof raw!=='string')return null;
  const normalized=raw.trim().replace(',','.');
  return /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)&&Number.isFinite(Number(normalized))?Number(normalized):null;
 }
 function parse(latitude,longitude){const lat=value(latitude),lon=value(longitude);return lat!==null&&lon!==null&&Math.abs(lat)<=90&&Math.abs(lon)<=180?[lat,lon]:null}
 function url(lot){const point=lot&&typeof lot==='object'?parse(lot.latitude,lot.longitude):null;return point?'https://yandex.ru/maps/?pt='+encodeURIComponent(point[1]+','+point[0])+'&z=16&l=map':null}
 function html(lot){
  const point=lot&&typeof lot==='object'?parse(lot.latitude,lot.longitude):null;if(!point)return '';
  const coordinates=point.map(number=>Number(number.toFixed(6)).toLocaleString('ru-RU',{useGrouping:false,maximumFractionDigits:6})).join(' · ');
  return '<a class="lot-location-link" href="'+url(lot)+'" target="_blank" rel="noopener noreferrer" aria-label="Открыть местоположение имущества на карте"><svg class="ui-icon" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0Z"/><circle cx="12" cy="10" r="2.3"/></svg><span><strong>'+coordinates+'</strong><small>Открыть карту с точкой имущества</small></span><span class="lot-location-arrow" aria-hidden="true">↗</span></a>';
 }
 window.FasLotLocation=Object.freeze({parse,url,html});
})();
