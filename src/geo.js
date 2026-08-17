// Distance + light "geocoding" helpers.
window.PinsGeo = (function () {
  const D = window.PinsData;

  function hav(a, b) {
    const R = 6371, r = Math.PI / 180;
    const dLa = (b[0] - a[0]) * r, dLn = (b[1] - a[1]) * r;
    const h = Math.sin(dLa / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLn / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  function fmtKm(km) {
    const m = Math.round(km * 1000 / 50) * 50;
    return m < 1000 ? m + ' m' : (m / 1000).toFixed(1) + ' km';
  }

  function host(u) {
    if (!u) return null;
    if (u.indexOf('tiktok') > -1) return 'tiktok';
    if (u.indexOf('instagram') > -1) return 'instagram';
    if (u.indexOf('expe.') > -1 || u.indexOf('expedia') > -1) return 'expedia';
    if (u.indexOf('getyourguide') > -1) return 'getyourguide';
    try { return u.replace(/^https?:\/\//, '').split('/')[0].replace(/^www\./, ''); }
    catch (e) { return 'link'; }
  }

  // Short badge shown next to a saved link, based on the source platform.
  function badge(u) {
    if (!u) return 'WEB';
    if (u.indexOf('tiktok') > -1) return 'TT';
    if (u.indexOf('instagram') > -1) return 'IG';
    if (u.indexOf('youtube') > -1 || u.indexOf('youtu.be') > -1) return 'YT';
    if (u.indexOf('google') > -1) return 'MAP';
    if (u.indexOf('reddit') > -1) return 'RDT';
    if (u.indexOf('substack') > -1) return 'SUB';
    return 'WEB';
  }

  // Infer a Paris arrondissement from a pin's actual coordinates, by nearest centroid.
  function arrFromLatLng(la, ln) {
    if (la == null || ln == null) return null;
    let best = null, bestDist = Infinity;
    for (const k of Object.keys(D.arrs)) {
      const d = hav([la, ln], D.arrs[k]);
      if (d < bestDist) { bestDist = d; best = k; }
    }
    return best;
  }

  return { hav, fmtKm, host, badge, arrFromLatLng };
})();
