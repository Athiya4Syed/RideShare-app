const BACKEND = window.location.hostname === 'localhost'
  ? 'http://localhost:3000'
  : 'https://rideshare-backend-e3ka.onrender.com';


// ─── AUTH GUARD ──────────────────────────────────────────────────
const token = localStorage.getItem('token');
const currentUser = JSON.parse(localStorage.getItem('user') || 'null');

// Redirect to login if not logged in
if (!token || !currentUser) {
  window.location.href = 'auth.html';
}

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

// Enter key support
document.addEventListener('DOMContentLoaded', () => {
  initMap();
  document.getElementById('pickup-search').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') searchLocation('pickup');
  });
  document.getElementById('destination-search').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') searchLocation('destination');
  });

  // ─── Show logged in user info ──────────────────────────────
  if (currentUser) {
    document.getElementById('user-greeting').textContent = `👤 ${currentUser.name}`;
    document.getElementById('user-role-badge').textContent =
      currentUser.role === 'driver' ? '🧭 Driver' : '🧍 Passenger';

    // Pre-fill name field
    const nameInput = document.getElementById('name');
    if (nameInput) nameInput.value = currentUser.name;

    // Hide driver tab for passengers
    if (currentUser.role === 'passenger') {
      const driverTab = document.querySelector('.tab:nth-child(3)');
      if (driverTab) driverTab.style.display = 'none';
    }
  }
});

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

  routingControl = L.Routing.control({
    waypoints: [L.latLng(pickupLatLng), L.latLng(destinationLatLng)],
    routeWhileDragging: false, addWaypoints: false,
    draggableWaypoints: false, fitSelectedRoutes: true,
    lineOptions: { styles: [{ color:'#00d4ff', weight:5, opacity:0.9 }] },
    createMarker: () => null
  }).addTo(map);

  routingControl.on('routesfound', e => {
    const route = e.routes[0];
    currentDistanceKm = (route.summary.totalDistance / 1000);
    const mins = Math.round(route.summary.totalTime / 60);

    document.getElementById('route-distance').textContent = `📏 ${currentDistanceKm.toFixed(1)} km`;
    document.getElementById('route-duration').textContent = `⏱️ ${mins} mins`;
    document.getElementById('route-info').style.display = 'flex';

    updateFareEstimate();
  });
}

// ─── FARE ESTIMATE ───────────────────────────────────────────────
function updateFareEstimate() {
  if (!currentDistanceKm) return;

  const FARE_RULES = {
    bike:   { base:15, perKm:7  },
    auto:   { base:25, perKm:10 },
    solo:   { base:40, perKm:14 },
    shared: { base:30, perKm:12 },
  };

  const rule = FARE_RULES[currentRideType];
  const total = rule.base + currentDistanceKm * rule.perKm;
  const isShared = currentRideType === 'shared' &&
    document.getElementById('allow-sharing').checked;
  const fare = Math.round(isShared ? total / 2 : total);
  const fullFare = Math.round(total);

  document.getElementById('fare-estimate-box').style.display = 'flex';
  document.getElementById('fare-type').textContent = currentRideType.toUpperCase();
  document.getElementById('fare-distance').textContent = `${currentDistanceKm.toFixed(1)} km`;
  document.getElementById('fare-amount').textContent = `₹${fare}`;
  document.getElementById('route-fare').textContent = `💰 ₹${fare}`;

  if (isShared) {
    document.getElementById('fare-saving-row').style.display = 'flex';
    document.getElementById('fare-saving').textContent = `₹${fullFare - fare}`;
  } else {
    document.getElementById('fare-saving-row').style.display = 'none';
  }
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
const socket = io(BACKEND);

socket.on('connect', () => {
  document.getElementById('connection-status').textContent = '🟢 Connected';
  document.getElementById('connection-status').className = 'connected';
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