// Photographs were visually checked. Titles describe the depicted object; unverified model variants are not invented.
const DEMO_OBJECT_PROFILES={"cars": [{"path": "assets/photos/cars-1.jpg", "title": "BMW M5", "brand": "BMW", "photoModel": "M5", "sourceId": "1555215695-3004980ad54e", "bodyType": "sedan", "color": "white"}, {"path": "assets/photos/cars-2.jpg", "title": "Porsche Panamera", "brand": "Porsche", "photoModel": "Panamera", "sourceId": "1503376780353-7e6692767b70", "bodyType": "liftback", "color": "black"}, {"path": "assets/photos/cars-3.jpg", "title": "Mercedes-Benz AMG GT", "brand": "Mercedes-Benz", "photoModel": "AMG GT", "sourceId": "1618843479313-40f8afb4b4d8", "bodyType": "coupe", "color": "gray"}], "trucks": [{"path": "assets/photos/trucks-1.jpg", "title": "Седельный тягач Peterbilt", "brand": "Peterbilt"}, {"path": "assets/photos/trucks-2.jpg", "title": "Тентованный полуприцеп", "brand": "Randon"}], "machinery": [{"path": "assets/photos/machinery-1.jpg", "title": "Гусеничный экскаватор Hyundai", "brand": "Hyundai"}, {"path": "assets/photos/equipment-type-forklift.jpg", "title": "Вилочный погрузчик HELI", "brand": "HELI"}], "equipment": [{"path": "assets/photos/equipment-1.jpg", "title": "Фрезерный станок с ЧПУ", "brand": ""}, {"path": "assets/photos/equipment-type-compressor.jpg", "title": "Промышленный воздушный компрессор", "brand": ""}, {"path": "assets/photos/equipment-type-lathe.jpg", "title": "Вертикально-фрезерный станок", "brand": ""}, {"path": "assets/photos/equipment-type-generator.jpg", "title": "Передвижной сварочный агрегат Miller", "brand": "Miller"}], "property": [{"path": "assets/photos/property-1.jpg", "title": "Жилой дом с бассейном", "brand": ""}, {"path": "assets/photos/property-2.jpg", "title": "Жилая недвижимость · интерьер", "brand": ""}], "commercial": [{"path": "assets/photos/commercial-1.jpg", "title": "Складское помещение со стеллажами", "brand": ""}, {"path": "assets/photos/commercial-2.jpg", "title": "Складское помещение со стеллажами", "brand": ""}], "vessels": [{"path": "assets/photos/vessels-1.jpg", "title": "Пассажирский моторный катер", "brand": ""}, {"path": "assets/photos/vessels-2.jpg", "title": "Каютный моторный катер", "brand": ""}], "other": [{"path": "assets/photos/other-1.jpg", "title": "Комплект офисной мебели", "brand": ""}, {"path": "assets/photos/other-2.jpg", "title": "Ноутбук в алюминиевом корпусе", "brand": ""}, {"path": "assets/photos/equipment-type-server.jpg", "title": "Стоечное серверное оборудование", "brand": ""}]};

// Appearance metadata belongs to the inspected photo profile, not all cars.
function enrichVerifiedDemoAppearance(c){
 if(!c.demo||c.demoEdited||c.sellerOwnerId||c.category!=='cars')return;
 const filled=keys=>keys.some(key=>typeof c[key]==='string'&&c[key].trim());
 const hasBody=filled(["bodyType", "body", "bodyStyle", "body_type", "body_style", "кузов", "Кузов", "типКузова", "тип_кузова", "Тип кузова", "тип кузова"]),hasColor=filled(["color", "colour", "bodyColor", "body_color", "exteriorColor", "exterior_color", "цвет", "Цвет", "цветКузова", "цвет_кузова", "Цвет кузова", "цвет кузова"]);
 const profile=DEMO_OBJECT_PROFILES.cars.find(item=>item.path===c.image);
 if(c.photoExample&&c.image===c.demoPhotoProfile&&profile&&globalThis.FasDemoPhotos?.matches(c,profile.path)){if(!hasBody&&profile.bodyType)c.bodyType=profile.bodyType;if(!hasColor&&profile.color)c.color=profile.color;return}
 // The original named Camry/K5 examples have a known sedan body, but no verified color.
 if(!hasBody&&(c.id===1046&&c.name==='Toyota Camry · 2.5 AT'||c.id===1047&&c.name==='Kia K5 · 2.0 AT'))c.bodyType='sedan';
}
function normalizePhotoDemo(c){if(c.demoEdited||c.sellerOwnerId)return;if(c.demo&&!c.demoEdited&&!c.sellerOwnerId&&c.category==='cars'&&c.photoExample&&c.image===c.demoPhotoProfile){const p=DEMO_OBJECT_PROFILES.cars.find(profile=>profile.path===c.image);if(p&&p.photoModel&&(/^(?:Спортивное купе Mercedes-Benz)(?: · \d+)?$/.test(c.name)||c.model==='Спортивное купе Mercedes-Benz')){const suffix=c.name.match(/ · (\d+)$/)?.[1];c.name=p.title+(suffix?' · '+suffix:'');c.model=p.title;c.brand=p.brand}if(p&&(/Дизель \/ Бензин|2\.0 л/.test(c.engine||''))){c.engine='Бензин · демоданные';c.fuel='petrol'}}enrichVerifiedDemoAppearance(c);if(c.demoCatalogVersion>=3)return;if(!c.demo||!c.photoExample||!c.demoPhotoProfile||c.image!==c.demoPhotoProfile)return;c.specsDemo=true;const title=c.model||c.name;if(title.includes('Полуприцеп')||title.includes('полуприцеп')){c.assetKind='trailer';c.km='';c.mileage=null;c.engine='Полуприцеп';c.fuel=null;c.transmission=null;c.drive=null;c.powerHp=null}if(title.includes('Дом')||title.includes('дом')){c.assetKind='house';c.floor=null;c.totalFloors=null;c.rooms=null;c.area=null;c.engine='Площадь не указана'}if(c.category==='machinery'){c.km='';c.mileage=null;c.engine='Параметры уточняются';c.powerHp=null}if(c.category==='cars'&&(/2\.0 л/.test(c.engine)||c.engine==='Дизель / Бензин'))c.engine='Бензин · демоданные'}


