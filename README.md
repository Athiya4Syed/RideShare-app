# 🚗 RideShare — Smart Carpooling Platform

![RideShare Banner](https://img.shields.io/badge/RideShare-Smart%20Carpooling-00d4ff?style=for-the-badge&logo=uber)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express-000000?style=for-the-badge&logo=express&logoColor=white)
![Socket.io](https://img.shields.io/badge/Socket.io-010101?style=for-the-badge&logo=socketdotio&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)

> A full-stack real-time ride-sharing web application with AI-powered booking, smart passenger matching, live GPS tracking, and push notifications.

🌍 **Live Demo:** [ride-share-app-git-main-athiya4syeds-projects.vercel.app](https://ride-share-app-git-main-athiya4syeds-projects.vercel.app)

---

## ✨ Features

- 🤖 **AI-Powered Booking** — Natural language ride requests using Claude AI (e.g. "I need a cheap ride from Bandra to Airport tomorrow 9am")
- 🗺️ **Interactive Maps** — Real-time route visualization using Leaflet.js + OpenStreetMap
- 🤝 **Smart Matching Algorithm** — Haversine formula-based route matching for passenger carpooling
- ⚡ **Real-time Updates** — Live ride status, GPS tracking, and notifications via Socket.io
- 🔐 **JWT Authentication** — Secure login/signup with Passenger & Driver roles
- 🗄️ **Persistent Database** — PostgreSQL via Supabase — data never lost on restart
- 🔔 **Push Notifications** — Web push notifications for ride updates
- 📱 **Progressive Web App** — Installable on phone like a native app
- 📊 **Admin Dashboard** — Monitor all users, rides, and revenue in real-time
- 💰 **Dynamic Fare Calculator** — Smart pricing with shared ride discounts

---

## 🚗 Ride Types

| Type | Seats | Price/km | Sharing |
|------|-------|----------|---------|
| 🏍️ Bike | 1 | ₹7/km | ❌ |
| 🛺 Auto | 3 | ₹10/km | ✅ |
| 🚗 Solo Car | 1 | ₹14/km | ❌ |
| 🚗 Shared Car | 3 | ₹12/km | ✅ |

---

## 🛠️ Tech Stack

### Frontend
- HTML5, CSS3, JavaScript (Vanilla)
- Leaflet.js + OpenStreetMap (Free maps, no API key needed)
- Leaflet Routing Machine (Route visualization)
- Socket.io Client (Real-time communication)
- Progressive Web App (PWA)

### Backend
- Node.js + Express.js
- Socket.io (Real-time bidirectional communication)
- JWT (JSON Web Tokens) for authentication
- bcryptjs (Password hashing)
- web-push (Push notifications)
- @anthropic-ai/sdk (Claude AI integration)

### Database & Hosting
- Supabase (PostgreSQL database)
- Vercel (Frontend hosting)
- Render (Backend hosting)
- GitHub (Version control)

---

## 🏗️ Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Frontend      │────▶│   Backend        │────▶│   Supabase      │
│   (Vercel)      │◀────│   (Render)       │◀────│   (PostgreSQL)  │
│                 │     │                  │     │                 │
│ HTML/CSS/JS     │     │ Node.js/Express  │     │ Users Table     │
│ Leaflet Maps    │     │ Socket.io        │     │ Rides Table     │
│ PWA             │     │ JWT Auth         │     │                 │
└─────────────────┘     │ Claude AI        │     └─────────────────┘
                        │ Web Push         │
                        └──────────────────┘
```

---

## 🧠 Smart Matching Algorithm

The core matching algorithm uses the **Haversine formula** to calculate distances between geographic coordinates and determines if two passengers can share a ride based on route efficiency:

```javascript
function isOnTheWay(rideA, rideB) {
  const direct = getDistanceKm(rideA.pickup, rideA.destination);
  const shared = getDistanceKm(rideA.pickup, rideB.pickup) +
                 getDistanceKm(rideB.pickup, rideB.destination) +
                 getDistanceKm(rideB.destination, rideA.destination);
  
  // Match if shared route is within 40% of direct route
  return (shared / direct) <= 1.4;
}
```

---

## 🚀 Getting Started

### Prerequisites
- Node.js v18+
- npm
- Supabase account (free)

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/Athiya4Syed/RideShare-app.git
cd RideShare-app
```

2. **Install backend dependencies**
```bash
cd backend
npm install
```

3. **Set up environment variables**

Create `backend/.env`:
```env
PORT=3000
JWT_SECRET=your-secret-key
SUPABASE_URL=your-supabase-url
SUPABASE_KEY=your-supabase-anon-key
CLAUDE_API_KEY=your-claude-api-key
VAPID_PUBLIC_KEY=your-vapid-public-key
VAPID_PRIVATE_KEY=your-vapid-private-key
VAPID_EMAIL=mailto:your@email.com
ADMIN_KEY=your-admin-key
```

4. **Set up Supabase database**

Run this SQL in your Supabase SQL Editor:
```sql
create table users (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  email text unique not null,
  password text not null,
  phone text default '',
  role text not null check (role in ('passenger', 'driver')),
  rating decimal default 5.0,
  total_rides integer default 0,
  created_at timestamp default now()
);

create table rides (
  id serial primary key,
  user_id uuid references users(id),
  name text not null,
  pickup text not null,
  destination text not null,
  pickup_lat decimal,
  pickup_lng decimal,
  dest_lat decimal,
  dest_lng decimal,
  ride_type text not null,
  allow_sharing boolean default false,
  scheduled_time timestamp,
  distance_km decimal,
  estimated_fare integer,
  status text default 'searching',
  matched_with integer,
  driver_rating integer,
  created_at timestamp default now()
);
```

5. **Run the backend**
```bash
cd backend
npm start
```

6. **Open the frontend**

Open `frontend/index.html` in your browser or use Live Server extension in VS Code.

---

## 📁 Project Structure

```
RideShare-app/
├── frontend/
│   ├── index.html          # Main app page
│   ├── auth.html           # Login/Signup page
│   ├── admin.html          # Admin dashboard
│   ├── app.js              # Main app logic
│   ├── auth.js             # Authentication logic
│   ├── style.css           # Main styles
│   ├── auth.css            # Auth page styles
│   ├── sw.js               # Service worker (PWA)
│   ├── manifest.json       # PWA manifest
│   ├── vercel.json         # Vercel config
│   └── icons/
│       └── icon.svg        # App icon
└── backend/
    ├── server.js           # Main server file
    ├── package.json        # Dependencies
    └── .env                # Environment variables
```

---

## 🔑 API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/signup` | Register new user |
| POST | `/auth/login` | Login user |
| GET | `/auth/profile` | Get user profile |

### Rides
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/rides` | Get all rides |
| POST | `/ride/request` | Book a new ride |
| POST | `/ride/rate` | Rate a completed ride |
| POST | `/driver/location` | Update driver GPS location |

### AI
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/ai/parse-ride` | Parse natural language ride request |

### Push Notifications
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/push/subscribe` | Subscribe to push notifications |
| POST | `/push/test` | Send test notification |

### Admin
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/admin/stats` | Get all stats, users, rides |
| DELETE | `/admin/user/:id` | Delete a user |
| DELETE | `/admin/ride/:id` | Delete a ride |

---

## 🔌 Real-time Socket Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `new-ride` | Server → Client | New ride booked |
| `match-found` | Server → Client | Two passengers matched |
| `driver-location` | Server → Client | Driver GPS update |
| `ride-rated` | Server → Client | Ride rated by passenger |
| `existing-rides` | Server → Client | All rides on connect |

---

## 🌐 Deployment

### Frontend (Vercel)
1. Push code to GitHub
2. Import repo on [vercel.com](https://vercel.com)
3. Set Root Directory to `frontend`
4. Deploy!

### Backend (Render)
1. Create new Web Service on [render.com](https://render.com)
2. Connect GitHub repo
3. Set Root Directory to `backend`
4. Add environment variables
5. Deploy!

---

## 👤 Demo Accounts

You can create your own accounts on the live demo. Choose between:
- **Passenger** — Book rides, get matched, rate drivers
- **Driver** — Share live GPS location

---

## 🔐 Admin Access

Access the admin dashboard at `/admin.html` with your admin key set in environment variables.

---

## 📸 Screenshots

### Main App
- Interactive map with route visualization
- 4 ride types with dynamic fare calculation
- Smart sharing toggle for Auto and Shared rides

### AI Assistant
- Natural language ride booking
- Auto-fills pickup, destination, ride type and schedule
- Powered by Claude AI (Anthropic)

### Admin Dashboard
- Real-time stats cards
- Users and rides management table
- Delete users and rides

---

## 🗺️ Roadmap

- [x] Core ride booking system
- [x] Real-time GPS tracking
- [x] Smart passenger matching
- [x] JWT Authentication
- [x] Supabase database
- [x] Claude AI integration
- [x] Push notifications
- [x] PWA support
- [x] Admin dashboard
- [ ] Razorpay payment integration
- [ ] OTP phone verification
- [ ] React Native mobile app
- [ ] Google Maps upgrade
- [ ] Multi-language support (Hindi, Telugu, Tamil)
- [ ] Driver earnings dashboard

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the project
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License.

---

## 👩‍💻 Author

**Athiya Syed**
- GitHub: [@Athiya4Syed](https://github.com/Athiya4Syed)

---

## 🙏 Acknowledgements

- [Leaflet.js](https://leafletjs.com/) — Free interactive maps
- [OpenStreetMap](https://www.openstreetmap.org/) — Free map tiles
- [Supabase](https://supabase.com/) — Open source Firebase alternative
- [Anthropic Claude](https://www.anthropic.com/) — AI language model
- [Socket.io](https://socket.io/) — Real-time communication
- [Render](https://render.com/) — Free backend hosting
- [Vercel](https://vercel.com/) — Free frontend hosting

---

⭐ **If you found this project helpful, please give it a star!**
