// Proxies Places API (New) text search so the real API key stays server-side.
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).end(); return; }
  const key = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!key) { res.status(500).json({ error: 'missing GOOGLE_MAPS_SERVER_KEY' }); return; }
  const upstream = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location'
    },
    body: JSON.stringify(req.body)
  });
  const data = await upstream.text();
  res.status(upstream.status).setHeader('Content-Type', 'application/json').send(data);
};
