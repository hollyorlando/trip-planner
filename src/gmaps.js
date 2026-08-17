// Loads the Google Maps JavaScript API once, and gives us a way to pin plain
// HTML nodes (rendered by React via a portal) to a lat/lng on the map — so
// pins/stays can stay declarative JSX while Google handles pan/zoom/projection.
window.PinsGoogleMaps = (function () {
  let loadPromise = null;

  function load() {
    if (loadPromise) return loadPromise;
    loadPromise = new Promise((resolve, reject) => {
      if (window.google && window.google.maps) { resolve(window.google.maps); return; }
      window.__pinsGmapsReady = () => resolve(window.google.maps);
      const s = document.createElement('script');
      s.src = '/api/maps-script?callback=__pinsGmapsReady';
      s.async = true;
      s.onerror = () => reject(new Error('failed to load google maps'));
      document.head.appendChild(s);
    });
    return loadPromise;
  }

  // Dark theme tuned to the app's own palette (#131313 surface, #333333 borders)
  // rather than Google's stock night mode, so the map reads as part of the UI.
  const DARK_STYLE = [
    { elementType: 'geometry', stylers: [{ color: '#131313' }] },
    { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#9e9e9e' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#131313' }] },
    { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#333333' }] },
    { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
    { featureType: 'administrative.country', elementType: 'labels.text.fill', stylers: [{ color: '#8a8a8a' }] },
    { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#1a1a1a' }] },
    { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#1e1e1e' }] },
    { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
    { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#1c2418' }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2a2a2a' }] },
    { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#1a1a1a' }] },
    { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#333333' }] },
    { featureType: 'road.arterial', elementType: 'labels.text.fill', stylers: [{ color: '#9e9e9e' }] },
    { featureType: 'road.local', elementType: 'labels.text.fill', stylers: [{ color: '#6b6b6b' }] },
    { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#1e1e1e' }] },
    { featureType: 'transit.line', elementType: 'geometry', stylers: [{ color: '#2a2a2a' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0b0b0b' }] },
    { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#4a5a66' }] }
  ];

  // Pins a plain DOM node to a LatLng using the pre-AdvancedMarker OverlayView API
  // (no Map ID / cloud styling required) — draw() re-runs on every pan/zoom.
  function makeOverlay(maps, map, position, node) {
    node.style.position = 'absolute';
    node.style.left = '0';
    node.style.top = '0';
    class HtmlOverlay extends maps.OverlayView {
      constructor() {
        super();
        this.position = position;
        this.node = node;
        this.setMap(map);
      }
      onAdd() { this.getPanes().overlayMouseTarget.appendChild(this.node); }
      draw() {
        const proj = this.getProjection();
        if (!proj) return;
        const pt = proj.fromLatLngToDivPixel(this.position);
        if (pt) this.node.style.transform = 'translate(' + Math.round(pt.x) + 'px,' + Math.round(pt.y) + 'px)';
      }
      onRemove() {
        if (this.node.parentNode) this.node.parentNode.removeChild(this.node);
      }
      // Only the user-location dot moves after being placed; spots/stays are static.
      updatePosition(position) {
        this.position = position;
        this.draw();
      }
    }
    return new HtmlOverlay();
  }

  return { load, DARK_STYLE, makeOverlay };
})();
