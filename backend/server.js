const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
const Anthropic = require('@anthropic-ai/sdk');
const webpush = require('web-push');
require('dotenv').config();

const axios = require('axios');
const app = express();
const server = http.createServer(app);

app.use(cors({ origin: "*" }));

const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(express.json());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

webpush.setVapidDetails(
  process.env.VAPID_EMAIL,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

const JWT_SECRET = process.env.JWT_SECRET || 'rideshare-secret-key-2024';

const FARE_RULES = {
  bike:   { base:15, perKm:7  },
  auto:   { base:25, perKm:10 },
  solo:   { base:40, perKm:14 },
  shared: { base:30, perKm:12 },
};

function getDistanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat/2) ** 2 +
    Math.cos(lat1 * Math.PI/180) *
    Math.cos(lat2 * Math.PI/180) *
    Math.sin(dLng/2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function calculateFare(rideType, distanceKm, shared = false) {
  const rule = FARE_RULES[rideType];
  const total = rule.base + distanceKm * rule.perKm;
  return Math.round(shared ? total / 2 : total);
}

function isOnTheWay(rideA, rideB) {
  if (!rideA.pickup_lat || !rideB.pickup_lat) return false;
  const direct = getDistanceKm(
    rideA.pickup_lat, rideA.pickup_lng,
    rideA.dest_lat, rideA.dest_lng
  );
  const shared =
    getDistanceKm(rideA.pickup_lat, rideA.pickup_lng, rideB.pickup_lat, rideB.pickup_lng) +
    getDistanceKm(rideB.pickup_lat, rideB.pickup_lng, rideB.dest_lat, rideB.dest_lng) +
    getDistanceKm(rideB.dest_lat, rideB.dest_lng, rideA.dest_lat, rideA.dest_lng);
  return (shared / direct) <= 1.4;
}

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

function adminMiddleware(req, res, next) {
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== process.env.ADMIN_KEY) {
    return res.status(403).json({ error: 'Access denied' });
  }
  next();
}

app.get('/', (req, res) => res.json({ message: '🚗 RideShare API running!' }));

// ─── AUTH ─────────────────────────────────────────────────────
app.post('/auth/signup', async (req, res) => {
  const { name, email, password, role, phone } = req.body;
  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: 'All fields required' });
  }
  const { data: existing } = await supabase.from('users').select('id').eq('email', email).single();
  if (existing) return res.status(400).json({ error: 'Email already registered' });
  const hashedPassword = await bcrypt.hash(password, 10);
  const { data: newUser, error } = await supabase
    .from('users')
    .insert([{ name, email, password: hashedPassword, role, phone: phone || '' }])
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  const token = jwt.sign(
    { id: newUser.id, name: newUser.name, email: newUser.email, role: newUser.role },
    JWT_SECRET, { expiresIn: '7d' }
  );
  res.status(201).json({ message: '✅ Account created!', token, user: { id: newUser.id, name, email, role, rating: 5.0 } });
});

app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const { data: user } = await supabase.from('users').select('*').eq('email', email).single();
  if (!user) return res.status(400).json({ error: 'Email not found' });
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.status(400).json({ error: 'Wrong password' });
  const token = jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role },
    JWT_SECRET, { expiresIn: '7d' }
  );
  res.json({ message: '✅ Logged in!', token, user: { id: user.id, name: user.name, email: user.email, role: user.role, rating: user.rating } });
});

app.get('/auth/profile', authMiddleware, async (req, res) => {
  const { data: user } = await supabase
    .from('users')
    .select('id, name, email, role, phone, rating, total_rides, created_at')
    .eq('id', req.user.id).single();
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user });
});

// ─── RIDES ────────────────────────────────────────────────────
app.get('/rides', async (req, res) => {
  const { data: rides } = await supabase.from('rides').select('*').order('created_at', { ascending: false }).limit(50);
  res.json({ rides: rides || [] });
});

