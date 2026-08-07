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

  function arrName(n) { return n === 1 ? '1er' : n + 'e'; }

  // Best-effort: guess a Paris arrondissement from free-text address/neighborhood.
  function arrFrom(addr) {
    const a = (addr || '').toLowerCase();
    if (!a.trim()) return null;
    const pc = a.match(/\b750(0[1-9]|1[0-9]|20)\b/);
    if (pc) {
      const n = parseInt(pc[0].slice(3), 10);
      if (n >= 1 && n <= 20) return { arr: arrName(n), how: 'read from postal code ' + pc[0] };
    }
    for (const [k, arr] of D.clues) if (a.indexOf(k) > -1) return { arr, how: 'matched “' + k + '”' };
    const ord = a.match(/\b(\d{1,2})\s*(er|eme|ème|e|st|nd|rd|th)\b/);
    if (ord) {
      const n = +ord[1];
      if (n >= 1 && n <= 20) return { arr: arrName(n), how: 'read as the ' + ord[0].trim() };
    }
    return null;
  }

  return { hav, fmtKm, host, arrName, arrFrom };
})();
