const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert/strict');
const {setup}=require('./helpers/quickbar-dom.cjs');
const html=fs.readFileSync('dist/index.html','utf8'),start=html.indexOf('<footer id="footer"'),end=html.indexOf('</footer>',start)+9;
assert(start>=0&&end>start);const markup=html.slice(start,end),css=fs.readFileSync('dist/footer.css','utf8'),source=fs.readFileSync('dist/footer-navigation.js','utf8');
function boot(home){
 const h=setup({mobile:true}),footer=h.add('footer','footer');footer.innerHTML=markup.replace(/^<footer[^>]*>|<\/footer>$/g,'');
 let calls=0;h.context.FasHomeNavigation=home===null?null:{goHome(){calls++;return home!==false}};vm.runInContext(source,h.context);
 const click=(target,extra={})=>{const event={type:'click',target,defaultPrevented:false,preventDefault(){this.defaultPrevented=true},...extra};footer.dispatchEvent(event);return event};
 return {...h,footer,click,homeCalls:()=>calls};
}
{
 const h=boot(),links=h.footer.querySelectorAll('a'),nav=h.footer.querySelector('.footer-menu');assert(nav);assert.equal(nav.querySelectorAll('a,button').length,5);
 for(const attribute of ['data-seller-open','data-seller-new','data-open-support','data-install-app'])assert(nav.querySelector('['+attribute+']'),'real existing action '+attribute);
 for(const link of links){const href=link.getAttribute('href');assert(href);assert(!href.startsWith('javascript:'));if(!href.startsWith('#')&&!href.startsWith('tel:')&&!href.startsWith('https:')){const url=new URL(href,'https://footer.fixture/'),file=path.join('dist',decodeURIComponent(url.pathname.slice(1)));assert(fs.existsSync(file),href+' exists');if(url.hash)assert(fs.readFileSync(file,'utf8').includes('id="'+decodeURIComponent(url.hash.slice(1))+'"'),href+' has a real document anchor')}if(link.getAttribute('target')==='_blank')assert(link.getAttribute('rel').includes('noopener'))}
 assert(markup.includes('href="https://vehiclesdb.com"'));assert(markup.includes('Vehicle data by VehiclesDB'));assert(markup.includes('href="tel:+78000000001"'));assert(markup.includes('privacy.html'));assert(!/cookie|href=["'](?:agreement(?:\.html)?|terms)["']/i.test(markup),'no invented cookie or placeholder legal destination');
 const agreement=h.footer.querySelector('a[href="terms.html"]');assert(agreement,'the published agreement has a real footer destination');assert.match(agreement.textContent,/Пользовательское соглашение/);assert(agreement.closest('.footer-identity'),'agreement is beside the footer phone contacts');assert.equal(h.footer.querySelectorAll('a[href="terms.html"]').length,1,'one clear contact-area agreement link');
 const terms=fs.readFileSync('dist/terms.html','utf8');assert(terms.includes('<h1>Пользовательское соглашение ФАС торги</h1>'));assert(terms.includes('name="fas-agreement-version"'),'the legal destination identifies its accepted edition');
 for(const id of ['site-user-count','site-users-online','site-user-count-status'])assert.equal(h.footer.querySelectorAll('#'+id).length,1,'existing analytics ID remains unique: '+id);
 const home=nav.querySelector('[data-footer-home]');assert.equal(h.click(home).defaultPrevented,true);assert.equal(h.homeCalls(),1);
 for(const button of nav.querySelectorAll('button'))h.click(button);assert.equal(h.homeCalls(),1,'footer navigation never duplicates seller/help/install handlers');
 h.click(home,{ctrlKey:true});h.click(home,{defaultPrevented:true});h.click(home,{button:1});assert.equal(h.homeCalls(),1,'native modifiers and prior gesture guards are retained');
}
{
 const h=boot(false),link=h.footer.querySelector('.footer-menu [data-footer-home]')||h.footer.querySelector('[data-footer-home]');
 assert.equal(h.click(link).defaultPrevented,true);assert.equal(h.homeCalls(),1,'a blocked seller save cannot fall through to the anchor default');
 const fallback=boot(null),home=fallback.footer.querySelector('[data-footer-home]');assert.equal(home.getAttribute('href'),'#home');assert.equal(fallback.click(home).defaultPrevented,false,'plain home anchor remains functional if the enhancement is unavailable');
}
const clean=css.replace(/\/\*[\s\S]*?\*\//g,'');
for(const [,selector]of clean.matchAll(/([^{}]+)\{/g))if(!selector.trim().startsWith('@'))for(const part of selector.split(','))assert(part.includes('#footer'),'footer styles must remain scoped: '+part.trim());
assert(/body\.reels #footer\.site-footer[^}]*display:none!important/.test(css),'footer stays hidden behind the full-screen feed');
assert(css.includes('#footer [data-install-app][hidden]')&&css.includes('.app-installed #footer [data-install-app]'),'installed/native state cannot be overridden by footer menu display');
assert(/\.footer-logo-link>\.brand-logo\{[^}]*width:100%[^}]*object-fit:contain/.test(css),'the approved blue transparent logo is shown whole inside the real link');
assert(!/\.footer-logo-link::(?:before|after)/.test(css),'no obsolete cropped overlay can cover the logo link');
assert(/\.footer-menu>a,[^}]*min-height:44px/s.test(css));assert(/\.footer-legal>a[^}]*min-height:44px/s.test(css));assert(/\.footer-statistics[^}]*min-height:44px/s.test(css));
assert(css.includes('grid-template-columns:minmax(0,1fr)'),'narrow footer collapses to one column');assert(css.includes('overflow-wrap:anywhere'),'long labels can grow instead of overflowing');
assert(!/font-size:(?:9|10)px/.test(css),'legal and supporting text remains readable without tiny font sizes');
const dock=fs.readFileSync('dist/quickbar.css','utf8');assert(/body\.has-quick-access:not\(\.reels\)\s*\{[^}]*padding-bottom:calc\(var\(--quick-access-height\)[^}]*safe-area-inset-bottom/s.test(dock),'shared body offset still reserves fixed navigation and safe area');
assert(!/body[^{}]*\{[^}]*padding-bottom\s*:0/.test(clean),'footer does not erase the global dock reservation');
assert(html.indexOf('href="footer.css')<html.indexOf('href="layout-safety.css'),'footer loads before the final shared layout protections');
console.log('PASS: real footer routes/legal files, visible required attribution, guarded Home action, untouched seller/help/install controls, retained counters and scoped dark/mobile/dock CSS constraints. Browser geometry is not simulated.');
