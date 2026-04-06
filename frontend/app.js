//routingControl.on('routesfound', function(e));
console.log('✅ Route found!', e.routes[0].instructions.length, 'steps');
  // ... rest of code

const BACKEND = window.location.hostname === 'localhost'
  ? 'http://localhost:3000'
  : 'https://rideshare-backend-e3ka.onrender.com';

// ─── PERFORMANCE ──────────────────────────────────────────────
// Debounce function to prevent too many API calls
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Cache for location searches
const locationCache = new Map();

// ─── AUTH GUARD ──────────────────────────────────────────────────
const token = localStorage.getItem('token');
const currentUser = JSON.parse(localStorage.getItem('user') || 'null');

if (!token || !currentUser) {
  window.location.href = 'auth.html';
}

// Show user info immediately
document.addEventListener('DOMContentLoaded', () => {
  if (currentUser) {
    const greeting = document.getElementById('user-greeting');
    const badge = document.getElementById('user-role-badge');
    const nameInput = document.getElementById('name');
    if (greeting) greeting.textContent = `👤 ${currentUser.name}`;
    if (badge) badge.textContent = currentUser.role === 'driver' ? '🧭 Driver' : '🧍 Passenger';
    if (nameInput) nameInput.value = currentUser.name;
    if (currentUser.role === 'passenger') {
      const driverTab = document.querySelector('.tab:nth-child(3)');
      if (driverTab) driverTab.style.display = 'none';
    }
  }
  initMap();
});

// ─── LOGOUT ──────────────────────────────────────────────────────
function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = 'auth.html';
}



// Map state
let map, pickupMarker, destinationMarker, routingControl, driverMarker;
let pickupLatLng = null, destinationLatLng = null;
let currentRideType = 'bike';
let currentDistanceKm = 0;
let driverTrackingInterval = null;
let currentRatingRideId = null;
let currentDriverRating = 0;

// ─── INIT MAP ────────────────────────────────────────────────────
function initMap() {
  map = L.map('map').setView([20.5937, 78.9629], 5);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap', maxZoom: 19
  }).addTo(map);
}

// ─── TABS ────────────────────────────────────────────────────────
function switchTab(tab) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelector(`#tab-${tab}`).classList.add('active');
  event.target.classList.add('active');
}

// ─── RIDE TYPE SELECTOR ──────────────────────────────────────────
function selectRideType(type) {
  currentRideType = type;
  document.querySelectorAll('.ride-type-card').forEach(c => c.classList.remove('active'));
  document.getElementById(`type-${type}`).classList.add('active');

  
 // Show/hide share toggle (shared rides AND auto can be shared)
document.getElementById('share-toggle').style.display =
    (type === 'shared' || type === 'auto') ? 'block' : 'none';

  // Update fare estimate
  if (pickupLatLng && destinationLatLng) updateFareEstimate();
}

