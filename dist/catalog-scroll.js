/* Mobile catalogue scrolls with the document. Reels retain their own virtual viewport. */
function createFasCatalogPageScroll(options) {
  'use strict';
  const view=options.window,doc=options.document,grid=options.grid;
  const requestFrame=options.requestAnimationFrame||view.requestAnimationFrame.bind(view);
  const cancelFrame=options.cancelAnimationFrame||view.cancelAnimationFrame.bind(view);
  const listeners=[],observers=[];
  let frame=null,destroyed=false,topInset=12,cachedCards=[],cachedFirst=null,cachedLength=-1,lastPosition=null,lastCount=-1;
  const pageMode=()=>!destroyed&&options.isPageMode();
  function cards(){
    const first=grid.firstElementChild,length=grid.children?.length;
    if(first!==cachedFirst||length!==cachedLength){
      cachedCards=Array.from(grid.querySelectorAll('.card[data-lot]'));
      cachedFirst=first;cachedLength=length;
    }
    return cachedCards;
  }
  function index(){
    if(!pageMode())return options.swipeIndex.apply(this,arguments);
    const list=cards();if(!list.length)return 0;
    // Card heights vary with their descriptions and controls. Use the first
    // card still visible below the safe top edge, never a fixed pixel step.
    let low=0,high=list.length;
    while(low<high){const middle=(low+high)>>1;if(list[middle].getBoundingClientRect().bottom<=topInset)low=middle+1;else high=middle}
    return Math.min(low,list.length-1);
  }
  function move(direction){
    if(!pageMode())return options.moveLot.apply(this,arguments);
    const list=cards(),delta=Number(direction);if(!list.length||!Number.isFinite(delta))return;
    const target=Math.max(0,Math.min(list.length-1,index()+Math.trunc(delta)));
    list[target].scrollIntoView({block:'start',inline:'nearest',behavior:options.reducedMotion()?'auto':'smooth'});
  }
  function cancel(){if(frame!==null)cancelFrame(frame);frame=null}
  function schedule(){
    if(!pageMode()||doc.hidden){cancel();return}
    if(frame!==null)return;
    frame=requestFrame(()=>{
      frame=null;if(!pageMode()||doc.hidden)return;
      const position=index(),count=cards().length;
      if(position===lastPosition&&count===lastCount)return;
      options.updatePosition();lastPosition=position;lastCount=count;
    });
  }
  function refresh(){
    cachedFirst=null;cachedLength=-1;lastPosition=null;lastCount=-1;
    if(!pageMode()||doc.hidden){cancel();return}
    const inset=Number(options.getTopInset?.());topInset=Number.isFinite(inset)?Math.max(0,inset):12;
    schedule();
  }
  function listen(target,name,handler){if(!target?.addEventListener)return;target.addEventListener(name,handler,{passive:true});listeners.push(()=>target.removeEventListener(name,handler))}
  listen(view,'scroll',schedule);listen(view,'resize',refresh);listen(doc,'visibilitychange',refresh);
  const Observer=options.MutationObserver;
  if(Observer){
    const listObserver=new Observer(refresh);listObserver.observe(grid,{childList:true});observers.push(listObserver);
    if(doc.body){const modeObserver=new Observer(refresh);modeObserver.observe(doc.body,{attributes:true,attributeFilter:['class']});observers.push(modeObserver)}
  }
  refresh();
  return {swipeIndex:index,moveLot:move,refresh,isPageMode:pageMode,destroy(){destroyed=true;cancel();listeners.forEach(remove=>remove());observers.forEach(observer=>observer.disconnect())}};
}

(()=>{
  'use strict';
  if(typeof window==='undefined'||typeof document==='undefined'||window.FasCatalogScroll)return;
  const grid=document.querySelector('#grid');
  if(!grid||typeof swipeIndex!=='function'||typeof moveLot!=='function'||!window.matchMedia||!window.requestAnimationFrame||!window.cancelAnimationFrame)return;
  const mobile=window.matchMedia('(max-width:700px)'),reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  const controller=createFasCatalogPageScroll({
    window,document,grid,swipeIndex,moveLot,
    isPageMode:()=>mobile.matches&&!(typeof reelsMode!=='undefined'&&reelsMode),
    reducedMotion:()=>reduced.matches,
    getTopInset:()=>parseFloat(window.getComputedStyle?.(grid).scrollMarginTop)||12,
    updatePosition:()=>{if(typeof updateSwipePosition==='function')updateSwipePosition()},
    MutationObserver:typeof MutationObserver==='function'?MutationObserver:null
  });
  swipeIndex=controller.swipeIndex;moveLot=controller.moveLot;
  window.FasCatalogScroll=Object.freeze(controller);
})();
