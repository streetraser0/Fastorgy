const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {boot}=require('./category-seller-harness.cjs');const {setup}=require('./quickbar-dom.cjs');const root=path.resolve(__dirname,'../..');const read=name=>fs.readFileSync(path.join(root,'dist',name),'utf8');
function integration({bubbleCancellation=false,records={},strictSelect=false,fixtures=null}={}){
 const app=boot({records}),dom=setup({mobile:true}),document=dom.document;
 dom.Element.prototype.insertAdjacentElement=function(where,node){
  const parent=this.parentElement,index=parent?.children.indexOf(this);
  if(where==='afterend'&&parent){node.parentElement=parent;parent.children.splice(index+1,0,node)}else this.appendChild(node);
 };
 if(fixtures)app.run('cars='+JSON.stringify(fixtures)+';ends.length=0;cars.forEach(lot=>ends.push(Date.parse(lot.ends)));invalidateSubscriptionInventory();window.FasKeywordSearch.invalidate();');
 const markup=read('index.html').split('<script>')[0];
 for(const [,tag,attributes,id]of markup.matchAll(/<([a-z][a-z0-9-]*)\b([^>]*\bid="([^"]+)"[^>]*)>/gi)){
  const node=document.querySelector('#'+id)||dom.add(id,tag),previous=app.node('#'+id);
  node.value=previous.value;node.textContent=String(previous.textContent);node.innerHTML=previous.innerHTML;
  for(const name of ['onchange','onsubmit','onclick','oninput'])node[name]=previous[name];
  for(const [,name,value]of attributes.matchAll(/([\w-]+)="([^"]*)"/g))node.setAttribute(name,value);
 }
 if(strictSelect){Object.defineProperty(dom.Element.prototype,'value',{
  configurable:true,
  get(){if(this.tagName!=='SELECT'||!['category','sub-category','region-filter'].includes(this.id))return this._value??'';const options=this.querySelectorAll('option'),value=option=>option.getAttribute('value')??option._value??option.textContent;if(this._explicitCategoryValue)return options.some(option=>value(option)===this._value)?this._value:'';const selected=options.find(option=>option.hasAttribute('selected'))||options[0];return selected?value(selected):''},
  set(value){this._value=String(value??'');if(this.tagName==='SELECT'&&['category','sub-category','region-filter'].includes(this.id))this._explicitCategoryValue=true}
 });for(const node of dom.nodes){const value=node.value;delete node.value;node.value=value}}
 // quickbar's small DOM keeps detached nodes in an inventory; browser lookup
 // only returns connected nodes, which matters after rebuilding the forms.
 document.getElementById=id=>document.querySelector('#'+id);
 const listeners={},timers=new Map();let timerId=0;
 app.context.setTimeout=(handler,delay=0)=>{const id=++timerId;timers.set(id,{handler,delay});return id};app.context.clearTimeout=id=>timers.delete(id);
 document.addEventListener=(type,handler,options)=>(listeners[type]??=[]).push({handler,capture:options===true||options?.capture===true});
 Object.assign(app.context,{document,MutationObserver:undefined});
 app.context.window.document=document;app.context.window.MutationObserver=undefined;
 app.run('render()');
 vm.runInContext(read('category-ui.js'),app.context);
 let enhancement=read('app-ui.js');
 if(bubbleCancellation){
  assert(enhancement.includes('},{capture:true});'),'counterfactual must remove the real cancellation capture flag');
  enhancement=enhancement.replace('},{capture:true});','});');
 }
 vm.runInContext(enhancement,app.context);
 vm.runInContext(read('property-map.js'),app.context);
 function click(target){
  assert(target,'expected a real category control');
  const event={type:'click',target,defaultPrevented:false,preventDefault(){this.defaultPrevented=true},stopPropagation(){this.stopped=true}};
  for(const entry of listeners.click||[])if(entry.capture)entry.handler(event);
  for(let node=target;node&&!event.stopped;node=node.parentElement){
   node.onclick?.(event);node.dispatchEvent(event);
  }
  if(!event.stopped)for(const entry of listeners.click||[])if(!entry.capture)entry.handler(event);
  return event;
 }
 function select(id){
  const group=app.run('window.FasCategories.groupOf('+JSON.stringify(id)+').id');
  click(document.querySelector('[data-home-category="'+group+'"]'));
  const picker=document.querySelector('#category-picker');assert(picker.open,'home tile opens the real picker');
  const node=app.run('window.FasCategories.get('+JSON.stringify(id)+')');
  click(picker.querySelector(node.kind==='group'?'[data-category-use="'+id+'"]':'[data-category-node="'+id+'"]'));
  assert.equal(picker.open,false,'selection closes the picker');
 }
 return{...app,document,click,select,flushTasks(){for(const [id,timer]of [...timers])if(timer.delay===0){timers.delete(id);timer.handler()}},field:id=>document.querySelector('#'+id)};
}

module.exports={integration,settle:async h=>{for(let i=0;i<12;i++){h.flushTasks();await Promise.resolve()}}};