// ─── SEARCH LOCATION ─────────────────────────────────────────────
async function searchLocation(type) {
  const inputId = type === 'pickup' ? 'pickup-search' : 'destination-search';
  const query = document.getElementById(inputId).value.trim();
  const statusEl = document.getElementById('search-status');

  if (!query) { statusEl.textContent = '⚠️ Type a location first!'; return; }

  // Check cache first
  if (locationCache.has(query)) {
    const cached = locationCache.get(query);
    placeMarker(type, cached.latlng, cached.name);
    map.setView(cached.latlng, 12);
    if (type === 'pickup') {
      document.getElementById('pickup').value = cached.name;
      statusEl.textContent = `✅ Pickup: ${cached.name}`;
    } else {
      document.getElementById('destination').value = cached.name;
      statusEl.textContent = `✅ Destination: ${cached.name}`;
    }
    if (pickupLatLng && destinationLatLng) {
      drawRoute();
      document.getElementById('request-btn').disabled = false;
    }
    return;
  }

  statusEl.textContent = '🔍 Searching...';

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=in`,
      { headers: { 'Accept-Language': 'en' } }
    );
    const results = await res.json();
    if (!results.length) { statusEl.textContent = '❌ Not found. Try again.'; return; }

    const place = results[0];
    const latlng = L.latLng(parseFloat(place.lat), parseFloat(place.lon));
    const name = place.display_name.split(',').slice(0, 3).join(', ');

    // Save to cache
    locationCache.set(query, { latlng, name });

    placeMarker(type, latlng, name);
    map.setView(latlng, 12);

    if (type === 'pickup') {
      document.getElementById('pickup').value = name;
      statusEl.textContent = `✅ Pickup: ${name}`;
      document.getElementById('step-hint').textContent = '✅ Now search your destination!';
    } else {
      document.getElementById('destination').value = name;
      statusEl.textContent = `✅ Destination: ${name}`;
    }

    if (pickupLatLng && destinationLatLng) {
      drawRoute();
      document.getElementById('request-btn').disabled = false;
      document.getElementById('step-hint').textContent = '✅ Ready! Choose ride type & book.';
    }
  } catch (e) {
    statusEl.textContent = '❌ Search failed. Check internet.';
  }
}

// ─── PLACE MARKER ────────────────────────────────────────────────
function placeMarker(type, latlng, label) {
  if (type === 'pickup') {
    if (pickupMarker) map.removeLayer(pickupMarker);
    pickupMarker = L.circleMarker(latlng, {
      radius:10, fillColor:'#00ff88', color:'#fff', weight:2, fillOpacity:1
    }).addTo(map).bindPopup(`📍 ${label}`).openPopup();
    pickupLatLng = latlng;
  } else {
    if (destinationMarker) map.removeLayer(destinationMarker);
    destinationMarker = L.circleMarker(latlng, {
      radius:10, fillColor:'#ff4d4d', color:'#fff', weight:2, fillOpacity:1
    }).addTo(map).bindPopup(`🏁 ${label}`).openPopup();
    destinationLatLng = latlng;
  }
}

// ─── DRAW ROUTE ──────────────────────────────────────────────────
function drawRoute() {
  if (!pickupLatLng || !destinationLatLng) return;
  if (routingControl) map.removeControl(routingControl);

  // Remove old custom panel
  const old = document.getElementById('custom-route-panel');
  if (old) old.remove();

  routingControl = L.Routing.control({
    waypoints: [L.latLng(pickupLatLng), L.latLng(destinationLatLng)],
    routeWhileDragging: false,
    addWaypoints: false,
    draggableWaypoints: false,
    fitSelectedRoutes: true,
    show: false,
    collapsible: false,
    showAlternatives: false,
    lineOptions: { styles: [{ color:'#00d4ff', weight:5, opacity:0.9 }] },
    createMarker: () => null
  }).addTo(map);

  routingControl.on('routesfound', function(e) {
    const route = e.routes[0];
    currentDistanceKm = (route.summary.totalDistance / 1000);
    const mins = Math.round(route.summary.totalTime / 60);

    document.getElementById('route-distance').textContent = `📏 ${currentDistanceKm.toFixed(1)} km`;
    document.getElementById('route-duration').textContent = `⏱️ ${mins} mins`;
    document.getElementById('route-info').style.display = 'flex';
    updateFareEstimate();

    // Hide Leaflet default panel
    setTimeout(() => {
      const lrmPanel = document.querySelector('.leaflet-top.leaflet-right');
      if (lrmPanel) lrmPanel.style.display = 'none';

      // Remove old panel
      const oldPanel = document.getElementById('custom-route-panel');
      if (oldPanel) oldPanel.remove();

      // Step icons
      const icons = {
        'Straight': '⬆️', 'SlightRight': '↗️', 'SlightLeft': '↖️',
        'Right': '➡️', 'Left': '⬅️', 'SharpRight': '↪️',
        'SharpLeft': '↩️', 'Roundabout': '🔄',
        'DestinationReached': '🏁', 'WaypointReached': '📍',
        'StartAt': '🟢'
      };

      const steps = route.instructions || [];

      // Build steps HTML
      let stepsHTML = '';
      steps.forEach(s => {
        const icon = icons[s.type] || '➡️';
        const dist = s.distance > 0
          ? (s.distance >= 1000
              ? (s.distance / 1000).toFixed(1) + ' km'
              : Math.round(s.distance) + ' m')
          : '';

        stepsHTML += '<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid #eee;">'
          + '<span style="font-size:1rem;min-width:24px;text-align:center;">' + icon + '</span>'
          + '<span style="flex:1;color:#111;font-size:0.78rem;">' + s.text + '</span>'
          + '<span style="color:#555;font-size:0.72rem;white-space:nowrap;">' + dist + '</span>'
          + '</div>';
      });

      // Create panel
      const panel = document.createElement('div');
      panel.id = 'custom-route-panel';
      panel.style.cssText = `
        position: absolute;
        top: 10px;
        right: 10px;
        z-index: 1000;
        background: #ffffff;
        color: #000000;
        border-radius: 8px;
        padding: 10px 12px;
        width: 280px;
        max-height: 250px;
        overflow-y: auto;
        box-shadow: 0 2px 10px rgba(0,0,0,0.3);
        font-family: Segoe UI, sans-serif;
        font-size: 0.78rem;
        box-sizing: border-box;
      `;

      panel.innerHTML = '<div style="font-weight:bold;color:#000;margin-bottom:6px;font-size:0.82rem;">'
        + '🗺️ Turn-by-turn &nbsp;|&nbsp; '
        + currentDistanceKm.toFixed(1) + ' km · ' + mins + ' mins'
        + '</div>'
        + stepsHTML;

      document.getElementById('map-container').appendChild(panel);

    }, 500);
  });
}

// ─── RESET MAP ───────────────────────────────────────────────────
function resetMap() {
  if (pickupMarker) map.removeLayer(pickupMarker);
  if (destinationMarker) map.removeLayer(destinationMarker);
  if (routingControl) map.removeControl(routingControl);
  pickupMarker = destinationMarker = routingControl = null;
  pickupLatLng = destinationLatLng = null;
  currentDistanceKm = 0;

  ['pickup-search','destination-search','pickup','destination'].forEach(id => {
    document.getElementById(id).value = '';
  });

  document.getElementById('route-info').style.display = 'none';
  document.getElementById('fare-estimate-box').style.display = 'none';
  document.getElementById('search-status').textContent = '';
  document.getElementById('request-btn').disabled = true;
  document.getElementById('step-hint').textContent = '🔍 Search pickup & destination on the map';
}

// ─── REQUEST RIDE ────────────────────────────────────────────────
async function requestRide() {
  const name = document.getElementById('name').value.trim();
  const pickup = document.getElementById('pickup').value.trim();
  const destination = document.getElementById('destination').value.trim();
  const scheduledTime = document.getElementById('scheduled-time').value;
  const allowSharing = document.getElementById('allow-sharing').checked;
  const statusBox = document.getElementById('status-box');

  if (!name) { statusBox.innerHTML = `<span class="error">⚠️ Enter your name!</span>`; return; }

  setButtonLoading(true);
  statusBox.innerHTML = `⏳ Booking your ${currentRideType} ride...`;

  try {
    const res = await fetch(`${BACKEND}/ride/request`, {
      method: 'POST',
      headers: {
           'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
      body: JSON.stringify({
        name, pickup, destination,
        pickupLat: pickupLatLng?.lat, pickupLng: pickupLatLng?.lng,
        destLat: destinationLatLng?.lat, destLng: destinationLatLng?.lng,
        rideType: currentRideType,
        allowSharing: (currentRideType === 'shared' || currentRideType === 'auto') ? allowSharing : false,
        scheduledTime: scheduledTime || null,
        distanceKm: currentDistanceKm.toFixed(1)
      })
    });

    const data = await res.json();
    if (res.ok) {
      setButtonLoading(false);  // ✅ ADDED
      showToast(`✅ ${currentRideType} ride booked!`);  // ✅ ADDED
      const icon = { bike:'🏍️', auto:'🛺', solo:'🚗', shared:'🚗' }[currentRideType];
      const scheduled = scheduledTime ? `<br/><small>⏰ Scheduled: ${new Date(scheduledTime).toLocaleString()}</small>` : '';
      statusBox.innerHTML = `
        <span class="success">${icon} Ride #${data.ride.id} booked!</span>
        <br/><small>💰 Fare: ₹${data.ride.estimatedFare}</small>
        ${scheduled}
      `;
      document.getElementById('name').value = '';
    } else {
      setButtonLoading(false);  // ✅ ADDED
      statusBox.innerHTML = `<span class="error">❌ ${data.error}</span>`;
    }
  } catch (e) {
    setButtonLoading(false);  // ADD THIS LINE
    statusBox.innerHTML = `<span class="error">❌ Server not running!</span>`;
  }
}


// ─── SOCKET.IO ───────────────────────────────────────────────────
const socket = io('https://rideshare-backend-e3ka.onrender.com', {
  transports: ['polling', 'websocket'],
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 2000,
  timeout: 20000
});

socket.on('connect', () => {
  console.log('✅ Socket connected!', socket.id);
  const el = document.getElementById('connection-status');
  if (el) {
    el.textContent = '🟢 Connected';
    el.className = 'connected';
    el.style.color = '#00ff88';
  }
});

socket.on('connect_error', (err) => {
  const el = document.getElementById('connection-status');
  if (el) {
    el.textContent = '🔴 Disconnected';
    el.className = 'disconnected';
  }
});

socket.on('disconnect', () => {
  document.getElementById('connection-status').textContent = '🔴 Disconnected';
  document.getElementById('connection-status').className = 'disconnected';
});

socket.on('existing-rides', displayRides);
socket.on('new-ride', addRideCard);

socket.on('match-found', data => {
  showMatchNotification(data);
  updateRideCard(data.rideA);
  updateRideCard(data.rideB);
});

socket.on('driver-location', data => {
  updateDriverMarker(data);
});

socket.on('ride-rated', ride => {
  updateRideCard(ride);
});

// ─── DISPLAY RIDES ───────────────────────────────────────────────
function displayRides(rides) {
  const c = document.getElementById('rides-container');
  if (!rides.length) { c.innerHTML = 'No rides yet...'; return; }
  c.innerHTML = '';
  rides.forEach(addRideCard);
}

function addRideCard(ride) {
  const c = document.getElementById('rides-container');
  if (c.innerHTML === 'No rides yet...') c.innerHTML = '';

  // Remove existing card if updating
  const existing = document.getElementById(`ride-${ride.id}`);
  if (existing) existing.remove();

  const icon = { bike:'🏍️', auto:'🛺', solo:'🚗', shared:'🚗' }[ride.rideType] || '🚗';
  const scheduled = ride.scheduledTime
    ? `<br/>⏰ ${new Date(ride.scheduledTime).toLocaleString()}` : '';
  const matched = ride.matchedWith
    ? `<span class="badge matched">✅ Matched #${ride.matchedWith}</span>` : '';
  const badge = `<span class="badge ${ride.status === 'matched' ? 'matched' : ''}">${ride.status}</span>`;

  const card = document.createElement('div');
  card.className = 'ride-card';
  card.id = `ride-${ride.id}`;
  card.innerHTML = `
    <strong>${icon} #${ride.id} — ${ride.name}</strong>
    📍 ${ride.pickup}<br/>
    🏁 ${ride.destination}<br/>
    💰 ₹${ride.estimatedFare} · 📏 ${ride.distanceKm} km
    ${scheduled}
    <br/>${badge} ${matched}
    <br/><button class="rate-btn" onclick="openRating(${ride.id}, '${ride.name}')">⭐ Rate Ride</button>
  `;
  c.prepend(card);
}

