'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../dist/index.html'),'utf8'),source=html.match(/<script data-featured-loading-init>([\s\S]*?)<\/script>/)?.[1];
assert(source,'loading reserve initializes before the main catalogue script');
for(const [raw,expected] of [[null,'default'],['[]','default'],['["nearby"]','default'],['["for-you","low"]','compact'],['["hot"]','compact'],['{"modes":["ending"]}','compact'],['broken JSON','default']]){
 const attrs=new Map(),timers=[],writes=[];
 const section={hidden:true,inert:false,setAttribute(k,v){attrs.set(k,v)},hasAttribute:k=>attrs.has(k),removeAttribute:k=>attrs.delete(k)};
 vm.runInNewContext(source,{document:{querySelector:()=>section},localStorage:{getItem:()=>raw,setItem:(...args)=>writes.push(args)},setTimeout:(fn,ms)=>timers.push({fn,ms})});
 assert.equal(attrs.get('data-featured-loading'),expected);assert.equal(attrs.get('aria-busy'),'true');assert.equal(section.inert,true);assert.deepEqual(writes,[],'loading must not alter preferences');
 assert.equal(timers[0].ms,15000);timers[0].fn();assert.equal(section.hidden,true,'failed initialization restores the original hidden section without covering the rest of the page');assert.equal(section.inert,false);assert.equal(attrs.size,0);
}
{
 const attrs=new Map(),section={setAttribute:(k,v)=>attrs.set(k,v),hasAttribute:k=>attrs.has(k),removeAttribute:k=>attrs.delete(k)};
 assert.doesNotThrow(()=>vm.runInNewContext(source,{document:{querySelector:()=>section},localStorage:{getItem(){throw Error('storage unavailable')}},setTimeout(){}}));assert.equal(attrs.get('data-featured-loading'),'default');
}
assert.match(html,/<noscript><p>Для просмотра подборки лотов включите JavaScript/);
console.log('PASS: early partial reserve, compact saved selections, unchanged preferences, unavailable storage and bounded failed-initialization fallback.');
