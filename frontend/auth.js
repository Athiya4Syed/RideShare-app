const BACKEND = window.location.hostname === 'localhost'
  ? 'http://localhost:3000'
  : 'https://rideshare-backend-e3ka.onrender.com';
let selectedRole = 'passenger';

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
      // Save token and user info
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));

      // Redirect to main app
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

// ─── AUTO REDIRECT IF ALREADY LOGGED IN ──────────────────────────
if (localStorage.getItem('token')) {
  window.location.href = 'index.html';
}