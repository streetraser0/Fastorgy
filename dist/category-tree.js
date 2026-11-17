/* Sale taxonomy. Existing lot.category values stay intact; subcategory refines them. */
(()=>{
 'use strict';
 const OLD=new Set(['cars','trucks','machinery','equipment','property','commercial','vessels','other']);
 const definitions=[
  ['transport','Транспорт','auction',[
   ['cars','Легковые автомобили','cars'],['motorcycles','Мотоциклы и мототехника','other'],['trucks','Грузовики и автобусы','trucks'],['machinery','Спецтехника','machinery'],['vessels','Водный транспорт','vessels'],['trailers','Прицепы и полуприцепы','trucks'],['snowmobiles','Снегоходы','other'],['atvs','Квадроциклы и багги','other']
  ]],
  ['real_estate','Недвижимость','auction',[
   ['property','Квартиры и комнаты','property'],['houses','Дома, дачи и коттеджи','property'],['land','Земельные участки','property'],['garages','Гаражи и машино-места','commercial'],['commercial','Коммерческая недвижимость','commercial']
  ]],
  ['home_garden','Товары для дома','auction',[
   ['furniture','Мебель и интерьер','other'],['home_appliances','Бытовая техника','other'],['kitchenware','Посуда и товары для кухни','other'],['home_textiles','Домашний текстиль','other'],['building_materials','Ремонт и стройматериалы','other'],['garden','Сад и огород','other'],['tools','Инструменты','other']
  ]],
  ['electronics','Электроника','auction',[
   ['phones','Телефоны и планшеты','other'],['computers','Ноутбуки и компьютеры','other'],['computer_parts','Комплектующие и серверы','other'],['audio_video','Аудио и видео','other'],['cameras','Фото и видеокамеры','other'],['games','Игровые приставки и игры','other'],['office_electronics','Оргтехника и расходники','other']
  ]],
  ['business','Бизнес и оборудование','auction',[
   ['equipment','Промышленное и торговое оборудование','equipment'],['ready_business','Готовый бизнес','other'],['business_materials','Сырьё и материалы','other'],['other','Прочее имущество','other']
  ]]
 ];
 const RETIRED=new Set(["work", "work_vacancies", "work_resumes", "services", "services_repair", "services_transport", "services_business", "services_household", "services_training", "personal", "clothing", "shoes", "personal_accessories", "watches_jewelry", "beauty_health", "kids_clothing", "kids_goods", "parts", "auto_parts", "tires_wheels", "vehicle_accessories", "motorcycle_parts", "oils_fluids", "hobby", "sports", "bicycles", "books", "collectibles", "musical_instruments", "fishing", "animals", "pets", "farm_animals", "pet_supplies"]);
 const groupsList=[],leavesList=[],index=new Map();
 for(const [id,label,mode,children] of definitions){
  const entries=children.map(([leafId,leafLabel,base,leafMode])=>Object.freeze({id:leafId,label:leafLabel,groupId:id,mode:leafMode||'auction',auction:leafMode!=='directory',legacyCategory:base}));
  const group=Object.freeze({id,label,mode,icon:id,kind:'group',children:Object.freeze(entries)});
  groupsList.push(group);index.set(id,group);
  for(const leaf of entries){leavesList.push(leaf);index.set(leaf.id,leaf)}
 }
 Object.freeze(groupsList);Object.freeze(leavesList);
 const get=id=>typeof id==='string'?index.get(id)||null:null;
 const text=lot=>[lot.name,lot.model,lot.assetKind].filter(value=>typeof value==='string').join(' ').toLocaleLowerCase('ru').replace(/ё/g,'е');
 function infer(lot){
  const category=typeof lot.category==='string'?lot.category:'cars';
  if(RETIRED.has(category)||RETIRED.has(lot.subcategory))return 'other';
  if(get(category)&&!OLD.has(category)&&get(category).kind!=='group')return category;
  const previous=get(lot.previousSubcategory);
  if(lot.subcategory==='other'&&previous?.groupId==='home_garden')return previous.id;
  if(typeof lot.subcategory==='string'&&get(lot.subcategory)&&!get(lot.subcategory).kind)return lot.subcategory;
  const name=text(lot);
  if(category==='property'||category==='commercial'){
   if(lot.assetKind==='house'||/(?:^|[^а-яa-z])дом(?:$|[^а-яa-z])|таунхаус|коттедж|загородн|дач[ауы]|вилл[ауы]/.test(name))return 'houses';
   if(/гараж|машино[ -]?мест/.test(name))return 'garages';
   if(/земельн[а-я]* участ|земл[яию]|(?:^|\s)участок(?:\s|$)/.test(name))return 'land';
   return category;
  }
  if(category==='trucks'&&(lot.assetKind==='trailer'||/полуприцеп|(?:^|\s)прицеп(?:\s|$)/.test(name)))return 'trailers';
  // Refine mixed legacy inventory only from clear object descriptions. A seller's
  // explicit subcategory above always wins; unrelated text never creates a lot.
  if(category==='other'){
   if(/снегоход/.test(name))return 'snowmobiles';
   if(/квадроцикл|(?:^|\s)багги(?:\s|$)/.test(name))return 'atvs';
   if(/мотоцикл|мопед|скутер/.test(name))return 'motorcycles';
   if(/ноутбук|компьютер|системн[а-я]* блок|моноблок/.test(name))return 'computers';
   if(/сервер|видеокарт|процессор|материнск[а-я]* плат/.test(name))return 'computer_parts';
   if(/смартфон|мобильн[а-я]* телефон|планшет|iphone|ipad/.test(name))return 'phones';
   if(/мебел[ьи]|(?:^|\s)диван|(?:^|\s)кресл|(?:^|\s)стол(?:\s|$)|(?:^|\s)стул|шкаф|комод/.test(name))return 'furniture';
   if(/стиральн[а-я]* машин|посудомоечн|бытов[а-я]* холодильник|микроволнов|пылесос/.test(name))return 'home_appliances';
   if(/оборудован|станок|компрессор|стеллаж|агрегат/.test(name))return 'equipment';
  }
  return get(category)&&!get(category).kind?category:'other';
 }
 function canonicalId(value){
  if(value&&typeof value==='object'&&!Array.isArray(value)){const id=infer(value);return RETIRED.has(id)?'other':id;}
  return typeof value==='string'&&get(value)?value:null;
 }
 function groupOf(value){const node=get(canonicalId(value));return node?.kind==='group'?node:node?get(node.groupId):null}
 const emptySelection=Object.freeze([]),selectionCache=new Map();
 function selection(value){
  if(value===undefined||value===null||value===''||value==='all'||value==='*')return emptySelection;
  const key=typeof value==='string'&&value.length<=2048?value:null;if(key&&selectionCache.has(key))return selectionCache.get(key);
  const remember=result=>{const safe=result?Object.freeze(result):null;if(key){if(selectionCache.size>=128)selectionCache.delete(selectionCache.keys().next().value);selectionCache.set(key,safe)}return safe};
  const input=Array.isArray(value)?value:typeof value==='string'&&value.length<=2048?value.split(','):null;
  if(!input||input.length>64)return remember(null);
  const ids=new Set();for(const raw of input){if(typeof raw!=='string'||!get(raw.trim()))return remember(null);ids.add(raw.trim())}
  // Full groups and redundant descendants have one stable representation.
  for(const group of groupsList)if(group.children.every(child=>ids.has(child.id)))ids.add(group.id);
  for(const id of [...ids]){const node=get(id);if(node.groupId&&ids.has(node.groupId))ids.delete(id)}
  if(groupsList.every(group=>ids.has(group.id)))return remember([]);
  return remember([...index.keys()].filter(id=>ids.has(id)));
 }
 function selectionValue(value){const ids=selection(value);return ids?ids.join(','):null}
 function matches(lot,value){
  const ids=selection(value);if(!ids)return false;if(!ids.length)return true;
  const actual=get(canonicalId(lot));if(!actual)return false;
  return ids.some(id=>{const wanted=get(id);return wanted.kind==='group'?actual.id===wanted.id||actual.groupId===wanted.id:actual.id===wanted.id});
 }
 function normalizeLot(lot){if(lot&&typeof lot==='object'&&!Array.isArray(lot)){if(RETIRED.has(lot.subcategory)&&!lot.previousSubcategory)lot.previousSubcategory=lot.subcategory;const id=canonicalId(lot);if(get(id)&&!get(id).kind)lot.subcategory=id}return lot}
 function label(value){
  if(value&&typeof value==='object'&&!Array.isArray(value))return get(canonicalId(value))?.label||'Категория не указана';
  const ids=selection(value);if(!ids)return 'Категория не указана';if(!ids.length)return 'Все категории';
  const labels=ids.map(id=>get(id).label);return labels.slice(0,2).join(', ')+(labels.length>2?' и ещё '+(labels.length-2):'');
 }
 function legacyCategory(value){const node=get(canonicalId(value));return node&&node.kind!=='group'?node.legacyCategory:null}
 function isAuction(id){const node=get(id);return node?.kind==='group'?node.children.some(child=>child.auction):!!node?.auction}
 function filterFamilies(value){
  const ids=value&&typeof value==='object'&&!Array.isArray(value)?[canonicalId(value)]:selection(value);if(!ids)return [];
  const families=new Set();for(const id of ids.length?ids:groupsList.map(group=>group.id)){const group=groupOf(id)?.id;families.add(group==='transport'?'vehicle':group==='real_estate'?'property':group==='business'||group==='electronics'?'equipment':'general')}
  return [...families];
 }
 function filterFamily(value){const families=filterFamilies(value);return families.length===1?families[0]:'general'}
 function leaves(groupId){return groupId?leavesList.filter(leaf=>leaf.groupId===groupId):leavesList.slice()}
 function auctionLeaves(){return leavesList.filter(leaf=>leaf.auction)}
 const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
 function optionsHTML(selected='',options={}){
  const all=options.includeAll?'<option value="">Все категории</option>':'';
  const normalized=selectionValue(selected),multi=normalized&&normalized.includes(',')?'<option value="'+escape(normalized)+'" selected>'+escape(label(normalized))+'</option>':'';
  if(normalized!==null)selected=normalized;
  return all+multi+groupsList.map(group=>{
   const children=group.children.filter(leaf=>!options.auctionOnly||leaf.auction);if(!children.length)return '';
   return '<optgroup label="'+escape(group.label)+'">'+(options.includeGroups?'<option value="'+group.id+'" '+(selected===group.id?'selected':'')+'>Все: '+escape(group.label)+'</option>':'')+children.map(leaf=>'<option value="'+leaf.id+'" '+(selected===leaf.id?'selected':'')+'>'+escape(leaf.label)+(leaf.auction?'':' · раздел объявлений')+'</option>').join('')+'</optgroup>';
  }).join('');
 }
 const api=Object.freeze({groups:()=>groupsList.slice(),leaves,get,groupOf,selection,selectionValue,matches,label,auctionLeaves,normalizeLot,canonicalId,legacyCategory,filterFamily,filterFamilies,isAuction,optionsHTML});
 globalThis.FasCategories=api;if(typeof window!=='undefined')window.FasCategories=api;
})();
