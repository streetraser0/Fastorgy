/* Arrival effects decorate inner content; native scrolling owns every page position. */
(()=>{
 'use strict';
 if(window.FasFeedMotion)return;
 const preference=window.matchMedia?.('(prefers-reduced-motion: reduce)')||{matches:false};
 const grid=document.querySelector('#grid'),featured=document.querySelector('#featured-track');
 const idle=120,duration=180,states=[];
 const create=(host,type)=>host?{host,type,timer:null,epoch:0,running:[],request:null,lastId:null,lastIndex:null,touch:false,pointer:false,position:0}:null;
 const reels=create(grid,'reels'),rail=create(featured,'featured');
 if(reels)states.push(reels);if(rail)states.push(rail);
 const inReels=()=>document.body.classList.contains('reels');
 const position=state=>Number(state.type==='reels'?state.host.scrollTop:state.host.scrollLeft)||0;
 function eligible(state){return !preference.matches&&!document.hidden&&state.host.isConnected!==false&&!document.querySelector('dialog[open]')&&(state.type==='reels'?inReels():!inReels()&&!state.host.hidden&&!state.host.closest?.('[hidden]'))}
 function cancelAnimations(state){const animations=state.running;state.running=[];for(const animation of animations){try{animation.cancel()}catch{}}}
 function cancelTimer(state){state.epoch++;if(state.timer!==null)window.clearTimeout(state.timer);state.timer=null}
 function cancel(state,reset=false){if(!state)return;cancelTimer(state);cancelAnimations(state);state.request=null;if(reset){state.lastId=null;state.lastIndex=null;state.touch=false;state.pointer=false}}
 function stop(options={}){cancel(reels,!!options.reset)}
 function activeCard(state){
  const cards=[...state.host.querySelectorAll(state.type==='reels'?'.card':'.featured-card')];
  if(!cards.length)return null;
  if(state.type==='reels'){
   const height=Number(state.host.clientHeight);if(!Number.isFinite(height)||height<=0)return null;
   const slot=Math.max(0,Math.min(cards.length-1,Math.round(state.host.scrollTop/height))),card=cards[slot];
   return Number(card?.dataset.lot)===state.request?.lotId?{card,index:state.request.index,id:state.request.lotId}:null;
  }
  const left=state.host.getBoundingClientRect?.().left;if(!Number.isFinite(left))return null;
  let chosen=null,distance=Infinity;
  cards.forEach((card,index)=>{const edge=card.getBoundingClientRect?.().left,delta=Math.abs(edge-left);if(Number.isFinite(delta)&&delta<distance){distance=delta;chosen={card,index,id:Number(card.dataset.featuredLot)}}});
  return chosen&&Number.isSafeInteger(chosen.id)&&chosen.id>0?chosen:null;
 }
 function photo(card,type){
  if(type==='featured')return card.querySelector('.featured-photo')?.querySelector('img');
  const media=card.querySelector('.gallery-track');if(!media)return null;
  const slot=Math.max(0,Math.min(media.children.length-1,Math.round((Number(media.scrollLeft)||0)/(media.clientWidth||1))));
  return media.children[slot]?.querySelector('img')||null;
 }
 function play(state,element,frames){
  if(!element||typeof element.animate!=='function')return;
  let animation;try{animation=element.animate(frames,{duration,easing:'cubic-bezier(.2,.75,.25,1)',fill:'none'})}catch{return}
  state.running.push(animation);const done=()=>{state.running=state.running.filter(item=>item!==animation)};
  if(animation.finished?.then)animation.finished.then(done,done);else{animation.onfinish=done;animation.oncancel=done}
 }
 function settle(state,epoch){
  if(epoch!==state.epoch)return;state.timer=null;
  if(!eligible(state)||state.touch||state.pointer)return;
  if(Math.abs(position(state)-state.position)>.5){schedule(state);return}
  const selected=activeCard(state);if(!selected||selected.card.isConnected===false||selected.id===state.lastId)return;
  const direction=state.lastIndex!==null&&selected.index<state.lastIndex?-1:1;
  state.lastId=selected.id;state.lastIndex=selected.index;cancelAnimations(state);
  play(state,photo(selected.card,state.type),[{opacity:.85,transform:'scale(.99)'},{opacity:1,transform:'scale(1)'}]);
  const text=selected.card.querySelector(state.type==='reels'?'.card-body':'.featured-name');
  play(state,text,[{opacity:.6,transform:state.type==='reels'?'translateY('+(direction*6)+'px)':'translateX('+(direction*6)+'px)'},{opacity:1,transform:'translate(0,0)'}]);
 }
 function schedule(state){
  cancelTimer(state);if(!eligible(state)||state.touch||state.pointer)return;
  const epoch=state.epoch;state.position=position(state);state.timer=window.setTimeout(()=>settle(state,epoch),idle);
 }
 function sync(value={}){
  if(!reels||value.grid!==reels.host)return;
  const lotId=Number(value.lotId),index=Number(value.index);
  if(!Number.isSafeInteger(lotId)||lotId<=0||!Number.isSafeInteger(index)||index<0||!eligible(reels)){cancel(reels);return}
  const unchanged=reels.request?.lotId===lotId&&reels.request?.index===index;
  reels.request={lotId,index};
  if(unchanged&&reels.timer!==null)return;
  if(lotId!==reels.lastId){cancelAnimations(reels);schedule(reels)}
 }
 function interrupted(state){cancelTimer(state);cancelAnimations(state)}
 for(const state of states){
  state.host.addEventListener('scroll',()=>{cancelAnimations(state);if(state.type==='featured'||state.request)schedule(state)},{passive:true});
  state.host.addEventListener('touchstart',event=>{state.touch=!!event.touches?.length;interrupted(state)},{passive:true});
  state.host.addEventListener('pointerdown',()=>{state.pointer=true;interrupted(state)},{passive:true});
 }
 function released(event){for(const state of states){const had=state.touch||state.pointer;if(event.type.startsWith('touch'))state.touch=!!event.touches?.length;else state.pointer=false;if(had&&!state.touch&&!state.pointer&&(state.type==='featured'||state.request))schedule(state)}}
 for(const type of ['touchend','touchcancel','pointerup','pointercancel'])document.addEventListener(type,released,{capture:true,passive:true});
 function cancelUnavailable(){for(const state of states)if(!eligible(state))cancel(state,true);else if(state.running.length&&state.running.some(animation=>animation.effect?.target?.isConnected===false))cancelAnimations(state)}
 document.addEventListener('visibilitychange',cancelUnavailable);
 preference.addEventListener?.('change',cancelUnavailable);
 const Observer=typeof MutationObserver==='function'?MutationObserver:null;
 if(Observer&&document.body)new Observer(cancelUnavailable).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class','open','hidden']});
 window.FasFeedMotion=Object.freeze({sync,stop});
 if(rail&&eligible(rail)){const first=activeCard(rail);if(first){rail.lastId=first.id;rail.lastIndex=first.index}}
 if(reels&&inReels()&&typeof visibleLots!=='undefined'&&typeof activeFeedIndex==='function'&&typeof swipeIndex==='function'){
  const index=activeFeedIndex();sync({grid,lotId:visibleLots[index]?.id,index,slot:swipeIndex()});
 }
})();