function updateRideCard(ride) { addRideCard(ride); }

// ─── MATCH NOTIFICATION ──────────────────────────────────────────
function showMatchNotification(data) {
  const existing = document.getElementById('match-notification');
  if (existing) existing.remove();

  const el = document.createElement('div');
  el.id = 'match-notification';
  el.innerHTML = `
    <div class="match-overlay">
      <div class="match-box">
        <div class="match-icon">🎉</div>
        <h2>Ride Match Found!</h2>
        <p>${data.rideA.name} & ${data.rideB.name} are sharing a ride!</p>
        <div class="match-details">
          <div class="match-person">
            <strong>👤 ${data.rideA.name}</strong>
            <span>📍 ${data.rideA.pickup}</span>
            <span>🏁 ${data.rideA.destination}</span>
            <span class="fare">💰 ₹${data.rideA.sharedFare}</span>
          </div>
          <div class="match-divider">↔️</div>
          <div class="match-person">
            <strong>👤 ${data.rideB.name}</strong>
            <span>📍 ${data.rideB.pickup}</span>
            <span>🏁 ${data.rideB.destination}</span>
            <span class="fare">💰 ₹${data.rideB.sharedFare}</span>
          </div>
        </div>
        <p class="match-saving">🌱 Saving fuel & reducing traffic together!</p>
        <button onclick="closeMatch()">✅ Got it!</button>
      </div>
    </div>`;
  document.body.appendChild(el);
}

