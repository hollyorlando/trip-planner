// Proxies the Maps JavaScript API bootstrap loader so the real API key lives only
// in this server-side env var, never in a file shipped to the browser.
module.exports = async function handler(req, res) {
  const key = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!key) {
    res.status(500).setHeader('Content-Type', 'application/javascript');
    res.send('console.error("pins: missing GOOGLE_MAPS_SERVER_KEY");');
    return;
  }
  const callback = (req.query && req.query.callback) || '__pinsGmapsReady';
  const upstream = await fetch(
    'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(key) +
    '&callback=' + encodeURIComponent(callback) + '&loading=async'
  );
  const body = await upstream.text();
  res.status(upstream.status);
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(body);
};
