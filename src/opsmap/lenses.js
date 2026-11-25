// v7.56: lenses for the drone camera (previs) in the 3D view. Each lens gives a horizontal field of view (FOV) for a
// picture shape (16:9 video, 4:3 photo…). Three ways to describe one:
//   eq      – 35 mm-equivalent focal length (what DJI quote); measured on the diagonal, so the FOV depends on the shape
//   sensorW – real sensor width in mm with the real focal length in mm (Inspire 3 X9 lenses, or your own lens)
//   hfov    – a horizontal FOV in degrees, for fisheye cameras (FPV, GoPro) that a straight lens can only approximate
// `match` picks the lenses offered first for a drone by its name in the fleet.

export const ASPECTS = [['16:9', 16 / 9], ['4:3', 4 / 3], ['3:2', 3 / 2], ['17:9', 17 / 9], ['9:16', 9 / 16]];
export const aspectOf = (k) => (ASPECTS.find((a) => a[0] === k) || ASPECTS[0])[1];

export const LENS_GROUPS = [
  { id: 'o4', name: 'DJI O4 / FPV', match: /\bo4\b|o4 ?air|avata|\bfpv\b|neo|whoop|freestyle|cine ?lift/i },
  { id: 'gopro', name: 'GoPro', match: /gopro|hero ?1\d|cine ?whoop|cine ?lift|fpv/i },
  { id: 'mavic4', name: 'DJI Mavic 4 Pro', match: /mavic ?4/i },
  { id: 'mavic3', name: 'DJI Mavic 3 Pro', match: /mavic ?3/i },
  { id: 'mini', name: 'DJI Mini 4 Pro / Mini 5 Pro', match: /mini ?[45]/i },
  { id: 'inspire3', name: 'DJI Inspire 3 · Zenmuse X9-8K Air (full frame)', match: /inspire/i },
  { id: 'generic', name: 'Typical lenses (35 mm equivalent)', match: null },
];

export const LENSES = [
  { id: 'o4-wide', group: 'o4', name: 'DJI O4 Air Unit / Pro · 155° wide', hfov: 130, aspect: '16:9', fisheye: true },
  { id: 'fpv-120', group: 'o4', name: 'Ultra-wide FPV · ~120°', hfov: 118, aspect: '16:9', fisheye: true },
  { id: 'gopro-wide', group: 'gopro', name: 'GoPro Wide', hfov: 118, aspect: '16:9', fisheye: true },
  { id: 'gopro-linear', group: 'gopro', name: 'GoPro Linear', hfov: 86, aspect: '16:9' },
  { id: 'gopro-narrow', group: 'gopro', name: 'GoPro Narrow', hfov: 62, aspect: '16:9' },
  { id: 'm4-28', group: 'mavic4', name: 'Mavic 4 Pro · 28 mm Hasselblad', eq: 28, aspect: '16:9' },
  { id: 'm4-70', group: 'mavic4', name: 'Mavic 4 Pro · 70 mm medium tele', eq: 70, aspect: '16:9' },
  { id: 'm4-168', group: 'mavic4', name: 'Mavic 4 Pro · 168 mm tele', eq: 168, aspect: '16:9' },
  { id: 'm3-24', group: 'mavic3', name: 'Mavic 3 Pro · 24 mm Hasselblad', eq: 24, aspect: '16:9' },
  { id: 'm3-70', group: 'mavic3', name: 'Mavic 3 Pro · 70 mm medium tele', eq: 70, aspect: '16:9' },
  { id: 'm3-166', group: 'mavic3', name: 'Mavic 3 Pro · 166 mm tele', eq: 166, aspect: '16:9' },
  { id: 'mini-24', group: 'mini', name: 'Mini 4 / 5 Pro · 24 mm', eq: 24, aspect: '16:9' },
  { id: 'mini-48', group: 'mini', name: 'Mini 4 / 5 Pro · 2× zoom (48 mm)', eq: 48, aspect: '16:9' },
  { id: 'i3-18', group: 'inspire3', name: 'Inspire 3 · DL 18 mm', sensorW: 36, focal: 18, aspect: '17:9' },
  { id: 'i3-24', group: 'inspire3', name: 'Inspire 3 · DL 24 mm', sensorW: 36, focal: 24, aspect: '17:9' },
  { id: 'i3-35', group: 'inspire3', name: 'Inspire 3 · DL 35 mm', sensorW: 36, focal: 35, aspect: '17:9' },
  { id: 'i3-50', group: 'inspire3', name: 'Inspire 3 · DL 50 mm', sensorW: 36, focal: 50, aspect: '17:9' },
  { id: 'eq-14', group: 'generic', name: '14 mm · ultra-wide', eq: 14, aspect: '16:9' },
  { id: 'eq-24', group: 'generic', name: '24 mm · wide', eq: 24, aspect: '16:9' },
  { id: 'eq-35', group: 'generic', name: '35 mm · standard wide', eq: 35, aspect: '16:9' },
  { id: 'eq-50', group: 'generic', name: '50 mm · normal', eq: 50, aspect: '16:9' },
  { id: 'eq-85', group: 'generic', name: '85 mm · short tele', eq: 85, aspect: '16:9' },
  { id: 'eq-135', group: 'generic', name: '135 mm · tele', eq: 135, aspect: '16:9' },
];

const DEG = 180 / Math.PI;
// horizontal FOV in degrees for a lens and picture shape (w / h)
export const hfovOf = (lens, aspect) => {
  if (!lens) return 60;
  const a = aspect || aspectOf(lens.aspect);
  if (lens.hfov) return lens.hfov;
  if (lens.sensorW > 0 && lens.focal > 0) {
    // a tall picture (9:16) uses the sensor's short side across
    const w = a < 1 ? (lens.sensorH > 0 ? lens.sensorH : lens.sensorW / (16 / 9)) : lens.sensorW;
    return 2 * Math.atan(w / (2 * lens.focal)) * DEG;
  }
  if (lens.eq > 0) { const halfW = 21.633 * a / Math.hypot(a, 1); return 2 * Math.atan(halfW / lens.eq) * DEG; }
  return 60;
};
// the lens a straight (non-fisheye) view can show: 3D views can't go past about 150° across
export const viewHfov = (h) => Math.max(1, Math.min(150, h));

// lenses for a drone: its own saved cameras, then the built-in ones that match its name, then the rest
export const lensesFor = (droneName, ownCams) => {
  const own = (ownCams || []).map((c, i) => ({ id: 'own-' + i, group: 'own', name: c.name || 'My lens ' + (i + 1), sensorW: Number(c.sensorW) || 0, sensorH: Number(c.sensorH) || 0, focal: Number(c.focal) || 0, aspect: c.aspect || '16:9', own: true }));
  const name = String(droneName || '');
  const hit = LENS_GROUPS.filter((g) => g.match && g.match.test(name)).map((g) => g.id);
  const order = [...hit, ...LENS_GROUPS.map((g) => g.id).filter((id) => !hit.includes(id))];
  const groups = [];
  if (own.length) groups.push({ id: 'own', name: name ? name + ' · your lenses' : 'Your lenses', lenses: own, suggested: true });
  order.forEach((id) => { const g = LENS_GROUPS.find((x) => x.id === id); groups.push({ id, name: g.name, lenses: LENSES.filter((l) => l.group === id), suggested: hit.includes(id) }); });
  return groups;
};
export const findLens = (groups, id) => { for (const g of groups) { const l = g.lenses.find((x) => x.id === id); if (l) return l; } return null; };
export const defaultLens = (groups) => { const g = groups.find((x) => x.suggested) || groups.find((x) => x.id === 'generic'); return g.lenses[0]; };
