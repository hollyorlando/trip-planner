(function () {
  const D = window.PinsData;
  const G = window.PinsGeo;
  const S = window.PinsStorage;
  const html = htm.bind(React.createElement);
  const { useState, useEffect, useRef } = React;

  const MONO_HEADER = { fontFamily: "'Character Mono',monospace", fontSize: 10, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#9e9e9e', marginBottom: 7 };
  const DATE_INPUT_STYLE = { flex: 1, minWidth: 0, border: '1px solid #333333', borderRadius: 14, padding: '11px 13px', fontSize: 14, background: 'transparent', colorScheme: 'dark' };

  // ---------- date formatting ----------

  const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

  function fmtDateShort(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-').map(Number);
    return MONTHS[m - 1] + ' ' + d;
  }

  function fmtDateRange(start, end) {
    if (!start && !end) return '';
    if (start && !end) return fmtDateShort(start);
    if (!start && end) return fmtDateShort(end);
    if (start === end) return fmtDateShort(start);
    const [ys, ms] = start.split('-'), [ye, me] = end.split('-');
    if (ys === ye && ms === me) return fmtDateShort(start) + ' – ' + Number(end.split('-')[2]);
    return fmtDateShort(start) + ' – ' + fmtDateShort(end);
  }

  // A trip can span more than one date range (e.g. visiting the same place twice,
  // or a trip that pauses and resumes) — show the overall span, plus a count if there's more than one.
  function fmtLegs(legs) {
    const valid = (legs || []).filter(l => l.start || l.end);
    if (!valid.length) return '';
    if (valid.length === 1) return fmtDateRange(valid[0].start, valid[0].end);
    const sorted = valid.slice().sort((a, b) => (a.start || '9999').localeCompare(b.start || '9999'));
    return fmtDateRange(sorted[0].start, sorted[sorted.length - 1].end) + ' · ' + valid.length + ' legs';
  }

  function newLeg() { return { id: 'leg-' + Date.now(), start: '', end: '' }; }
  function emptyStayDraft() { return { name: '', location: null, locResults: [], locSearching: false, start: '', end: '' }; }

  // ---------- state ----------

  // Trips used to have one start/end pair; now a trip can have several date-range
  // "legs" (e.g. visiting the same place across two separate weeks).
  function migrateTripLegs(trips) {
    return trips.map(t => (Array.isArray(t.legs) && t.legs.length) ? t : {
      id: t.id, name: t.name, fill: t.fill, geo: !!t.geo, location: t.location || null,
      legs: [{ id: 'leg-' + t.id + '-0', start: t.start || '', end: t.end || '' }]
    });
  }

  // Stays used to be one entry per trip; now a trip can have several (e.g. two hotels
  // on one trip), each with its own date range, plus a record of which one is active.
  function migrateStays(saved, defaultEntry) {
    if (saved && saved.activeStay) return { stays: saved.stays || {}, activeStay: saved.activeStay };
    if (saved && saved.stays) {
      const stays = {}, activeStay = {};
      Object.keys(saved.stays).forEach(tripId => {
        const v = saved.stays[tripId];
        const entry = Array.isArray(v) ? v[0] : (v && { id: 'stay-' + tripId, name: v.name, spotId: v.spotId, arr: v.arr, la: v.la, ln: v.ln, start: v.start || '', end: v.end || '' });
        if (entry) { stays[tripId] = [entry]; activeStay[tripId] = entry.id; }
      });
      return { stays, activeStay };
    }
    return { stays: { paris: [defaultEntry] }, activeStay: { paris: defaultEntry.id } };
  }

  function makeInitialState() {
    const saved = S.load();
    const defaultStay = { id: 'stay-seed', name: 'les patios du marais', spotId: null, arr: '3e', la: 48.8610, ln: 2.3640, start: '', end: '' };
    const { stays, activeStay } = migrateStays(saved, defaultStay);
    return {
      screen: 'trips', tripId: 'paris', view: 'map', query: '', off: {},
      sel: null, detail: null, expanded: false, addOpen: false, newTripOpen: false, stayOpen: false,
      confirmDeleteTripId: null, editTripId: null,
      stayEditId: null, stayEditStart: '', stayEditEnd: '',
      zoom: 1.9, tx: 0, ty: 0,
      trips: migrateTripLegs((saved && saved.trips) || D.seedTrips),
      // Hotel spots (the old "pinned/saved hotels" pick-list) were retired in favor of
      // Google-Places-backed stays entered directly — drop any that survive in old saved data.
      spots: ((saved && saved.spots) || D.seedSpots).filter(s => s.c !== 'hotel'),
      stays, activeStay,
      sf: { name: '', arr: '3e', start: '', end: '', googleResults: [], googleSearching: false, googlePlace: null },
      f: { name: '', cat: 'restaurant', arr: '3e', addr: '', arrManual: false, pickerOpen: false, url: '', note: '', googleResults: [], googleSearching: false, googlePlace: null },
      nt: { name: '', legs: [newLeg()], location: null, locResults: [], locSearching: false, stays: [], stayDraft: emptyStayDraft() },
      et: { name: '', legs: [newLeg()], location: null, locResults: [], locSearching: false }
    };
  }

  // ---------- derived data helpers ----------

  function allSpotsForTrip(state) { return state.spots.filter(s => s.trip === state.tripId); }

  function filteredSpots(state) {
    const q = state.query.trim().toLowerCase();
    return allSpotsForTrip(state)
      .filter(s => !state.off[s.c])
      .filter(s => !q || (s.n + ' ' + (s.no || '') + ' ' + (s.t || []).join(' ') + ' ' + s.a).toLowerCase().indexOf(q) > -1);
  }

  function stayList(state) { return state.stays[state.tripId] || []; }

  function currentStay(state) {
    const list = stayList(state);
    if (!list.length) return null;
    const activeId = state.activeStay[state.tripId];
    return list.find(s => s.id === activeId) || list[0];
  }

  function distanceTo(state, s) {
    const stay = currentStay(state);
    return stay ? G.hav([stay.la, stay.ln], [s.la, s.ln]) : 0;
  }

  function decorateSpot(s, state) {
    const c = D.cats[s.c];
    const stay = currentStay(state);
    const km = distanceTo(state, s);
    return {
      id: s.id, name: s.n, note: s.no || 'no note yet', arr: s.a, fill: c.fill, ink: c.ink,
      cat: c.label,
      dist: !stay ? '—' : (stay.spotId === s.id ? 'your stay' : G.fmtKm(km)),
      bg: s.visited ? '#1a1a1a' : '#131313',
      border: s.id === state.sel ? '#ffffff' : '#2a2a2a',
      tags: (s.t || []).slice(0, 3),
      src: G.host(s.u) || 'no link', srcInk: s.u ? '#ffffff' : '#737373'
    };
  }

  // ---------- map math ----------

  function fitToSpots(state, mapSize) {
    const W = mapSize.w || 402, H = mapSize.h || 386;
    const BASE = W / 1000;
    const list = filteredSpots(state);
    if (!list.length) {
      const zoom = 1.9, sc = BASE * zoom;
      return { zoom, tx: W / 2 - 500 * sc, ty: H / 2 - 336 * sc };
    }
    const xs = list.map(s => G.X(s.ln)), ys = list.map(s => G.Y(s.la));
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const pad = 70;
    const sc = Math.max(0.28, Math.min(2.6, Math.min(W / (x1 - x0 + pad * 2), H / (y1 - y0 + pad * 2))));
    return { zoom: sc / BASE, tx: W / 2 - ((x0 + x1) / 2) * sc, ty: H / 2 - ((y0 + y1) / 2) * sc };
  }

  function zoomBy(state, mapSize, k) {
    const W = mapSize.w || 402, H = mapSize.h || 386;
    const BASE = W / 1000;
    const sc = BASE * state.zoom, ns = Math.max(0.28, Math.min(3.2, sc * k));
    const cx = W / 2, cy = H / 2;
    return { zoom: ns / BASE, tx: cx - (cx - state.tx) * (ns / sc), ty: cy - (cy - state.ty) * (ns / sc) };
  }

  // Re-center the map on one spot without changing zoom (used when picking a spot from the sheet).
  function centerOnSpot(state, mapSize, s) {
    const W = mapSize.w || 402, H = mapSize.h || 386;
    const BASE = W / 1000;
    const sc = BASE * state.zoom;
    return { tx: W / 2 - G.X(s.ln) * sc, ty: H / 2 - G.Y(s.la) * sc };
  }

  function computePins(state, mapSize) {
    const list = filteredSpots(state);
    const staySpotIds = stayList(state).map(s => s.spotId).filter(Boolean);
    const BASE = (mapSize.w || 402) / 1000;
    const sc = BASE * state.zoom;
    return list.filter(s => !staySpotIds.includes(s.id)).map(s => {
      const selq = state.sel === s.id, size = selq ? 36 : 26;
      return {
        id: s.id, spot: s, fill: D.cats[s.c].fill, size, dot: selq ? 9 : 7,
        left: Math.round(state.tx + G.X(s.ln) * sc),
        top: Math.round(state.ty + G.Y(s.la) * sc),
        z: selq ? 4 : 2, op: s.visited && !selq ? 0.45 : 1,
        showLabel: selq, name: s.n
      };
    });
  }

  // ---------- icons ----------

  function SearchIcon() {
    return html`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" style=${{ flex: 'none', color: '#9e9e9e' }}>
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8"/>
      <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    </svg>`;
  }
  function HouseIcon({ size = 16, color = '#fff' }) {
    return html`<svg width=${size} height=${size} viewBox="0 0 24 24" fill="none" style=${{ flex: 'none', color }}>
      <path d="M3.5 11.2 12 4.2l8.5 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M5.9 10.3V19a1 1 0 0 0 1 1h10.2a1 1 0 0 0 1-1v-8.7" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
    </svg>`;
  }
  function RecenterIcon() {
    return html`<svg width="19" height="19" viewBox="0 0 24 24" fill="none" style=${{ color: '#fff' }}>
      <circle cx="12" cy="12" r="6" stroke="currentColor" strokeWidth="1.8"/>
      <path d="M12 1.5v3.2M12 19.3v3.2M22.5 12h-3.2M4.7 12H1.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    </svg>`;
  }
  function ExternalLinkIcon() {
    return html`<svg width="16" height="16" viewBox="0 0 20 20" fill="none" style=${{ flex: 'none' }}>
      <path d="M4.16667 10H15.8333M15.8333 10L10 4.16667M15.8333 10L10 15.8333" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>`;
  }
  function TrashIcon({ size = 15, color = '#9e9e9e' }) {
    return html`<svg width=${size} height=${size} viewBox="0 0 24 24" fill="none" style=${{ flex: 'none', color }}>
      <path d="M4 7h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M6.5 7l.7 12.1a1.5 1.5 0 0 0 1.5 1.4h6.6a1.5 1.5 0 0 0 1.5-1.4L18 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    </svg>`;
  }
  function PencilIcon({ size = 15, color = '#9e9e9e' }) {
    return html`<svg width=${size} height=${size} viewBox="0 0 24 24" fill="none" style=${{ flex: 'none', color }}>
      <path d="M14.5 4.5l5 5L8 21H3v-5z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M13 6l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    </svg>`;
  }

  // ---------- photo slot ----------

  function PhotoSlot({ spotId, index, width, height, radius, placeholder, bump }) {
    const inputRef = useRef(null);
    const src = S.loadPhoto(spotId, index);
    const pick = () => inputRef.current && inputRef.current.click();
    const onChange = async (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!file) return;
      try {
        const dataUrl = await S.compressImage(file);
        S.savePhoto(spotId, index, dataUrl);
        bump();
      } catch (err) { console.warn('pins: could not read photo', err); }
    };
    const clear = (e) => { e.stopPropagation(); S.removePhoto(spotId, index); bump(); };
    return html`
      <button type="button" className="photo-slot" onClick=${pick}
        style=${{ width, height, borderRadius: radius, flex: 'none', scrollSnapAlign: 'start' }}>
        ${src ? html`<img src=${src} alt="" />` : html`<span className="ph-text">${placeholder}</span>`}
        ${src ? html`<span className="ph-clear" onClick=${clear}>×</span>` : null}
        <input ref=${inputRef} type="file" accept="image/*" style=${{ display: 'none' }} onChange=${onChange} />
      </button>
    `;
  }

  // ---------- boot ----------

  const BOOT_PINS = [
    { x: 18, y: 74, c: '#7db4ff' }, { x: 62, y: 30, c: '#df91f2' }, { x: 100, y: 92, c: '#aed900' }, { x: 140, y: 44, c: '#ff4dc9' },
    { x: 176, y: 100, c: '#fff59e' }, { x: 206, y: 20, c: '#f28500' }, { x: 236, y: 68, c: '#d90000' }, { x: 274, y: 104, c: '#abf5ed' }
  ];
  const BOOT_LETTERS = '(pins)'.split('');

  function BootScreen({ boot, onSkip }) {
    return html`
      <div onClick=${onSkip} style=${{ position: 'absolute', inset: 0, zIndex: 60, background: '#131313', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 34, cursor: 'pointer', opacity: boot === 'out' ? 0 : 1, transitionProperty: 'opacity', transitionDuration: '340ms', transitionTimingFunction: 'cubic-bezier(0.93,0,1,1)' }}>
        <div style=${{ position: 'relative', width: 300, height: 130 }}>
          <svg width="300" height="130" viewBox="0 0 300 130" fill="none" style=${{ position: 'absolute', inset: 0 }}>
            <path d="M18 74 L62 30 L100 92 L140 44 L176 100 L206 20 L236 68 L274 104" stroke="#2e2e2e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="760" strokeDashoffset="760" style=${{ animation: 'routeDraw 900ms cubic-bezier(0.93,0,0.07,1) 640ms both' }}/>
          </svg>
          ${BOOT_PINS.map((p, i) => html`
            <div key=${i} style=${{ position: 'absolute', left: p.x, top: p.y, width: 26, height: 26, borderRadius: 999, background: p.c, border: '2.5px solid #131313', boxShadow: '0 3px 10px rgba(0,0,0,0.5)', animation: `pinDrop 620ms cubic-bezier(0,0,0.07,1.25) ${i * 90}ms both` }}/>
          `)}
        </div>
        <div style=${{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <div style=${{ fontSize: 46, lineHeight: 1, letterSpacing: '-1px', fontWeight: 600, color: '#fff' }}>
            ${BOOT_LETTERS.map((ch, i) => html`<span key=${i} style=${{ display: 'inline-block', animation: `glitchIn 260ms cubic-bezier(0.93,0,0.07,1) ${1020 + i * 75}ms both` }}>${ch}</span>`)}
          </div>
          <div style=${{ fontFamily: "'Character Mono',monospace", fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#9e9e9e', animation: 'dimPulse 1400ms cubic-bezier(0.93,0,0.07,1) 1500ms infinite' }}>unpacking your trips</div>
        </div>
      </div>
    `;
  }

  // ---------- location search (trip destination + draft stays) ----------

  // One field doubles as both the free-text name and the google search query — used
  // for a trip's own location and for stays. Typing and hitting "search" (or enter)
  // looks the text up via google places; picking a result fills the name in from it.
  // Editing the field after a pick clears the picked place, since the name no longer
  // matches it. Search only ever runs on an explicit tap/enter (never per keystroke)
  // since each lookup is a billed google places call.
  function LocationSearchField({ value, onChange, label, namePlaceholder, near, mode }) {
    const picked = !!value.location;
    const isRegion = mode === 'region';
    // Region picks (a trip's destination) aren't worth renaming, but a place pick (a stay)
    // should stay editable — Google's name is a starting point, not the final word.
    const locked = picked && isRegion;
    const doSearch = async () => {
      const q = value.name.trim();
      if (!q) return;
      onChange({ locSearching: true, locResults: [] });
      const results = isRegion
        ? await window.PinsPlaces.searchLocations(q)
        : await window.PinsPlaces.searchPlaces(q, near ? { near } : undefined);
      onChange({ locSearching: false, locResults: results });
    };
    const onKeyDown = (e) => { if (e.key === 'Enter') { e.preventDefault(); doSearch(); } };
    const pick = (r) => async () => {
      if (!isRegion) {
        onChange({ location: { name: r.name, address: r.address, la: r.la, ln: r.ln }, name: (r.name || value.name).toLowerCase(), locResults: [] });
        return;
      }
      // Autocomplete predictions don't carry coordinates — fetch them before confirming the pick.
      onChange({ locSearching: true, locResults: [] });
      const details = await window.PinsPlaces.getPlaceLocation(r.id);
      onChange({
        locSearching: false,
        location: { name: r.name, address: (details && details.address) || r.address, la: details && details.la, ln: details && details.ln },
        name: (r.name || value.name).toLowerCase()
      });
    };
    const change = () => onChange({ location: null, locResults: [] });

    return html`
      <div style=${MONO_HEADER}>${label}</div>
      <div style=${{ display: 'flex', gap: 8, marginBottom: picked ? 6 : 10 }}>
        <div style=${{ flex: 1, minWidth: 0, position: 'relative' }}>
          ${picked ? html`<span style=${{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: '#aed900', fontSize: 15, pointerEvents: 'none' }}>✓</span>` : null}
          <input value=${value.name} onChange=${(e) => onChange({ name: e.target.value })} onKeyDown=${onKeyDown} placeholder=${namePlaceholder} readOnly=${locked}
            style=${{ width: '100%', border: `1px solid ${picked ? '#fff' : '#333333'}`, borderRadius: 14, padding: picked ? '11px 13px 11px 34px' : '11px 13px', fontSize: 15, background: locked ? '#1e1e1e' : 'transparent', color: '#fff' }}/>
        </div>
        ${window.PinsPlaces.isConfigured() ? html`
          <button type="button" onClick=${picked ? change : doSearch} disabled=${!picked && (!value.name.trim() || value.locSearching)}
            style=${{ flex: 'none', border: `1px solid ${picked ? '#fff' : '#333333'}`, borderRadius: 14, padding: '0 15px', fontSize: 13, color: picked || value.name.trim() ? '#fff' : '#737373' }}>${picked ? 'search again' : (value.locSearching ? '…' : 'search')}</button>
        ` : null}
      </div>
      ${picked ? html`<div style=${{ fontFamily: "'Character Mono',monospace", fontSize: 10.5, color: '#9e9e9e', margin: '0 0 10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>found at ${value.location.address || value.location.name}</div>` : null}
      ${value.locResults.length ? html`
        <div style=${{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
          ${value.locResults.map(r => html`
            <button type="button" key=${r.id} onClick=${pick(r)}
              style=${{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', textAlign: 'left', border: '1px solid #333333', borderRadius: 12, padding: '9px 11px' }}>
              <span style=${{ fontSize: 14, fontWeight: 500 }}>${r.name}</span>
              <span style=${{ fontFamily: "'Character Mono',monospace", fontSize: 10.5, color: '#9e9e9e' }}>${r.address}</span>
            </button>
          `)}
        </div>
      ` : null}
    `;
  }

  // A trip can span more than one date range — this renders the list of legs plus
  // a "+" to append another one, sharing the same row style as the date inputs elsewhere.
  function LegsEditor({ legs, onChange }) {
    const setLeg = (i, patchObj) => onChange(legs.map((l, idx) => idx === i ? { ...l, ...patchObj } : l));
    const addLeg = () => onChange(legs.concat([newLeg()]));
    const removeLeg = (i) => onChange(legs.filter((_, idx) => idx !== i));

    return html`
      <div style=${MONO_HEADER}>dates</div>
      <div style=${{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
        ${legs.map((l, i) => html`
          <div key=${l.id} style=${{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="date" value=${l.start} onChange=${(e) => setLeg(i, { start: e.target.value })} style=${DATE_INPUT_STYLE}/>
            <span style=${{ color: '#737373', flex: 'none' }}>–</span>
            <input type="date" value=${l.end} min=${l.start || undefined} onChange=${(e) => setLeg(i, { end: e.target.value })} style=${DATE_INPUT_STYLE}/>
            ${legs.length > 1 ? html`<button type="button" onClick=${() => removeLeg(i)} style=${{ flex: 'none', fontFamily: "'Character Mono',monospace", fontSize: 17, lineHeight: 1, color: '#9e9e9e', padding: '0 2px' }}>×</button>` : null}
          </div>
        `)}
      </div>
      <button type="button" onClick=${addLeg} style=${{ fontFamily: "'Character Mono',monospace", fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#fff', borderBottom: '1px solid #494949', marginBottom: 18 }}>+ add another leg</button>
    `;
  }

  // ---------- trips list ----------

  function tripCard(t, state, patch) {
    const n = state.spots.filter(s => s.trip === t.id).length;
    const dotKeys = Object.keys(D.cats).filter(k => state.spots.some(s => s.trip === t.id && s.c === k));
    const dots = dotKeys.length ? dotKeys.map(k => D.cats[k].fill) : ['#333333'];
    const open = () => patch({ screen: 'trip', tripId: t.id, sel: null, expanded: false, query: '', off: {} });
    const askDelete = (e) => { e.stopPropagation(); patch({ confirmDeleteTripId: t.id }); };
    const askEdit = (e) => {
      e.stopPropagation();
      const legs = (t.legs && t.legs.length) ? t.legs.map(l => ({ ...l })) : [newLeg()];
      patch({ editTripId: t.id, et: { name: t.name, legs, location: t.location || null, locResults: [], locSearching: false } });
    };
    return html`
      <button type="button" key=${t.id} className="hoverable" onClick=${open}
        style=${{ display: 'block', width: '100%', textAlign: 'left', borderRadius: 24, padding: 12, background: t.fill }}>
        <div style=${{ background: '#131313', borderRadius: 16, padding: '16px 16px 14px' }}>
          <div style=${{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 4 }}>
            <div style=${{ fontSize: 26, lineHeight: 1.05, letterSpacing: '-0.5px', fontWeight: 600, textTransform: 'lowercase' }}>${t.name}</div>
            <div style=${{ display: 'flex', alignItems: 'center', gap: 6, flex: 'none' }}>
              <div style=${{ fontFamily: "'Character Mono',monospace", fontSize: 11, color: '#9e9e9e', whiteSpace: 'nowrap' }}>${fmtLegs(t.legs) || 'dates tbd'}</div>
              <span onClick=${askEdit} className="icon-btn" style=${{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 999, flex: 'none' }}>${PencilIcon({})}</span>
              <span onClick=${askDelete} className="icon-btn" style=${{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 999, flex: 'none' }}>${TrashIcon({})}</span>
            </div>
          </div>
          <div style=${{ fontSize: 14, color: '#b3b3b3', marginBottom: 14 }}>${n ? n + ' spots saved · ' + dotKeys.length + ' kinds of spot' : 'no spots yet — start pinning'}</div>
          <div style=${{ display: 'flex', gap: 4 }}>
            ${dots.map((c, i) => html`<div key=${i} style=${{ width: 14, height: 14, borderRadius: 999, background: c }}/>`)}
          </div>
        </div>
      </button>
    `;
  }

  function TripsScreen({ state, patch }) {
    return html`
      <div style=${{ height: '100%', overflowY: 'auto', padding: '58px 18px 40px' }}>
        <div style=${{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 26 }}>
          <div style=${{ fontFamily: "'Character Mono',monospace", fontSize: 15, letterSpacing: '0.02em' }}>(pins)</div>
          <button type="button" className="btn-pill-outline" onClick=${() => patch({ newTripOpen: true })}
            style=${{ fontFamily: "'Character Mono',monospace", fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', borderRadius: 999, padding: '7px 13px', whiteSpace: 'nowrap' }}>new trip</button>
        </div>
        <h1 style=${{ fontSize: 42, lineHeight: 1, letterSpacing: '-0.9px', fontWeight: 600, textTransform: 'lowercase', margin: '0 0 10px' }}>your trips</h1>
        <p style=${{ fontSize: 16, lineHeight: 1.45, color: '#b3b3b3', margin: '0 0 26px', maxWidth: 300 }}>every rec you screenshotted, dropped on one map. open a trip to see it.</p>
        <div style=${{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          ${state.trips.map(t => tripCard(t, state, patch))}
        </div>
      </div>
    `;
  }

  // ---------- map view ----------

  function MapView({ state, patch, mapSize, mapWrapRef, onMapPointerDown, onMapWheel, onMapClick }) {
    const trip = state.trips.find(t => t.id === state.tripId);
    const stay = currentStay(state);
    const stays = stayList(state);
    const activeStayId = state.activeStay[state.tripId];
    const BASE = (mapSize.w || 402) / 1000;
    const sc = BASE * state.zoom;
    const pins = computePins(state, mapSize);
    const hasMap = !!(trip && trip.geo);
    const all = allSpotsForTrip(state);
    const noMap = !hasMap && !all.length;
    const asList = state.expanded;
    const sheetH = !all.length ? 132 : (asList ? 380 : 196);

    return html`
      <div style=${{ flex: 1, position: 'relative', overflow: 'hidden', background: '#131313' }}>
        <div ref=${mapWrapRef} className="map-viewport" onPointerDown=${onMapPointerDown} onWheel=${onMapWheel} onClick=${onMapClick}
          style=${{ position: 'absolute', inset: 0, overflow: 'hidden', cursor: 'grab' }}>
          ${hasMap ? html`
            <div style=${{ position: 'absolute', left: 0, top: 0, width: 1000, height: 672, transform: `translate(${state.tx}px,${state.ty}px) scale(${sc})`, transformOrigin: '0 0', pointerEvents: 'none' }}>
              <img src="./src/map-paris.svg" alt="" draggable="false" style=${{ position: 'absolute', left: -240, top: -180, width: 1700, height: 1200, display: 'block' }} />
            </div>
          ` : null}
          ${pins.map(p => html`
            <div key=${p.id} onClick=${(e) => {
              e.stopPropagation();
              if (state.sel === p.id) patch({ detail: p.id, expanded: false });
              else patch({ sel: p.id, expanded: false });
            }}
              style=${{ position: 'absolute', left: p.left, top: p.top, zIndex: p.z, transform: 'translate(-50%,-50%)', cursor: 'pointer' }}>
              <div style=${{ width: p.size, height: p.size, borderRadius: 999, background: p.fill, border: '2.5px solid #131313', boxShadow: '0 2px 8px rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: p.op }}>
                <div style=${{ width: p.dot, height: p.dot, borderRadius: 999, background: D.cats[p.spot.c].ink, opacity: 0.5 }}/>
              </div>
              ${p.showLabel ? html`<div style=${{ position: 'absolute', left: '50%', top: p.size / 2 + 7, transform: 'translateX(-50%)', background: '#fff', color: '#131313', padding: '5px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600, letterSpacing: '-0.1px', whiteSpace: 'nowrap', textTransform: 'lowercase', pointerEvents: 'none' }}>${p.name}</div>` : null}
            </div>
          `)}
          ${stays.map(s => {
            const isActive = s.id === activeStayId;
            const dr = stays.length > 1 ? fmtDateRange(s.start, s.end) : '';
            return html`
              <div key=${s.id} onClick=${(e) => { e.stopPropagation(); patch({ stayOpen: true }); }}
                style=${{ position: 'absolute', left: Math.round(state.tx + G.X(s.ln) * sc), top: Math.round(state.ty + G.Y(s.la) * sc), transform: 'translate(-50%,-50%)', zIndex: isActive ? 5 : 4, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
                <div style=${{ width: isActive ? 34 : 28, height: isActive ? 34 : 28, borderRadius: 12, background: isActive ? '#fff' : '#131313', border: isActive ? 'none' : '2px solid #fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 3px 10px rgba(0,0,0,0.6)' }}>${HouseIcon({ size: isActive ? 19 : 15, color: isActive ? '#131313' : '#fff' })}</div>
                <div style=${{ background: isActive ? '#fff' : '#131313', color: isActive ? '#131313' : '#fff', border: isActive ? 'none' : '1px solid #fff', padding: '4px 9px', borderRadius: 999, fontSize: 11.5, fontWeight: 600, letterSpacing: '-0.1px', whiteSpace: 'nowrap', textTransform: 'lowercase', pointerEvents: 'none' }}>${s.name}${dr ? ' · ' + dr : ''}</div>
              </div>
            `;
          })}
        </div>

        ${noMap ? html`
          <div style=${{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '0 46px', textAlign: 'center', pointerEvents: 'none' }}>
            <div style=${{ fontSize: 19, fontWeight: 600, letterSpacing: '-0.3px', textTransform: 'lowercase', color: '#fff' }}>no map yet</div>
            <p style=${{ fontSize: 14, lineHeight: 1.45, color: '#b3b3b3', margin: 0 }}>drop your first spot and the map draws itself around it.</p>
          </div>
        ` : null}

        <div style=${{ position: 'absolute', right: 14, top: 14, display: 'flex', flexDirection: 'column', gap: 8, zIndex: 5 }}>
          <div style=${{ background: '#131313', border: '1px solid #333333', borderRadius: 14, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <button type="button" className="icon-btn" onClick=${() => patch(zoomBy(state, mapSize, 1.3))} style=${{ width: 40, height: 40, fontSize: 20, fontWeight: 500, lineHeight: 1, color: '#fff' }}>+</button>
            <div style=${{ height: 1, background: '#333333' }}/>
            <button type="button" className="icon-btn" onClick=${() => patch(zoomBy(state, mapSize, 0.77))} style=${{ width: 40, height: 40, fontSize: 20, fontWeight: 500, lineHeight: 1, color: '#fff' }}>–</button>
          </div>
          <button type="button" className="icon-btn" onClick=${() => patch(fitToSpots(state, mapSize))}
            style=${{ width: 40, height: 40, background: '#131313', border: '1px solid #333333', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>${RecenterIcon()}</button>
        </div>

        <button type="button" className="stay-chip" onClick=${() => patch({ stayOpen: true })}
          style=${{ position: 'absolute', left: 14, top: 14, zIndex: 5, background: '#131313', border: '1px solid #333333', borderRadius: 999, padding: '7px 12px', display: 'flex', alignItems: 'center', gap: 8, maxWidth: 250 }}>
          ${HouseIcon({ size: 14, color: '#fff' })}
          <div style=${{ fontFamily: "'Character Mono',monospace", fontSize: 10, letterSpacing: '0.04em', color: '#b3b3b3', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>${stay ? 'staying · ' + stay.name + (stays.length > 1 && fmtDateRange(stay.start, stay.end) ? ' · ' + fmtDateRange(stay.start, stay.end) : '') : "set where you're staying"}</div>
        </button>

        <button type="button" className="fab-btn" onClick=${() => patch({ addOpen: true })}
          style=${{ position: 'absolute', right: 16, zIndex: 8, bottom: sheetH + 14, width: 56, height: 56, borderRadius: 999, background: '#fff', color: '#131313', fontSize: 28, fontWeight: 400, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>

        ${BottomSheet({ state, patch, mapSize, sheetH, asList, all })}
      </div>
    `;
  }

  function BottomSheet({ state, patch, mapSize, sheetH, asList, all }) {
    const list = filteredSpots(state);
    const sorted = list.slice().sort((a, b) => distanceTo(state, a) - distanceTo(state, b));
    const empty = !all.length;
    const title = empty ? 'this trip is empty'
      : (asList ? list.length + (list.length === 1 ? ' spot' : ' spots') + ' · nearest first'
        : (state.sel ? 'selected' : list.length + (list.length === 1 ? ' spot on this map' : ' spots on this map')));
    const actionLabel = empty ? 'add one' : (asList ? 'collapse' : 'see all');
    const toggleSheet = () => empty ? patch({ addOpen: true }) : patch({ expanded: !state.expanded });
    // Tapping a spot that isn't selected just highlights + centers it on the map;
    // tapping it again (already selected) opens the full detail screen.
    const selectOrOpen = (s) => () => {
      if (state.sel === s.id) { patch({ detail: s.id }); return; }
      patch(prev => ({ sel: s.id, ...centerOnSpot(prev, mapSize, s) }));
    };

    return html`
      <div style=${{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 7, background: '#131313', borderTop: '1px solid #333333', borderRadius: '24px 24px 0 0', height: sheetH, transition: 'height 280ms cubic-bezier(0.93,0,0.07,1)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <button type="button" onClick=${toggleSheet} style=${{ padding: '9px 0 6px', display: 'flex', justifyContent: 'center', flex: 'none' }}>
          <div style=${{ width: 38, height: 4, borderRadius: 999, background: '#494949' }}/>
        </button>
        <div style=${{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '0 16px 8px', flex: 'none' }}>
          <div style=${{ fontFamily: "'Character Mono',monospace", fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#b3b3b3' }}>${title}</div>
          <button type="button" onClick=${toggleSheet} style=${{ fontFamily: "'Character Mono',monospace", fontSize: 11, color: '#fff' }}>${actionLabel}</button>
        </div>
        ${empty ? html`
          <div style=${{ padding: '6px 16px 18px' }}>
            <p style=${{ fontSize: 14.5, lineHeight: 1.45, color: '#b3b3b3', margin: 0 }}>nothing saved to this trip yet. paste a link, name the place, and it lands on the map.</p>
          </div>
        ` : (asList ? html`
          <div style=${{ flex: 1, overflowY: 'auto', padding: '0 16px 24px' }}>
            ${sorted.map(s => { const d = decorateSpot(s, state); return html`
              <button type="button" key=${s.id} data-spot-id=${s.id} className="row-hover" onClick=${selectOrOpen(s)}
                style=${{ display: 'flex', width: '100%', textAlign: 'left', gap: 12, alignItems: 'flex-start', padding: '11px 0', borderBottom: '1px solid #1e1e1e', background: s.id === state.sel ? '#1a1a1a' : 'transparent' }}>
                <div style=${{ width: 32, height: 32, borderRadius: 999, background: d.fill, flex: 'none', marginTop: 2 }}/>
                <div style=${{ flex: 1, minWidth: 0 }}>
                  <div style=${{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.2px', textTransform: 'lowercase', lineHeight: 1.2 }}>${d.name}</div>
                  <div style=${{ fontSize: 12.5, color: '#b3b3b3', lineHeight: 1.35, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>${d.note}</div>
                </div>
                <div style=${{ fontFamily: "'Character Mono',monospace", fontSize: 10, color: '#9e9e9e', flex: 'none', marginTop: 4 }}>${d.dist}</div>
              </button>
            `; })}
          </div>
        ` : html`
          <div style=${{ display: 'flex', gap: 10, overflowX: 'auto', padding: '2px 16px 16px', scrollSnapType: 'x mandatory' }}>
            ${sorted.map(s => { const d = decorateSpot(s, state); return html`
              <button type="button" key=${s.id} data-spot-id=${s.id} className="card-hover" onClick=${selectOrOpen(s)}
                style=${{ flex: 'none', width: 224, scrollSnapAlign: 'start', textAlign: 'left', background: '#131313', border: `1px solid ${d.border}`, borderRadius: 18, padding: '12px 13px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style=${{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style=${{ width: 9, height: 9, borderRadius: 999, background: d.fill }}/>
                  <span style=${{ fontFamily: "'Character Mono',monospace", fontSize: 9.5, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#b3b3b3' }}>${d.cat}</span>
                </div>
                <div style=${{ fontSize: 17, lineHeight: 1.15, fontWeight: 600, letterSpacing: '-0.2px', textTransform: 'lowercase' }}>${d.name}</div>
                <div style=${{ fontSize: 12.5, lineHeight: 1.35, color: '#b3b3b3', height: 34, overflow: 'hidden' }}>${d.note}</div>
                <div style=${{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
                  <span style=${{ fontFamily: "'Character Mono',monospace", fontSize: 10, color: '#9e9e9e' }}>${d.dist}</span>
                  <span style=${{ fontFamily: "'Character Mono',monospace", fontSize: 10, color: d.srcInk }}>${d.src}</span>
                </div>
              </button>
            `; })}
          </div>
        `)}
      </div>
    `;
  }

  function ListView({ state, patch, all }) {
    const list = filteredSpots(state);
    const groups = Object.keys(D.cats).filter(k => all.some(s => s.c === k) && !state.off[k]).map(k => {
      const items = list.filter(s => s.c === k).slice().sort((a, b) => distanceTo(state, a) - distanceTo(state, b));
      return { key: k, label: D.cats[k].label, fill: D.cats[k].fill, count: list.filter(s => s.c === k).length, items };
    }).filter(g => g.count);
    const empty = !groups.length;

    return html`
      <div style=${{ flex: 1, overflowY: 'auto', padding: '0 16px 40px' }}>
        ${empty ? html`
          <div style=${{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '70px 30px 0', textAlign: 'center' }}>
            <div style=${{ fontSize: 19, fontWeight: 600, letterSpacing: '-0.3px', textTransform: 'lowercase', color: '#fff' }}>${all.length ? 'nothing matches' : 'nothing saved yet'}</div>
            <p style=${{ fontSize: 14.5, lineHeight: 1.45, color: '#b3b3b3', margin: 0 }}>${all.length ? 'no spot fits those filters. turn a category back on, or clear the search.' : 'paste a link, name the place, and it lands on this list.'}</p>
          </div>
        ` : null}
        ${groups.map(g => html`
          <div key=${g.key} style=${{ marginBottom: 22 }}>
            <div style=${{ display: 'flex', alignItems: 'center', gap: 8, position: 'sticky', top: 0, background: '#131313', padding: '8px 0' }}>
              <span style=${{ width: 12, height: 12, borderRadius: 999, background: g.fill }}/>
              <span style=${{ fontFamily: "'Character Mono',monospace", fontSize: 11, letterSpacing: '0.07em', textTransform: 'uppercase' }}>${g.label}</span>
              <span style=${{ fontFamily: "'Character Mono',monospace", fontSize: 10, color: '#9e9e9e' }}>${g.count}</span>
            </div>
            <div style=${{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              ${g.items.map(s => { const d = decorateSpot(s, state); return html`
                <button type="button" key=${s.id} className="list-row-hover" onClick=${() => patch({ detail: s.id, sel: s.id })}
                  style=${{ display: 'flex', width: '100%', textAlign: 'left', gap: 12, background: d.bg, border: '1px solid #2a2a2a', borderRadius: 18, padding: 13 }}>
                  <div style=${{ flex: 1, minWidth: 0 }}>
                    <div style=${{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
                      <span style=${{ fontSize: 17, fontWeight: 600, letterSpacing: '-0.2px', textTransform: 'lowercase' }}>${s.n}</span>
                      <span style=${{ fontFamily: "'Character Mono',monospace", fontSize: 10, color: '#9e9e9e' }}>${s.a}</span>
                    </div>
                    <div style=${{ fontSize: 13, color: '#b3b3b3', lineHeight: 1.4, marginTop: 3 }}>${d.note}</div>
                    <div style=${{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                      ${d.tags.map((tg, i) => html`<span key=${i} style=${{ fontFamily: "'Character Mono',monospace", fontSize: 9.5, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#b3b3b3', background: '#1e1e1e', borderRadius: 999, padding: '4px 8px' }}>${tg}</span>`)}
                    </div>
                  </div>
                  <div style=${{ fontFamily: "'Character Mono',monospace", fontSize: 10, color: '#9e9e9e', flex: 'none' }}>${d.dist}</div>
                </button>
              `; })}
            </div>
          </div>
        `)}
      </div>
    `;
  }

  function TripScreen({ state, patch, mapWrapRef, mapSize, onMapPointerDown, onMapWheel, onMapClick }) {
    const trip = state.trips.find(t => t.id === state.tripId) || state.trips[0];
    const all = allSpotsForTrip(state);
    const counts = {};
    all.forEach(s => { counts[s.c] = (counts[s.c] || 0) + 1; });
    const catKeys = Object.keys(D.cats).filter(k => counts[k]);

    return html`
      <div style=${{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
        <div style=${{ padding: '56px 16px 0', background: '#131313', zIndex: 6 }}>
          <div style=${{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <button type="button" className="link-fade" onClick=${() => patch({ screen: 'trips', detail: null })} style=${{ fontFamily: "'Character Mono',monospace", fontSize: 12, color: '#b3b3b3' }}>(all trips)</button>
            <div style=${{ display: 'flex', background: '#1e1e1e', borderRadius: 999, padding: 3 }}>
              <button type="button" onClick=${() => patch({ view: 'map' })} style=${{ fontFamily: "'Character Mono',monospace", fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '6px 14px', borderRadius: 999, background: state.view === 'map' ? '#fff' : 'transparent', color: state.view === 'map' ? '#131313' : '#b3b3b3' }}>map</button>
              <button type="button" onClick=${() => patch({ view: 'list' })} style=${{ fontFamily: "'Character Mono',monospace", fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '6px 14px', borderRadius: 999, background: state.view === 'list' ? '#fff' : 'transparent', color: state.view === 'list' ? '#131313' : '#b3b3b3' }}>list</button>
            </div>
          </div>
          <div style=${{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
            <h2 style=${{ fontSize: 30, lineHeight: 1, letterSpacing: '-0.6px', fontWeight: 600, textTransform: 'lowercase', margin: 0 }}>${trip.name}</h2>
            <span style=${{ fontFamily: "'Character Mono',monospace", fontSize: 11, color: '#9e9e9e' }}>${all.length ? all.length + (all.length === 1 ? ' spot' : ' spots') : 'empty'}</span>
          </div>
          <div style=${{ display: 'flex', alignItems: 'center', gap: 8, background: '#1e1e1e', borderRadius: 999, padding: '0 14px', height: 40, marginBottom: 10 }}>
            ${SearchIcon()}
            <input value=${state.query} onChange=${(e) => patch({ query: e.target.value })} placeholder="search spots, notes, tags"
              style=${{ flex: 1, minWidth: 0, border: 0, background: 'transparent', height: 38, fontSize: 15, outline: 'none' }} />
          </div>
          <div style=${{ display: 'flex', gap: 7, overflowX: 'auto', maxWidth: '100%', padding: '2px 0 12px' }}>
            ${catKeys.map(k => {
              const on = !state.off[k];
              const toggle = () => patch({ off: { ...state.off, [k]: on } });
              return html`
                <button type="button" key=${k} onClick=${toggle}
                  style=${{ flex: 'none', display: 'flex', alignItems: 'center', gap: 7, borderRadius: 999, padding: '7px 13px 7px 10px', background: on ? '#fff' : '#131313', color: on ? '#131313' : '#9e9e9e', border: `1px solid ${on ? '#fff' : '#333333'}`, fontSize: 13, fontWeight: 500, textTransform: 'lowercase', whiteSpace: 'nowrap' }}>
                  <span style=${{ width: 10, height: 10, borderRadius: 999, background: on ? D.cats[k].fill : '#494949', flex: 'none' }}/>${D.cats[k].label}
                  <span style=${{ fontFamily: "'Character Mono',monospace", fontSize: 10, opacity: 0.6 }}>${counts[k]}</span>
                </button>
              `;
            })}
          </div>
        </div>
        ${state.view === 'map'
          ? MapView({ state, patch, mapSize, mapWrapRef, onMapPointerDown, onMapWheel, onMapClick })
          : ListView({ state, patch, all })}
      </div>
    `;
  }

  // ---------- spot detail ----------

  function SpotDetailScreen({ state, patch, bump }) {
    const d = state.spots.find(s => s.id === state.detail);
    if (!d) return null;
    const c = D.cats[d.c];
    const stay = currentStay(state);
    const km = distanceTo(state, d);

    const close = () => patch({ detail: null });
    const toggleVisited = () => patch({ spots: state.spots.map(s => s.id === d.id ? { ...s, visited: !s.visited } : s) });
    const setNote = (e) => { const v = e.target.value; patch({ spots: state.spots.map(s => s.id === d.id ? { ...s, no: v } : s) }); };
    const removeSpot = () => patch({ spots: state.spots.filter(s => s.id !== d.id), detail: null, sel: null });

    return html`
      <div style=${{ position: 'absolute', inset: 0, zIndex: 20, background: '#131313', display: 'flex', flexDirection: 'column', animation: 'upSheet 320ms cubic-bezier(0.93,0,0.07,1)' }}>
        <div style=${{ flex: 'none', padding: '56px 16px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button type="button" className="link-fade" onClick=${close} style=${{ fontFamily: "'Character Mono',monospace", fontSize: 12, color: '#b3b3b3' }}>(back to map)</button>
          <button type="button" onClick=${toggleVisited}
            style=${{ fontFamily: "'Character Mono',monospace", fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', border: `1px solid ${d.visited ? '#aed900' : '#333333'}`, background: d.visited ? '#aed900' : '#131313', color: d.visited ? '#131313' : '#f3f3f3', borderRadius: 999, padding: '7px 12px', whiteSpace: 'nowrap' }}>${d.visited ? '✓ visited' : 'mark visited'}</button>
        </div>
        <div style=${{ flex: 1, overflowY: 'auto', padding: '0 0 34px' }}>
          <div style=${{ padding: '0 16px' }}>
            <div style=${{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style=${{ width: 11, height: 11, borderRadius: 999, background: c.fill }}/>
              <span style=${{ fontFamily: "'Character Mono',monospace", fontSize: 10.5, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#b3b3b3' }}>${c.label} · ${d.a}</span>
            </div>
            <h2 style=${{ fontSize: 32, lineHeight: 1.02, letterSpacing: '-0.7px', fontWeight: 600, textTransform: 'lowercase', margin: '0 0 8px' }}>${d.n}</h2>
            ${d.addr ? html`<div style=${{ fontSize: 14.5, lineHeight: 1.4, color: '#b3b3b3', margin: '0 0 12px' }}>${d.addr}</div>` : null}
            <div style=${{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
              ${(d.t || []).map((tg, i) => html`<span key=${i} style=${{ fontFamily: "'Character Mono',monospace", fontSize: 9.5, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#fff', background: c.soft, borderRadius: 999, padding: '5px 9px' }}>${tg}</span>`)}
            </div>
          </div>
          <div style=${{ padding: '0 16px 16px' }}>
            <div style=${{ display: 'flex', gap: 8, overflowX: 'auto', scrollSnapType: 'x mandatory', paddingBottom: 2 }}>
              ${[0, 1, 2].map(i => html`<${PhotoSlot} key=${i} spotId=${d.id} index=${i} width=${i === 0 ? 268 : 190} height=${196} radius=${18} placeholder=${i === 0 ? 'drop a photo of ' + d.n : 'photo ' + (i + 1)} bump=${bump} />`)}
            </div>
          </div>
          <div style=${{ padding: '0 16px' }}>
            <div style=${{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
              <div style=${{ background: '#1e1e1e', borderRadius: 16, padding: '12px 13px' }}>
                <div style=${{ fontFamily: "'Character Mono',monospace", fontSize: 9.5, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#9e9e9e', marginBottom: 5 }}>from your stay</div>
                <div style=${{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.3px' }}>${!stay ? 'no stay set' : G.fmtKm(km)}</div>
                <div style=${{ fontSize: 12.5, color: '#b3b3b3' }}>${!stay ? 'tap to set one' : Math.max(2, Math.round(km * 13)) + ' min walk'}</div>
              </div>
              <div style=${{ background: '#1e1e1e', borderRadius: 16, padding: '12px 13px' }}>
                <div style=${{ fontFamily: "'Character Mono',monospace", fontSize: 9.5, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#9e9e9e', marginBottom: 5 }}>hours · price</div>
                <div style=${{ fontSize: 13, fontWeight: 500, color: d.h ? '#fff' : '#737373', lineHeight: 1.4, whiteSpace: 'pre-line' }}>${d.h || 'not added yet'}</div>
                <div style=${{ fontSize: 12.5, color: '#b3b3b3' }}>${d.p || 'add a price'}</div>
              </div>
            </div>
            ${d.u ? html`
              <div style=${{ borderRadius: 20, padding: 14, background: c.soft, marginBottom: 14 }}>
                <div style=${{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }}>
                  <div style=${{ fontFamily: "'Character Mono',monospace", fontSize: 10, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#fff' }}>saved from ${G.host(d.u)}</div>
                </div>
                <a href=${d.u} target="_blank" rel="noreferrer" style=${{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#fff', color: '#131313', borderRadius: 999, padding: '9px 15px', fontSize: 13.5, fontWeight: 500, textTransform: 'lowercase' }}>open original ${ExternalLinkIcon()}</a>
              </div>
            ` : null}
            <div style=${{ marginBottom: 14 }}>
              <div style=${MONO_HEADER}>notes</div>
              <textarea value=${d.no || ''} onChange=${setNote} placeholder="what do you want to order? who told you about it?"
                style=${{ width: '100%', minHeight: 84, resize: 'vertical', border: '1px solid #333333', borderRadius: 16, padding: '12px 13px', fontSize: 14.5, lineHeight: 1.45, background: '#131313' }}/>
            </div>
            <button type="button" onClick=${removeSpot}
              style=${{ fontFamily: "'Character Mono',monospace", fontSize: 10.5, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#f62350', border: '1px solid #4a1620', borderRadius: 999, padding: '9px 14px' }}>remove from trip</button>
          </div>
        </div>
      </div>
    `;
  }

  // ---------- add spot sheet ----------

  function AddSpotSheet({ state, patch, bump }) {
    const f = state.f;
    const inferred = G.arrFrom(f.addr);
    const activeArr = f.arrManual ? f.arr : (inferred ? inferred.arr : f.arr);
    const close = () => patch({ addOpen: false });
    const setField = (k) => (e) => patch({ f: { ...state.f, [k]: e.target.value } });
    const pickCat = (k) => () => patch({ f: { ...state.f, cat: k } });
    const pickArr = (a) => () => patch({ f: { ...state.f, arr: a, arrManual: true } });
    const toggleArrPicker = () => patch({ f: { ...state.f, pickerOpen: !state.f.pickerOpen } });
    const showArrPicker = !inferred || f.pickerOpen;

    const doGoogleSearch = async () => {
      const q = (f.name + ' ' + (f.addr || '')).trim();
      if (!q) return;
      patch(prev => ({ f: { ...prev.f, googleSearching: true, googleResults: [] } }));
      const results = await window.PinsPlaces.searchPlaces(q);
      patch(prev => ({ f: { ...prev.f, googleSearching: false, googleResults: results } }));
    };
    const pickGoogleResult = (r) => async () => {
      patch(prev => ({ f: { ...prev.f, googleResults: [], googleSearching: true } }));
      const details = await window.PinsPlaces.getDetails(r.id);
      patch(prev => {
        if (!details) return { f: { ...prev.f, googleSearching: false } };
        const hit = G.arrFrom(details.address);
        return {
          f: {
            ...prev.f, googleSearching: false, googlePlace: details,
            addr: details.address || prev.f.addr, arr: hit ? hit.arr : prev.f.arr, arrManual: false
          }
        };
      });
    };
    const clearGoogle = () => patch({ f: { ...state.f, googlePlace: null } });

    const saveSpot = () => {
      const name = f.name.trim();
      if (!name) return;
      const gp = f.googlePlace;
      let la, ln;
      if (gp && gp.la != null && gp.ln != null) {
        la = gp.la; ln = gp.ln;
      } else {
        const base = D.arrs[activeArr] || D.arrs['3e'];
        const num = parseInt((f.addr.match(/\d{1,4}/) || ['' + (state.spots.length * 7)])[0], 10) || 0;
        la = base[0] + ((((num * 61) % 100) / 100) - 0.5) * 0.006;
        ln = base[1] + ((((num * 37) % 100) / 100) - 0.5) * 0.010;
      }
      const id = name.toLowerCase() + '-' + state.spots.length;
      const s = {
        id, idx: state.spots.length, n: name.toLowerCase(),
        c: f.cat, a: activeArr, addr: f.addr.trim() || undefined,
        la, ln, no: f.note, u: f.url || undefined, t: [], visited: false, trip: state.tripId,
        h: (gp && gp.hours) || undefined, p: (gp && gp.price) || undefined
      };
      patch({
        spots: state.spots.concat([s]), addOpen: false, sel: s.id, detail: s.id,
        f: { name: '', cat: f.cat, arr: activeArr, addr: '', arrManual: false, pickerOpen: false, url: '', note: '', googleResults: [], googleSearching: false, googlePlace: null }
      });
      if (gp && gp.photoName) {
        window.PinsPlaces.fetchPhotoBlob(gp.photoName, 800).then(async (blob) => {
          if (!blob) return;
          try {
            const dataUrl = await S.compressImage(blob);
            S.savePhoto(id, 0, dataUrl);
            bump();
          } catch (err) { console.warn('pins: could not save google photo', err); }
        });
      }
    };

    return html`
      <div style=${{ position: 'absolute', inset: 0, zIndex: 30, background: 'rgba(0,0,0,0.72)', animation: 'fadeIn 180ms linear' }} onClick=${close}>
        <div onClick=${(e) => e.stopPropagation()} style=${{ position: 'absolute', left: 0, right: 0, bottom: 0, background: '#131313', borderRadius: '26px 26px 0 0', maxHeight: '88%', display: 'flex', flexDirection: 'column', animation: 'upSheet 320ms cubic-bezier(0.93,0,0.07,1)' }}>
          <div style=${{ flex: 'none', padding: '14px 16px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style=${{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.4px', textTransform: 'lowercase' }}>add a spot</div>
            <button type="button" onClick=${close} style=${{ fontFamily: "'Character Mono',monospace", fontSize: 11, color: '#b3b3b3' }}>close</button>
          </div>
          <div style=${{ flex: 1, overflowY: 'auto', padding: '6px 16px 20px' }}>
            <div style=${MONO_HEADER}>name</div>
            <input value=${f.name} onChange=${setField('name')} placeholder="e.g. du pain et des idées"
              style=${{ width: '100%', border: '1px solid #333333', borderRadius: 14, padding: '11px 13px', fontSize: 15, marginBottom: 10 }}/>
            ${window.PinsPlaces.isConfigured() ? html`
              ${f.googlePlace ? html`
                <div style=${{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14, background: '#1e1e1e', borderRadius: 14, padding: '10px 12px' }}>
                  <span style=${{ fontSize: 13 }}>✓ found on google — photo + hours will be added</span>
                  <button type="button" onClick=${clearGoogle} style=${{ marginLeft: 'auto', flex: 'none', fontFamily: "'Character Mono',monospace", fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#9e9e9e' }}>clear</button>
                </div>
              ` : html`
                <button type="button" onClick=${doGoogleSearch} disabled=${!f.name.trim() || f.googleSearching}
                  style=${{ width: '100%', border: '1px solid #333333', borderRadius: 14, padding: '10px', fontSize: 13.5, textAlign: 'center', color: f.name.trim() ? '#fff' : '#737373', marginBottom: 14 }}>${f.googleSearching ? 'looking…' : 'look up on google'}</button>
              `}
              ${f.googleResults.length ? html`
                <div style=${{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14, marginTop: -6 }}>
                  ${f.googleResults.map(r => html`
                    <button type="button" key=${r.id} onClick=${pickGoogleResult(r)}
                      style=${{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', textAlign: 'left', border: '1px solid #333333', borderRadius: 12, padding: '9px 11px' }}>
                      <span style=${{ fontSize: 14, fontWeight: 500 }}>${r.name}</span>
                      <span style=${{ fontFamily: "'Character Mono',monospace", fontSize: 10.5, color: '#9e9e9e' }}>${r.address}</span>
                    </button>
                  `)}
                </div>
              ` : null}
            ` : null}
            <div style=${MONO_HEADER}>category</div>
            <div style=${{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 14 }}>
              ${Object.keys(D.cats).map(k => { const on = f.cat === k; return html`
                <button type="button" key=${k} onClick=${pickCat(k)}
                  style=${{ display: 'flex', alignItems: 'center', gap: 7, borderRadius: 999, padding: '8px 13px', background: on ? '#fff' : '#131313', color: on ? '#131313' : '#fff', border: `1px solid ${on ? '#fff' : '#333333'}`, fontSize: 13, textTransform: 'lowercase', whiteSpace: 'nowrap' }}>
                  <span style=${{ width: 10, height: 10, borderRadius: 999, background: D.cats[k].fill }}/>${D.cats[k].label}
                </button>
              `; })}
            </div>
            <div style=${MONO_HEADER}>street address</div>
            <input value=${f.addr} onChange=${setField('addr')} placeholder="35 rue de bretagne, 75003"
              style=${{ width: '100%', border: '1px solid #333333', borderRadius: 14, padding: '11px 13px', fontSize: 15, marginBottom: 10 }}/>
            ${inferred ? html`
              <div style=${{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 9, marginBottom: 14 }}>
                <span style=${{ flex: 'none', background: '#fff', color: '#131313', borderRadius: 999, padding: '6px 11px', fontSize: 12.5, fontWeight: 600, textTransform: 'lowercase', whiteSpace: 'nowrap' }}>${activeArr} · ${D.hoods[activeArr] || ''}</span>
                <button type="button" onClick=${toggleArrPicker} style=${{ flex: 'none', marginLeft: 'auto', fontFamily: "'Character Mono',monospace", fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#fff', borderBottom: '1px solid #737373' }}>change</button>
                <span style=${{ flexBasis: '100%', fontFamily: "'Character Mono',monospace", fontSize: 10, lineHeight: 1.4, color: '#9e9e9e' }}>${f.arrManual ? 'you picked this one' : inferred.how}</span>
              </div>
            ` : html`
              <p style=${{ fontSize: 13, lineHeight: 1.45, color: '#b3b3b3', margin: '0 0 10px' }}>add a postal code or a neighborhood name and the pin places itself. or pick the arrondissement:</p>
            `}
            ${showArrPicker ? html`
              <div style=${{ display: 'flex', gap: 7, overflowX: 'auto', maxWidth: '100%', paddingBottom: 14 }}>
                ${Object.keys(D.arrs).map(a => { const on = activeArr === a; return html`
                  <button type="button" key=${a} onClick=${pickArr(a)}
                    style=${{ flex: 'none', borderRadius: 999, padding: '8px 13px', background: on ? '#fff' : '#131313', color: on ? '#131313' : '#b3b3b3', border: `1px solid ${on ? '#fff' : '#333333'}`, fontFamily: "'Character Mono',monospace", fontSize: 11, whiteSpace: 'nowrap' }}>${a} ${D.hoods[a] || ''}</button>
                `; })}
              </div>
            ` : null}
            <div style=${MONO_HEADER}>source link</div>
            <input value=${f.url} onChange=${setField('url')} placeholder="paste the tiktok or instagram url"
              style=${{ width: '100%', border: '1px solid #333333', borderRadius: 14, padding: '11px 13px', fontSize: 15, marginBottom: 14 }}/>
            <div style=${MONO_HEADER}>why you saved it</div>
            <textarea value=${f.note} onChange=${setField('note')} placeholder="the thing you'll forget otherwise"
              style=${{ width: '100%', minHeight: 70, resize: 'vertical', border: '1px solid #333333', borderRadius: 16, padding: '11px 13px', fontSize: 15, lineHeight: 1.45, marginBottom: 16 }}/>
            <button type="button" onClick=${saveSpot}
              style=${{ width: '100%', background: f.name.trim() ? '#fff' : '#1e1e1e', color: f.name.trim() ? '#131313' : '#737373', borderRadius: 999, padding: 15, fontSize: 16, fontWeight: 500, textTransform: 'lowercase' }}>${f.name.trim() ? 'drop the pin' : 'name it first'}</button>
            <p style=${{ fontFamily: "'Character Mono',monospace", fontSize: 10, color: '#9e9e9e', textAlign: 'center', margin: '10px 0 0' }}>saves to this trip, on this device.</p>
          </div>
        </div>
      </div>
    `;
  }

  // ---------- stay sheet ----------

  function StaySheet({ state, patch }) {
    const list = stayList(state);
    const activeId = state.activeStay[state.tripId];
    const sf = state.sf;
    const trip = state.trips.find(t => t.id === state.tripId);
    // Biases the search toward the trip's own destination, so e.g. a hotel search
    // on a Puglia trip surfaces hotels in Puglia instead of Puglia itself again.
    const near = trip && trip.location ? { la: trip.location.la, ln: trip.location.ln } : undefined;
    const close = () => patch({ stayOpen: false, stayEditId: null });

    const setSFName = (e) => {
      const v = e.target.value;
      // Once a place is picked, this field is just the editable display name —
      // don't let typing re-trigger the arrondissement guess or drop the pick.
      if (sf.googlePlace) { patch({ sf: { ...sf, name: v } }); return; }
      const hit = G.arrFrom(v);
      patch({ sf: { ...sf, name: v, arr: hit ? hit.arr : sf.arr } });
    };
    const sfHit = G.arrFrom(sf.name);
    const sfNote = sfHit ? sfHit.arr + ' · ' + (D.hoods[sfHit.arr] || '') + ' — ' + sfHit.how : '';
    const pickArr = (a) => () => patch({ sf: { ...sf, arr: a } });
    const setStart = (e) => patch({ sf: { ...sf, start: e.target.value } });
    const setEnd = (e) => patch({ sf: { ...sf, end: e.target.value } });

    const doStayGoogleSearch = async () => {
      const q = sf.name.trim();
      if (!q) return;
      patch(prev => ({ sf: { ...prev.sf, googleSearching: true, googleResults: [] } }));
      const results = await window.PinsPlaces.searchPlaces(q, near ? { near } : undefined);
      patch(prev => ({ sf: { ...prev.sf, googleSearching: false, googleResults: results } }));
    };
    const onSFKeyDown = (e) => { if (e.key === 'Enter') { e.preventDefault(); doStayGoogleSearch(); } };
    const pickStayGoogleResult = (r) => () => patch({ sf: { ...sf, googlePlace: r, name: (r.name || r.address).toLowerCase(), googleResults: [] } });
    const changeStayGoogle = () => patch({ sf: { ...sf, googlePlace: null, name: '', googleResults: [] } });

    const addStay = () => {
      let entry;
      if (sf.googlePlace) {
        const nm = sf.name.trim(); if (!nm) return;
        entry = { id: 'stay-' + Date.now(), name: nm.toLowerCase(), spotId: null, arr: null, address: sf.googlePlace.address, la: sf.googlePlace.la, ln: sf.googlePlace.ln, start: sf.start, end: sf.end };
      } else {
        const nm = sf.name.trim(); if (!nm) return;
        const b = D.arrs[sf.arr];
        entry = { id: 'stay-' + Date.now(), name: nm.toLowerCase(), spotId: null, arr: sf.arr, la: b[0], ln: b[1], start: sf.start, end: sf.end };
      }
      patch({
        stays: { ...state.stays, [state.tripId]: list.concat([entry]) },
        activeStay: { ...state.activeStay, [state.tripId]: entry.id },
        sf: { name: '', arr: sf.arr, start: '', end: '', googleResults: [], googleSearching: false, googlePlace: null }
      });
    };

    const setActive = (entry) => () => patch({ activeStay: { ...state.activeStay, [state.tripId]: entry.id } });
    const removeEntry = (entry) => () => {
      const remaining = list.filter(s => s.id !== entry.id);
      patch({
        stays: { ...state.stays, [state.tripId]: remaining },
        activeStay: activeId === entry.id
          ? { ...state.activeStay, [state.tripId]: remaining[0] ? remaining[0].id : null }
          : state.activeStay
      });
    };
    const startEditDates = (entry) => () => patch({ stayEditId: entry.id, stayEditStart: entry.start || '', stayEditEnd: entry.end || '' });
    const cancelEditDates = () => patch({ stayEditId: null, stayEditStart: '', stayEditEnd: '' });
    const saveEditDates = () => {
      patch({
        stays: { ...state.stays, [state.tripId]: list.map(s => s.id === state.stayEditId ? { ...s, start: state.stayEditStart, end: state.stayEditEnd } : s) },
        stayEditId: null, stayEditStart: '', stayEditEnd: ''
      });
    };

    return html`
      <div style=${{ position: 'absolute', inset: 0, zIndex: 32, background: 'rgba(0,0,0,0.72)', animation: 'fadeIn 180ms linear' }} onClick=${close}>
        <div onClick=${(e) => e.stopPropagation()} style=${{ position: 'absolute', left: 0, right: 0, bottom: 0, background: '#131313', borderRadius: '26px 26px 0 0', maxHeight: '88%', display: 'flex', flexDirection: 'column', animation: 'upSheet 320ms cubic-bezier(0.93,0,0.07,1)' }}>
          <div style=${{ flex: 'none', padding: '16px 16px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style=${{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.4px', textTransform: 'lowercase' }}>where you're staying</div>
            <button type="button" onClick=${close} style=${{ fontFamily: "'Character Mono',monospace", fontSize: 11, color: '#b3b3b3' }}>close</button>
          </div>
          <div style=${{ flex: 1, overflowY: 'auto', padding: '0 16px 22px' }}>
            <p style=${{ fontSize: 14, lineHeight: 1.45, color: '#b3b3b3', margin: '0 0 16px' }}>every distance on the map is measured from whichever stay is current. add more than one if you're splitting the trip between places, each with its own dates.</p>

            ${list.length ? html`
              <div style=${MONO_HEADER}>your stays</div>
              <div style=${{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
                ${list.map(entry => {
                  const isActive = activeId === entry.id;
                  const editing = state.stayEditId === entry.id;
                  return html`
                    <div key=${entry.id} style=${{ border: `1px solid ${isActive ? '#fff' : '#333333'}`, borderRadius: 18, padding: 13 }}>
                      <div style=${{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style=${{ flex: 1, minWidth: 0 }}>
                          <div style=${{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.2px', textTransform: 'lowercase', lineHeight: 1.2 }}>${entry.name}</div>
                          <div style=${{ fontFamily: "'Character Mono',monospace", fontSize: 10.5, color: '#9e9e9e', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>${[entry.arr || entry.address, fmtDateRange(entry.start, entry.end)].filter(Boolean).join(' · ') || 'no dates yet'}</div>
                        </div>
                        <button type="button" onClick=${setActive(entry)}
                          style=${{ flex: 'none', fontFamily: "'Character Mono',monospace", fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', borderRadius: 999, padding: '6px 11px', background: isActive ? '#fff' : 'transparent', color: isActive ? '#131313' : '#b3b3b3', border: `1px solid ${isActive ? '#fff' : '#333333'}`, whiteSpace: 'nowrap' }}>${isActive ? 'current' : 'switch to this'}</button>
                      </div>
                      ${editing ? html`
                        <div style=${{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                          <input type="date" value=${state.stayEditStart} onChange=${(e) => patch({ stayEditStart: e.target.value })} style=${{ ...DATE_INPUT_STYLE, fontSize: 13, padding: '7px 10px', borderRadius: 10 }}/>
                          <span style=${{ color: '#737373', flex: 'none' }}>–</span>
                          <input type="date" value=${state.stayEditEnd} min=${state.stayEditStart || undefined} onChange=${(e) => patch({ stayEditEnd: e.target.value })} style=${{ ...DATE_INPUT_STYLE, fontSize: 13, padding: '7px 10px', borderRadius: 10 }}/>
                        </div>
                        <div style=${{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 8 }}>
                          <button type="button" onClick=${saveEditDates} style=${{ fontFamily: "'Character Mono',monospace", fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#fff' }}>save</button>
                          <button type="button" onClick=${cancelEditDates} style=${{ fontFamily: "'Character Mono',monospace", fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#9e9e9e' }}>cancel</button>
                        </div>
                      ` : html`
                        <div style=${{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
                          <button type="button" onClick=${startEditDates(entry)} style=${{ fontFamily: "'Character Mono',monospace", fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#9e9e9e', borderBottom: '1px solid #494949' }}>${fmtDateRange(entry.start, entry.end) ? 'edit dates' : 'add dates'}</button>
                          <button type="button" onClick=${removeEntry(entry)} style=${{ marginLeft: 'auto', fontFamily: "'Character Mono',monospace", fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#9e9e9e' }}>remove</button>
                        </div>
                      `}
                    </div>
                  `;
                })}
              </div>
            ` : null}

            <div style=${MONO_HEADER}>${list.length ? 'add another stay' : "where you're staying"}</div>
            <div style=${{ display: 'flex', gap: 8, marginBottom: sf.googlePlace ? 6 : 10 }}>
              <div style=${{ flex: 1, minWidth: 0, position: 'relative' }}>
                ${sf.googlePlace ? html`<span style=${{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: '#aed900', fontSize: 15, pointerEvents: 'none' }}>✓</span>` : null}
                <input value=${sf.name} onChange=${setSFName} onKeyDown=${onSFKeyDown} placeholder="search by name or address — sheraton montreal, 12 rue de bretagne…"
                  style=${{ width: '100%', border: `1px solid ${sf.googlePlace ? '#fff' : '#333333'}`, borderRadius: 14, padding: sf.googlePlace ? '11px 13px 11px 34px' : '11px 13px', fontSize: 15, background: 'transparent', color: '#fff' }}/>
              </div>
              ${window.PinsPlaces.isConfigured() ? html`
                <button type="button" onClick=${sf.googlePlace ? changeStayGoogle : doStayGoogleSearch} disabled=${!sf.googlePlace && (!sf.name.trim() || sf.googleSearching)}
                  style=${{ flex: 'none', border: `1px solid ${sf.googlePlace ? '#fff' : '#333333'}`, borderRadius: 14, padding: '0 15px', fontSize: 13, color: sf.googlePlace || sf.name.trim() ? '#fff' : '#737373' }}>${sf.googlePlace ? 'search again' : (sf.googleSearching ? '…' : 'search')}</button>
              ` : null}
            </div>
            ${sf.googlePlace ? html`<div style=${{ fontFamily: "'Character Mono',monospace", fontSize: 10.5, color: '#9e9e9e', margin: '0 0 10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>found at ${sf.googlePlace.address || sf.googlePlace.name} — edit the name above if you'd like</div>` : null}
            ${sf.googleResults.length ? html`
              <div style=${{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
                ${sf.googleResults.map(r => html`
                  <button type="button" key=${r.id} onClick=${pickStayGoogleResult(r)}
                    style=${{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', textAlign: 'left', border: '1px solid #333333', borderRadius: 12, padding: '9px 11px' }}>
                    <span style=${{ fontSize: 14, fontWeight: 500 }}>${r.name}</span>
                    <span style=${{ fontFamily: "'Character Mono',monospace", fontSize: 10.5, color: '#9e9e9e' }}>${r.address}</span>
                  </button>
                `)}
              </div>
            ` : null}
            ${!window.PinsPlaces.isConfigured() ? html`
              ${sfHit ? html`<div style=${{ fontFamily: "'Character Mono',monospace", fontSize: 10, color: '#9e9e9e', margin: '0 0 10px' }}>${sfNote}</div>` : null}
              <div style=${{ display: 'flex', gap: 7, overflowX: 'auto', maxWidth: '100%', paddingBottom: 12 }}>
                ${Object.keys(D.arrs).map(a => { const on = sf.arr === a; return html`
                  <button type="button" key=${a} onClick=${pickArr(a)}
                    style=${{ flex: 'none', borderRadius: 999, padding: '8px 13px', background: on ? '#fff' : 'transparent', color: on ? '#131313' : '#b3b3b3', border: `1px solid ${on ? '#fff' : '#333333'}`, fontFamily: "'Character Mono',monospace", fontSize: 11 }}>${a} ${D.hoods[a] || ''}</button>
                `; })}
              </div>
            ` : null}

            <div style=${MONO_HEADER}>dates for this stay</div>
            <div style=${{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <input type="date" value=${sf.start} onChange=${setStart} style=${DATE_INPUT_STYLE}/>
              <span style=${{ color: '#737373', flex: 'none' }}>–</span>
              <input type="date" value=${sf.end} min=${sf.start || undefined} onChange=${setEnd} style=${DATE_INPUT_STYLE}/>
            </div>

            <button type="button" onClick=${addStay}
              style=${{ width: '100%', background: sf.name.trim() ? '#fff' : '#1e1e1e', color: sf.name.trim() ? '#131313' : '#737373', borderRadius: 999, padding: 14, fontSize: 15.5, fontWeight: 500, textTransform: 'lowercase' }}>add this stay</button>
          </div>
        </div>
      </div>
    `;
  }

  // ---------- new trip sheet ----------

  function NewTripSheet({ state, patch }) {
    const nt = state.nt;
    const close = () => patch({ newTripOpen: false });
    const setLoc = (p) => patch(prev => ({ nt: { ...prev.nt, ...p } }));
    const setStayDraft = (p) => patch(prev => ({ nt: { ...prev.nt, stayDraft: { ...prev.nt.stayDraft, ...p } } }));

    const addDraftStay = () => {
      const loc = nt.stayDraft.location;
      if (!loc) return;
      const nm = (nt.stayDraft.name.trim() || loc.name).toLowerCase();
      const entry = { id: 'stay-' + Date.now(), name: nm, spotId: null, arr: null, address: loc.address, la: loc.la, ln: loc.ln, start: nt.stayDraft.start, end: nt.stayDraft.end };
      patch({ nt: { ...nt, stays: nt.stays.concat([entry]), stayDraft: emptyStayDraft() } });
    };
    const removeDraftStay = (id) => () => patch({ nt: { ...nt, stays: nt.stays.filter(s => s.id !== id) } });

    const createTrip = () => {
      const nm = (nt.name || 'new trip').trim().toLowerCase();
      const id = 'trip-' + Date.now() + '-' + state.trips.length;
      const fills = ['#ffadd2', '#aed900', '#7db4ff', '#f28500'];
      const trip = { id, name: nm, legs: nt.legs, fill: fills[state.trips.length % 4], geo: false, location: nt.location };
      const draftStays = nt.stays;
      patch({
        trips: state.trips.concat([trip]),
        stays: draftStays.length ? { ...state.stays, [id]: draftStays } : state.stays,
        activeStay: draftStays.length ? { ...state.activeStay, [id]: draftStays[0].id } : state.activeStay,
        newTripOpen: false,
        nt: { name: '', legs: [newLeg()], location: null, locResults: [], locSearching: false, stays: [], stayDraft: emptyStayDraft() }
      });
    };

    return html`
      <div style=${{ position: 'absolute', inset: 0, zIndex: 30, background: 'rgba(0,0,0,0.72)', animation: 'fadeIn 180ms linear' }} onClick=${close}>
        <div onClick=${(e) => e.stopPropagation()} style=${{ position: 'absolute', left: 0, right: 0, bottom: 0, background: '#131313', borderRadius: '26px 26px 0 0', maxHeight: '88%', display: 'flex', flexDirection: 'column', animation: 'upSheet 320ms cubic-bezier(0.93,0,0.07,1)' }}>
          <div style=${{ flex: 'none', padding: '16px 16px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style=${{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.4px', textTransform: 'lowercase' }}>start a trip</div>
            <button type="button" onClick=${close} style=${{ fontFamily: "'Character Mono',monospace", fontSize: 11, color: '#b3b3b3' }}>close</button>
          </div>
          <div style=${{ flex: 1, overflowY: 'auto', padding: '6px 16px 22px' }}>
            ${LocationSearchField({ value: nt, onChange: setLoc, label: 'where to', namePlaceholder: 'e.g. puglia, paris, japan', mode: 'region' })}
            ${LegsEditor({ legs: nt.legs, onChange: (legs) => patch({ nt: { ...nt, legs } }) })}

            ${window.PinsPlaces.isConfigured() ? html`
              <div style=${MONO_HEADER}>where you're staying (optional)</div>
              <p style=${{ fontSize: 13, lineHeight: 1.4, color: '#9e9e9e', margin: '0 0 12px' }}>add now, or skip and set it later from the map. you can add more than one.</p>
              ${nt.stays.length ? html`
                <div style=${{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                  ${nt.stays.map(s => html`
                    <div key=${s.id} style=${{ display: 'flex', alignItems: 'center', gap: 10, border: '1px solid #333333', borderRadius: 16, padding: 12 }}>
                      <div style=${{ flex: 1, minWidth: 0 }}>
                        <div style=${{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.2px', textTransform: 'lowercase', lineHeight: 1.2 }}>${s.name}</div>
                        <div style=${{ fontFamily: "'Character Mono',monospace", fontSize: 10.5, color: '#9e9e9e', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>${[s.address, fmtDateRange(s.start, s.end)].filter(Boolean).join(' · ') || 'dates tbd'}</div>
                      </div>
                      <button type="button" onClick=${removeDraftStay(s.id)} style=${{ flex: 'none', fontFamily: "'Character Mono',monospace", fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#9e9e9e' }}>remove</button>
                    </div>
                  `)}
                </div>
              ` : null}
              ${LocationSearchField({ value: nt.stayDraft, onChange: setStayDraft, label: 'search by name or address', namePlaceholder: "sheraton montreal, 12 rue de bretagne…", near: nt.location ? { la: nt.location.la, ln: nt.location.ln } : undefined })}
              <div style=${{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <input type="date" value=${nt.stayDraft.start} onChange=${(e) => setStayDraft({ start: e.target.value })} style=${DATE_INPUT_STYLE}/>
                <span style=${{ color: '#737373', flex: 'none' }}>–</span>
                <input type="date" value=${nt.stayDraft.end} min=${nt.stayDraft.start || undefined} onChange=${(e) => setStayDraft({ end: e.target.value })} style=${DATE_INPUT_STYLE}/>
              </div>
              <button type="button" onClick=${addDraftStay} disabled=${!nt.stayDraft.location}
                style=${{ width: '100%', border: '1px solid #333333', borderRadius: 14, padding: 12, fontSize: 14.5, textAlign: 'center', color: nt.stayDraft.location ? '#fff' : '#737373', marginBottom: 18 }}>${nt.stayDraft.location ? 'add this stay' : 'search and pick a place first'}</button>
            ` : null}

            <button type="button" onClick=${createTrip} style=${{ width: '100%', background: '#fff', color: '#131313', borderRadius: 999, padding: 15, fontSize: 16, fontWeight: 500, textTransform: 'lowercase' }}>create trip</button>
          </div>
        </div>
      </div>
    `;
  }

  // ---------- edit trip sheet ----------

  function EditTripSheet({ state, patch }) {
    const t = state.trips.find(tr => tr.id === state.editTripId);
    if (!t) return null;
    const et = state.et;
    const close = () => patch({ editTripId: null });
    const setLoc = (p) => patch(prev => ({ et: { ...prev.et, ...p } }));
    const saveTrip = () => {
      const nm = (et.name.trim() || t.name).toLowerCase();
      patch({
        trips: state.trips.map(tr => tr.id === t.id ? { ...tr, name: nm, legs: et.legs, location: et.location } : tr),
        editTripId: null
      });
    };
    return html`
      <div style=${{ position: 'absolute', inset: 0, zIndex: 30, background: 'rgba(0,0,0,0.72)', animation: 'fadeIn 180ms linear' }} onClick=${close}>
        <div onClick=${(e) => e.stopPropagation()} style=${{ position: 'absolute', left: 0, right: 0, bottom: 0, background: '#131313', borderRadius: '26px 26px 0 0', maxHeight: '88%', display: 'flex', flexDirection: 'column', animation: 'upSheet 320ms cubic-bezier(0.93,0,0.07,1)' }}>
          <div style=${{ flex: 'none', padding: '16px 16px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style=${{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.4px', textTransform: 'lowercase' }}>edit trip</div>
            <button type="button" onClick=${close} style=${{ fontFamily: "'Character Mono',monospace", fontSize: 11, color: '#b3b3b3' }}>close</button>
          </div>
          <div style=${{ flex: 1, overflowY: 'auto', padding: '6px 16px 22px' }}>
            ${LocationSearchField({ value: et, onChange: setLoc, label: 'where to', namePlaceholder: 'e.g. puglia, paris, japan', mode: 'region' })}
            ${LegsEditor({ legs: et.legs, onChange: (legs) => patch({ et: { ...et, legs } }) })}
            <button type="button" onClick=${saveTrip} style=${{ width: '100%', background: '#fff', color: '#131313', borderRadius: 999, padding: 15, fontSize: 16, fontWeight: 500, textTransform: 'lowercase' }}>save changes</button>
          </div>
        </div>
      </div>
    `;
  }

  // ---------- delete trip sheet ----------

  function DeleteTripSheet({ state, patch }) {
    const t = state.trips.find(tr => tr.id === state.confirmDeleteTripId);
    if (!t) return null;
    const n = state.spots.filter(s => s.trip === t.id).length;
    const close = () => patch({ confirmDeleteTripId: null });
    const confirmDelete = () => {
      const removedIds = state.spots.filter(s => s.trip === t.id).map(s => s.id);
      removedIds.forEach(id => { for (let i = 0; i < 3; i++) S.removePhoto(id, i); });
      const stays2 = { ...state.stays }, activeStay2 = { ...state.activeStay };
      delete stays2[t.id];
      delete activeStay2[t.id];
      patch({
        trips: state.trips.filter(tr => tr.id !== t.id),
        spots: state.spots.filter(s => s.trip !== t.id),
        stays: stays2,
        activeStay: activeStay2,
        confirmDeleteTripId: null
      });
    };
    return html`
      <div style=${{ position: 'absolute', inset: 0, zIndex: 40, background: 'rgba(0,0,0,0.72)', animation: 'fadeIn 180ms linear' }} onClick=${close}>
        <div onClick=${(e) => e.stopPropagation()} style=${{ position: 'absolute', left: 0, right: 0, bottom: 0, background: '#131313', borderRadius: '26px 26px 0 0', padding: '20px 16px 26px', animation: 'upSheet 320ms cubic-bezier(0.93,0,0.07,1)' }}>
          <div style=${{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.4px', textTransform: 'lowercase', marginBottom: 10 }}>delete ${t.name}?</div>
          <p style=${{ fontSize: 14.5, lineHeight: 1.45, color: '#b3b3b3', margin: '0 0 20px' }}>${n ? 'this removes all ' + n + (n === 1 ? ' spot' : ' spots') + ' saved here, along with any photos. this can\'t be undone.' : 'this trip has no spots saved yet. this can\'t be undone.'}</p>
          <button type="button" onClick=${confirmDelete}
            style=${{ width: '100%', background: '#f62350', color: '#fff', borderRadius: 999, padding: 15, fontSize: 16, fontWeight: 500, textTransform: 'lowercase', marginBottom: 10 }}>delete trip</button>
          <button type="button" onClick=${close}
            style=${{ width: '100%', fontFamily: "'Character Mono',monospace", fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#b3b3b3', padding: 10 }}>cancel</button>
        </div>
      </div>
    `;
  }

  // ---------- root ----------

  function App() {
    const [state, setState] = useState(makeInitialState);
    const [, setPhotoTick] = useState(0);
    const bump = () => setPhotoTick(t => t + 1);
    const patch = (p) => setState(prev => ({ ...prev, ...(typeof p === 'function' ? p(prev) : p) }));

    useEffect(() => {
      S.save({ trips: state.trips, spots: state.spots, stays: state.stays, activeStay: state.activeStay });
    }, [state.trips, state.spots, state.stays, state.activeStay]);

    // ---- boot ----
    const [boot, setBoot] = useState('in');
    const [bootMinElapsed, setBootMinElapsed] = useState(false);
    useEffect(() => {
      const t = setTimeout(() => setBootMinElapsed(true), 2350);
      return () => clearTimeout(t);
    }, []);
    const skipBoot = () => setBoot(b => (b === 'in' ? 'out' : b));

    // ---- cross-device sync (Supabase, shared — no login) ----
    const syncOn = window.PinsSync.isConfigured();
    const [syncReady, setSyncReady] = useState(!syncOn);
    const mergedRef = useRef(false);

    // Triggers the fade-out once conditions are met; deliberately excludes `boot`
    // from deps so it doesn't re-fire (and cancel the effect below) once boot flips to 'out'.
    useEffect(() => {
      if (!bootMinElapsed || !syncReady) return;
      setBoot(b => (b === 'in' ? 'out' : b));
    }, [bootMinElapsed, syncReady]);

    // Removes the boot overlay from the DOM once its fade-out transition finishes.
    useEffect(() => {
      if (boot !== 'out') return;
      const t = setTimeout(() => setBoot(null), 370);
      return () => clearTimeout(t);
    }, [boot]);

    useEffect(() => {
      if (!syncOn || mergedRef.current) return;
      mergedRef.current = true;
      (async () => {
        const remote = await window.PinsSync.loadSharedState();
        if (remote) {
          patch({
            trips: remote.trips ? migrateTripLegs(remote.trips) : state.trips,
            // Retired hotel-category spots (the old pinned/saved-hotels list) can still be
            // sitting in older synced data — strip them here too, not just from local storage.
            spots: remote.spots ? remote.spots.filter(s => s.c !== 'hotel') : state.spots,
            stays: remote.stays || state.stays,
            activeStay: remote.activeStay || state.activeStay
          });
        } else {
          await window.PinsSync.saveSharedState({
            trips: state.trips, spots: state.spots, stays: state.stays, activeStay: state.activeStay
          });
        }
        setSyncReady(true);
      })();
      // eslint-disable-next-line
    }, []);

    useEffect(() => {
      if (!syncOn || !syncReady) return;
      const t = setTimeout(() => {
        window.PinsSync.saveSharedState({
          trips: state.trips, spots: state.spots, stays: state.stays, activeStay: state.activeStay
        });
      }, 800);
      return () => clearTimeout(t);
    }, [state.trips, state.spots, state.stays, state.activeStay, syncReady]);

    const mapWrapRef = useRef(null);
    const [mapSize, setMapSize] = useState({ w: 0, h: 0 });
    useEffect(() => {
      const el = mapWrapRef.current;
      if (!el) return;
      const ro = new ResizeObserver((entries) => {
        const cr = entries[0].contentRect;
        setMapSize({ w: cr.width, h: cr.height });
      });
      ro.observe(el);
      return () => ro.disconnect();
    }, [state.screen, state.view]);

    // Selecting a spot (from a map pin or a sheet card) scrolls its matching
    // card in the pull-up sheet into view, so the two stay in sync either way.
    useEffect(() => {
      if (!state.sel) return;
      const el = document.querySelector(`[data-spot-id="${CSS.escape(state.sel)}"]`);
      if (el) el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }, [state.sel]);

    const fitKeyRef = useRef(null);
    useEffect(() => {
      if (state.screen !== 'trip' || state.view !== 'map') return;
      if (mapSize.w < 10) return;
      if (fitKeyRef.current === state.tripId) return;
      fitKeyRef.current = state.tripId;
      patch(prev => fitToSpots(prev, mapSize));
      // eslint-disable-next-line
    }, [state.screen, state.view, state.tripId, mapSize.w, mapSize.h]);

    const draggedRef = useRef(false);
    const onMapPointerDown = (e) => {
      if (e.button === 1 || e.button === 2) return;
      const sx = e.clientX, sy = e.clientY;
      const tx0 = state.tx, ty0 = state.ty;
      let moved = false;
      const el = e.currentTarget;
      const move = (ev) => {
        const dx = ev.clientX - sx, dy = ev.clientY - sy;
        if (Math.abs(dx) + Math.abs(dy) > 4) { moved = true; el.style.cursor = 'grabbing'; }
        if (moved) patch({ tx: tx0 + dx, ty: ty0 + dy });
      };
      const up = () => {
        el.style.cursor = 'grab';
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        draggedRef.current = moved;
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    };
    const onMapWheel = (e) => { e.preventDefault(); patch(prev => zoomBy(prev, mapSize, e.deltaY < 0 ? 1.12 : 0.9)); };
    const onMapClick = () => { if (!draggedRef.current) patch({ sel: null }); };

    return html`
      <div className="app-shell">
        ${boot ? BootScreen({ boot, onSkip: skipBoot }) : null}
        ${state.screen === 'trips'
          ? TripsScreen({ state, patch })
          : TripScreen({ state, patch, mapWrapRef, mapSize, onMapPointerDown, onMapWheel, onMapClick })}
        ${state.detail ? SpotDetailScreen({ state, patch, bump }) : null}
        ${state.addOpen ? AddSpotSheet({ state, patch, bump }) : null}
        ${state.stayOpen ? StaySheet({ state, patch }) : null}
        ${state.newTripOpen ? NewTripSheet({ state, patch }) : null}
        ${state.confirmDeleteTripId ? DeleteTripSheet({ state, patch }) : null}
        ${state.editTripId ? EditTripSheet({ state, patch }) : null}
      </div>
    `;
  }

  ReactDOM.createRoot(document.getElementById('root')).render(html`<${App} />`);
})();
