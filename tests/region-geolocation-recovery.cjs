const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const main=fs.readFileSync('dist/index.html','utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
const code=main.slice(main.indexOf('function cancelUserLocationRequest()'),main.indexOf("$('#modal').addEventListener('close',cancelUserLocationRequest)"));
function boot(){
 const requests=[],nodes={'#geo-status':{textContent:''},'#detect-location':{disabled:false},'#modal':{open:true,closed:0,close(){this.open=false;this.closed++}},'#sort':{},'#region-filter':{},'#city':{}};
 const state={$:id=>nodes[id]||null,geoBusy:false,geoRequestId:0,geoStatusNode:null,userGeo:null,renders:0,toasts:[],navigator:{geolocation:{getCurrentPosition(success,failure){requests.push({success,failure})}}},coordinates(lat,lon){return Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180?[lat,lon]:null},updateRegionLabels(){},syncSearchFields(){},render(){state.renders++},toast(message){state.toasts.push(message)}};
 vm.createContext(state);vm.runInContext(code,state);return {state,nodes,requests};
}
const h=boot(),s=h.state;
s.navigator.geolocation.getCurrentPosition=()=>{throw Object.assign(new Error('Permissions Policy blocked'),{name:'SecurityError'})};
assert.doesNotThrow(()=>s.requestUserLocation(),'a synchronous browser failure must remain inside the action');
assert.equal(s.geoBusy,false);assert.equal(h.nodes['#detect-location'].disabled,false);assert.match(h.nodes['#geo-status'].textContent,/Не удалось определить/);assert.equal(s.renders,0);assert.equal(s.userGeo,null);assert.equal(h.nodes['#modal'].open,true,'manual region selection remains accessible after failure');
s.navigator.geolocation.getCurrentPosition=(success,failure)=>h.requests.push({success,failure});
s.requestUserLocation();assert.equal(h.requests.length,1,'retry is not swallowed by an old busy flag');assert.equal(s.geoBusy,true);assert.equal(h.nodes['#detect-location'].disabled,true);
h.requests[0].success({coords:{latitude:51.66,longitude:39.2}});assert.equal(s.geoBusy,false);assert.equal(h.nodes['#detect-location'].disabled,false);assert.deepEqual(Array.from(s.userGeo.point),[51.66,39.2]);assert.equal(s.renders,1);assert.equal(h.nodes['#modal'].closed,1);
const late=boot(),oldStatus=late.nodes['#geo-status'],oldButton=late.nodes['#detect-location'];let calls=0;
late.state.navigator.geolocation.getCurrentPosition=(success,failure)=>{
 if(++calls===1){
  // Replacing the dialog can start a newer request before an older API call throws.
  late.state.cancelUserLocationRequest();late.nodes['#geo-status']={textContent:'New dialog'};late.nodes['#detect-location']={disabled:false};late.state.requestUserLocation();throw Error('Old action failed');
 }
 late.requests.push({success,failure});
};
assert.doesNotThrow(()=>late.state.requestUserLocation());assert.equal(calls,2);assert.equal(late.state.geoBusy,true,'a superseded synchronous failure cannot clear the new request');assert.equal(late.nodes['#detect-location'].disabled,true);assert.match(late.nodes['#geo-status'].textContent,/Ожидаем/);assert.match(oldStatus.textContent,/Ожидаем/);assert.equal(oldButton.disabled,true);
late.requests[0].failure({code:1});assert.equal(late.state.geoBusy,false);assert.equal(late.nodes['#detect-location'].disabled,false);assert.match(late.nodes['#geo-status'].textContent,/не разрешён/);
console.log('PASS: synchronous region-geolocation failure is recoverable, preserves manual selection, accepts a valid retry and cannot disturb a newer dialog request.');