app.post('/ride/request', authMiddleware, async (req, res) => {
  const { pickup, destination, pickupLat, pickupLng, destLat, destLng, rideType, allowSharing, scheduledTime, distanceKm } = req.body;
  if (!pickup || !destination || !rideType) return res.status(400).json({ error: 'Missing required fields' });
  const dist = parseFloat(distanceKm) || getDistanceKm(parseFloat(pickupLat), parseFloat(pickupLng), parseFloat(destLat), parseFloat(destLng));
  const { data: newRide, error } = await supabase.from('rides').insert([{
    user_id: req.user.id, name: req.user.name,
    pickup, destination,
    pickup_lat: parseFloat(pickupLat), pickup_lng: parseFloat(pickupLng),
    dest_lat: parseFloat(destLat), dest_lng: parseFloat(destLng),
    ride_type: rideType,
    allow_sharing: ['shared','auto'].includes(rideType) ? (allowSharing !== false) : false,
    scheduled_time: scheduledTime || null,
    distance_km: dist.toFixed(1),
    estimated_fare: calculateFare(rideType, dist, false),
    status: 'searching'
  }]).select().single();
  if (error) return res.status(500).json({ error: error.message });
  const rideForFrontend = {
    ...newRide, rideType: newRide.ride_type,
    pickupLat: newRide.pickup_lat, pickupLng: newRide.pickup_lng,
    destLat: newRide.dest_lat, destLng: newRide.dest_lng,
    allowSharing: newRide.allow_sharing,
    distanceKm: newRide.distance_km, estimatedFare: newRide.estimated_fare,
  };
  io.emit('new-ride', rideForFrontend);
  if (newRide.allow_sharing) {
    const { data: searchingRides } = await supabase.from('rides').select('*')
      .eq('status', 'searching').eq('allow_sharing', true)
      .neq('id', newRide.id).in('ride_type', ['shared', 'auto']);
    let match = null;
    for (const r of (searchingRides || [])) {
      if (isOnTheWay(r, newRide) || isOnTheWay(newRide, r)) { match = r; break; }
    }
    if (match) {
      await supabase.from('rides').update({ status:'matched', matched_with: match.id }).eq('id', newRide.id);
      await supabase.from('rides').update({ status:'matched', matched_with: newRide.id }).eq('id', match.id);
      const fareA = calculateFare('shared', parseFloat(newRide.distance_km), true);
      const fareB = calculateFare('shared', parseFloat(match.distance_km), true);
      io.emit('match-found', {
        rideA: { ...rideForFrontend, status:'matched', sharedFare: fareA },
        rideB: { ...match, rideType: match.ride_type, estimatedFare: match.estimated_fare, sharedFare: fareB }
      });
    }
  }
  res.status(201).json({ message: '✅ Ride booked!', ride: rideForFrontend });
});

app.post('/ride/rate', authMiddleware, async (req, res) => {
  const { rideId, driverRating } = req.body;
  const { data: ride, error } = await supabase.from('rides').update({ driver_rating: driverRating }).eq('id', rideId).select().single();
  if (error) return res.status(500).json({ error: error.message });
  io.emit('ride-rated', ride);
  res.json({ message: '⭐ Rated!', ride });
});

app.post('/driver/location', authMiddleware, (req, res) => {
  const { lat, lng, rideId } = req.body;
  io.emit('driver-location', { driverName: req.user.name, driverId: req.user.id, lat, lng, rideId, timestamp: Date.now() });
  res.json({ message: 'Location updated' });
});

// ─── AI ───────────────────────────────────────────────────────
app.post('/ai/parse-ride', async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'Message required' });
  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: `You are a ride-sharing assistant for India. Extract ride details from this message and return ONLY a JSON object with no extra text:
Message: "${message}"
Return this exact JSON format:
{
  "pickup": "location name or null",
  "destination": "location name or null",
  "rideType": "bike/auto/solo/shared or null",
  "scheduledTime": "ISO datetime or null",
  "allowSharing": true/false,
  "confidence": 0-100,
  "suggestion": "helpful message to user"
}
Today is ${new Date().toISOString()}`
      }]
    });
    const text = response.content[0].text.trim();
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    res.json({ success: true, data: parsed });
  } catch (err) {
    console.error('Claude AI error:', err);
    res.status(500).json({ error: 'AI parsing failed' });
  }
});

// ─── PUSH NOTIFICATIONS ───────────────────────────────────────
const pushSubscriptions = new Map();

app.post('/push/subscribe', authMiddleware, async (req, res) => {
  const { subscription } = req.body;
  if (!subscription) return res.status(400).json({ error: 'Subscription required' });
  pushSubscriptions.set(req.user.id, subscription);
  res.json({ success: true, message: '✅ Subscribed!' });
});

