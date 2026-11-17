const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
function boot(windows=[]){
 const listeners={},opened=[],navigated=[];let closed=0,focused=0;
 const self={location:{origin:'https://auction.example'},registration:{scope:'https://auction.example/'},addEventListener(type,handler){listeners[type]=handler},clients:{async matchAll(){return windows.map(url=>({url,async navigate(target){navigated.push(target);return{async focus(){focused++}}}}))},async openWindow(url){opened.push(url)}}};
 vm.runInNewContext(fs.readFileSync('dist/sw.js','utf8'),{self,URL,Request,Response,Map,Set,Number,Promise});
 return{opened,navigated,focused:()=>focused,closed:()=>closed,async click(lotId,extra={}){let pending;listeners.notificationclick({notification:{data:{lotId,...extra},close(){closed++}},waitUntil(value){pending=value}});await pending}};
}
(async()=>{
 let h=boot(['https://external.example/','https://auction.example/?view=favorites']);await h.click(1042,{url:'https://external.example/steal'});
 assert.deepEqual(h.navigated,['https://auction.example/?lot=1042']);assert.equal(h.focused(),1);assert.equal(h.opened.length,0);assert.equal(h.closed(),1);
 h=boot(['https://auction.example/signin-with-chatgpt','https://auction.example/api/analytics/sales']);await h.click(1043);
 assert.equal(h.navigated.length,0,'notification cannot replace an authentication or API window');assert.deepEqual(h.opened,['https://auction.example/?lot=1043']);
 for(const value of [null,undefined,'javascript:alert(1)',0,-1,1.5,Infinity,Number.MAX_SAFE_INTEGER+1]){h=boot();await h.click(value);assert.equal(h.opened.length,0);assert.equal(h.navigated.length,0)}
 console.log('PASS: notification clicks only open validated lot links on this Site, preserve auth routes and reject foreign URLs/invalid identifiers.');
})().catch(error=>{console.error(error);process.exitCode=1});
