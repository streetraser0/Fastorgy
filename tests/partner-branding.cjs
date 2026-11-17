const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {setup}=require('./helpers/quickbar-dom.cjs');
const source=fs.readFileSync(path.resolve(__dirname,'../dist/partner-branding.js'),'utf8');
function boot(){const h=setup({mobile:true});h.context.URL=URL;let registered=0;const original=h.context.document.addEventListener;h.context.document.addEventListener=(type,callback,options)=>{if(type==='error'){registered++;assert.equal(options,true,'image failures are observed in capture phase')}return original(type,callback,options)};vm.runInContext(source,h.context);h.api=h.context.FasPartnerBranding;h.listeners=()=>registered;return h}
const h=boot(),api=h.api;
assert(Object.isFrozen(api));
for(const value of [undefined,null,'','   '])assert.equal(api.validLogo(value),true,'empty logo is optional');
for(const value of ['https://partner.example/logo.png',' https://partner.example/logo.svg?size=64&theme=light ','https://cdn.partner.example/image?id=4'])assert.equal(api.validLogo(value),true,value);
assert.equal(api.normalizeLogo(' https://PARTNER.example/logo.png '),'https://partner.example/logo.png');
for(const value of ['http://partner.example/logo.png','javascript:alert(1)','data:image/svg+xml,<svg/>','blob:upload','//partner.example/logo.png','https://user:password@partner.example/logo.png','https://partner.example/white space.png','https://partner.example/\nlogo.png','\n','https://partner.example/\u0080logo.png',{},7,'https://partner.example/'+ 'x'.repeat(2048)]){assert.equal(api.validLogo(value),false,'unsafe or unsupported logo rejected');assert.equal(api.normalizeLogo(value),'')}
for(const lot of [null,[],{}, {bank:'Частный продавец'}, {bank:'Имя человека',sellerType:'private',partnerLogo:'https://partner.example/logo.png'}, {bank:'Банк',sellerType:' PRIVATE '}, {bank:'Банк',sellerType:'bank',sellerOwnerId:'owner'}])assert.equal(api.html(lot),'','private/unknown sellers have no organisation badge');
const bank={bank:'Демо-банк',sellerType:'bank',demo:true};
const neutral=api.html(bank);assert(neutral.includes('lot-partner-fallback'));assert(neutral.includes('Логотип не указан'));assert(neutral.includes('Демо-банк'));assert(!neutral.includes('<img'),'demo bank never borrows a real bank logo');assert(!/проверен|verified|Сбер|ВТБ/i.test(neutral),'branding makes no verification or invented partnership claim');
assert(api.html({bank:'Тестовый банк'}).includes('data-partner-kind="bank"'),'legacy bank-name lots are recognised');
assert(api.html({bank:'Организация',sellerType:'company'}).includes('Организация'));
assert(api.html({bank:'Лизинговая компания',sellerType:'leasing'}).includes('data-partner-kind="leasing"'));
const company={bank:'Компания <img src=x onerror=evil()> & "Юг"',sellerType:'company',partnerLogo:'https://partner.example/logo.svg?size=64&theme=light'};
const branded=api.html(company);assert(branded.includes('src="https://partner.example/logo.svg?size=64&amp;theme=light"'));assert(branded.includes('&lt;img'));assert(!branded.includes('<img src=x'));
h.grid.innerHTML=branded;
assert.equal(h.grid.querySelectorAll('img').length,1);assert.equal(h.grid.querySelector('script'),null);assert.equal(h.grid.querySelector('[onerror]'),null,'escaped seller text cannot create an event handler');
const image=h.grid.querySelector('img[data-partner-logo]'),mark=image.closest('.lot-partner-mark'),fallback=mark.querySelector('.lot-partner-fallback');
assert.equal(image.getAttribute('width'),'28');assert.equal(image.getAttribute('height'),'28');assert.equal(image.getAttribute('loading'),'lazy');assert.equal(image.getAttribute('referrerpolicy'),'no-referrer');assert(fallback.hasAttribute('hidden'));
h.event('error',image);assert.equal(image.hidden,true);assert.equal(fallback.hidden,false);assert.equal(image.dataset.partnerFailed,'true','failed load changes to a neutral mark without another request');h.event('error',image);assert.equal(image.hidden,true);
const unrelated=h.add('ordinary-photo','img');h.event('error',unrelated);assert.equal(unrelated.hidden,false,'ordinary lot photos are untouched');
const editor=api.editorFieldHTML({partnerLogo:'https://partner.example/logo.png?a=1&b=2'});assert(editor.includes('name="partnerLogo"'));assert(editor.includes('type="url"'));assert(editor.includes('maxlength="2048"'));assert(editor.includes('value="https://partner.example/logo.png?a=1&amp;b=2"'));
assert(!api.editorFieldHTML({partnerLogo:'javascript:alert(1)'}).includes('javascript:'));
vm.runInContext(source,h.context);assert.equal(h.listeners(),1,'repeated installation creates no duplicate error listener');
const css=fs.readFileSync(path.resolve(__dirname,'../dist/partner-branding.css'),'utf8');assert(/\.lot-partner-mark\s*\{[^}]*width:\s*28px/s.test(css),'logo space is reserved');assert(/overflow-wrap:\s*anywhere/.test(css),'long organisation names can wrap');assert(/\.lot-partner \[hidden\]\s*\{\s*display:\s*none\s*!important/.test(css),'fallback/logo visibility survives the theme');
console.log('PASS: organisation-only branding, optional safe HTTPS logos, neutral demo fallback, escaping, fixed logo dimensions, failed-image recovery and bounded editor field.');
