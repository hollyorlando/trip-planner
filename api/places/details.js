// Proxies Places API (New) place details so the real API key stays server-side.
// `fields` is the caller-supplied field mask (different callers need different fields).
module.exports = async function handler(req, res) {
  const key = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!key) { res.status(500).json({ error: 'missing GOOGLE_MAPS_SERVER_KEY' }); return; }
  const { placeId, fields } = req.query || {};
  if (!placeId) { res.status(400).json({ error: 'missing placeId' }); return; }
  const upstream = await fetch('https://places.googleapis.com/v1/places/' + encodeURIComponent(placeId), {
    headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': fields || 'location,formattedAddress' }
  });
  const data = await upstream.text();
  res.status(upstream.status).setHeader('Content-Type', 'application/json').send(data);
};
