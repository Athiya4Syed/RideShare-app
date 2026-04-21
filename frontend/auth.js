const BACKEND = window.location.hostname === 'localhost'
  ? 'http://localhost:3000'
  : 'https://rideshare-backend-e3ka.onrender.com';

let selectedRole = 'passenger';
let otpVerified = false;

// ─── AUTO REDIRECT IF ALREADY LOGGED IN ──────────────────────────
if (localStorage.getItem('token')) {
  window.location.href = 'index.html';
}

// ─── TAB SWITCHING ───────────────────────────────────────────────
function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
  document.getElementById(`${tab}-form`).classList.add('active');
  event.target.classList.add('active');
}

// ─── ROLE SELECTOR ───────────────────────────────────────────────
function selectRole(role) {
  selectedRole = role;
  document.querySelectorAll('.role-card').forEach(c => c.classList.remove('active'));
  document.getElementById(`role-${role}`).classList.add('active');
}

// ─── SIGNUP ──────────────────────────────────────────────────────
async function signup() {
  if (!otpVerified) {
    showError('signup-error', '⚠️ Please verify your phone number first!');
    return;
  }

  const name     = document.getElementById('signup-name').value.trim();
  const email    = document.getElementById('signup-email').value.trim();
  const phone    = document.getElementById('signup-phone').value.trim();
  const password = document.getElementById('signup-password').value;
  const errorEl  = document.getElementById('signup-error');

  errorEl.textContent = '';

  if (!name || !email || !password) {
    errorEl.textContent = '⚠️ Please fill in all fields!'; return;
  }
  if (password.length < 6) {
    errorEl.textContent = '⚠️ Password must be at least 6 characters!'; return;
  }

  try {
    const res = await fetch(`${BACKEND}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, phone, password, role: selectedRole })
    });

    const data = await res.json();

    if (res.ok) {
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      window.location.href = 'index.html';
    } else {
      errorEl.textContent = `❌ ${data.error}`;
    }
  } catch (e) {
    errorEl.textContent = '❌ Cannot reach server!';
  }
}

// ─── LOGIN ───────────────────────────────────────────────────────
async function login() {
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errorEl  = document.getElementById('login-error');

  errorEl.textContent = '';

  if (!email || !password) {
    errorEl.textContent = '⚠️ Please enter email and password!'; return;
  }

  try {
    const res = await fetch(`${BACKEND}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();

    if (res.ok) {
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      window.location.href = 'index.html';
    } else {
      errorEl.textContent = `❌ ${data.error}`;
    }
  } catch (e) {
    errorEl.textContent = '❌ Cannot reach server!';
  }
}

// ─── SEND OTP ────────────────────────────────────────────────────
async function sendOTP() {
  const phone = document.getElementById('signup-phone').value.trim();
  const statusEl = document.getElementById('otp-status');

  if (!phone) {
    statusEl.innerHTML = '<span style="color:#ff4d4d">⚠️ Enter phone number first!</span>';
    return;
  }

  if (!phone.startsWith('+')) {
    statusEl.innerHTML = '<span style="color:#ff4d4d">⚠️ Include country code e.g. +91XXXXXXXXXX</span>';
    return;
  }

  const btn = document.getElementById('send-otp-btn');
  btn.disabled = true;
  btn.textContent = '📲 Sending...';
  statusEl.innerHTML = '';

  try {
    const res = await fetch(`${BACKEND}/auth/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone })
    });

    const data = await res.json();

    if (res.ok) {
      statusEl.innerHTML = '<span style="color:#00ff88">✅ OTP sent to your phone!</span>';
      document.getElementById('otp-section').style.display = 'block';

      // Countdown timer
      let seconds = 300;
      const timer = setInterval(() => {
        seconds--;
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        document.getElementById('otp-timer').textContent =
          `⏳ OTP expires in ${mins}:${secs.toString().padStart(2, '0')}`;
        if (seconds <= 0) {
          clearInterval(timer);
          document.getElementById('otp-timer').textContent = '❌ OTP expired!';
          btn.disabled = false;
          btn.textContent = '📲 Resend OTP';
        }
      }, 1000);

    } else {
      statusEl.innerHTML = `<span style="color:#ff4d4d">❌ ${data.error}</span>`;
      btn.disabled = false;
      btn.textContent = '📲 Send OTP';
    }
  } catch (err) {
    statusEl.innerHTML = '<span style="color:#ff4d4d">❌ Failed to send OTP!</span>';
    btn.disabled = false;
    btn.textContent = '📲 Send OTP';
  }
}

// ─── VERIFY OTP ──────────────────────────────────────────────────
app.post('/auth/verify-otp', async (req, res) => {
  const { phone, otp } = req.body;
  const stored = otpStore.get(phone);

  if (!stored) return res.status(400).json({ error: 'OTP not found. Request a new one!' });
  if (Date.now() > stored.expiry) {
    otpStore.delete(phone);
    return res.status(400).json({ error: 'OTP expired. Request a new one!' });
  }

  try {
    const verifyRes = await axios.get(
      `https://2factor.in/API/V1/${process.env.TWOFACTOR_API_KEY}/SMS/VERIFY/${stored.sessionId}/${otp}`
    );

    if (verifyRes.data.Details === 'OTP Matched') {
      otpStore.delete(phone);
      res.json({ success: true, message: '✅ Phone verified!' });
    } else {
      res.status(400).json({ error: 'Wrong OTP! Try again.' });
    }
  } catch (err) {
    console.error('2Factor verify error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Verification failed!' });
  }
});