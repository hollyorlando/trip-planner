// Cross-device sync: everyone who opens the app with this deploy's Supabase config
// reads and writes the same shared row. No login — simplest possible sync for a
// single person (or trusted group) using one link across devices.
// Photos ride along in the same blob (see PinsStorage.collectPhotos/applyPhotos in
// app.js) so they don't stay stuck on whichever device first cached them.
window.PinsSync = (function () {
  const cfg = window.PINS_SUPABASE_CONFIG || {};
  const configured = !!(cfg.url && cfg.anonKey && cfg.url !== 'YOUR_SUPABASE_URL' && cfg.anonKey !== 'YOUR_SUPABASE_ANON_KEY');
  const client = configured ? window.supabase.createClient(cfg.url, cfg.anonKey) : null;
  const ROW_ID = 'shared';

  function isConfigured() { return configured; }

  async function loadSharedState() {
    const { data, error } = await client.from('app_state').select('data').eq('id', ROW_ID).maybeSingle();
    if (error) { console.warn('pins-sync: load failed', error); return null; }
    return data ? data.data : null;
  }

  async function saveSharedState(stateBlob) {
    const { error } = await client.from('app_state').upsert({
      id: ROW_ID, data: stateBlob, updated_at: new Date().toISOString()
    });
    if (error) console.warn('pins-sync: save failed', error);
  }

  return { isConfigured, loadSharedState, saveSharedState };
})();
