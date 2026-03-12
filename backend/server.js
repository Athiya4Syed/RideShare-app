const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ["https://ride-share-eyl4dh4n5-athiya4syeds-projects.vercel.app", "http://localhost:5500"],
    methods: ["GET", "POST"]
  }
});

app.use(cors({
  origin: ["https://ride-share-eyl4dh4n5-athiya4syeds-projects.vercel.app", "http://localhost:5500"],
  methods: ["GET", "POST"]
}));
app.use(express.json());

// ─── IN-MEMORY STORAGE ───────────────────────────────────────────
let users = [];
let rides = [];
let rideIdCounter = 1;
const JWT_SECRET = process.env.JWT_SECRET || 'rideshare-secret-key-2024';

// ─── FARE RULES ──────────────────────────────────────────────────
const FARE_RULES = {
  bike:   { base:15, perKm:7,  label:'🏍️ Bike',      maxPassengers:1 },
  auto:   { base:25, perKm:10, label:'🛺 Auto',       maxPassengers:3 },
  solo:   { base:40, perKm:14, label:'🚗 Car Solo',   maxPassengers:1 },
  shared: { base:30, perKm:12, label:'🚗 Car Shared', maxPassengers:3 },
};

// ─── HELPERS ─────────────────────────────────────────────────────
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
  if (!rideA.pickupLat || !rideB.pickupLat) return false;
  const direct = getDistanceKm(rideA.pickupLat, rideA.pickupLng, rideA.destLat, rideA.destLng);
  const shared =
    getDistanceKm(rideA.pickupLat, rideA.pickupLng, rideB.pickupLat, rideB.pickupLng) +
    getDistanceKm(rideB.pickupLat, rideB.pickupLng, rideB.destLat, rideB.destLng) +
    getDistanceKm(rideB.destLat, rideB.destLng, rideA.destLat, rideA.destLng);
  return (shared / direct) <= 1.4;
}

function findMatch(newRide) {
  if (!newRide.allowSharing) return null;
  for (const r of rides) {
    if (r.id === newRide.id || r.status !== 'searching' || !r.allowSharing) continue;
    const shareable = ['shared', 'auto'];
    if (!shareable.includes(r.rideType) || !shareable.includes(newRide.rideType)) continue;
    if (isOnTheWay(r, newRide) || isOnTheWay(newRide, r)) return r;
  }
  return null;
}

// ─── AUTH MIDDLEWARE ─────────────────────────────────────────────
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

// ─── AUTH ROUTES ─────────────────────────────────────────────────

// SIGNUP
app.post('/auth/signup', async (req, res) => {
  const { name, email, password, role, phone } = req.body;

  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  if (users.find(u => u.email === email)) {
    return res.status(400).json({ error: 'Email already registered' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const newUser = {
    id: users.length + 1,
    name, email, phone: phone || '',
    password: hashedPassword,
    role, // 'passenger' or 'driver'
    rating: 5.0,
    totalRides: 0,
    createdAt: new Date().toISOString()
  };

  users.push(newUser);

  const token = jwt.sign(
    { id: newUser.id, name: newUser.name, email: newUser.email, role: newUser.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  console.log(`✅ New ${role} registered: ${name} (${email})`);

  res.status(201).json({
    message: '✅ Account created!',
    token,
    user: { id: newUser.id, name, email, role, phone, rating: 5.0 }
  });
});

// LOGIN
app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;

  const user = users.find(u => u.email === email);
  if (!user) return res.status(400).json({ error: 'Email not found' });

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.status(400).json({ error: 'Wrong password' });

  const token = jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  console.log(`✅ Login: ${user.name} (${user.role})`);

  res.json({
    message: '✅ Logged in!',
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role, rating: user.rating }
  });
});

// GET profile
app.get('/auth/profile', authMiddleware, (req, res) => {
  const user = users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const { password, ...safeUser } = user;
  res.json({ user: safeUser });
});

// ─── RIDE ROUTES ─────────────────────────────────────────────────

app.get('/', (req, res) => res.json({ message: '🚗 RideShare API running!' }));
app.get('/rides', (req, res) => res.json({ rides }));

app.get('/fare-estimate', (req, res) => {
  const { rideType, distanceKm, shared } = req.query;
  if (!FARE_RULES[rideType]) return res.status(400).json({ error: 'Invalid ride type' });
  const fare = calculateFare(rideType, parseFloat(distanceKm), shared === 'true');
  res.json({ fare, rideType, distanceKm });
});

app.post('/ride/request', authMiddleware, (req, res) => {
  const {
    pickup, destination,
    pickupLat, pickupLng, destLat, destLng,
    rideType, allowSharing, scheduledTime, distanceKm
  } = req.body;

  if (!pickup || !destination || !rideType) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const dist = parseFloat(distanceKm) || getDistanceKm(
    parseFloat(pickupLat), parseFloat(pickupLng),
    parseFloat(destLat), parseFloat(destLng)
  );

  const newRide = {
    id: rideIdCounter++,
    userId: req.user.id,
    name: req.user.name,
    pickup, destination,
    pickupLat: parseFloat(pickupLat), pickupLng: parseFloat(pickupLng),
    destLat: parseFloat(destLat), destLng: parseFloat(destLng),
    rideType,
    allowSharing: ['shared','auto'].includes(rideType) ? (allowSharing !== false) : false,
    scheduledTime: scheduledTime || null,
    distanceKm: dist.toFixed(1),
    estimatedFare: calculateFare(rideType, dist, false),
    status: 'searching',
    matchedWith: null,
    rating: null,
    createdAt: new Date().toISOString()
  };

  rides.push(newRide);
  io.emit('new-ride', newRide);

  const match = findMatch(newRide);
  if (match) {
    newRide.status = 'matched';
    newRide.matchedWith = match.id;
    match.status = 'matched';
    match.matchedWith = newRide.id;

    const fareA = calculateFare('shared', parseFloat(newRide.distanceKm), true);
    const fareB = calculateFare('shared', parseFloat(match.distanceKm), true);

    io.emit('match-found', {
      rideA: { ...newRide, sharedFare: fareA },
      rideB: { ...match, sharedFare: fareB }
    });
  }

  res.status(201).json({ message: '✅ Ride booked!', ride: newRide });
});

app.post('/ride/rate', authMiddleware, (req, res) => {
  const { rideId, driverRating } = req.body;
  const ride = rides.find(r => r.id === parseInt(rideId));
  if (!ride) return res.status(404).json({ error: 'Ride not found' });
  ride.driverRating = driverRating;
  io.emit('ride-rated', ride);
  res.json({ message: '⭐ Rated!', ride });
});

app.post('/driver/location', authMiddleware, (req, res) => {
  const { lat, lng, rideId } = req.body;
  io.emit('driver-location', {
    driverName: req.user.name,
    driverId: req.user.id,
    lat, lng, rideId,
    timestamp: Date.now()
  });
  res.json({ message: 'Location updated' });
});

// ─── SOCKET.IO ───────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log('✅ Connected:', socket.id);
  socket.emit('existing-rides', rides);
  socket.on('disconnect', () => console.log('❌ Disconnected:', socket.id));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server on http://localhost:${PORT}`));