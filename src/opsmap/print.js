// v7.9: draws the advanced ops map in the PDF print window. This function is turned into text (toString) and run
// inside the print page, so it must not use anything from this module: only its arguments and Leaflet (L).
// OM: { mode, zones:[{shape,pts,c,r,color,stroke,fill,dash,tag,name,buffer}], paths:[{legs:[{a,b,color,dash}],pts:[[lat,lng,alt]]}],
//       points:[{kind,lat,lng,title,text,size}], overlay:{src,center,widthM,rot,opacity,aspect}|null }
export function opsAdvPrint(OM, imagery) {
  var el = document.getElementById('opsadv'); if (!el || typeof L === 'undefined') return;
  var plan = OM.mode === 'plan';
  var mo = { zoomControl: false, attributionControl: !plan, zoomSnap: 0, fadeAnimation: false, zoomAnimation: false, dragging: false, scrollWheelZoom: false };
  if (plan) mo.crs = L.CRS.Simple;
  var m = L.map(el, mo);
  var east = function (ll, d) { return plan ? [ll[0], ll[1] + d] : [ll[0], ll[1] + d / (111320 * Math.cos(ll[0] * Math.PI / 180))]; };
  var north = function (ll, d) { return plan ? [ll[0] + d, ll[1]] : [ll[0] + d / 110574, ll[1]]; };
  var all = [];
  OM.zones.forEach(function (z) { if (z.shape === 'circle') { all.push(east(z.c, z.r + (z.buffer || 0)), east(z.c, -z.r - (z.buffer || 0)), north(z.c, z.r + (z.buffer || 0)), north(z.c, -z.r - (z.buffer || 0))); } else z.pts.forEach(function (p) { all.push(p); }); });
  OM.paths.forEach(function (p) { p.pts.forEach(function (q) { all.push([q[0], q[1]]); }); });
  OM.points.forEach(function (p) { all.push([p.lat, p.lng]); });
  if (OM.overlay) { var o = OM.overlay, hw = o.widthM / 2, hh = o.widthM * (o.aspect || 1) / 2; all.push(north(east(o.center, -hw), -hh), north(east(o.center, hw), hh)); }
  if (all.length > 1) m.fitBounds(L.latLngBounds(all).pad(0.08), { animate: false, maxZoom: plan ? 6 : 21 }); else if (all.length) m.setView(all[0], plan ? 2 : 19); else m.setView([0, 0], 2);
  if (!plan && imagery) imagery(m);
  L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(m);
  if (OM.overlay && OM.overlay.src) {
    var ov = OM.overlay, pane = m.createPane('wdPlan'); pane.style.zIndex = 350;
    var img = document.createElement('img'); img.src = ov.src; pane.appendChild(img);
    var c = m.latLngToLayerPoint(ov.center), b = m.latLngToLayerPoint(east(ov.center, 100));
    var w = Math.sqrt((b.x - c.x) * (b.x - c.x) + (b.y - c.y) * (b.y - c.y)) / 100 * ov.widthM, h = w * (ov.aspect || 1);
    img.style.cssText = 'position:absolute;left:0;top:0;max-width:none;transform-origin:0 0;width:' + w + 'px;height:' + h + 'px;opacity:' + ((ov.opacity == null ? 60 : ov.opacity) / 100) + ';transform:translate(' + c.x + 'px,' + c.y + 'px) rotate(' + (ov.rot || 0) + 'deg) translate(' + (-w / 2) + 'px,' + (-h / 2) + 'px)';
  }
  var a = m.latLngToLayerPoint(m.getCenter()), a2 = m.latLngToLayerPoint(east([m.getCenter().lat, m.getCenter().lng], 100)), ppm = Math.sqrt((a2.x - a.x) * (a2.x - a.x) + (a2.y - a.y) * (a2.y - a.y)) / 100;
  OM.zones.forEach(function (z) {
    if (z.buffer > 0) {
      if (z.shape === 'circle') L.circle(z.c, { radius: z.r + z.buffer, color: '#d97706', weight: 1.5, dashArray: '8 6', fillColor: '#f59e0b', fillOpacity: 0.1 }).addTo(m);
      else L.polygon(z.pts, { fill: false, color: '#f59e0b', opacity: 0.25, weight: Math.max(2, 2 * z.buffer * ppm), lineJoin: 'round' }).addTo(m);
    }
    var st = { color: z.stroke, weight: 2, fillColor: z.color, fillOpacity: z.fill, dashArray: z.dash || null };
    var ly = z.shape === 'circle' ? L.circle(z.c, Object.assign({ radius: z.r }, st)) : L.polygon(z.pts, st);
    ly.addTo(m); ly.bindTooltip('<span style="font-weight:400">' + z.name + '</span><br>' + z.tag, { permanent: true, direction: 'center', className: 'hzt' });
  });
  OM.paths.forEach(function (p) {
    p.legs.forEach(function (l) { L.polyline([l.a, l.b], { color: '#fff', weight: 6 }).addTo(m); L.polyline([l.a, l.b], { color: l.color, weight: 3, dashArray: l.dash || null }).addTo(m); });
    p.pts.forEach(function (q, i) { L.marker([q[0], q[1]], { icon: L.divIcon({ className: '', iconSize: [0, 0], html: '<div style="margin:-9px 0 0 -9px;width:18px;height:18px;border-radius:50%;background:#fff;border:2px solid #0f172a;font:700 9px/14px sans-serif;text-align:center">' + (i + 1) + '</div><div style="position:absolute;left:10px;top:-16px;font:700 8px sans-serif;background:#fff;padding:0 2px;border-radius:2px;white-space:nowrap">' + (Math.round((q[2] || 0) * 10) / 10) + ' m</div>' }) }).addTo(m); });
  });
  var e = function (s) { return String(s == null ? '' : s).replace(/[&<>]/g, function (c) { return c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'; }); };
  OM.points.forEach(function (p) {
    var html;
    if (p.kind === 'tlz') { var s = Math.max(10, (p.size || 5) * ppm); html = '<div style="margin:' + (-s / 2) + 'px 0 0 ' + (-s / 2) + 'px;width:' + s + 'px;height:' + s + 'px;background:#0f172a;border:2px solid #fff;box-sizing:border-box"></div><div style="position:absolute;left:-30px;width:60px;top:' + (s / 2 + 1) + 'px;text-align:center;font:800 8px sans-serif;text-shadow:0 0 2px #fff">' + e(p.title) + '</div>'; }
    else if (p.kind === 'elz') { var d = Math.max(20, (p.size || 4) * 2 * ppm); html = '<div style="margin:' + (-d / 2) + 'px 0 0 ' + (-d / 2) + 'px;width:' + d + 'px;height:' + d + 'px;border-radius:50%;background:#ea580c;border:2px solid #fff;box-sizing:border-box;color:#fff;font:800 7px/' + (d - 4) + 'px sans-serif;text-align:center">' + e(p.title) + '</div>'; }
    else if (p.kind === 'poi') html = '<svg style="position:absolute;left:-10px;top:-18px" width="20" height="18" viewBox="0 0 28 26"><path d="M14 2 L26 24 L2 24 Z" fill="#facc15" stroke="#0f172a" stroke-width="2.5"/><text x="14" y="21" text-anchor="middle" font-size="14" font-weight="900" fill="#0f172a">!</text></svg><div style="position:absolute;left:12px;top:-22px;max-width:150px;background:#fff;border:1px solid #0f172a;border-radius:3px;padding:2px 4px;font:7.5px/1.25 sans-serif;white-space:pre-wrap"><b>' + e(p.title) + '</b>' + (p.text ? '<br>' + e(p.text) : '') + '</div>';
    else html = '<div style="position:absolute;left:-4px;top:-4px;width:8px;height:8px;border-radius:50%;background:#fff;border:1.5px solid #0f172a"></div><div style="position:absolute;left:8px;top:-10px;max-width:150px;background:#fff;border:1px solid #64748b;border-radius:3px;padding:2px 4px;font:7.5px/1.25 sans-serif;white-space:pre-wrap"><b>' + e(p.title) + '</b>' + (p.text ? '<br>' + e(p.text) : '') + '</div>';
    L.marker([p.lat, p.lng], { icon: L.divIcon({ className: '', iconSize: [0, 0], html: html }) }).addTo(m);
  });
}
