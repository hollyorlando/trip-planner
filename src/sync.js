// Cross-device sync: one row per signed-in user in the `app_state` table,
// holding the same {trips, spots, stays, activeStay} blob localStorage keeps locally.
// Photos stay local-only for now (not synced).
window.PinsSync = (function () {
  const cfg = window.PINS_SUPABASE_CONFIG || {};
  const configured = !!(cfg.url && cfg.anonKey && cfg.url !== 'YOUR_SUPABASE_URL' && cfg.anonKey !== 'YOUR_SUPABASE_ANON_KEY');
  const client = configured ? window.supabase.createClient(cfg.url, cfg.anonKey) : null;

  function isConfigured() { return configured; }

  async function getSession() {
    if (!client) return null;
    const { data } = await client.auth.getSession();
    return data.session || null;
  }

  function onAuthChange(cb) {
    if (!client) return () => {};
    const { data: sub } = client.auth.onAuthStateChange((_event, session) => cb(session));
    return () => sub.subscription.unsubscribe();
  }

  async function sendMagicLink(email) {
    if (!client) throw new Error('sync not configured');
    return client.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin + window.location.pathname }
    });
  }

  async function signOut() {
    if (client) await client.auth.signOut();
  }

  async function loadRemoteState(userId) {
    const { data, error } = await client.from('app_state').select('data').eq('user_id', userId).maybeSingle();
    if (error) { console.warn('pins-sync: load failed', error); return null; }
    return data ? data.data : null;
  }

  async function saveRemoteState(userId, stateBlob) {
    const { error } = await client.from('app_state').upsert({
      user_id: userId, data: stateBlob, updated_at: new Date().toISOString()
    });
    if (error) console.warn('pins-sync: save failed', error);
  }

  return { isConfigured, getSession, onAuthChange, sendMagicLink, signOut, loadRemoteState, saveRemoteState };
})();
