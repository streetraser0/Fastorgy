/* Organisation branding supplied by the seller; this is not a verification badge. */
(()=>{
 'use strict';
 if(window.FasPartnerBranding)return;
 const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
 const text=value=>typeof value==='string'?value.trim().slice(0,240):'';
 function normalizeLogo(value){
  if(typeof value!=='string'||/[\u0000-\u001F\u007F-\u009F]/.test(value))return '';
  const source=value.trim();if(!source||source.length>2048||/\s/u.test(source))return '';
  try{const url=new URL(source);return url.protocol==='https:'&&url.hostname&&!url.username&&!url.password?url.href:''}catch{return ''}
 }
 function validLogo(value){if(value===null||value===undefined)return true;if(typeof value!=='string'||/[\u0000-\u001F\u007F-\u009F]/.test(value))return false;return !value.trim()||!!normalizeLogo(value)}
 function organisation(lot){
  if(!lot||typeof lot!=='object'||Array.isArray(lot)||lot.sellerOwnerId)return null;
  const type=text(lot.sellerType).toLowerCase();if(type==='private')return null;
  const name=text(lot.bank)||text(lot.organizationName)||text(lot.sellerName);
  if(!name||/^(?:частный продавец|продавец|физическое лицо|private seller)$/iu.test(name))return null;
  const kind=type==='bank'||!type&&/банк|bank/iu.test(name)?'bank':['leasing','lessor'].includes(type)?'leasing':'company';
  return {name,kind,label:kind==='bank'?'Банк':kind==='leasing'?'Лизинговая компания':'Организация',logo:normalizeLogo(lot.partnerLogo)};
 }
 function initials(name){const words=name.replace(/[«»"']/g,' ').split(/\s+/u).filter(Boolean);return words.slice(0,2).map(word=>Array.from(word)[0]||'').join('').toLocaleUpperCase('ru')||'О'}
 const bankMark='<svg class="lot-partner-bank-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 8 9-5 9 5H3Zm2 3v7m5-7v7m4-7v7m5-7v7M3 21h18"/></svg>';
 function html(lot){
  const seller=organisation(lot);if(!seller)return '';
  return '<span class="lot-partner" data-partner-branding data-partner-kind="'+seller.kind+'" title="Продавец: '+escape(seller.name)+'"><span class="lot-partner-mark" aria-hidden="true"><span class="lot-partner-fallback" title="Логотип не указан"'+(seller.logo?' hidden':'')+'>'+(seller.kind==='bank'?bankMark:escape(initials(seller.name)))+'</span>'+(seller.logo?'<img class="lot-partner-logo" data-partner-logo src="'+escape(seller.logo)+'" alt="" width="28" height="28" loading="lazy" decoding="async" referrerpolicy="no-referrer">':'')+'</span><span class="lot-partner-copy"><span class="lot-partner-name">'+escape(seller.name)+'</span><small class="lot-partner-type">'+seller.label+'</small></span></span>';
 }
 function editorFieldHTML(lot={}){return '<label class="wide partner-logo-field">Логотип банка или организации<input type="url" name="partnerLogo" maxlength="2048" autocomplete="url" inputmode="url" value="'+escape(normalizeLogo(lot.partnerLogo))+'" placeholder="https://example.ru/logo.png"><small>HTTPS-ссылка на логотип продавца. Если логотип не указан, показываем нейтральный значок организации.</small></label>'}
 document.addEventListener('error',event=>{
  const target=event.target;if(!target?.matches?.('img[data-partner-logo]')||target.dataset.partnerFailed)return;
  const mark=target.closest('.lot-partner-mark'),fallback=mark?.querySelector('.lot-partner-fallback');if(!fallback)return;
  target.dataset.partnerFailed='true';target.hidden=true;fallback.hidden=false;
 },true);
 window.FasPartnerBranding=Object.freeze({html,editorFieldHTML,validLogo,normalizeLogo});
})();
