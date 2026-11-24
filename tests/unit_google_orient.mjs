// v7.50: Google's 3D city must face the same way as the plan (east +x, north -z in the 3D view). The 3D view holds the
// library's tile group in a holder turned half a circle (Ops3D.jsx, googleTiles); this checks that against the real
// library maths, so a library update that changes its frame is caught.
import { Group, Vector3 } from 'three';
import { WGS84_ELLIPSOID } from '3d-tiles-renderer/three';
import { ReorientationPlugin } from '3d-tiles-renderer/three/plugins';
const R = Math.PI / 180, lat = -27.99, lon = 153.43; let fails = 0;
const tiles = { group: new Group(), ellipsoid: WGS84_ELLIPSOID, root: {}, addEventListener() {}, removeEventListener() {} };
new ReorientationPlugin({ lat: lat * R, lon: lon * R, height: 0, recenter: true }).init(tiles);
const root = new Group(); root.rotation.y = Math.PI; root.add(tiles.group); root.updateMatrixWorld(true);
const at = (la, lo) => { const v = new Vector3(); WGS84_ELLIPSOID.getCartographicToPosition(la * R, lo * R, 0, v); return v.applyMatrix4(tiles.group.matrixWorld); };
const check = (name, ok, got) => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : ' ' + JSON.stringify(got))); if (!ok) fails++; };
const e = at(lat, lon + 100 / (111320 * Math.cos(lat * R))), n = at(lat + 100 / 111320, lon), o = at(lat, lon);
check('the take-off point is at the middle', o.length() < 0.5, o);
check('100 m east lands at x ≈ +100', Math.abs(e.x - 100) < 1 && Math.abs(e.z) < 1, e);
check('100 m north lands at z ≈ -100', Math.abs(n.z + 100) < 1 && Math.abs(n.x) < 1, n);
console.log(fails ? 'FAILS ' + fails : 'ALL PASS');
