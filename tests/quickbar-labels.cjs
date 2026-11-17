/* Route/name regressions plus a font-advance budget, not a browser geometry test. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const crypto=require('node:crypto');
const {setup}=require('./helpers/quickbar-dom.cjs');
const source=fs.readFileSync('dist/quickbar.js','utf8');
const css=fs.readFileSync('dist/quickbar.css','utf8');
function boot(){const h=setup({mobile:true});h.context.FasAuctionNotifications={bidSummary:()=>({total:0,outbidCount:0,rows:[]}),openMyBids(){h.calls.push(['bids']);h.modal.open=true}};vm.runInContext(source,h.context);h.flush();h.dock=h.document.querySelector('#quick-access');return h}
const expected=[['catalog','Каталог','grid'],['search','Поиск','search'],['sell','Продать','listing'],['favorites','Избранное','heart'],['bids','Мои ставки','gavel'],['account','Кабинет','user']];
const h=boot(),buttons=h.dock.querySelectorAll('[data-quick]');
assert.equal(buttons.length,expected.length);
expected.forEach(([key,label,icon],index)=>{
 const button=buttons[index];
 assert.equal(button.dataset.quick,key);
 assert.equal(button.querySelector('.quick-access-label').textContent,label);
 assert(button.getAttribute('aria-label').toLocaleLowerCase('ru').includes(label.toLocaleLowerCase('ru')),'accessible name retains the visible action: '+label);
 assert(button.getAttribute('title').toLocaleLowerCase('ru').includes(label.toLocaleLowerCase('ru')),'tooltip agrees with the caption: '+label);
 assert.equal(button.querySelector('.quick-access-icon').getAttribute('aria-hidden'),'true');
 assert.equal(button.querySelector('svg').dataset.icon,icon);
});
assert.equal(buttons[2].getAttribute('aria-label'),'Продать — разместить лот');
for(const [key,call] of [['sell','sell'],['bids','bids'],['search','search'],['account','account']]){
 const route=boot();route.click(route.dock.querySelector('[data-quick="'+key+'"]'));assert(route.calls.some(([kind])=>kind===call),key+' still opens its actual destination');
}
h.context.saved=Array.from({length:1234},(_,index)=>index+1);h.notify();
assert.equal(h.document.querySelector('#quick-favorite-count').textContent,'99+','large badges stay bounded');
assert(buttons[3].getAttribute('aria-label').includes('1234'),'assistive technology receives the uncapped saved count');
h.click(buttons[3]);assert.equal(h.context.tab,'fav');h.click(buttons[0]);assert.equal(h.context.tab,'all');

/* Advance widths measured with FreeType/Pillow at 1000px and wght=700.
   Binding the font hash makes a font change require a fresh measurement. */
const advanceEm={'Каталог':4.021,'Поиск':3.063,'Продать':4.267,'Избранное':5.494,'Мои ставки':5.653,'Мои':2.081,'ставки':3.372,'Кабинет':4.168828125};
assert.equal(crypto.createHash('sha256').update(fs.readFileSync('dist/assets/fonts/manrope-cyrillic.woff2')).digest('hex'),'447c49583b1b735cc6f566151db1d24354cec41076c55dd98455cfbde9e806c1');
const mobile=css.split('@media(max-width:700px)')[1].split('@media(max-width:360px)')[0];
const navRule=mobile.match(/\.quick-access,\.reels \.quick-access\{([^}]+)\}/)[1];
const buttonRule=mobile.match(/\.quick-access-button\{([^}]+)\}/)[1];
const [,minimum,viewportPercent,maximum]=buttonRule.match(/font-size:clamp\((\d+)px,([\d.]+)vw,(\d+)px\)/).map(Number);
const inset=Number(navRule.match(/calc\(100% - (\d+)px\)/)[1]);
const padding=Number(navRule.match(/padding:\d+px (\d+)px/)[1]);
const gap=Number(navRule.match(/gap:(\d+)/)[1]);
const border=Number(css.match(/\.quick-access\{[^}]*border:(\d+)px/)[1]);
const buttonPadding=Number(buttonRule.match(/padding-inline:(\d+)/)[1]);
assert(minimum>=9&&maximum<=10,'mobile captions remain within the reviewed readable range');
for(const viewport of [320,360,390]){
 const fontSize=Math.min(maximum,Math.max(minimum,viewport*viewportPercent/100));
 const track=(viewport-inset-2*padding-2*border-gap*(expected.length-1))/expected.length;
 const budget=track-2*buttonPadding;
 assert(track>=44,'each mobile target retains 44px width at '+viewport);
 for(const [,label] of expected){const advance=label==='Мои ставки'&&advanceEm[label]*fontSize>budget?Math.max(...label.split(' ').map(word=>advanceEm[word])):advanceEm[label];assert(advance*fontSize<=budget,label+' exceeds its measured wrapping budget at '+viewport)}
 // The bounded badge ends 8px beyond a centered 28px icon: 22px from the center.
 assert(28/2+8<=track/2,'a 99+ favorite badge cannot enter the next target at '+viewport);
}
assert(/\.quick-access-button\{[^}]*overflow-wrap:anywhere/.test(css),'text zoom retains a wrapping fallback');
const lot=boot();lot.modal.classList.add('lot-dialog');lot.modal.open=true;lot.document.querySelector('#bid-form').dataset.lotId='42';lot.notify();
const jump=lot.content.querySelector('[data-quick="bid"]');assert.equal(jump.dataset.label,'К ставке');lot.click(jump);assert.equal(lot.document.activeElement.id,'bid','short jump caption still focuses the bid form');
console.log('PASS: six accurate captions/icons/routes, matching accessible names, bounded 99+ badge with full spoken count, bid-form jump, and actual-font advance budgets at 320/360/390px. Browser geometry is not simulated.');
