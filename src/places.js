// Google Places API (New) lookups: search by name/address, pull details + a photo.
// Called directly from the browser (Places API New supports CORS) — no backend needed.
// Costs real money past Google's free monthly allowance, so this is only ever
// triggered by an explicit button tap, never automatically while typing.
window.PinsPlaces = (function () {
  const cfg = window.PINS_PLACES_CONFIG || {};
  const configured = !!(cfg.apiKey && cfg.apiKey !== 'YOUR_GOOGLE_PLACES_API_KEY');
  const BASE = 'https://places.googleapis.com/v1';

  function isConfigured() { return configured; }

  async function searchPlaces(query, opts) {
    if (!configured || !query.trim()) return [];
    const near = opts && opts.near;
    const body = { textQuery: query, maxResultCount: 5 };
    // Biases (doesn't restrict) results toward a destination that's already been picked,
    // so e.g. a hotel search on a Puglia trip doesn't surface Puglia itself again.
    if (near && near.la != null && near.ln != null) {
      body.locationBias = { circle: { center: { latitude: near.la, longitude: near.ln }, radius: 50000 } };
    }
    try {
      const res = await fetch(BASE + '/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': cfg.apiKey,
          'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location'
        },
        body: JSON.stringify(body)
      });
      if (!res.ok) { console.warn('pins-places: search failed', await res.text()); return []; }
      const data = await res.json();
      return (data.places || []).map(p => ({
        id: p.id,
        name: p.displayName && p.displayName.text,
        address: p.formattedAddress,
        la: p.location && p.location.latitude,
        ln: p.location && p.location.longitude
      }));
    } catch (err) { console.warn('pins-places: search error', err); return []; }
  }

  // Places Autocomplete (New), restricted to the "(regions)" type collection —
  // countries, states/provinces, and cities — so a trip destination search returns
  // actual places, not businesses that happen to share the name (a restaurant called
  // "Puglia", say). Predictions don't carry coordinates, so picking one requires a
  // follow-up getPlaceLocation() call.
  async function searchLocations(query) {
    if (!configured || !query.trim()) return [];
    try {
      const res = await fetch(BASE + '/places:autocomplete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': cfg.apiKey },
        body: JSON.stringify({ input: query, includedPrimaryTypes: ['(regions)'] })
      });
      if (!res.ok) { console.warn('pins-places: location search failed', await res.text()); return []; }
      const data = await res.json();
      return (data.suggestions || []).map(s => {
        const p = s.placePrediction;
        if (!p) return null;
        return {
          id: p.placeId,
          name: (p.structuredFormat && p.structuredFormat.mainText && p.structuredFormat.mainText.text) || (p.text && p.text.text) || '',
          address: (p.structuredFormat && p.structuredFormat.secondaryText && p.structuredFormat.secondaryText.text) || (p.text && p.text.text) || ''
        };
      }).filter(Boolean);
    } catch (err) { console.warn('pins-places: location search error', err); return []; }
  }

  async function getPlaceLocation(placeId) {
    if (!configured) return null;
    try {
      const res = await fetch(BASE + '/places/' + placeId, {
        headers: { 'X-Goog-Api-Key': cfg.apiKey, 'X-Goog-FieldMask': 'location,formattedAddress' }
      });
      if (!res.ok) { console.warn('pins-places: location details failed', await res.text()); return null; }
      const d = await res.json();
      return { la: d.location && d.location.latitude, ln: d.location && d.location.longitude, address: d.formattedAddress };
    } catch (err) { console.warn('pins-places: location details error', err); return null; }
  }

  function formatHours(oh) {
    if (!oh || !oh.weekdayDescriptions || !oh.weekdayDescriptions.length) return '';
    return oh.weekdayDescriptions.join('\n');
  }

  function formatPrice(level, rating) {
    const dollarMap = {
      PRICE_LEVEL_FREE: 'free', PRICE_LEVEL_INEXPENSIVE: '€', PRICE_LEVEL_MODERATE: '€€',
      PRICE_LEVEL_EXPENSIVE: '€€€', PRICE_LEVEL_VERY_EXPENSIVE: '€€€€'
    };
    const parts = [];
    if (level && dollarMap[level]) parts.push(dollarMap[level]);
    if (rating) parts.push('★' + rating);
    return parts.join(' · ');
  }

  async function getDetails(placeId) {
    if (!configured) return null;
    try {
      const res = await fetch(BASE + '/places/' + placeId, {
        headers: {
          'X-Goog-Api-Key': cfg.apiKey,
          'X-Goog-FieldMask': 'displayName,formattedAddress,location,regularOpeningHours,priceLevel,rating,photos'
        }
      });
      if (!res.ok) { console.warn('pins-places: details failed', await res.text()); return null; }
      const d = await res.json();
      return {
        name: d.displayName && d.displayName.text,
        address: d.formattedAddress,
        la: d.location && d.location.latitude,
        ln: d.location && d.location.longitude,
        hours: formatHours(d.regularOpeningHours),
        price: formatPrice(d.priceLevel, d.rating),
        photoName: d.photos && d.photos[0] && d.photos[0].name
      };
    } catch (err) { console.warn('pins-places: details error', err); return null; }
  }

  async function fetchPhotoBlob(photoName, maxWidthPx) {
    if (!configured || !photoName) return null;
    try {
      const url = BASE + '/' + photoName + '/media?maxWidthPx=' + (maxWidthPx || 800) + '&key=' + cfg.apiKey;
      const res = await fetch(url);
      if (!res.ok) return null;
      return await res.blob();
    } catch (err) { console.warn('pins-places: photo error', err); return null; }
  }

  return { isConfigured, searchPlaces, searchLocations, getPlaceLocation, getDetails, fetchPhotoBlob };
})();
