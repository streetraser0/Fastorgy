const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {setup}=require('./helpers/quickbar-dom.cjs');
const source=fs.readFileSync(path.join(__dirname,'../dist/cabinet-layout.js'),'utf8');
function boot({desktop=false,ua='',platform='',touches=0,native=false,view='all'}={}){
 const h=setup();let enabled=desktop;
 // Complete the small fixture's DOM movement and descendant-selector support.
 const proto=h.Element.prototype;
 proto.insertBefore=function(node,before){if(node.parentElement)node.parentElement.children=node.parentElement.children.filter(n=>n!==node);const at=this.children.indexOf(before);node.parentElement=this;if(at<0)this.children.push(node);else this.children.splice(at,0,node);return node};
 Object.defineProperty(proto,'nextElementSibling',{get(){const items=this.parentElement?.children||[];return items[items.indexOf(this)+1]||null},configurable:true});
 proto.querySelectorAll=function(selector){
  const parts=selector.trim().split(/\s+/),found=[];
  const accepts=node=>{let current=node;if(!current.matches(parts.at(-1)))return false;for(let i=parts.length-2;i>=0;i--){if(parts[i]==='>'){i--;current=current.parentElement;if(!current?.matches(parts[i]))return false}else{current=current.parentElement?.closest(parts[i]);if(!current)return false}}return true};
  function walk(node){for(const child of node.children){if(accepts(child))found.push(child);walk(child)}}walk(this);return found;
 };
 h.context.navigator={userAgent:ua,platform,maxTouchPoints:touches};h.context.FasDesktopWeb={active:()=>enabled};h.context.Capacitor={isNativePlatform:()=>native};
 h.content.innerHTML=`<div class="seller-shell"><div class="seller-desktop-toolbar"><div class="seller-dashboard-heading"><h2>Личный кабинет</h2></div><button class="seller-create-button"><span>Разместить объявление</span></button></div><div class="seller-desktop-layout"><div class="seller-desktop-sidebar"><nav class="seller-account-tabs"><button data-seller-tab="all" aria-pressed="${view!=='profile'}"><span>Мои лоты</span></button><button data-seller-tab="profile" aria-pressed="${view==='profile'}"><span>Профиль</span></button></nav></div><div class="seller-desktop-main"><nav class="seller-tabs"><button data-seller-tab="all" aria-pressed="${view==='all'}"><span>Все объявления</span></button><button data-seller-tab="draft" aria-pressed="${view==='draft'}"><span>Черновики</span><b>2</b></button><button data-seller-tab="live"><span>На торгах</span></button></nav>${view==='profile'?'<form id="seller-profile-form"><input id="profile-value"></form>':'<div class="seller-list"><article class="seller-row" id="draft-row-1"><span class="seller-status" data-status="draft">Черновик</span><button data-seller-edit="draft-1">Продолжить</button></article><article class="seller-row" id="live-row"><span class="seller-status" data-status="live">Идут торги</span></article><article class="seller-row" id="draft-row-2"><span class="seller-status" data-status="draft">Черновик</span><button data-seller-edit="draft-2">Продолжить</button></article></div>'}</div></div></div>`;
 const shell=h.document.querySelector('.seller-shell'),draftButton=shell.querySelector('.seller-tabs [data-seller-tab="draft"]'),originalParent=draftButton.parentElement,originalOrder=shell.querySelector('.seller-list')?.children.slice()||[];
 vm.runInContext(source,h.context);
 return {...h,shell,draftButton,originalParent,originalOrder,api:h.context.FasCabinetLayout,desktop(on){enabled=on;h.context.FasCabinetLayout.refresh()}};
}
let count=0;function test(name,fn){fn();count++;}
const mobileVariants=[{ua:'Mozilla iPhone Safari'},{ua:'Mozilla iPad Safari'},{ua:'Mozilla Macintosh Safari',platform:'MacIntel',touches:5},{ua:'Mozilla Android Mobile Chrome'},{ua:'Mozilla Android Tablet Chrome'},{ua:'Mozilla Android Mobile wv',native:true},{ua:'Mozilla iPhone Mobile',native:true},{native:true}];
for(const variant of [{desktop:true},...mobileVariants])test('supported '+JSON.stringify(variant),()=>{
 const h=boot(variant);assert(h.api.active());assert.equal(h.draftButton.parentElement.className,'seller-account-tabs');assert.equal(h.draftButton.querySelector('span').textContent,'Мои черновики');const details=h.shell.querySelector('.cabinet-drafts');assert(details);assert(!details.open);assert.equal(details.querySelectorAll('.seller-row').length,2);assert.equal(h.shell.querySelectorAll('[data-seller-edit="draft-1"]').length,1);assert.equal(h.shell.querySelector('.cabinet-draft-count').textContent,'2');h.api.refresh();assert.equal(h.shell.querySelectorAll('.cabinet-drafts').length,1);
});
for(const variant of [{ua:'Mozilla Windows Chrome'},{}])test('excluded '+JSON.stringify(variant),()=>{
 const h=boot(variant);assert(!h.api.active());assert.equal(h.draftButton.parentElement,h.originalParent);assert.equal(h.draftButton.querySelector('span').textContent,'Черновики');assert.equal(h.shell.querySelector('.cabinet-drafts'),null);assert.deepEqual(h.shell.querySelector('.seller-list').children,h.originalOrder);
});
test('resize restores node identity, row order and label without data writes',()=>{
 const h=boot({desktop:true}),row=h.originalOrder[0],button=row.querySelector('button');let edits=0;button.onclick=()=>edits++;h.desktop(false);assert.equal(h.draftButton.parentElement,h.originalParent);assert.deepEqual(h.shell.querySelector('.seller-list').children,h.originalOrder);assert.equal(h.draftButton.querySelector('span').textContent,'Черновики');assert.equal(h.shell.querySelector('.cabinet-drafts'),null);button.onclick();assert.equal(edits,1);h.desktop(true);assert.equal(h.shell.querySelectorAll('[data-seller-edit="draft-1"]').length,1);assert.equal(h.shell.querySelector('#draft-row-1'),row);
});
test('profile input survives gate change and draft tab has no duplicate',()=>{
 const h=boot({desktop:true,view:'profile'}),input=h.shell.querySelector('#profile-value');input.value='Несохранённый профиль';h.desktop(false);assert.equal(h.shell.querySelector('#profile-value'),input);assert.equal(input.value,'Несохранённый профиль');h.desktop(true);assert.equal(h.shell.querySelectorAll('[data-seller-tab="draft"]').length,1);assert.equal(h.shell.querySelector('.cabinet-drafts'),null);
});
test('draft tab active state is distinct from All and no bottom duplication',()=>{
 const h=boot({desktop:true,view:'draft'});assert.equal(h.draftButton.getAttribute('aria-pressed'),'true');assert.equal(h.shell.querySelector('.seller-account-tabs [data-seller-tab="all"]').getAttribute('aria-pressed'),'false');assert.equal(h.shell.querySelector('.cabinet-drafts'),null);h.desktop(false);assert.equal(h.shell.querySelector('.seller-account-tabs [data-seller-tab="all"]').getAttribute('aria-pressed'),'true');
});
test('deleted draft is not resurrected when layout is restored',()=>{
 const h=boot({desktop:true}),row=h.shell.querySelector('#draft-row-1');row.remove();h.api.refresh();assert.equal(h.shell.querySelector('.cabinet-draft-count').textContent,'1');h.desktop(false);assert.equal(h.shell.querySelector('#draft-row-1'),null);assert.equal(h.shell.querySelectorAll('.seller-row').length,2);
});
test('late native-app detection opts into the shared cabinet without desktop features',()=>{
 const h=boot();assert(!h.api.active());h.document.documentElement.classList.add('native-app');h.api.refresh();assert(h.api.active());assert.equal(h.draftButton.parentElement.className,'seller-account-tabs');assert(h.shell.querySelector('.cabinet-drafts'));assert(h.document.documentElement.classList.contains('mobile-cabinet'));assert(!h.document.documentElement.classList.contains('desktop-web'));
});
for(const variant of mobileVariants)test('mobile form and draft identity survives refresh '+JSON.stringify(variant),()=>{
 const h=boot({...variant,view:'profile'}),input=h.shell.querySelector('#profile-value');input.value='Не терять изменения';const button=h.draftButton;h.api.refresh();h.desktop(false);assert.equal(h.shell.querySelector('#profile-value'),input);assert.equal(input.value,'Не терять изменения');assert.equal(h.shell.querySelector('[data-seller-tab="draft"]'),button);assert.equal(h.shell.querySelectorAll('[data-seller-tab="draft"]').length,1);assert(h.document.documentElement.classList.contains('mobile-cabinet'));assert(!h.document.documentElement.classList.contains('desktop-web'));
});
test('native bridge arriving after iOS UI keeps expanded draft disclosure and controls',()=>{
 const h=boot({ua:'Mozilla iPhone Safari'}),details=h.shell.querySelector('.cabinet-drafts'),row=h.shell.querySelector('#draft-row-1');details.open=true;h.document.documentElement.classList.add('native-app');h.api.refresh();assert.equal(h.shell.querySelector('.cabinet-drafts'),details);assert.equal(h.shell.querySelector('#draft-row-1'),row);assert(details.open);assert(h.api.active());
});
const css=fs.readFileSync(path.join(__dirname,'../dist/cabinet-layout.css'),'utf8');assert(css.includes('grid-template-columns:90px minmax(0,1fr)'));assert(css.includes('font-size:16px'));assert(css.includes('env(safe-area-inset-bottom,0px)'));assert(css.includes('env(safe-area-inset-left,0px)'));assert(css.includes('flex-wrap:nowrap'));assert(!css.includes('html.ios-cabinet'));assert(!/history\.|localStorage|sessionStorage|innerHTML\s*=/.test(source));
console.log('PASS: '+count+' cabinet layout checks: desktop, iOS/Android web and native parity, existing draft controls/rows, distinct active tab, collapsible list, safe resize and retained unsaved inputs.');
