const BACKEND = window.location.hostname === 'localhost'
  ? 'http://localhost:3000'
  : 'https://rideshare-backend-e3ka.onrender.com';

let selectedRole = 'passenger';
let otpVerified = false;

if (localStorage.getItem('token')) {
  window.location.href = 'index.html';
}

function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
  document.getElementById(`${tab}-form`).classList.add('active');
  event.target.classList.add('active');
}

function selectRole(role) {
  selectedRole = role;
  document.querySelectorAll('.role-card').forEach(c => c.classList.remove('active'));
  document.getElementById(`role-${role}`).classList.add('active');
}

async function signup() {
  if (!otpVerified) {
    document.getElementById('signup-error').textContent = '⚠️ Please verify your phone number first!';
    return;
  }

  const name     = document.getElementById('signup-name').value.trim();
  const email    = document.getElementById('signup-email').value.trim();
  const phone    = document.getElementById('signup-phone').value.trim();
  const password = document.getElementById('signup-password').value;
  const errorEl  = document.getElementById('signup-error');

  errorEl.textContent = '';

  if (!name || !email || !password) { errorEl.textContent = '⚠️ Please fill in all fields!'; return; }
  if (password.length < 6) { errorEl.textContent = '⚠️ Password must be at least 6 characters!'; return; }

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

async function login() {
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errorEl  = document.getElementById('login-error');

  errorEl.textContent = '';

  if (!email || !password) { errorEl.textContent = '⚠️ Please enter email and password!'; return; }

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

async function sendOTP() {
  const phone = document.getElementById('signup-phone').value.trim();
  const statusEl = document.getElementById('otp-status');

  if (!phone) { statusEl.textContent = '⚠️ Enter phone number!'; return; }

  try {
    const res = await fetch(`${BACKEND}/auth/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone })
    });
    const data = await res.json();
    if (res.ok) {
      statusEl.textContent = '✅ OTP sent!';
      document.getElementById('otp-section').style.display = 'block';
    } else {
      statusEl.textContent = `❌ ${data.error}`;
    }
  } catch (e) {
    statusEl.textContent = '❌ Cannot reach server!';
  }
}

async function verifyOTP() {
  const phone = document.getElementById('signup-phone').value.trim();
  const otp = document.getElementById('otp-input').value.trim();
  const statusEl = document.getElementById('otp-status');

  try {
    const res = await fetch(`${BACKEND}/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, otp })
    });
    const data = await res.json();
    if (res.ok) {
      otpVerified = true;
      statusEl.textContent = '✅ Phone verified!';
      document.getElementById('otp-section').style.display = 'none';
    } else {
      statusEl.textContent = `❌ ${data.error}`;
    }
  } catch (e) {
    statusEl.textContent = '❌ Cannot reach server!';
  }
}