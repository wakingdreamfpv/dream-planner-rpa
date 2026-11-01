// Sun times and directions (NOAA sunrise equation), no library needed. Accurate to a minute or two and about a degree.
// angle (sun altitude, degrees): -0.833 sunrise/sunset, -6 civil, -12 nautical, -18 astronomical, +6 end/start of golden hour.
const rad = Math.PI / 180;
function solar(date, lng) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 12));
  const J = d.getTime() / 86400000 + 2440587.5;
  const n = Math.ceil(J - 2451545.0 + 0.0008);
  const Js = n - lng / 360;
  const M = (357.5291 + 0.98560028 * Js) % 360;
  const C = 1.9148 * Math.sin(M * rad) + 0.02 * Math.sin(2 * M * rad) + 0.0003 * Math.sin(3 * M * rad);
  const lam = (M + C + 180 + 102.9372) % 360;
  const Jt = 2451545.0 + Js + 0.0053 * Math.sin(M * rad) - 0.0069 * Math.sin(2 * lam * rad);
  const dec = Math.asin(Math.sin(lam * rad) * Math.sin(23.4397 * rad));
  return { Jt, dec };
}
const toDate = (j) => new Date((j - 2440587.5) * 86400000);
export function sunTimes(date, lat, lng, angle = -0.833) {
  const { Jt, dec } = solar(date, lng);
  const cosH = (Math.sin(angle * rad) - Math.sin(lat * rad) * Math.sin(dec)) / (Math.cos(lat * rad) * Math.cos(dec));
  if (cosH > 1 || cosH < -1) return { rise: null, set: null, dec };
  const H = Math.acos(cosH) / rad;
  return { rise: toDate(Jt - H / 360), set: toDate(Jt + H / 360), dec };
}
// compass bearing (degrees from true north) of the sun at sunrise and sunset
export function sunBearings(date, lat, lng) {
  const { dec } = solar(date, lng);
  const c = (Math.sin(dec) + Math.sin(-0.833 * rad) * Math.sin(lat * rad)) / (Math.cos(-0.833 * rad) * Math.cos(lat * rad));
  if (c > 1 || c < -1) return { rise: null, set: null };
  const az = Math.acos(c) / rad;
  return { rise: az, set: 360 - az };
}
export function daylight(date, lat, lng) {
  const s = sunTimes(date, lat, lng, -0.833), c = sunTimes(date, lat, lng, -6), n = sunTimes(date, lat, lng, -12), g = sunTimes(date, lat, lng, 6);
  const b = sunBearings(date, lat, lng);
  return { sunrise: s.rise, sunset: s.set, firstLight: c.rise, lastLight: c.set, nauticalDawn: n.rise, nauticalDusk: n.set,
    goldenMorningEnd: g.rise, goldenEveningStart: g.set, riseAz: b.rise, setAz: b.set };
}