// A library photograph belongs to one depicted object. It is never reassigned
// to a different model merely because that object has the same category.
(()=>{
 'use strict';
 const normalize=value=>String(value??'').normalize('NFKC').toLocaleLowerCase('ru').replace(/ё/g,'е').replace(/[^\p{L}\p{N}]/gu,'');
 const profiles=Object.entries(DEMO_OBJECT_PROFILES).flatMap(([category,items])=>items.map(profile=>({...profile,category})));
 profiles.push({path:'assets/photos/trucks-type-sitrak-c7h.jpg',title:'Седельный тягач SITRAK C7H',brand:'SITRAK',photoModel:'C7H',category:'trucks'});
 const byPath=new Map(profiles.map(profile=>[profile.path,profile]));
 function known(source){if(typeof source!=='string')return null;const path=source.split(/[?#]/,1)[0];if(byPath.has(path))return byPath.get(path);return profiles.find(profile=>profile.sourceId&&source.split(/[?#]/,1)[0]==='https://images.unsplash.com/photo-'+profile.sourceId)||null}
 const fallback=lot=>'assets/'+(Object.hasOwn(DEMO_OBJECT_PROFILES,lot?.category)?lot.category:'other')+'.svg';
 function modelMatches(value,expected){const characters=String(expected??'').normalize('NFKC').match(/[\p{L}\p{N}]/gu)||[];if(!characters.length)return false;return new RegExp('(?:^|[^\\p{L}\\p{N}])'+characters.join('[^\\p{L}\\p{N}]*')+'(?=$|[^\\p{L}\\p{N}])','iu').test(String(value??'').normalize('NFKC'))}
 function matches(lot,profile){
  if(!lot||!profile||lot.category!==profile.category)return false;
  const name=normalize(lot.name),model=normalize(lot.model),brand=normalize(lot.brand||lot.manufacturer),expectedBrand=normalize(profile.brand),expectedModel=normalize(profile.photoModel);
  if(expectedBrand&&(brand?brand!==expectedBrand:!name.includes(expectedBrand)))return false;
  if(expectedModel&&!modelMatches(model?lot.model:lot.name,profile.photoModel))return false;
  // Unbranded stock objects require their actual profile description. A generic
  // category such as equipment is insufficient to prove photo correspondence.
  if(!expectedBrand&&!name.includes(normalize(profile.title))&&!model.includes(normalize(profile.title))&&!(profile.path==='assets/photos/property-2.jpg'&&/квартир/.test(name)))return false;
  return true;
 }
 function resolve(lot,source){
  const candidate=source??lot?.image??(lot?.demo&&lot?.img?'https://images.unsplash.com/'+lot.img+'?auto=format&fit=crop&w=900&q=85':null),profile=known(candidate);
  if(!profile)return accepts(lot,candidate)?candidate||fallback(lot):fallback(lot);
  return accepts(lot,candidate)?candidate:fallback(lot);
 }
 function accepts(lot,source){const profile=known(source);if(profile)return !!lot?.demo&&!lot.demoEdited&&!lot.sellerOwnerId&&matches(lot,profile);return !(lot?.demo&&!lot.demoEdited&&!lot.sellerOwnerId&&lot.img&&typeof source==='string'&&source.includes('images.unsplash.com/'+lot.img))}
 const api=Object.freeze({resolve,accepts,isKnownStock:source=>!!known(source),matches:(lot,source)=>matches(lot,known(source))});
 globalThis.FasDemoPhotos=api;globalThis.resolveLotPhoto=resolve;
 if(typeof window!=='undefined'){window.FasDemoPhotos=api;window.resolveLotPhoto=resolve}
})();
