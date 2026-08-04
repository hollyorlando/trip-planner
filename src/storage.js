// localStorage persistence for trip/spot/stay data, plus compressed photo storage.
window.PinsStorage = (function () {
  const KEY = 'pins-trip-app:v1';
  const PHOTO_PREFIX = 'pins-trip-app:photo:';

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

  return { load, save, loadPhoto, savePhoto, removePhoto, compressImage };
})();
