/* Device-local media for seller drafts. IndexedDB is not a server upload or shared account storage. */
((root) => {
  'use strict';
  const MiB = 1024 * 1024;
  const constants = Object.freeze({ maxImages: 20, maxVideos: 5, maxTotalBytes: 100 * MiB, maxImageBytes: 10 * MiB, maxVideoBytes: 30 * MiB, maxDecodedPixels: 40000000, maxImageDimension: 2560, conversionTimeoutMs: 15000 });
  const photoAccept = 'image/jpeg,image/png,image/webp,image/gif,image/avif,image/heic,image/heif,image/heic-sequence,image/heif-sequence,image/bmp,image/tiff,.jpg,.jpeg,.png,.webp,.gif,.avif,.heic,.heif,.hif,.bmp,.tif,.tiff';
  const fileAccept = photoAccept + ',video/mp4,video/webm,.mp4,.webm';
  const DB_NAME = 'fas-seller-media-v1', STORE = 'media';
  const urls = new Map(), safeUrls = new Set();
  let databasePromise = null, referencedIds = new Set(), lastHydratedLots = null;
  const validId = id => typeof id === 'string' && /^idb:[A-Za-z0-9_-]{8,128}$/.test(id);
  function owner(value) { if (typeof value !== 'string' || !value.trim() || value.length > 256) throw new Error('Не удалось определить владельца файлов. Откройте кабинет продавца заново.'); return value; }
  const refsFrom = values => (Array.isArray(values) ? values : []).filter(ref => ref && typeof ref === 'object' && validId(ref.id));
  const asIds = values => [...new Set((Array.isArray(values) ? values : []).map(value => typeof value === 'string' ? value : value?.id).filter(validId))];
  function storageError(error) {
    if (error?.name === 'QuotaExceededError') return new Error('В памяти браузера недостаточно места для файлов. Удалите ненужные черновики или выберите файлы меньшего размера.');
    if (error?.name === 'InvalidStateError' || error?.name === 'SecurityError' || error?.name === 'NotAllowedError') return new Error('Браузер не разрешил сохранить файлы на устройстве. Проверьте настройки приватности или откройте сайт в обычном режиме.');
    return new Error('Не удалось сохранить или прочитать файлы на устройстве. Повторите попытку.');
  }
  function openDatabase() {
    if (!root.indexedDB) return Promise.reject(new Error('В этом браузере недоступно локальное хранилище файлов. Откройте сайт в Safari или Chrome.'));
    if (!databasePromise) databasePromise = new Promise((resolve, reject) => {
      let request, rejected = false;
      try { request = root.indexedDB.open(DB_NAME, 1); } catch (error) { reject(storageError(error)); return; }
      request.onupgradeneeded = () => { const db = request.result; if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' }); };
      request.onerror = () => { rejected = true; reject(storageError(request.error)); };
      request.onblocked = () => { rejected = true; reject(new Error('Хранилище файлов открыто в другой вкладке. Закройте другие вкладки ФАС торги и повторите попытку.')); };
      request.onsuccess = () => {
        const db = request.result;
        if (rejected) { db.close(); return; }
        db.onversionchange = () => { db.close(); databasePromise = null; };
        resolve(db);
      };
    }).catch(error => { databasePromise = null; throw error; });
    return databasePromise;
  }
  async function transaction(mode, action) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      let tx, result;
      try { tx = db.transaction(STORE, mode); } catch (error) { reject(storageError(error)); return; }
      tx.oncomplete = () => resolve(result);
      tx.onabort = event => reject(storageError(tx.error || event?.target?.error));
      tx.onerror = event => reject(storageError(tx.error || event?.target?.error));
      try { result = action(tx.objectStore(STORE), tx); } catch (error) { try { tx.abort(); } catch {} reject(storageError(error)); }
    });
  }
  const bytesEqual = (bytes, offset, values) => values.every((value, i) => bytes[offset + i] === value);
  const ascii = (bytes, start, length) => String.fromCharCode(...bytes.slice(start, start + length));
  const uint32 = (bytes, offset, little = false) => little ? bytes[offset] + bytes[offset + 1] * 256 + bytes[offset + 2] * 65536 + bytes[offset + 3] * 16777216 : bytes[offset] * 16777216 + bytes[offset + 1] * 65536 + bytes[offset + 2] * 256 + bytes[offset + 3];
  const uint16 = (bytes, offset, little = false) => little ? bytes[offset] + bytes[offset + 1] * 256 : bytes[offset] * 256 + bytes[offset + 1];
  const conversionError = () => new Error('Браузер не смог открыть эту фотографию. Экспортируйте её в JPEG или PNG в галерее устройства и выберите заново.');
  function conversionTimeout() { const error = new Error('Обработка фотографии заняла больше 15 секунд. Выберите её заново или экспортируйте в JPEG или PNG и повторите попытку.');error.code = 'media-conversion-timeout';return error; }
  function boundedConversion(promise, deadline, options = {}) {
    if (typeof root.setTimeout !== 'function') return Promise.resolve(promise);
    return new Promise((resolve, reject) => {
      let finished = false, expired = false, timer;
      const cleanup = () => { if (timer !== undefined && typeof root.clearTimeout === 'function') root.clearTimeout(timer); };
      const timeout = () => { if (finished) return;finished = true;expired = true;try { options.onTimeout?.(); } catch {}reject(conversionTimeout()); };
      const remaining = deadline - Date.now();if (remaining <= 0) timeout();else timer = root.setTimeout(timeout, remaining);
      Promise.resolve(promise).then(value => {
        if (finished) { if (expired) try { options.onLate?.(value); } catch {}return; }
        finished = true;cleanup();resolve(value);
      }, error => { if (finished) return;finished = true;cleanup();reject(error); });
    });
  }
  const malformedImage = () => new Error('Фотография повреждена или записана не полностью. Выберите исходный файл либо экспортируйте его в JPEG или PNG.');
  function imageDimensions(width, height) {
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) throw malformedImage();
    if (width > constants.maxDecodedPixels / height) throw new Error('Фотография слишком большая по разрешению: максимум 40 мегапикселей. Уменьшите её в галерее и выберите заново.');
  }
  async function inspectRasterDimensions(file, initial, type) {
    // Read dimensions before IDB writes or browser decoding. Original bytes,
    // including GIF/WebP animation, are preserved; compressed size is not a pixel limit.
    const read = async (start, length) => {
      if (start < 0 || length < 1 || start + length > file.size) throw malformedImage();
      if (start + length <= initial.length) return initial.subarray(start, start + length);
      let bytes;try { bytes = new Uint8Array(await file.slice(start, start + length).arrayBuffer()); } catch { throw malformedImage(); }
      if (bytes.length !== length) throw malformedImage();return bytes;
    };
    if (type === 'image/png') {
      const bytes = await read(0, 33);
      if (uint32(bytes, 8) !== 13 || ascii(bytes, 12, 4) !== 'IHDR') throw malformedImage();
      imageDimensions(uint32(bytes, 16), uint32(bytes, 20));return;
    }
    if (type === 'image/gif') {
      const bytes = await read(0, 13);imageDimensions(uint16(bytes, 6, true), uint16(bytes, 8, true));
      // GIF frames may declare dimensions larger than the logical screen. Walk
      // their headers too, skipping compressed subblocks without decoding them.
      let at = 13 + (bytes[10] & 0x80 ? 3 * (1 << ((bytes[10] & 7) + 1)) : 0), blocks = 0, found = false;
      let windowStart = 0, windowBytes = initial;
      const gifRead = async (start, length) => {
        if (start < 0 || start + length > file.size) throw malformedImage();
        if (start < windowStart || start + length > windowStart + windowBytes.length) {
          windowStart = start;windowBytes = await read(start, Math.min(65536, file.size - start));
        }
        return windowBytes.subarray(start - windowStart, start - windowStart + length);
      };
      const skipBlocks = async () => {
        while (++blocks <= 65536) {
          const size = (await gifRead(at++, 1))[0];
          if (!size) return;
          if (at + size > file.size) throw malformedImage();at += size;
        }
        throw malformedImage();
      };
      for (let records = 0; records < 4096 && at < file.size; records++) {
        const kind = (await gifRead(at, 1))[0];
        if (kind === 0x3b) { if (!found) throw malformedImage();return; }
        if (kind === 0x21) { at += 2;await skipBlocks();continue; }
        if (kind !== 0x2c) throw malformedImage();
        const frame = await gifRead(at, 10);imageDimensions(uint16(frame, 5, true), uint16(frame, 7, true));
        at += 10 + (frame[9] & 0x80 ? 3 * (1 << ((frame[9] & 7) + 1)) : 0);
        const codeSize = (await gifRead(at++, 1))[0];if (codeSize < 2 || codeSize > 8) throw malformedImage();
        found = true;await skipBlocks();
      }
      throw malformedImage();
    }
    if (type === 'image/jpeg') {
      const frames = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
      let at = 2;
      for (let markers = 0; markers < 4096 && at < file.size; markers++) {
        const bytes = await read(at, Math.min(12, file.size - at));
        if (bytes[0] !== 0xff) throw malformedImage();
        let index = 1;while (index < bytes.length && bytes[index] === 0xff) index++;
        if (index === bytes.length) { if (bytes.length === 1) throw malformedImage();at += index - 1;continue; }
        const marker = bytes[index++];at += index;
        if (marker === 0x00 || marker === 0xd8 || marker === 0xd9 || marker === 0xda) throw malformedImage();
        if (marker === 0x01 || marker >= 0xd0 && marker <= 0xd7) continue;
        const sizeBytes = await read(at, 2), size = uint16(sizeBytes, 0);
        if (size < 2 || at + size > file.size) throw malformedImage();
        if (frames.has(marker)) {
          if (size < 8) throw malformedImage();const frame = await read(at, 8);
          if (!frame[7] || size < 8 + frame[7] * 3) throw malformedImage();
          imageDimensions(uint16(frame, 5), uint16(frame, 3));return;
        }
        at += size;
      }
      throw malformedImage();
    }
    if (type === 'image/webp') {
      const riff = await read(0, 12), end = uint32(riff, 4, true) + 8;
      if (end > file.size || end < 20) throw malformedImage();
      const uint24 = (bytes, at) => bytes[at] + bytes[at + 1] * 256 + bytes[at + 2] * 65536;
      let at = 12, chunks = 0, found = false;
      while (at < end) {
        if (++chunks > 4096 || at + 8 > end) throw malformedImage();
        const header = await read(at, 8), kind = ascii(header, 0, 4), size = uint32(header, 4, true), body = at + 8;
        if (body + size + size % 2 > end) throw malformedImage();
        if (kind === 'VP8X') {
          if (size < 10) throw malformedImage();const bytes = await read(body, 10);
          imageDimensions(uint24(bytes, 4) + 1, uint24(bytes, 7) + 1);found = true;
        } else if (kind === 'VP8 ') {
          if (size < 10) throw malformedImage();const bytes = await read(body, 10);
          if (!bytesEqual(bytes, 3, [0x9d, 0x01, 0x2a])) throw malformedImage();
          imageDimensions(uint16(bytes, 6, true) & 0x3fff, uint16(bytes, 8, true) & 0x3fff);found = true;
        } else if (kind === 'VP8L') {
          if (size < 5) throw malformedImage();const bytes = await read(body, 5);
          if (bytes[0] !== 0x2f || bytes[4] >> 5) throw malformedImage();
          imageDimensions(1 + bytes[1] + ((bytes[2] & 0x3f) << 8), 1 + (bytes[2] >> 6) + (bytes[3] << 2) + ((bytes[4] & 0x0f) << 10));found = true;
        } else if (kind === 'ANMF') {
          if (size < 16) throw malformedImage();const bytes = await read(body, 16);
          imageDimensions(uint24(bytes, 6) + 1, uint24(bytes, 9) + 1);
        }
        at = body + size + size % 2;
      }
      if (!found) throw malformedImage();
    }
  }
  function boxHeader(bytes, at, end) {
    if (at + 8 > end) throw malformedImage();
    let size = uint32(bytes, at), header = 8;
    if (size === 1) { if (at + 16 > end || uint32(bytes, at + 8) !== 0) throw malformedImage(); size = uint32(bytes, at + 12); header = 16; }
    if (size === 0) size = end - at;
    if (size < header || at + size > end) throw malformedImage();
    return { size, header, type: ascii(bytes, at + 4, 4) };
  }
  function inspectImageDimensions(bytes, type) {
    if (type === 'image/bmp') {
      if (bytes.length < 26) throw malformedImage();
      const dib = uint32(bytes, 14, true);
      if (dib === 12) imageDimensions(uint16(bytes, 18, true), uint16(bytes, 20, true));
      else {
        if (dib < 40 || dib > bytes.length - 14 || bytes.length < 54) throw malformedImage();
        const width = uint32(bytes, 18, true), rawHeight = uint32(bytes, 22, true), height = rawHeight > 2147483647 ? 4294967296 - rawHeight : rawHeight;
        imageDimensions(width, height);
      }
    } else if (type === 'image/tiff') {
      if (bytes.length < 8) throw malformedImage();
      const little = bytes[0] === 73, offset = uint32(bytes, 4, little);
      if (offset < 8 || offset + 2 > bytes.length) throw malformedImage();
      const count = uint16(bytes, offset, little);if (offset + 2 + count * 12 + 4 > bytes.length) throw malformedImage();
      let width = 0, height = 0;
      for (let i = 0; i < count; i++) {
        const at = offset + 2 + i * 12, tag = uint16(bytes, at, little), format = uint16(bytes, at + 2, little);
        if ((tag !== 256 && tag !== 257) || uint32(bytes, at + 4, little) !== 1 || ![3, 4].includes(format)) continue;
        const value = format === 3 ? uint16(bytes, at + 8, little) : uint32(bytes, at + 8, little);if (tag === 256) width = value;else height = value;
      }
      imageDimensions(width, height);
    } else {
      let boxes = 0;
      function walk(start, end, depth) {
        if (depth > 8) throw malformedImage();
        for (let at = start; at < end;) {
          if (++boxes > 10000) throw malformedImage();
          const box = boxHeader(bytes, at, end), data = at + box.header;
          if (box.type === 'ispe') { if (box.size < box.header + 12) throw malformedImage();imageDimensions(uint32(bytes, data + 4), uint32(bytes, data + 8)); }
          else if (['meta', 'iprp', 'ipco'].includes(box.type)) { const child = data + (box.type === 'meta' ? 4 : 0);if (child > at + box.size) throw malformedImage();walk(child, at + box.size, depth + 1); }
          at += box.size;
        }
      }
      walk(0, bytes.length, 0);
    }
  }
  async function ftypImageType(file, initial) {
    if (ascii(initial, 4, 4) !== 'ftyp') return '';
    let size = uint32(initial, 0), header = 8;
    if (size === 1 && initial.length >= 16 && uint32(initial, 8) === 0) { size = uint32(initial, 12);header = 16; }
    const end = Math.min(Number.isFinite(size) && size > 0 ? size : 64, file.size, 4096);
    const bytes = end <= initial.length ? initial.slice(0, end) : new Uint8Array(await file.slice(0, end).arrayBuffer());
    const brands = [ascii(bytes, header, 4)];for (let at = header + 8; at + 4 <= bytes.length; at += 4) brands.push(ascii(bytes, at, 4));
    const type = brands.some(brand => ['avif', 'avis'].includes(brand)) ? 'image/avif' : brands.some(brand => ['heic', 'heix', 'hevc', 'hevx'].includes(brand)) ? 'image/heic' : brands.some(brand => ['mif1', 'msf1'].includes(brand)) ? 'image/heif' : '';
    if (type && (size < header + 8 || size > file.size || size > 4096 || (size - header) % 4 !== 0)) throw malformedImage();
    return type;
  }
  async function inspectFile(file) {
    if (!file || typeof file.slice !== 'function' || !Number.isFinite(file.size) || file.size <= 0) throw new Error('Выберите непустые фотографии или видеофайлы.');
    let bytes;
    try { bytes = new Uint8Array(await file.slice(0, 64).arrayBuffer()); } catch { throw new Error('Не удалось прочитать один из файлов. Выберите его заново.'); }
    let type = '';
    if (bytesEqual(bytes, 0, [255, 216, 255])) type = 'image/jpeg';
    else if (bytesEqual(bytes, 0, [137, 80, 78, 71, 13, 10, 26, 10])) type = 'image/png';
    else if (['GIF87a', 'GIF89a'].includes(ascii(bytes, 0, 6))) type = 'image/gif';
    else if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') type = 'image/webp';
    else if (ascii(bytes, 0, 2) === 'BM') type = 'image/bmp';
    else if (bytesEqual(bytes, 0, [73, 73, 42, 0]) || bytesEqual(bytes, 0, [77, 77, 0, 42])) type = 'image/tiff';
    else type = await ftypImageType(file, bytes);
    if (!type && ascii(bytes, 4, 4) === 'ftyp' && ['isom', 'iso2', 'iso3', 'iso4', 'iso5', 'iso6', 'mp41', 'mp42', 'avc1', 'avc2', 'M4V ', 'MSNV', 'dash'].includes(ascii(bytes, 8, 4))) type = 'video/mp4';
    else if (!type && bytesEqual(bytes, 0, [26, 69, 223, 163]) && ascii(bytes, 4, bytes.length - 4).includes('webm')) type = 'video/webm';
    if (!type) throw new Error('Поддерживаются фото JPG, PNG, WebP, GIF и видео MP4, WebM. AVIF, HEIC/HEIF, BMP и TIFF доступны, если браузер умеет их открывать. SVG и документы не принимаются.');
    const declared = String(file.type || '').toLowerCase().split(';')[0].trim(), aliases = { 'image/jpeg': ['image/jpg', 'image/pjpeg'], 'image/avif': ['image/avif-sequence'], 'image/heic': ['image/heif', 'image/heic-sequence', 'image/heif-sequence'], 'image/heif': ['image/heic', 'image/heic-sequence', 'image/heif-sequence'], 'image/bmp': ['image/x-bmp', 'image/x-ms-bmp'], 'image/tiff': ['image/x-tiff'] };
    if (declared && !['application/octet-stream', type, ...(aliases[type] || [])].includes(declared)) throw new Error('Содержимое одного из файлов не соответствует его формату. Выберите исходную фотографию или видео.');
    const kind = type.startsWith('image/') ? 'image' : 'video';
    if (file.size > (kind === 'image' ? constants.maxImageBytes : constants.maxVideoBytes)) throw new Error(kind === 'image' ? 'Одна фотография должна быть не больше 10 МБ.' : 'Одно видео должно быть не больше 30 МБ.');
    if (['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(type)) await inspectRasterDimensions(file, bytes, type);
    const name = String(file.name || (kind === 'image' ? 'Фотография' : 'Видео')).replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 160);
    return { file, kind, type, name, size: file.size, sourceSize: file.size };
  }
  async function decodedImage(blob, deadline) {
    if (typeof root.createImageBitmap === 'function') {
      try { const bitmap = await boundedConversion(root.createImageBitmap(blob, { imageOrientation: 'from-image' }), deadline, { onLate: bitmap => bitmap?.close?.() });return { image: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close?.() }; }
      catch (error) { if (error?.code === 'media-conversion-timeout') throw error; }
    }
    if (!root.URL?.createObjectURL || !root.URL?.revokeObjectURL) throw conversionError();
    const image = typeof root.Image === 'function' ? new root.Image() : root.document?.createElement?.('img');if (!image) throw conversionError();
    let url;
    try { url = root.URL.createObjectURL(blob); } catch { throw conversionError(); }
    let released = false;
    const release = () => { if (released) return;released = true;image.onload = null;image.onerror = null;try { image.removeAttribute?.('src'); } catch {}root.URL.revokeObjectURL(url); };
    const loaded = new Promise((resolve, reject) => {
      image.onload = () => resolve({ image, width: image.naturalWidth || image.width, height: image.naturalHeight || image.height, release });
      image.onerror = () => { release();reject(conversionError()); };
      try { image.src = url; } catch { release();reject(conversionError()); }
    });
    return boundedConversion(loaded, deadline, { onTimeout: release, onLate: decoded => decoded.release() });
  }
  async function normalizeImage(item) {
    if (!['image/avif', 'image/heic', 'image/heif', 'image/bmp', 'image/tiff'].includes(item.type)) return item;
    let bytes;try { bytes = new Uint8Array(await item.file.slice(0, item.file.size).arrayBuffer()); } catch { throw malformedImage(); }
    inspectImageDimensions(bytes, item.type);
    const deadline = Date.now() + constants.conversionTimeoutMs, decoded = await decodedImage(new Blob([item.file], { type: item.type }), deadline);let canvas;
    try {
      imageDimensions(decoded.width, decoded.height);
      const ratio = Math.min(1, constants.maxImageDimension / Math.max(decoded.width, decoded.height)), width = Math.max(1, Math.round(decoded.width * ratio)), height = Math.max(1, Math.round(decoded.height * ratio));
      canvas = root.document?.createElement?.('canvas') || (typeof root.OffscreenCanvas === 'function' ? new root.OffscreenCanvas(width, height) : null);if (!canvas) throw conversionError();
      canvas.width = width;canvas.height = height;const context = canvas.getContext?.('2d', { alpha: false });if (!context) throw conversionError();
      context.fillStyle = '#fff';context.fillRect(0, 0, width, height);context.drawImage(decoded.image, 0, 0, width, height);
      const encoding = typeof canvas.convertToBlob === 'function' ? canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 }) : new Promise((resolve, reject) => { if (typeof canvas.toBlob !== 'function') { reject(conversionError());return; }canvas.toBlob(resolve, 'image/jpeg', 0.85); });
      const file = await boundedConversion(encoding, deadline);
      if (!file || file.type !== 'image/jpeg' || !Number.isFinite(file.size) || file.size <= 0) throw conversionError();
      if (file.size > constants.maxImageBytes) throw new Error('После обработки фотография больше 10 МБ. Уменьшите её в галерее и выберите заново.');
      if (!bytesEqual(new Uint8Array(await file.slice(0, 3).arrayBuffer()), 0, [255, 216, 255])) throw conversionError();
      return { ...item, file, type: 'image/jpeg', sourceType: item.type, name: (item.name.replace(/\.[^.]+$/, '') || 'Фотография') + '.jpg', size: file.size };
    } catch (error) { if (error?.code === 'media-conversion-timeout' || /40 мегапикселей|10 МБ|повреждена/.test(error?.message || '')) throw error;throw conversionError(); }
    finally { decoded.release();if (canvas) { canvas.width = 1;canvas.height = 1; } }
  }
  function checkTotals(items) {
    if (items.filter(item => item.kind === 'image').length > constants.maxImages) throw new Error('В одном лоте можно разместить до 20 фотографий.');
    if (items.filter(item => item.kind === 'video').length > constants.maxVideos) throw new Error('В одном лоте можно разместить до 5 видео.');
    if (items.reduce((sum, item) => sum + item.size, 0) > constants.maxTotalBytes || items.reduce((sum, item) => sum + (Number.isFinite(item.sourceSize) && item.sourceSize > 0 ? item.sourceSize : item.size), 0) > constants.maxTotalBytes) throw new Error('Общий размер фотографий и видео одного лота должен быть не больше 100 МБ.');
  }
  async function validateFiles(files, existingRefs = []) {
    const list = Array.from(files || []);
    if (list.length > constants.maxImages + constants.maxVideos) throw new Error('В одном лоте можно разместить до 20 фото и 5 видео.');
    const inspected = [];for (const file of list) inspected.push(await inspectFile(file));
    const existing = refsFrom(existingRefs).filter(ref => ['image', 'video'].includes(ref.kind) && Number.isFinite(ref.size) && ref.size > 0);
    checkTotals([...existing, ...inspected]);
    const normalized = [];for (const item of inspected) normalized.push(await normalizeImage(item));
    checkTotals([...existing, ...normalized]);return normalized;
  }
  const createId = () => 'idb:' + (root.crypto?.randomUUID?.() || Date.now().toString(36) + '_' + Math.random().toString(36).slice(2) + '_' + Math.random().toString(36).slice(2));
  async function storeFiles(files, ownerId, options = {}) {
    owner(ownerId);
    const inspected = await validateFiles(files, options.existingRefs || []);
    if (!inspected.length) return [];
    const records = inspected.map(item => ({ id: createId(), ownerId, kind: item.kind, type: item.type, name: item.name, size: item.size, sourceSize: item.sourceSize, ...(item.sourceType ? { sourceType: item.sourceType } : {}), createdAt: Date.now(), blob: new Blob([item.file], { type: item.type }) }));
    await transaction('readwrite', store => { records.forEach(record => store.add(record)); });
    return records.map(({ id, kind, type, name, size, sourceSize, sourceType }) => ({ id, kind, type, name, size, sourceSize, ...(sourceType ? { sourceType } : {}) }));
  }
  async function readRecords(ids) {
    const records = [];
    await transaction('readonly', store => { ids.forEach((id, index) => { const request = store.get(id); request.onsuccess = () => { records[index] = request.result; }; }); });
    return records;
  }
  async function getMedia(refs, options = {}) {
    const valid = refsFrom(refs);
    if (!valid.length) return [];
    const ownerId = owner(options.ownerId);
    const records = await readRecords(valid.map(ref => ref.id));
    const media = [];
    for (let i = 0; i < valid.length; i++) {
      const record = records[i];
      if (!record || !record.blob || !['image', 'video'].includes(record.kind) || record.ownerId !== ownerId) continue;
      let entry = urls.get(record.id);
      if (!entry) {
        let url;
        try { url = root.URL.createObjectURL(record.blob); } catch { throw new Error('Браузер не смог открыть сохранённый файл. Перезагрузите страницу.'); }
        entry = { url, ownerId: record.ownerId }; urls.set(record.id, entry); safeUrls.add(url);
      }
      media.push({ url: entry.url, type: record.kind, label: record.name, ref: record.id });
    }
    return media;
  }
  async function hydrateLots(cars) {
    const lots = Array.isArray(cars) ? cars : [];
    lastHydratedLots = lots;
    referencedIds = new Set(lots.flatMap(lot => refsFrom(lot?.mediaRefs).map(ref => ref.id)));
    await Promise.all(lots.filter(lot => refsFrom(lot?.mediaRefs).length).map(async lot => {
      const refs = refsFrom(lot.mediaRefs);
      const ownerId = lot.sellerOwnerId || lot.ownerId;
      const media = typeof ownerId === 'string' && ownerId.trim() && ownerId.length <= 256 ? await getMedia(refs, { ownerId }) : [];
      const remote = (Array.isArray(lot.media) ? lot.media : []).filter(item => { const url = typeof item === 'string' ? item : item?.url; return typeof url === 'string' && !url.startsWith('blob:') && !item?.ref; });
      lot.media = [...media, ...remote];
      const image = media.find(item => item.type === 'image');
      if (image) lot.image = image.url;
      else if (typeof lot.image !== 'string' || lot.image.startsWith('blob:')) lot.image = 'assets/' + (/^(cars|trucks|machinery|equipment|property|commercial|vessels|other)$/.test(lot.category) ? lot.category : 'other') + '.svg';
      lot.mediaMissingCount = refs.length - media.length;
    }));
    return cars;
  }
  function releaseUrls(ids) {
    for (const id of asIds(ids)) {
      const entry = urls.get(id);
      if (!entry) continue;
      root.URL.revokeObjectURL(entry.url); safeUrls.delete(entry.url); urls.delete(id);
    }
  }
  function revokeAll() { releaseUrls([...urls.keys()]); }
  function serializeLot(lot) {
    if (!lot || typeof lot !== 'object') return lot;
    const clean = { ...lot };
    if (typeof clean.image === 'string' && clean.image.startsWith('blob:')) clean.image = 'assets/' + (/^(cars|trucks|machinery|equipment|property|commercial|vessels|other)$/.test(clean.category) ? clean.category : 'other') + '.svg';
    if (Array.isArray(clean.media)) clean.media = clean.media.filter(item => { const url = typeof item === 'string' ? item : item?.url; return typeof url === 'string' && !url.startsWith('blob:'); });
    return clean;
  }
  async function deleteMedia(ids, ownerId, options = {}) {
    owner(ownerId);
    const requested = asIds(ids), protectedIds = new Set([...referencedIds, ...asIds(options.keepRefs || [])]);
    const deleted = [], kept = [];
    if (!requested.length) return { deleted, kept };
    await transaction('readwrite', store => {
      requested.forEach(id => {
        const request = store.get(id);
        request.onsuccess = () => {
          const record = request.result;
          if (record && record.ownerId === ownerId && !protectedIds.has(id)) { store.delete(id); deleted.push(id); }
          else kept.push(id);
        };
      });
    });
    releaseUrls(deleted);
    return { deleted, kept };
  }
  root.addEventListener?.('pagehide', event => { if (!event.persisted) revokeAll(); });
  root.addEventListener?.('pageshow', async event => {
    if (!event.persisted || !lastHydratedLots) return;
    const emit = (name, detail) => { if (typeof root.CustomEvent === 'function' && typeof root.dispatchEvent === 'function') root.dispatchEvent(new root.CustomEvent(name, { detail })); };
    try { await hydrateLots(lastHydratedLots); emit('fas-seller-media-restored', {}); }
    catch (error) { emit('fas-seller-media-error', { message: error.message }); }
  });
  root.FasSellerMedia = Object.freeze({ constants, photoAccept, fileAccept, validateFiles, storeFiles, getMedia, hydrateLots, serializeLot, deleteMedia, releaseUrls, revokeAll, isSafeObjectUrl: url => typeof url === 'string' && safeUrls.has(url) });
})(typeof window === 'undefined' ? globalThis : window);
