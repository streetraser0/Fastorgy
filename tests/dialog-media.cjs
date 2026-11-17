const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const html=fs.readFileSync(path.join(__dirname,'../dist/index.html'),'utf8');
const main=html.match(/<script>([\s\S]*?)<\/script>/)[1];
const geoCode=main.slice(main.indexOf('function cancelUserLocationRequest()'),main.indexOf("$('#modal').addEventListener('close',cancelUserLocationRequest)"));
function locationHarness(){
 const requests=[],nodes={'#geo-status':{},'#detect-location':{},'#modal':{open:true,closed:0,close(){this.open=false;this.closed++}},'#sort':{},'#region-filter':{},'#city':{}};
 const state={$:id=>nodes[id]||null,geoBusy:false,geoRequestId:0,geoStatusNode:null,userGeo:null,renders:0,toasts:[],navigator:{geolocation:{getCurrentPosition(success,failure){requests.push({success,failure})}}},coordinates(lat,lon){return Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180?[lat,lon]:null},updateRegionLabels(){},syncSearchFields(){},render(){state.renders++},toast(message){state.toasts.push(message)}};
 vm.createContext(state);vm.runInContext(geoCode,state);return {state,nodes,requests};
}
const position={coords:{latitude:55.75,longitude:37.62}};
for(const outcome of ['success','failure']){
 const h=locationHarness();h.state.requestUserLocation();h.nodes['#modal'].open=false;delete h.nodes['#geo-status'];delete h.nodes['#detect-location'];
 assert.doesNotThrow(()=>h.requests[0][outcome](outcome==='success'?position:{code:1}));assert.equal(h.state.renders,0);assert.equal(h.nodes['#modal'].closed,0);assert.equal(h.state.userGeo,null);
}
{
 const h=locationHarness();h.state.requestUserLocation();h.nodes['#geo-status']={};h.nodes['#detect-location']={};
 h.state.requestUserLocation();assert.equal(h.requests.length,2);h.requests[0].success(position);assert.equal(h.state.geoBusy,true);assert.equal(h.state.renders,0);assert.equal(h.nodes['#modal'].closed,0);
 h.requests[1].failure({code:1});assert.equal(h.state.geoBusy,false);assert.equal(h.nodes['#detect-location'].disabled,false);assert.match(h.nodes['#geo-status'].textContent,/не разрешён/);
}
{
 const h=locationHarness();h.state.requestUserLocation();h.state.cancelUserLocationRequest();h.requests[0].success(position);assert.equal(h.state.userGeo,null);assert.equal(h.state.renders,0);
 h.state.requestUserLocation();h.requests[1].success(position);assert.equal(h.state.renders,1);assert.equal(h.nodes['#modal'].closed,1);assert.equal(h.nodes['#sort'].value,'nearest');assert.equal(h.state.userGeo.point[0],55.75);
}
{
 const h=locationHarness();h.state.requestUserLocation();h.requests[0].success({coords:{latitude:99,longitude:0}});assert.equal(h.state.renders,0);assert.equal(h.nodes['#detect-location'].disabled,false);
}
const categoryLabelCode=main.slice(main.indexOf('function lotCategoryLabel('),main.indexOf('\n',main.indexOf('function lotCategoryLabel(')));
const mediaCode=categoryLabelCode+'\n'+main.slice(main.indexOf('function syncReels('),main.indexOf('function setReels('));
for(const [hidden,modal,reduced,expected,nested=false] of [[false,false,false,1],[true,false,false,0],[false,true,false,0],[false,false,true,0],[false,false,false,0,true]]){
 let play=0,pause=0;const slide={},track={children:[slide],scrollLeft:0,clientWidth:300};slide.parentElement=track;
 const video={dataset:{},parentElement:slide,paused:true,play(){play++;this.paused=false;return Promise.resolve()},pause(){pause++;this.paused=true}},card={querySelectorAll:()=>[video]};
 const nodes={'#modal':{open:modal},'#reels-category-label':{},'#reels-position':{},'#grid':{querySelectorAll:()=>[card]}};
 const state={$:id=>nodes[id],visibleLots:[{category:'cars'}],categoryNames:{cars:'Cars'},recommendationSession:null,reelsMode:true,activeFeedIndex:()=>0,document:{hidden,querySelectorAll:()=>nested?[{}]:[]},window:{matchMedia:()=>({matches:reduced})}};
 vm.runInNewContext(mediaCode,state);state.syncReels(0);assert.equal(play,expected);assert.equal(video.paused,!expected);assert.equal(pause,0,'already-paused videos need no repeated pause call');
}
console.log('PASS: stale/closed/replaced/cancelled location callbacks, overlapping GPS requests, valid/invalid positions, modal/background/reduced-motion video playback.');
