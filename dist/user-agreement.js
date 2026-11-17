/* Explicit agreement acceptance only. No account creation, paid status or implicit acceptance. */
(()=>{
 'use strict';
 const version='2026-11-14-r2',url='terms.html?v='+version,edition='14.11.2026 (редакция 2)';
 const archives=Object.freeze({'2026-11-14':'terms-2026-11-14.html'});
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function normalize(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||value.version!==version||typeof value.acceptedAt!=='string')return null;
  const time=Date.parse(value.acceptedAt);if(!Number.isFinite(time)||time<=0||time>Date.now()+300000)return null;
  return Object.freeze({version,acceptedAt:new Date(time).toISOString()});
 }
 function historicalAcceptance(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||(value.version!==version&&!Object.hasOwn(archives,value.version))||typeof value.acceptedAt!=='string')return null;
  const time=Date.parse(value.acceptedAt);if(!Number.isFinite(time)||time<=0||time>Date.now()+300000)return null;
  return Object.freeze({version:value.version,acceptedAt:new Date(time).toISOString()});
 }
 function acceptanceHistory(existing,previous,next){
  const rows=[],seen=new Set();
  for(const value of [...(Array.isArray(existing)?existing.slice(-30):[]),previous,next]){const entry=historicalAcceptance(value);if(!entry)continue;const key=entry.version+'|'+entry.acceptedAt;if(seen.has(key))continue;seen.add(key);rows.push(entry)}
  return Object.freeze(rows);
 }
 const isCurrent=value=>!!normalize(value);
 function capture(input){return input?.checked===true?Object.freeze({version,acceptedAt:new Date().toISOString()}):null}
 function fieldHTML(id='user-agreement',acceptance=null){
  if(!/^[a-zA-Z][\w:-]{0,100}$/.test(id))throw Error('Некорректный идентификатор согласия');
  const current=normalize(acceptance);
  if(current)return `<div class="user-agreement-accepted" role="status">Принята редакция <a href="${url}" target="_blank" rel="noopener noreferrer">Пользовательского соглашения</a> от ${edition}, версия ${version}.<small>Время принятия: ${escape(new Date(current.acceptedAt).toLocaleString('ru-RU'))}</small></div>`;
  const previous=historicalAcceptance(acceptance),notice=previous&&previous.version!==version?`<p class="user-agreement-previous">Ранее принята <a href="${archives[previous.version]}" target="_blank" rel="noopener noreferrer">редакция ${escape(previous.version)}</a>. Новая редакция требует отдельного принятия.</p>`:'';
  return notice+`<label class="user-agreement-consent" for="${id}"><input id="${id}" name="agreementAccepted" type="checkbox" required><span>Я прочитал(а) и принимаю <a href="${url}" target="_blank" rel="noopener noreferrer">Пользовательское соглашение</a> ФАС торги, редакция от ${edition}, версия ${version}.</span></label>`;
 }
 window.FasUserAgreement=Object.freeze({version,url,archives,normalize,isCurrent,capture,fieldHTML,acceptanceHistory});
})();
