// v7.27: ground heights and satellite imagery for the advanced ops map.
// Ground: free public terrain tiles (AWS "Terrarium", no key; Australian coverage is about 5–30 m detail) read in the
// browser, with Open-Meteo's elevation service as a backup. Imagery: Esri World Imagery tiles, for the 3D ground.
// Both are best-effort: if they can't be reached the map still works, flat and without imagery.

const tileCache = new Map();
const TERRARIUM = (z, x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
const ESRI = (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;

export const lngToX = (lng, z) => ((lng + 180) / 360) * 2 ** z;
export const latToY = (lat, z) => { const r = (lat * Math.PI) / 180; return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z; };
export const xToLng = (x, z) => (x / 2 ** z) * 360 - 180;
export const yToLat = (y, z) => { const n = Math.PI - (2 * Math.PI * y) / 2 ** z; return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))); };

const loadImg = (url) => new Promise((res, rej) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = () => rej(new Error('tile ' + url)); i.src = url; });

// a Terrarium tile as a 256×256 grid of metres above sea level
const terrTile = (z, x, y) => {
  const k = z + '/' + x + '/' + y;
  if (!tileCache.has(k)) tileCache.set(k, loadImg(TERRARIUM(z, x, y)).then((img) => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 256; const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, 256, 256).data, out = new Float32Array(256 * 256);
    for (let i = 0; i < out.length; i++) out[i] = d[i * 4] * 256 + d[i * 4 + 1] + d[i * 4 + 2] / 256 - 32768;
    return out;
  }).catch((e) => { tileCache.delete(k); throw e; }));
  return tileCache.get(k);
};

async function fromTiles(lls, z) {
  const need = new Map();
  const at = lls.map(([lat, lng]) => { const fx = lngToX(lng, z) * 256 - 0.5, fy = latToY(lat, z) * 256 - 0.5; return { fx, fy }; });
  const key = (px, py) => { const tx = Math.floor(px / 256), ty = Math.floor(py / 256); const k = tx + '/' + ty; if (!need.has(k)) need.set(k, terrTile(z, tx, ty)); return k; };
  at.forEach(({ fx, fy }) => { const x0 = Math.floor(fx), y0 = Math.floor(fy); key(x0, y0); key(x0 + 1, y0); key(x0, y0 + 1); key(x0 + 1, y0 + 1); });
  const tiles = new Map(); await Promise.all([...need.entries()].map(async ([k, p]) => tiles.set(k, await p)));
  const px = (x, y) => { const tx = Math.floor(x / 256), ty = Math.floor(y / 256); const t = tiles.get(tx + '/' + ty); return t[(y - ty * 256) * 256 + (x - tx * 256)]; };
  return at.map(({ fx, fy }) => { // bilinear between the four nearest samples
    const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    const a = px(x0, y0), b = px(x0 + 1, y0), c = px(x0, y0 + 1), d = px(x0 + 1, y0 + 1);
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  });
}

async function fromOpenMeteo(lls) {
  const out = [];
  for (let i = 0; i < lls.length; i += 100) {
    const part = lls.slice(i, i + 100);
    const u = 'https://api.open-meteo.com/v1/elevation?latitude=' + part.map((q) => q[0].toFixed(6)).join(',') + '&longitude=' + part.map((q) => q[1].toFixed(6)).join(',');
    const r = await fetch(u); if (!r.ok) throw new Error('Open-Meteo ' + r.status);
    const j = await r.json(); if (!j || !Array.isArray(j.elevation) || j.elevation.length !== part.length) throw new Error('Open-Meteo: no elevations');
    out.push(...j.elevation);
  }
  return out;
}

// ground height (m above sea level) at each [lat, lng]; { elev, src } or throws if nothing can be reached
export async function elevations(lls) {
  if (!lls.length) return { elev: [], src: '' };
  if (typeof window !== 'undefined' && window.__WD_TERRAIN) return window.__WD_TERRAIN(lls); // tests
  try { return { elev: await fromTiles(lls, 15), src: 'public terrain data' }; }
  catch (e) { return { elev: await fromOpenMeteo(lls), src: 'Open-Meteo elevation' }; }
}

// satellite imagery for a lat/lng box, stitched into one canvas in Web Mercator; { canvas, z, x0, y0 } (x0/y0 in
// global pixels at zoom z) so callers can map any lat/lng onto it. Resolves null if the imagery can't be reached.
export async function satelliteCanvas([s, w, n, e], maxPx = 2048) {
  if (typeof window !== 'undefined' && window.__WD_SAT === false) return null;
  let z = 19;
  while (z > 12 && Math.max((lngToX(e, z) - lngToX(w, z)) * 256, (latToY(s, z) - latToY(n, z)) * 256) > maxPx) z--;
  const x0 = lngToX(w, z) * 256, y0 = latToY(n, z) * 256, x1 = lngToX(e, z) * 256, y1 = latToY(s, z) * 256;
  const c = document.createElement('canvas'); c.width = Math.max(2, Math.ceil(x1 - x0)); c.height = Math.max(2, Math.ceil(y1 - y0));
  const g = c.getContext('2d'); g.fillStyle = '#cbd5e1'; g.fillRect(0, 0, c.width, c.height);
  const jobs = [];
  for (let tx = Math.floor(x0 / 256); tx <= Math.floor(x1 / 256); tx++) for (let ty = Math.floor(y0 / 256); ty <= Math.floor(y1 / 256); ty++) {
    jobs.push(loadImg(ESRI(z, tx, ty)).then((img) => { g.drawImage(img, tx * 256 - x0, ty * 256 - y0, 256, 256); return 1; }, () => 0));
  }
  const ok = (await Promise.all(jobs)).reduce((a, b) => a + b, 0);
  return ok ? { canvas: c, z, x0, y0, tiles: ok } : null;
}
