// Proxies Places API (New) photo media so the real API key stays server-side.
module.exports = async function handler(req, res) {
  const key = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!key) { res.status(500).end(); return; }
  const { photoName, maxWidthPx } = req.query || {};
  if (!photoName) { res.status(400).end(); return; }
  const url = 'https://places.googleapis.com/v1/' + photoName +
    '/media?maxWidthPx=' + encodeURIComponent(maxWidthPx || '800') + '&key=' + key;
  const upstream = await fetch(url);
  if (!upstream.ok) { res.status(upstream.status).end(); return; }
  const buf = Buffer.from(await upstream.arrayBuffer());
  res.setHeader('Content-Type', upstream.headers.get('content-type') || 'image/jpeg');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.status(200).send(buf);
};
