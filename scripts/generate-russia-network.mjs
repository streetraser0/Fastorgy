import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Offline, deterministic artwork: Natural Earth geometry + the site's existing
// approximate administrative-center reference points. No runtime map service.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const feature = JSON.parse(fs.readFileSync(path.join(root, 'design/geography/russia-natural-earth-110m.geojson'), 'utf8'));
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(root, 'dist/geo-data.js'), 'utf8') + ';globalThis.centers=REGION_CENTERS;', context);
const centers = Object.entries(context.centers).sort(([a], [b]) => Number(a) - Number(b));
if (centers.length !== 85 || !context.centers['77']) throw new Error('Expected 85 regional centers including Moscow (77).');

// Albers equal-area conic, centered on Russia; longitudes across the date line
// stay continuous so Chukotka is beside the rest of the country.
const rad = Math.PI / 180;
const phi1 = 50 * rad, phi2 = 70 * rad, phi0 = 60 * rad;
const n = (Math.sin(phi1) + Math.sin(phi2)) / 2;
const c = Math.cos(phi1) ** 2 + 2 * n * Math.sin(phi1);
const rho0 = Math.sqrt(c - 2 * n * Math.sin(phi0)) / n;
function project([longitude, latitude]) {
  const lon = longitude < 0 ? longitude + 360 : longitude;
  const theta = n * (lon - 105) * rad;
  const rho = Math.sqrt(c - 2 * n * Math.sin(latitude * rad)) / n;
  return [rho * Math.sin(theta), rho * Math.cos(theta) - rho0];
}
const rings = feature.geometry.coordinates.flatMap(polygon => polygon.map(ring => ring.map(project)));
const points = centers.map(([id, [lat, lon]]) => ({id, point: project([lon, lat])}));
const all = [...rings.flat(), ...points.map(p => p.point)];
const xs = all.map(p => p[0]), ys = all.map(p => p[1]);
const xmin = Math.min(...xs), xmax = Math.max(...xs), ymin = Math.min(...ys), ymax = Math.max(...ys);
const width = 720, height = 420, padding = 20;
const scale = Math.min((width - padding * 2) / (xmax - xmin), (height - padding * 2) / (ymax - ymin));
const ox = (width - (xmax - xmin) * scale) / 2;
const oy = (height - (ymax - ymin) * scale) / 2;
const fit = ([x, y]) => [ox + (x - xmin) * scale, oy + (y - ymin) * scale];
const f = value => Number(value.toFixed(2));
const pair = point => point.map(f).join(',');
const outline = rings.map(ring => 'M' + ring.map(p => pair(fit(p))).join('L') + 'Z').join('');
const hub = fit(points.find(p => p.id === '77').point);
const links = points.filter(p => p.id !== '77').map(({id, point}) => {
  const end = fit(point);
  const dx = end[0] - hub[0], dy = end[1] - hub[1];
  const bend = Math.min(36, Math.hypot(dx, dy) * 0.13);
  const length = Math.hypot(dx, dy) || 1;
  const control = [(hub[0] + end[0]) / 2 + dy / length * bend, (hub[1] + end[1]) / 2 - dx / length * bend];
  return `    <path data-region="${id}" d="M${pair(hub)}Q${pair(control)} ${pair(end)}"/>`;
}).join('\n');
const dots = points.filter(p => p.id !== '77').map(({id, point}) => {
  const [x, y] = fit(point);
  return `    <circle data-region="${id}" cx="${f(x)}" cy="${f(y)}" r="1.8"/>`;
}).join('\n');
const labelX = f(hub[0] + 12), labelY = f(hub[1] - 13);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="420" viewBox="0 0 720 420" role="img" aria-labelledby="map-title map-desc">
  <title id="map-title">Россия — связи регионов с Москвой</title>
  <desc id="map-desc">Декоративная схема: географический контур Natural Earth и 85 справочных региональных точек, включая Москву. Линии не обозначают маршруты или наличие услуг.</desc>
  <g id="russia-outline" fill="#EAF3FF" stroke="#0868E8" stroke-width="1.1" stroke-linejoin="round" fill-rule="evenodd">
    <path d="${outline}"/>
  </g>
  <g id="regional-connections" fill="none" stroke="#0868E8" stroke-width="0.85" stroke-opacity="0.26" stroke-linecap="round">
${links}
  </g>
  <g id="regional-centers" fill="#0868E8" fill-opacity="0.86" stroke="#FFFFFF" stroke-width="0.5">
${dots}
  </g>
  <g id="moscow-hub" data-region="77">
    <circle cx="${f(hub[0])}" cy="${f(hub[1])}" r="9" fill="#0868E8" fill-opacity="0.1"/>
    <circle cx="${f(hub[0])}" cy="${f(hub[1])}" r="4.5" fill="#0868E8" stroke="#FFFFFF" stroke-width="1.6"/>
    <text x="${labelX}" y="${labelY}" font-family="Arial, sans-serif" font-size="17" font-weight="700" fill="#0868E8" stroke="#FFFFFF" stroke-width="4" stroke-linejoin="round" paint-order="stroke">Москва</text>
  </g>
</svg>
`;
const destination = path.join(root, 'dist/assets/russia-network.svg');
fs.writeFileSync(destination, svg, 'utf8');
console.log(JSON.stringify({asset: path.relative(root, destination), bytes: Buffer.byteLength(svg), centers: centers.length, connections: points.length - 1, projection: 'Albers equal-area conic (50°, 70°, 105°E)'}, null, 2));
