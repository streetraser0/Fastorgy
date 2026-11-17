/* Pure rules shared by the private seller form and the local demonstration auction. */
(() => {
  'use strict';
  const MIN_DURATION_MINUTES = 60;
  const MAX_DURATION_MINUTES = 30 * 24 * 60;
  const MAX_AUCTION_MS = MAX_DURATION_MINUTES * 60000;
  const CATEGORIES = ['cars', 'trucks', 'machinery', 'equipment', 'property', 'commercial', 'vessels', 'other'];
  const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const text = value => typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim() : '';
  const present = value => value !== undefined && value !== null && value !== '';
  function number(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value !== 'string' || !value.trim() || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim())) return null;
    const result = Number(value);
    return Number.isFinite(result) ? result : null;
  }
  const bool = value => value === true || value === 'true' || value === 'on' || value === '1';
  const first = (...values) => values.find(value => value !== undefined);
  const time = value => typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Date.parse(value) : NaN;
  const iso = value => Number.isFinite(value) && Math.abs(value) <= 8640000000000000 ? new Date(value).toISOString() : '';
  const nowOf = options => Number.isFinite(options?.now) ? options.now : Date.now();
  const money = value => Number.isSafeInteger(value) && value >= 0;
  const positiveMoney = value => money(value) && value > 0;
  const modes = () => typeof window !== 'undefined' ? window.FasAuctionModes : globalThis.FasAuctionModes;
  const descending = lot => lot?.auctionDirection === 'descending';
  const optionalText = ['address', 'inspection', 'deliveryNotes', 'deliveryRegions', 'documents', 'defects', 'completeness'];
  const field = (name, label, type = 'text', settings = {}) => Object.freeze({ name, label, type, ...settings, ...(settings.options ? { options: Object.freeze({ ...settings.options }) } : {}) });
  const numeric = (name, label, max, unit = '', min = 0, step = 'any') => field(name, label, 'number', { min, max, step, ...(unit ? { unit } : {}) });
  const choice = (name, label, options) => field(name, label, 'select', { options: { '': 'Не указано', ...options } });
  const short = (name, label, maxLength = 150) => field(name, label, 'text', { maxLength });
  const F = {
    brand: short('brand', 'Марка / бренд', 100), model: short('model', 'Модель'), manufacturer: short('manufacturer', 'Производитель'),
    year: field('year', 'Год выпуска', 'year', { min: 1800, max: 9999, step: 1 }), buildingYear: field('year', 'Год постройки', 'year', { min: 1800, max: 9999, step: 1 }),
    mileage: numeric('mileage', 'Пробег', 1e9, 'км', 0, 1), powerHp: numeric('powerHp', 'Мощность двигателя', 1e7, 'л.с.'), engineVolume: numeric('engineVolume', 'Объём двигателя', 1000, 'л'),
    fuel: choice('fuel', 'Топливо', { petrol: 'Бензин', diesel: 'Дизель', electric: 'Электричество', hybrid: 'Гибрид' }),
    transmission: choice('transmission', 'Коробка передач', { auto: 'Автоматическая', manual: 'Механическая' }), drive: choice('drive', 'Привод', { front: 'Передний', rear: 'Задний', awd: 'Полный' }),
    vin: short('vin', 'VIN / номер кузова', 30), bodyType: short('bodyType', 'Тип кузова'), color: short('color', 'Цвет', 100),
    payload: numeric('payload', 'Грузоподъёмность', 1e9, 'кг'), workingHours: numeric('workingHours', 'Наработка', 1e9, 'моточасов', 0, 1), weight: numeric('weight', 'Масса', 1e12, 'кг'),
    length: numeric('length', 'Длина', 1e9, 'м'), width: numeric('width', 'Ширина', 1e9, 'м'), axleCount: numeric('axleCount', 'Количество осей', 100, '', 0, 1),
    machineryType: short('machineryType', 'Вид спецтехники'), vesselType: short('vesselType', 'Тип судна'), trailerType: short('trailerType', 'Тип прицепа'),
    area: numeric('area', 'Площадь объекта', 1e9, 'м²', 0.01), landArea: numeric('landArea', 'Площадь участка', 1e12, 'м²', 0.01),
    rooms: numeric('rooms', 'Количество комнат', 1e5, '', 0, 1), floor: numeric('floor', 'Этаж', 1e5, '', 0, 1), totalFloors: numeric('totalFloors', 'Этажей в здании', 1e5, '', 1, 1),
    buildingType: choice('buildingType', 'Материал / тип здания', { brick: 'Кирпичный', panel: 'Панельный', monolith: 'Монолитный', block: 'Блочный', wood: 'Деревянный', metal: 'Металлический', mixed: 'Смешанный', other: 'Другой' }),
    landType: choice('landType', 'Категория земли', { settlement: 'Земли населённых пунктов', agricultural: 'Сельскохозяйственные земли', industrial: 'Земли промышленности', other: 'Другая категория' }),
    usage: short('usage', 'Назначение / разрешённое использование', 300), garageType: choice('garageType', 'Тип объекта', { garage: 'Гараж', parking: 'Машино-место', box: 'Гаражный бокс', other: 'Другой' }),
    cadastralNumber: short('cadastralNumber', 'Кадастровый номер', 60), ceilingHeight: numeric('ceilingHeight', 'Высота потолков', 1000, 'м'),
    heating: choice('heating', 'Отопление', { central: 'Центральное', gas: 'Газовое', electric: 'Электрическое', stove: 'Печное', none: 'Отсутствует', other: 'Другое' }),
    utilities: field('utilities', 'Коммуникации', 'textarea', { maxLength: 2000, hint: 'Укажите фактическое подключение воды, электричества и других коммуникаций.' }),
    itemType: short('itemType', 'Вид имущества'), material: short('material', 'Материал'), dimensions: short('dimensions', 'Размеры', 200), quantity: numeric('quantity', 'Количество', 1e12, '', 0.001),
    quantityUnit: choice('quantityUnit', 'Единица измерения', { pcs: 'Штуки', set: 'Комплекты', m: 'Метры', m2: 'Квадратные метры', m3: 'Кубические метры', kg: 'Килограммы', l: 'Литры', pack: 'Упаковки' }),
    powerKw: numeric('powerKw', 'Мощность', 1e9, 'кВт'), voltage: numeric('voltage', 'Напряжение', 1e6, 'В'),
    powerSource: choice('powerSource', 'Источник питания', { mains: 'Электросеть', battery: 'Аккумулятор', petrol: 'Бензин', manual: 'Ручной', pneumatic: 'Пневматический', other: 'Другой' }),
    serialNumber: short('serialNumber', 'Серийный / заводской номер', 80), storageGb: numeric('storageGb', 'Объём накопителя', 1e12, 'ГБ'), ramGb: numeric('ramGb', 'Оперативная память', 1e6, 'ГБ'),
    capacityGb: numeric('capacityGb', 'Объём памяти / накопителя', 1e12, 'ГБ'), screenSize: numeric('screenSize', 'Диагональ экрана', 1000, 'дюймов'),
    processor: short('processor', 'Процессор'), graphicsCard: short('graphicsCard', 'Видеокарта'), operatingSystem: short('operatingSystem', 'Операционная система'),
    interface: short('interface', 'Интерфейс подключения'), interfaces: short('interfaces', 'Разъёмы и подключения', 300), resolutionMp: numeric('resolutionMp', 'Разрешение матрицы', 1e6, 'Мп'),
    lens: short('lens', 'Объектив / байонет'), shutterCount: numeric('shutterCount', 'Пробег затвора', 1e12, 'кадров', 0, 1), platform: short('platform', 'Игровая платформа'), mediaType: short('mediaType', 'Носитель / формат'),
    printTechnology: choice('printTechnology', 'Технология печати', { laser: 'Лазерная', inkjet: 'Струйная', thermal: 'Термопечать', matrix: 'Матричная', other: 'Другая' }), printSpeed: numeric('printSpeed', 'Скорость печати', 1e6, 'стр./мин'),
    businessType: short('businessType', 'Вид бизнеса'), businessAssets: field('businessAssets', 'Что входит в продажу', 'textarea', { maxLength: 4000 }), batchNumber: short('batchNumber', 'Партия / маркировка', 100)
  };
  const conditionOptions = Object.freeze({ new: 'Новое', used: 'Бывшее в эксплуатации', repair: 'Требует ремонта' });
  const propertyConditions = Object.freeze({ new: 'Новый объект', used: 'В эксплуатации', repair: 'Требует ремонта' });
  const definitions = {
    cars: ['Легковые автомобили', 'Toyota Camry 2.5, 2021 год', 'brand model year mileage fuel transmission engineVolume', 'drive powerHp bodyType color vin manufacturer'],
    motorcycles: ['Мотоциклы и мототехника', 'Мотоцикл Honda CB500, 2020 год', 'brand model year mileage engineVolume fuel', 'powerHp transmission vin manufacturer'],
    trucks: ['Грузовики и автобусы', 'Самосвал КАМАЗ 65115, 2019 год', 'brand model year mileage payload bodyType fuel', 'powerHp transmission drive engineVolume vin manufacturer'],
    machinery: ['Спецтехника', 'Экскаватор JCB 3CX, 2018 год', 'machineryType brand model year workingHours powerHp', 'manufacturer serialNumber fuel weight payload'],
    vessels: ['Водный транспорт', 'Моторная лодка Волжанка 46, 2020 год', 'vesselType brand model year length powerHp', 'width weight fuel serialNumber manufacturer'],
    trailers: ['Прицепы и полуприцепы', 'Бортовой полуприцеп Schmitz, 2018 год', 'trailerType brand model year payload length', 'axleCount weight width vin manufacturer'],
    snowmobiles: ['Снегоходы', 'Снегоход BRP Ski-Doo, 2021 год', 'brand model year mileage engineVolume powerHp', 'fuel serialNumber vin manufacturer'],
    atvs: ['Квадроциклы и багги', 'Квадроцикл CFMOTO X6, 2022 год', 'brand model year mileage engineVolume drive', 'powerHp fuel transmission vin manufacturer'],
    property: ['Квартиры и комнаты', 'Двухкомнатная квартира, 54 м², 5 этаж', 'area rooms floor totalFloors buildingType', 'buildingYear cadastralNumber ceilingHeight'],
    houses: ['Дома, дачи и коттеджи', 'Кирпичный дом 120 м² с участком 8 соток', 'area rooms totalFloors buildingYear buildingType landArea', 'cadastralNumber heating utilities'],
    land: ['Земельные участки', 'Участок 10 соток для жилого дома', 'area landType usage', 'cadastralNumber utilities'],
    garages: ['Гаражи и машино-места', 'Гаражный бокс, 24 м²', 'area garageType', 'buildingType cadastralNumber utilities'],
    commercial: ['Коммерческая недвижимость', 'Офисное помещение 85 м², отдельный вход', 'area floor totalFloors usage buildingType', 'buildingYear cadastralNumber ceilingHeight utilities'],
    furniture: ['Мебель и интерьер', 'Обеденный стол из дуба, 160 × 90 см', 'itemType material dimensions brand', 'manufacturer color quantity'],
    home_appliances: ['Бытовая техника', 'Стиральная машина Bosch, загрузка 7 кг', 'itemType brand model powerKw', 'year manufacturer dimensions serialNumber'],
    kitchenware: ['Посуда и товары для кухни', 'Набор фарфоровой посуды на 6 персон', 'itemType material quantity', 'brand manufacturer dimensions color'],
    home_textiles: ['Домашний текстиль', 'Хлопковое постельное бельё, двуспальный комплект', 'itemType material dimensions quantity', 'brand color manufacturer'],
    building_materials: ['Ремонт и стройматериалы', 'Керамическая плитка, 20 м²', 'itemType material quantity quantityUnit', 'dimensions brand manufacturer'],
    garden: ['Сад и огород', 'Теплица из поликарбоната, 3 × 6 м', 'itemType usage material dimensions', 'brand manufacturer quantity powerKw'],
    tools: ['Инструменты', 'Аккумуляторная дрель Makita, 18 В', 'itemType brand model powerSource powerKw', 'manufacturer voltage weight serialNumber'],
    phones: ['Телефоны и планшеты', 'Смартфон Samsung Galaxy S23, 256 ГБ', 'brand model storageGb screenSize', 'ramGb color serialNumber year'],
    computers: ['Ноутбуки и компьютеры', 'Ноутбук Lenovo ThinkPad, 16 ГБ, SSD 512 ГБ', 'itemType brand model processor ramGb storageGb', 'graphicsCard operatingSystem serialNumber year'],
    computer_parts: ['Комплектующие и серверы', 'Серверная память DDR4, 32 ГБ', 'itemType manufacturer model capacityGb interface', 'quantity powerKw serialNumber'],
    audio_video: ['Аудио и видео', 'Стереоусилитель Yamaha, рабочее состояние', 'itemType brand model powerKw', 'dimensions interfaces serialNumber year'],
    cameras: ['Фото и видеокамеры', 'Фотоаппарат Canon EOS 80D с объективом', 'itemType brand model resolutionMp', 'lens shutterCount serialNumber year'],
    games: ['Игровые приставки и игры', 'Игровая приставка Sony PlayStation 5 с геймпадом', 'itemType platform brand model', 'mediaType quantity serialNumber'],
    office_electronics: ['Оргтехника и расходники', 'Лазерный принтер Brother, двусторонняя печать', 'itemType brand model printTechnology', 'printSpeed powerKw serialNumber'],
    equipment: ['Промышленное и торговое оборудование', 'Винтовой компрессор Atlas Copco, 11 кВт', 'itemType manufacturer model powerKw voltage', 'year serialNumber dimensions weight workingHours'],
    ready_business: ['Готовый бизнес', 'Действующая пекарня с оборудованием', 'businessType usage businessAssets', 'area'],
    business_materials: ['Сырьё и материалы', 'Листовая нержавеющая сталь, партия 500 кг', 'itemType material quantity quantityUnit', 'manufacturer dimensions batchNumber'],
    other: ['Прочее имущество', 'Партия складского имущества, комплект', 'itemType material dimensions', 'brand manufacturer quantity serialNumber']
  };
  const profiles = {};
  for (const [id, [label, titleExample, primary, additional]] of Object.entries(definitions)) {
    const realEstate = ['property', 'houses', 'land', 'garages', 'commercial'].includes(id);
    profiles[id] = Object.freeze({ id, label, titleExample, primary: Object.freeze(primary.split(' ').filter(Boolean).map(key => F[key])), additional: Object.freeze(additional.split(' ').filter(Boolean).map(key => F[key])),
      conditionLabel: id === 'land' ? 'Состояние участка' : id === 'ready_business' ? 'Состояние бизнеса' : realEstate ? 'Состояние объекта' : 'Состояние имущества',
      conditionOptions: id === 'land' ? Object.freeze({ new: 'Не использовался', used: 'Используется', repair: 'Требует подготовки' }) : id === 'ready_business' ? Object.freeze({ new: 'Новый проект', used: 'Действующий бизнес', repair: 'Требует восстановления' }) : realEstate ? propertyConditions : conditionOptions });
  }
  Object.freeze(profiles);
  const CHARACTERISTIC_FIELDS = Object.freeze([...new Set([...Object.values(F).map(definition => definition.name), 'make', 'km', 'engine', 'engineCapacity', 'displacement', 'loadCapacity', 'machineHours'])]);
  const IDENTITY_FIELDS = Object.freeze([...new Set(['category','subcategory','name','condition',...CHARACTERISTIC_FIELDS,'assetKind','regionCode','city','address','latitude','longitude','vin','cadastralNumber','serialNumber','bank','sellerType','sellerName','sellerOwnerId','ownerId'])]);
  const NUMERIC_IDENTITY_FIELDS=new Set([...Object.values(F).filter(field=>['number','year'].includes(field.type)).map(field=>field.name),'km','latitude','longitude','loadCapacity','machineHours','displacement']);
  function hasActualBids(lot, { ownBid, current } = {}) {
    if (!isRecord(lot)) return false;
    if (Number(lot.bids)>0 || isRecord(ownBid)&&(Number(ownBid.count)>0 || positiveMoney(number(ownBid.price)) || Array.isArray(ownBid.history)&&ownBid.history.some(row=>isRecord(row)&&positiveMoney(number(row.price))&&Number.isFinite(time(row.at))))) return true;
    const start=number(first(lot.startPrice,lot.start)),price=number(first(current,lot.currentPrice,lot.price));
    return !descending(lot)&&positiveMoney(start)&&positiveMoney(price)&&price>start;
  }
  function hasFinalResult(lot) { return isRecord(lot)&&(lot.status==='sold'||Number.isFinite(time(lot.soldAt))&&positiveMoney(number(lot.soldPrice))); }
  function identityLocked(lot, options = {}) { return hasActualBids(lot,options)||hasFinalResult(lot); }
  function identityValue(key, value, lot) {
    if (key==='subcategory') { const tree=typeof window!=='undefined'?window.FasCategories:globalThis.FasCategories;return tree?.canonicalId?.(lot)||text(value)||text(lot.category); }
    if (value===null||value===undefined||value==='') return null;
    const candidate=typeof value==='string'?value.trim():value;
    if (typeof candidate==='number') return candidate;
    if (typeof candidate==='string') { if(NUMERIC_IDENTITY_FIELDS.has(key)){const numeric=number(candidate.replace(/[\s\u00a0\u202f]/g,'').replace(',','.'));if(numeric!==null)return numeric}return key==='vin'?candidate.toUpperCase():candidate; }
    return candidate;
  }
  function identityChanges(proposed, existing) {
    if (!isRecord(proposed)||!isRecord(existing)) return [];
    return IDENTITY_FIELDS.filter(key=>Object.hasOwn(proposed,key)&&identityValue(key,proposed[key],proposed)!==identityValue(key,existing[key],existing));
  }
  function preserveAuctionIdentity(proposed, existing) {
    const next={...proposed};if(!isRecord(existing))return next;
    for(const key of IDENTITY_FIELDS)if(Object.hasOwn(existing,key))next[key]=existing[key];else delete next[key];
    return next;
  }
  function listingProtection(lot, { ownBid, current, now = Date.now() } = {}) {
    const hasBids=hasActualBids(lot,{ownBid,current}),start=time(first(lot?.startsAt,lot?.starts)),duration=number(lot?.durationMinutes);
    const deadlines=[time(lot?.ends),time(lot?.announcedEnds),time(ownBid?.ends)];
    if(Number.isFinite(start)&&duration!==null&&duration>=MIN_DURATION_MINUTES&&duration<=MAX_DURATION_MINUTES)deadlines.push(start+duration*60000);
    const valid=deadlines.filter(Number.isFinite),until=valid.length?Math.max(...valid):null,expired=Number.isFinite(now)&&until!==null&&now>=until;
    return {hasBids,until,expired,locked:hasBids&&!expired};
  }
  function listingProfile(rawOrId) {
    const tree = typeof window !== 'undefined' ? window.FasCategories : globalThis.FasCategories;
    const id = tree?.canonicalId?.(rawOrId);
    return profiles[id] || profiles[typeof rawOrId === 'string' ? rawOrId : rawOrId?.subcategory] || profiles[rawOrId?.category] || profiles.other;
  }
  function sanitizeCharacteristics(raw = {}) {
    const value = isRecord(raw) ? { ...raw } : {}, profile = listingProfile(value), allowed = new Set([...profile.primary, ...profile.additional].map(definition => definition.name));
    for (const key of CHARACTERISTIC_FIELDS) if (!allowed.has(key)) delete value[key];
    return value;
  }

  function immutableInput(raw, existing, options = {}) {
    if (!isRecord(existing) || !existing.status || existing.status === 'draft') return raw;
    if (identityLocked(existing,options)) raw=preserveAuctionIdentity(raw,existing);
    const starts = first(existing.startsAt, existing.starts);
    return { ...raw, auctionType: descending(existing) ? 'dutch' : 'english', auctionDirection: existing.auctionDirection || 'ascending', floorPrice: existing.floorPrice, decreaseStep: existing.decreaseStep, decreaseIntervalMinutes: existing.decreaseIntervalMinutes, startMode: existing.startMode || 'now', startsAt: starts,
      ends: existing.ends, durationMinutes: first(existing.durationMinutes, (time(existing.ends) - time(starts)) / 60000),
      startPrice: first(existing.startPrice, existing.start, existing.price),
      stepMode: existing.stepMode || 'fixed', stepValue: first(existing.stepValue, existing.step),
      reservePrice: first(existing.reservePrice, existing.reserve), buyNowPrice: first(existing.buyNowPrice, existing.buyNow),
      deposit: existing.deposit || 0, antiSniping: first(existing.antiSniping, existing.extension, false),
      antiSnipingWindowMinutes: first(existing.antiSnipingWindowMinutes, 2), antiSnipingExtensionMinutes: first(existing.antiSnipingExtensionMinutes, 2)
    };
  }
  function normalise(raw = {}, options = {}) {
    raw = isRecord(raw) ? raw : {};
    const now = nowOf(options);
    const existing = isRecord(options.existing) ? options.existing : null;
    raw = sanitizeCharacteristics(immutableInput(raw, existing, options));
    const startMode = first(raw.startMode, 'now');
    const preservedStart = existing ? time(first(existing.startsAt, existing.starts)) : NaN;
    const requestedStart = time(first(raw.startsAt, raw.starts));
    const starts = startMode === 'scheduled' ? requestedStart : Number.isFinite(preservedStart) && existing.status !== 'draft' ? preservedStart : now;
    const rawDuration = first(raw.durationMinutes, raw.durationHours !== undefined ? number(raw.durationHours) === null ? null : number(raw.durationHours) * 60 : undefined);
    const requestedEnd = time(first(raw.ends, raw.endsAt));
    const duration = rawDuration !== undefined ? number(rawDuration) : Number.isFinite(requestedEnd) && Number.isFinite(starts) ? (requestedEnd - starts) / 60000 : 10080;
    const ends = existing && existing.status && existing.status !== 'draft' ? time(existing.ends) : Number.isFinite(starts) && duration !== null ? starts + duration * 60000 : NaN;
    const startPrice = number(first(raw.startPrice, raw.start, raw.price));
    const auctionDirection = first(raw.auctionDirection, 'ascending'), isDescending = auctionDirection === 'descending';
    const stepMode = isDescending ? 'fixed' : first(raw.stepMode, 'fixed');
    const stepValue = isDescending ? number(raw.decreaseStep) : number(first(raw.stepValue, raw.step, stepMode === 'percent' ? 1 : 100));
    const reservePrice = number(first(raw.reservePrice, raw.reserve));
    const buyNowPrice = number(first(raw.buyNowPrice, raw.buyNow));
    const value = {
      category: text(raw.category), subcategory: text(raw.subcategory), name: text(raw.name), description: text(raw.description),
      condition: text(raw.condition), regionCode: text(raw.regionCode), city: text(raw.city),
      auctionType: isDescending ? 'dutch' : 'english', auctionDirection, floorPrice: isDescending ? number(raw.floorPrice) : null, decreaseStep: isDescending ? number(raw.decreaseStep) : null, decreaseIntervalMinutes: isDescending ? number(raw.decreaseIntervalMinutes) : null, startMode, startsAt: iso(starts), starts: iso(starts), ends: iso(ends), maxEnds: iso(starts + MAX_AUCTION_MS),
      durationMinutes: duration, start: startPrice, startPrice, price: startPrice,
      stepMode, stepValue, step: null, reservePrice: isDescending ? null : reservePrice, buyNowPrice: isDescending ? null : buyNowPrice,
      deposit: number(first(raw.deposit, 0)),
      antiSniping: !isDescending && bool(first(raw.antiSniping, raw.extension, false)),
      antiSnipingWindowMinutes: number(first(raw.antiSnipingWindowMinutes, raw.extensionWindowMinutes, 2)),
      antiSnipingExtensionMinutes: number(first(raw.antiSnipingExtensionMinutes, raw.extensionMinutes, 2)),
      pickup: bool(first(raw.pickup, true)), delivery: bool(first(raw.delivery, false))
    };
    for (const key of optionalText) value[key] = text(raw[key]);
    const profile = listingProfile(raw);
    for (const definition of [...profile.primary, ...profile.additional]) value[definition.name] = ['number', 'year'].includes(definition.type) ? number(raw[definition.name]) : text(raw[definition.name]);
    value.extension = value.antiSniping;
    value.step = isDescending ? value.decreaseStep : increment(value, startPrice);
    return value;
  }

  function validateListing(raw = {}, options = {}) {
    raw = isRecord(raw) ? raw : {};
    const changedIdentity=identityLocked(options.existing,options)?identityChanges(raw,options.existing):[];
    raw = sanitizeCharacteristics(immutableInput(raw, options.existing, options));
    const value = normalise(raw, options), errors = {}, draft = options.draft === true;
    if(changedIdentity.length)errors.identity=hasFinalResult(options.existing)?'По лоту уже сохранён результат. Предмет продажи сохраняется; можно уточнить описание, недостатки, фото и документы.':'После первой ставки предмет продажи и его основные характеристики сохраняются. Можно уточнить описание, недостатки, фото и документы.';
    const now = nowOf(options), starts = time(value.starts), ends = time(value.ends);
    const existing = isRecord(options.existing) ? options.existing : null;
    const checkText = (key, min, max, label) => {
      const content = value[key];
      if ((!draft || present(raw[key])) && (content.length < min || content.length > max)) errors[key] = label + ': от ' + min + ' до ' + max + ' символов.';
    };
    if ((!draft || present(raw.category)) && !CATEGORIES.includes(value.category)) errors.category = 'Выберите категорию имущества.';
    const tree=typeof window!=='undefined'?window.FasCategories:globalThis.FasCategories;
    if(tree&&present(raw.subcategory)){const node=tree.get(value.subcategory);if(!node||node.kind==='group'||!tree.isAuction(value.subcategory)||tree.legacyCategory(value.subcategory)!==value.category)errors.category='Выберите подкатегорию имущества для аукциона.';}
    checkText('name', 3, 150, 'Название');
    checkText('description', 20, 12000, 'Описание');
    checkText('city', 2, 100, 'Город');
    if ((!draft || present(raw.regionCode)) && (!/^\d{2,3}$/.test(value.regionCode) || Array.isArray(options.regionCodes) && !options.regionCodes.includes(value.regionCode))) errors.regionCode = 'Выберите регион хранения имущества.';
    if ((!draft || present(raw.condition)) && !['new', 'used', 'repair'].includes(value.condition)) errors.condition = 'Укажите состояние имущества.';
    if (!['ascending', 'descending'].includes(value.auctionDirection)) errors.auctionDirection = 'Выберите торги на повышение или на понижение.';
    if (present(raw.auctionType) && raw.auctionType !== (descending(value) ? 'dutch' : 'english')) errors.auctionType = 'Тип аукциона не соответствует выбранному направлению.';
    if (descending(value)) {
      const engine = modes();
      if (!engine) errors.auctionDirection = 'Настройки торгов на понижение пока недоступны. Обновите страницу.';
      else { const checked = engine.validate(value); for (const [key,message] of Object.entries(checked.errors)) if (!draft || present(raw[key])) errors[key] = message; }
      if (present(first(raw.reservePrice, raw.reserve))) errors.reservePrice = 'Для торгов на понижение используйте нижний предел цены.';
      if (present(first(raw.buyNowPrice, raw.buyNow))) errors.buyNowPrice = 'На понижении выкуп проходит по текущей цене; отдельную цену выкупа не задают.';
    }
    if (!['now', 'scheduled'].includes(value.startMode)) errors.startMode = 'Выберите немедленный или отложенный старт.';
    if (!Number.isFinite(starts)) errors.startsAt = 'Укажите корректные дату и время начала.';
    const existingStart = existing ? time(first(existing.startsAt, existing.starts)) : NaN;
    const preserveActive = existing && existing.status !== 'draft' && starts === existingStart;
    if (value.startMode === 'scheduled' && Number.isFinite(starts) && starts < now && !preserveActive) errors.startsAt = 'Начало аукциона не может быть в прошлом.';
    if (value.durationMinutes === null || value.durationMinutes < MIN_DURATION_MINUTES || value.durationMinutes > MAX_DURATION_MINUTES) errors.durationMinutes = 'Аукцион длится от 1 часа до 30 суток.';
    if (!Number.isFinite(ends) || Number.isFinite(starts) && (ends - starts < MIN_DURATION_MINUTES * 60000 || ends - starts > MAX_AUCTION_MS)) errors.durationMinutes = 'Аукцион длится от 1 часа до 30 суток.';
    const suppliedEnd = first(raw.ends, raw.endsAt);
    if (present(suppliedEnd) && (!Number.isFinite(time(suppliedEnd)) || Math.abs(time(suppliedEnd) - ends) >= 1)) errors.ends = 'Дата завершения должна соответствовать выбранной длительности.';
    if ((!draft || present(first(raw.startPrice, raw.start, raw.price))) && !positiveMoney(value.start)) errors.startPrice = 'Укажите стартовую цену в целых рублях, больше нуля.';
    if (!['fixed', 'percent'].includes(value.stepMode)) errors.stepMode = 'Выберите фиксированный шаг или процент от текущей цены.';
    if (!descending(value) && value.stepMode === 'fixed' && !positiveMoney(value.stepValue)) errors.stepValue = 'Фиксированный шаг — положительное целое число рублей.';
    if (!descending(value) && value.stepMode === 'percent' && (value.stepValue === null || value.stepValue < 0.1 || value.stepValue > 50)) errors.stepValue = 'Шаг в процентах — от 0,1 до 50%.';
    if (!descending(value) && positiveMoney(value.start) && value.step !== null && !Number.isSafeInteger(value.start + value.step)) errors.stepValue = 'Сумма цены и шага выходит за допустимый числовой диапазон.';
    if (!descending(value) && present(first(raw.reservePrice, raw.reserve)) && (!positiveMoney(value.reservePrice) || positiveMoney(value.start) && value.reservePrice < value.start)) errors.reservePrice = 'Минимальная цена продажи не может быть ниже стартовой.';
    if (!descending(value) && present(first(raw.buyNowPrice, raw.buyNow)) && (!positiveMoney(value.buyNowPrice) || positiveMoney(value.start) && value.buyNowPrice < value.start || value.reservePrice !== null && value.buyNowPrice < value.reservePrice)) errors.buyNowPrice = 'Цена «Купить сейчас» не может быть ниже стартовой и минимальной цены продажи.';
    if (!money(value.deposit) || positiveMoney(value.start) && value.deposit > value.start) errors.deposit = 'Задаток — от 0 до стартовой цены, в целых рублях.';
    if (value.antiSniping && (!Number.isInteger(value.antiSnipingWindowMinutes) || value.antiSnipingWindowMinutes < 1 || value.antiSnipingWindowMinutes > 30)) errors.antiSnipingWindowMinutes = 'Окно автопродления — от 1 до 30 минут.';
    if (value.antiSniping && (!Number.isInteger(value.antiSnipingExtensionMinutes) || value.antiSnipingExtensionMinutes < 1 || value.antiSnipingExtensionMinutes > 30)) errors.antiSnipingExtensionMinutes = 'Продление — от 1 до 30 минут, в пределах 30 суток от старта.';
    if (!value.pickup && !value.delivery && !draft) errors.delivery = 'Выберите самовывоз или доставку.';
    for (const key of optionalText) if (value[key].length > (['inspection', 'documents', 'defects', 'completeness', 'deliveryNotes'].includes(key) ? 4000 : 300)) errors[key] = 'Сократите текст в поле.';
    const profile = listingProfile(raw);
    for (const definition of [...profile.primary, ...profile.additional]) {
      const key = definition.name; if (!present(raw[key])) continue;
      if (['number', 'year'].includes(definition.type)) {
        if (value[key] === null || value[key] < definition.min || value[key] > definition.max || definition.step === 1 && !Number.isInteger(value[key])) errors[key] = 'Укажите корректное число в поле «' + definition.label + '».';
      } else if (definition.type === 'select') {
        if (!Object.hasOwn(definition.options, value[key])) errors[key] = 'Выберите допустимое значение в поле «' + definition.label + '».';
      } else if (value[key].length > definition.maxLength) errors[key] = 'Сократите текст в поле «' + definition.label + '».';
    }
    if (value.floor !== null && value.totalFloors !== null && value.floor > value.totalFloors) errors.floor = 'Этаж объекта не может превышать этажность здания.';
    if (!draft && ['property', 'commercial'].includes(value.category) && (value.area === null || value.area <= 0)) errors.area = 'Укажите площадь объекта больше нуля.';
    return { valid: Object.keys(errors).length === 0, errors, value };
  }

  function increment(lot, currentPrice) {
    if (!isRecord(lot) || descending(lot)) return null;
    const price = number(first(currentPrice, lot.currentPrice, lot.price, lot.start));
    if (!positiveMoney(price)) return null;
    const stepValue = number(first(lot.stepValue, lot.step));
    if (lot.stepMode === 'percent') {
      if (stepValue === null || stepValue < 0.1 || stepValue > 50) return null;
      // Decimal percentages must not gain a ruble through binary floating-point error.
      const [whole, fraction = ''] = String(stepValue).split('.');
      const numerator = BigInt(whole + fraction), denominator = 100n * 10n ** BigInt(fraction.length);
      const exact = (BigInt(price) * numerator + denominator - 1n) / denominator;
      const result = Number(exact > 0n ? exact : 1n);
      return positiveMoney(result) ? result : null;
    }
    return positiveMoney(stepValue) ? stepValue : null;
  }
  function nextBid(lot, currentPrice) {
    if (!isRecord(lot) || descending(lot)) return null;
    const price = number(first(currentPrice, lot.currentPrice, lot.price, lot.start)), step = increment(lot, price);
    return positiveMoney(price) && positiveMoney(step) && positiveMoney(price + step) ? price + step : null;
  }
  function getAuctionState(lot, now = Date.now()) {
    if (!isRecord(lot) || !Number.isFinite(now)) return 'unavailable';
    if (['draft', 'cancelled', 'sold', 'withdrawn'].includes(lot.status)) return lot.status;
    if (present(lot.auctionDirection) && !['ascending','descending'].includes(lot.auctionDirection)) return 'unavailable';
    if (descending(lot) && (!modes() || !modes().quote(lot, now).valid)) return 'unavailable';
    const starts = time(first(lot.startsAt, lot.starts)), ends = time(lot.ends);
    if (!Number.isFinite(starts) || !Number.isFinite(ends) || ends - starts < MIN_DURATION_MINUTES * 60000 || ends > starts + MAX_AUCTION_MS) return 'unavailable';
    if (now >= ends) return 'ended';
    if (lot.status === 'paused') return 'paused';
    if (now < starts) return 'scheduled';
    return 'live';
  }
  function validateBid(lot, price, now = Date.now()) {
    const min = nextBid(lot), step = increment(lot), amount = number(price);
    if (getAuctionState(lot, now) !== 'live') return { valid: false, error: 'Аукцион сейчас не принимает ставки.', min, step };
    if (descending(lot)) return { valid:false, error:'На торгах на понижение подтвердите покупку по текущей цене.', min:null, step:null };
    const instantPrice=number(lot.buyNowPrice);
    if(positiveMoney(instantPrice)&&amount!==null&&amount>=instantPrice)return {valid:false,error:'Ставка достигает цены мгновенной покупки. Выберите «Купить сейчас».',min,step};
    if (!positiveMoney(amount) || min === null || amount < min) return { valid: false, error: 'Ставка должна быть целым числом рублей не ниже следующей цены.', min, step };
    const currentPrice = number(first(lot.currentPrice, lot.price, lot.start));
    if (lot.stepMode !== 'percent' && (amount - currentPrice) % step !== 0) return { valid: false, error: 'Ставка должна быть кратна шагу аукциона.', min, step };
    return { valid: true, error: '', min, step };
  }
  function extendedEnd(lot, now = Date.now()) {
    if (!isRecord(lot)) return '';
    const currentEnd = time(lot.ends), starts = time(first(lot.startsAt, lot.starts));
    if (!Number.isFinite(currentEnd) || !Number.isFinite(starts)) return '';
    if (descending(lot) || !lot.antiSniping || getAuctionState(lot, now) !== 'live') return iso(currentEnd);
    const windowMinutes = number(lot.antiSnipingWindowMinutes), extensionMinutes = number(lot.antiSnipingExtensionMinutes);
    if (windowMinutes === null || windowMinutes < 1 || windowMinutes > 30 || extensionMinutes === null || extensionMinutes < 1 || extensionMinutes > 30 || currentEnd - now > windowMinutes * 60000) return iso(currentEnd);
    return iso(Math.min(starts + MAX_AUCTION_MS, Math.max(currentEnd, now + extensionMinutes * 60000)));
  }

  const api = Object.freeze({ MIN_DURATION_MINUTES, MAX_DURATION_MINUTES, MAX_AUCTION_MS, CATEGORIES: Object.freeze(CATEGORIES), CHARACTERISTIC_FIELDS, IDENTITY_FIELDS, hasActualBids, hasFinalResult, identityLocked, identityChanges, preserveAuctionIdentity, listingProtection, listingProfile, sanitizeCharacteristics, normalise, validateListing, getAuctionState, increment, nextBid, validateBid, extendedEnd });
  globalThis.FasSellerRules = api;
  if (typeof window !== 'undefined') window.FasSellerRules = api;
})();
