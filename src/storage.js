// localStorage persistence for trip/spot/stay data, plus compressed photo storage.
window.PinsStorage = (function () {
  const KEY = 'pins-trip-app:v1';
  const PHOTO_PREFIX = 'pins-trip-app:photo:';
  const MAX_PHOTOS_PER_SPOT = 3;

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      console.warn('pins: failed to read saved data', e);
      return null;
    }
  }

  function save(data) {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('pins: failed to save (storage full?)', e);
    }
  }

  function photoKey(spotId, i) { return PHOTO_PREFIX + spotId + ':' + i; }

  function loadPhoto(spotId, i) {
    try { return localStorage.getItem(photoKey(spotId, i)); }
    catch (e) { return null; }
  }

  function savePhoto(spotId, i, dataUrl) {
    try { localStorage.setItem(photoKey(spotId, i), dataUrl); return true; }
    catch (e) { console.warn('pins: photo did not fit in storage', e); return false; }
  }

  function removePhoto(spotId, i) {
    try { localStorage.removeItem(photoKey(spotId, i)); } catch (e) {}
  }

  // Photos are cached in localStorage only, so they never leave the device that added
  // them. These let the sync blob carry them too, piggybacking on the same "one shared
  // JSON row" mechanism as everything else, so a photo added on one device shows up on
  // the rest instead of disappearing there.
  function collectPhotos(spotIds) {
    const out = [];
    spotIds.forEach(id => {
      for (let i = 0; i < MAX_PHOTOS_PER_SPOT; i++) {
        const dataUrl = loadPhoto(id, i);
        if (dataUrl) out.push({ id, i, dataUrl });
      }
    });
    return out;
  }

  // Fills in photos this device doesn't have yet; never overwrites a local one, so an
  // in-progress local edit can't be clobbered by a stale remote copy.
  function applyPhotos(list) {
    if (!list) return;
    list.forEach(({ id, i, dataUrl }) => {
      if (!loadPhoto(id, i)) savePhoto(id, i, dataUrl);
    });
  }

  // A device that hasn't cached every photo locally (a fresh install, or one that hit
  // its storage quota partway through applyPhotos) must not push that partial set as
  // the new synced record — it would erase photos another device already contributed.
  // Union the last-seen remote set with whatever this device has locally, local
  // winning on conflicts, then drop anything for a spot that no longer exists.
  function mergePhotos(remoteList, localList, validSpotIds) {
    const map = new Map();
    (remoteList || []).forEach(p => map.set(p.id + ':' + p.i, p));
    (localList || []).forEach(p => map.set(p.id + ':' + p.i, p));
    const valid = new Set(validSpotIds);
    return Array.from(map.values()).filter(p => valid.has(p.id));
  }

  // Downscale + JPEG-compress an uploaded image so it fits comfortably in localStorage.
  function compressImage(file, maxDim = 1000, quality = 0.75) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        let { width, height } = img;
        if (width > height && width > maxDim) { height = Math.round(height * (maxDim / width)); width = maxDim; }
        else if (height > maxDim) { width = Math.round(width * (maxDim / height)); height = maxDim; }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
      img.src = url;
    });
  }

  return { load, save, loadPhoto, savePhoto, removePhoto, compressImage, collectPhotos, applyPhotos, mergePhotos };
})();