app.post('/push/unsubscribe', authMiddleware, (req, res) => {
  pushSubscriptions.delete(req.user.id);
  res.json({ success: true });
});

async function sendPushNotification(userId, title, body, url = '/') {
  const subscription = pushSubscriptions.get(userId);
  if (!subscription) return;
  try {
    await webpush.sendNotification(subscription, JSON.stringify({ title, body, url }));
  } catch (err) {
    pushSubscriptions.delete(userId);
  }
}

app.post('/push/test', authMiddleware, async (req, res) => {
  await sendPushNotification(req.user.id, '🚗 RideShare Test', 'Push notifications are working!', '/');
  res.json({ success: true, message: 'Test notification sent!' });
});

// ─── ADMIN ────────────────────────────────────────────────────
app.get('/admin/stats', adminMiddleware, async (req, res) => {
  const { data: users } = await supabase.from('users').select('id, name, email, role, created_at');
  const { data: rides } = await supabase.from('rides').select('*').order('created_at', { ascending: false });
  const totalRides = rides?.length || 0;
  const totalUsers = users?.length || 0;
  const passengers = users?.filter(u => u.role === 'passenger').length || 0;
  const drivers = users?.filter(u => u.role === 'driver').length || 0;
  const matchedRides = rides?.filter(r => r.status === 'matched').length || 0;
  const totalRevenue = rides?.reduce((sum, r) => sum + (r.estimated_fare || 0), 0) || 0;
  res.json({ success: true, stats: { totalUsers, totalRides, passengers, drivers, matchedRides, totalRevenue }, users: users || [], rides: rides || [] });
});

app.delete('/admin/user/:id', adminMiddleware, async (req, res) => {
  await supabase.from('users').delete().eq('id', req.params.id);
  res.json({ success: true, message: 'User deleted' });
});

app.delete('/admin/ride/:id', adminMiddleware, async (req, res) => {
  await supabase.from('rides').delete().eq('id', req.params.id);
  res.json({ success: true, message: 'Ride deleted' });
});

// ─── OTP VERIFICATION ─────────────────────────────────────────
const otpStore = new Map(); // Store OTPs temporarily

// Send OTP
app.post('/auth/send-otp', async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone number required' });

  // Generate 6 digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  
  // Store OTP with expiry (5 minutes)
  otpStore.set(phone, {
    otp,
    expiry: Date.now() + 5 * 60 * 1000
  });

  try {
    const phoneNumber = phone.replace('+91', '').replace(/\s/g, '');
const otpResponse = await axios.get(
  `https://2factor.in/API/V1/${process.env.TWOFACTOR_API_KEY}/SMS/${phoneNumber}/AUTOGEN`
);
const sessionId = otpResponse.data.Details;
otpStore.set(phone, {
  sessionId,
  expiry: Date.now() + 5 * 60 * 1000
});

    console.log(`✅ OTP sent to ${phone}`);
    res.json({ success: true, message: '✅ OTP sent successfully!' });

  } catch (err) {
    console.error('Twilio error:', err);
    res.status(500).json({ error: 'Failed to send OTP. Check phone number!' });
  }
});

// Verify OTP
app.post('/auth/verify-otp', (req, res) => {
  const { phone, otp } = req.body;
  if (!phone || !otp) return res.status(400).json({ error: 'Phone and OTP required' });

  const stored = otpStore.get(phone);

  if (!stored) return res.status(400).json({ error: 'OTP not found. Request a new one!' });
  if (Date.now() > stored.expiry) {
    otpStore.delete(phone);
    return res.status(400).json({ error: 'OTP expired. Request a new one!' });
  }
  if (stored.otp !== otp) return res.status(400).json({ error: 'Wrong OTP!' });

  otpStore.delete(phone);
  res.json({ success: true, message: '✅ Phone verified!' });
});

// ─── SOCKET.IO ────────────────────────────────────────────────
io.on('connection', async (socket) => {
  console.log('✅ Connected:', socket.id);
  const { data: rides } = await supabase.from('rides').select('*').order('created_at', { ascending: false }).limit(20);
  socket.emit('existing-rides', (rides || []).map(r => ({
    ...r, rideType: r.ride_type, estimatedFare: r.estimated_fare,
    distanceKm: r.distance_km, allowSharing: r.allow_sharing,
  })));
  socket.on('disconnect', () => console.log('❌ Disconnected:', socket.id));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server on http://localhost:${PORT}`));