function closeMatch() {
  const el = document.getElementById('match-notification');
  if (el) el.remove();
}

// ─── DRIVER TRACKING ─────────────────────────────────────────────
function startDriverTracking() {
  const driverName = document.getElementById('driver-name').value.trim();
  const rideId = document.getElementById('driver-ride-id').value;

  if (!driverName) {
    document.getElementById('driver-status').textContent = '⚠️ Enter driver name!';
    return;
  }

  if (!navigator.geolocation) {
    document.getElementById('driver-status').textContent = '❌ GPS not supported!';
    return;
  }

  document.getElementById('stop-tracking-btn').style.display = 'block';
  document.getElementById('driver-status').textContent = '📡 Sharing live location...';

  driverTrackingInterval = setInterval(() => {
    navigator.geolocation.getCurrentPosition(pos => {
      const { latitude, longitude } = pos.coords;

      fetch(`${BACKEND}/driver/location`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driverName, lat: latitude, lng: longitude, rideId })
      });

      document.getElementById('driver-status').textContent =
        `📡 Live: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
    });
  }, 3000);
}

function stopDriverTracking() {
  clearInterval(driverTrackingInterval);
  document.getElementById('stop-tracking-btn').style.display = 'none';
  document.getElementById('driver-status').textContent = '⏹️ Stopped.';
}

function updateDriverMarker(data) {
  const latlng = L.latLng(data.lat, data.lng);

  if (!driverMarker) {
    driverMarker = L.marker(latlng, {
      icon: L.divIcon({
        html: '🚗',
        className: '',
        iconSize: [30, 30]
      })
    }).addTo(map);
  } else {
    driverMarker.setLatLng(latlng);
  }

  document.getElementById('driver-info').style.display = 'flex';
  document.getElementById('driver-name-display').textContent = `👤 ${data.driverName}`;
}

// ─── RATING ──────────────────────────────────────────────────────
function openRating(rideId, rideName) {
  currentRatingRideId = rideId;
  currentDriverRating = 0;
  document.getElementById('rating-ride-info').textContent = `Ride #${rideId} — ${rideName}`;
  document.getElementById('rating-modal').style.display = 'flex';
}

function setRating(type, value) {
  currentDriverRating = value;
  const stars = document.querySelectorAll('#passenger-stars span');
  stars.forEach((s, i) => {
    s.style.opacity = i < value ? '1' : '0.3';
  });
}

async function submitRating() {
  if (!currentDriverRating) {
    alert('Please select a star rating!'); return;
  }
  await fetch(`${BACKEND}/ride/rate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      rideId: currentRatingRideId,
      driverRating: currentDriverRating
    })
  });
  closeRating();
  alert('⭐ Thanks for rating!');
}

function closeRating() {
  document.getElementById('rating-modal').style.display = 'none';
}

// ─── MOBILE NAV ──────────────────────────────────────────────────
function mobileNav(tab, btn) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.mobile-nav button').forEach(b => b.classList.remove('active'));
  document.getElementById(`tab-${tab}`).classList.add('active');
  btn.classList.add('active');

  // On mobile, scroll panel into view
  if (window.innerWidth <= 768) {
    document.getElementById('panel').scrollIntoView({ behavior: 'smooth' });
  }
}

// ─── TOAST NOTIFICATION ──────────────────────────────────────────
function showToast(message, duration = 3000) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ─── LOADING STATE FOR BUTTON ─────────────────────────────────────
function setButtonLoading(loading) {
  const btn = document.getElementById('request-btn');
  if (loading) {
    btn.innerHTML = '<span class="spinner"></span> Finding ride...';
    btn.disabled = true;
  } else {
    btn.innerHTML = 'Book Ride 🚗';
    btn.disabled = false;
  }
}
// ─── PWA INSTALL ─────────────────────────────────────────────────
let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;

  // Show install button
  const installBtn = document.getElementById('install-btn');
  if (installBtn) {
    installBtn.style.display = 'block';
    installBtn.style.cssText = `
      padding: 7px 14px;
      background: #00ff88;
      color: #000;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-size: 0.82rem;
      font-weight: bold;
      animation: pulse 2s infinite;
    `;
  }

  showToast('📲 You can install RideShare as an app!', 5000);
});

async function installApp() {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  if (outcome === 'accepted') {
    showToast('🎉 RideShare installed successfully!');
    document.getElementById('install-btn').style.display = 'none';
  }
  deferredPrompt = null;
}

window.addEventListener('appinstalled', () => {
  showToast('🎉 RideShare installed! Check your home screen!');
  document.getElementById('install-btn').style.display = 'none';
});

// ─── AI ASSISTANT ─────────────────────────────────────────────────
function toggleAIChat() {
  const chat = document.getElementById('ai-chat');
  chat.style.display = chat.style.display === 'none' ? 'block' : 'none';
  if (chat.style.display === 'block') {
    document.getElementById('ai-input').focus();
  }
}

async function sendAIMessage() {
  const input = document.getElementById('ai-input');
  const message = input.value.trim();
  if (!message) return;

  // Add user message
  addAIMessage(message, 'user');
  input.value = '';

  // Add loading
  const loadingId = 'loading-' + Date.now();
  addAIMessage('🤔 Thinking...', 'loading', loadingId);

  try {
    const res = await fetch(`${BACKEND}/ai/parse-ride`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ message })
    });

    const data = await res.json();
    
    // Remove loading
    document.getElementById(loadingId)?.remove();

    if (data.success) {
      const ai = data.data;

      // Auto fill form fields
      let filled = [];

      if (ai.pickup) {
        document.getElementById('pickup-search').value = ai.pickup;
        filled.push(`📍 Pickup: ${ai.pickup}`);
        await searchLocation('pickup');
      }

      if (ai.destination) {
        document.getElementById('destination-search').value = ai.destination;
        filled.push(`🏁 Destination: ${ai.destination}`);
        await searchLocation('destination');
      }

      if (ai.rideType) {
        selectRideType(ai.rideType);
        filled.push(`🚗 Ride type: ${ai.rideType}`);
      }

      if (ai.scheduledTime) {
        const dt = new Date(ai.scheduledTime);
        const local = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000)
          .toISOString().slice(0, 16);
        document.getElementById('scheduled-time').value = local;
        filled.push(`⏰ Scheduled: ${dt.toLocaleString()}`);
      }

      if (ai.allowSharing) {
        document.getElementById('allow-sharing').checked = true;
      }

      // Show response
      const response = filled.length > 0
        ? `✅ Got it! I've filled in:\n${filled.join('\n')}\n\n💡 ${ai.suggestion}`
        : `💡 ${ai.suggestion || "I couldn't find specific details. Try: 'Ride from Mumbai to Pune tomorrow 9am'"}`;

      addAIMessage(response, 'bot');

      // Switch to book tab
      document.getElementById('tab-book').click();

    } else {
      addAIMessage('❌ Sorry, I couldn\'t understand that. Try: "I need a ride from Bandra to Airport"', 'bot');
    }
  } catch (err) {
    document.getElementById(loadingId)?.remove();
    addAIMessage('❌ AI service unavailable. Please try again!', 'bot');
  }
}

