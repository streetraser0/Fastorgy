const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const {setup}=require('./helpers/quickbar-dom.cjs');
const h=setup();h.context.Date=Date;
Object.defineProperty(h.Element.prototype,'parentNode',{get(){return this.parentElement}});
vm.runInContext(fs.readFileSync('dist/countdown.js','utf8'),h.context);
const api=h.context.FasCountdown,values=(end,now)=>{const p=api.parts(end,now);return ['months','days','hours','minutes','seconds'].map(key=>p[key])};
const from='2023-01-31T12:00:00.000Z';
assert.deepEqual(values('2023-02-28T12:00:00.000Z',from),[1,0,0,0,0]);
assert.deepEqual(values('2023-02-28T11:59:59.000Z',from),[0,27,23,59,59]);
assert.deepEqual(values('2024-02-29T12:00:00Z','2024-01-31T12:00:00Z'),[1,0,0,0,0]);
assert.deepEqual(values('2024-02-28T12:00:00Z','2024-01-31T12:00:00Z'),[0,28,0,0,0]);
assert.deepEqual(values('2024-03-30T12:00:00Z','2024-01-31T12:00:00Z'),[1,30,0,0,0],'month arithmetic stays anchored to Jan31 rather than drifting after February');
assert.deepEqual(values('2025-02-28T12:00:00Z','2024-02-29T12:00:00Z'),[12,0,0,0,0]);
assert.deepEqual(values('2027-01-03T04:05:06Z','2026-11-01T00:00:00Z'),[2,2,4,5,6]);
assert.deepEqual(values('2027-01-01T01:00:00+03:00','2026-12-31T23:30:00+03:00'),[0,0,1,30,0],'time offsets represent the same real duration');
assert.deepEqual(values('2024-02-29T12:00:00.499Z','2024-01-31T12:00:00.500Z'),[0,28,23,59,59],'milliseconds cannot prematurely count a complete month');
for(const invalid of [null,undefined,'invalid',NaN,Infinity,{},'<img src=x onerror=alert(1)>']){
 assert.deepEqual(values(invalid,from),[0,0,0,0,0]);assert.equal(api.parts(invalid,from).valid,false);
}
assert.equal(api.parts('2023-01-30T00:00:00Z',from).expired,true);
assert.deepEqual(values(from,from),[0,0,0,0,0]);
assert.equal(api.parts(Date.parse(from)+500,from).expired,false,'a sub-second remaining deadline has not yet expired');
assert(values(8640000000000000,'2023-01-31T12:00:00Z').every(Number.isFinite),'valid Date boundary cannot produce NaN units');
assert.equal(api.text('2023-02-06T13:02:03Z',from),'0 мес. 6 дн. 01 ч. 02 мин. 03 сек.');

const end='2023-02-06T13:02:03.000Z',now=Date.parse(from),node=h.add('test-countdown','span');
node.innerHTML=api.html(end,now);const wrapper=node.querySelector('.countdown-units');
assert.equal(wrapper.getAttribute('role'),'timer');assert.equal(wrapper.getAttribute('aria-live'),'off');
assert.equal(node.querySelectorAll('.countdown-number').length,5);
assert.match(wrapper.getAttribute('aria-label'),/0 месяцев, 6 дней, 1 час, 2 минуты, 3 секунды/);
let writes=0;
for(const number of node.querySelectorAll('.countdown-number')){
 let current=number.textContent;
 Object.defineProperty(number,'textContent',{get(){return current},set(value){writes++;current=value},configurable:true});
}
assert.equal(api.update(node,end,now),false);assert.equal(writes,0,'unchanged tick performs no text writes');
assert.equal(api.update(node,end,now+1000),true);assert.equal(writes,1,'only the changing second updates');
assert.strictEqual(node.querySelector('.countdown-units'),wrapper,'tick preserves the countdown DOM and unit labels');
assert.equal(node.querySelector('[data-countdown-part="seconds"]').textContent,'02');
api.update(node,'2023-02-06T13:12:02.000Z',now+1000);
assert.equal(node.querySelector('[data-countdown-part="minutes"]').textContent,'12','authoritative changed deadline is used');
api.update(node,'2023-01-01T00:00:00Z',now);
assert.equal(node.querySelector('[data-countdown-part="days"]').textContent,'0');assert.equal(wrapper.getAttribute('aria-label'),'Торги завершены');
api.update(node,'invalid',now);assert.equal(wrapper.getAttribute('aria-label'),'Срок окончания не указан');
const empty=h.add('empty-countdown');assert.equal(api.update(empty,end,now),false,'initial markup already contains current values');
assert.equal(empty.querySelectorAll('.countdown-number').length,5);
const old=empty.querySelector('.countdown-units');empty.innerHTML='';api.update(empty,end,now);assert.notStrictEqual(empty.querySelector('.countdown-units'),old,'replaced host content is safely initialized again');
assert(!api.html('<img src=x onerror=alert(1)>',now).includes('<img'),'input dates never become HTML');
console.log('PASS: five labeled countdown units, anchored UTC calendar months/leap boundaries, exact remaining time, safe invalid/expired states and changed-digit-only DOM updates.');