function addAIMessage(text, type, id = null) {
  const messages = document.getElementById('ai-messages');
  const div = document.createElement('div');
  div.className = `ai-message ai-${type}`;
  if (id) div.id = id;
  div.style.whiteSpace = 'pre-line';
  div.textContent = text;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
}

// ─── AI BUTTON INJECTED VIA JS ────────────────────────────────
(function() {
  const div = document.createElement('div');
  div.id = 'ai-assistant';
  div.innerHTML = `
    <button id="ai-btn" onclick="toggleAIChat()" title="AI Ride Assistant">🤖</button>
    <div id="ai-chat" style="display:none">
      <div id="ai-chat-header">
        <span>🤖 AI Ride Assistant</span>
        <button onclick="toggleAIChat()">✕</button>
      </div>
      <div id="ai-messages">
        <div class="ai-message ai-bot">
          👋 Hi! Tell me where you want to go!<br><br>
          Try: "Cheap ride from Bandra to Airport tomorrow 9am"
        </div>
      </div>
      <div id="ai-input-area">
        <input type="text" id="ai-input" placeholder="Type your ride request..."/>
        <button onclick="sendAIMessage()">Send</button>
      </div>
    </div>
  `;
  document.body.appendChild(div);

  document.getElementById('ai-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendAIMessage();
  });
})();

// ─── PUSH NOTIFICATIONS ──────────────────────────────────────
const VAPID_PUBLIC_KEY = 'BBU2EB4lxWY2dvNqsMY7aP3QWkT-q4ImP73nTnMyxLhS2-QoK5PWFpnKonOfht7s0KhLMglWowWOyPbFLRNd9b4';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function subscribeToPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.log('Push not supported');
    return;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    });

    await fetch(`${BACKEND}/push/subscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ subscription })
    });

    console.log('✅ Push notifications enabled!');
    showToast('🔔 Notifications enabled!');
  } catch (err) {
    console.error('Push subscription error:', err);
  }
}

async function testPushNotification() {
  await fetch(`${BACKEND}/push/test`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  showToast('🔔 Test notification sent!');
}

// Auto subscribe when page loads
window.addEventListener('load', () => {
  setTimeout(subscribeToPush, 3000);
});
};