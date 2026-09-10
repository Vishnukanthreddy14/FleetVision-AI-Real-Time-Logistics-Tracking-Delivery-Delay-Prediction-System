/**
 * FleetVisionAI — 3D Flip Card Interactive Login Controller
 * Handles 3D rotation, orbiting transport icons, persona autofill, and FastAPI authentication.
 */

document.addEventListener('DOMContentLoaded', () => {
  const floatingIconsContainer = document.getElementById('floatingIconsContainer');
  const cardFlipper = document.getElementById('cardFlipper');
  const toForgotPwdBtn = document.getElementById('toForgotPwdBtn');
  const backToLoginBtn = document.getElementById('backToLoginBtn');
  const loginForm = document.getElementById('loginForm');
  const resetForm = document.getElementById('resetForm');
  const toggleLoginPwd = document.getElementById('toggleLoginPwd');
  const loginEmail = document.getElementById('loginEmail');
  const loginPassword = document.getElementById('loginPassword');
  const toastMessage = document.getElementById('toastMessage');
  const toastText = document.getElementById('toastText');
  const personaChips = document.querySelectorAll('.persona-chips .chip');

  // Transport & Telematics Line Icon Definitions
  const transportIcons = [
    `<svg viewBox="0 0 24 24"><path d="M1 3h15v13H1zM16 8h4l3 3v5h-7zM5.5 19a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM18.5 19a2.5 2.5 0 100-5 2.5 2.5 0 000 5z"/></svg>`,
    `<svg viewBox="0 0 24 24"><rect x="1" y="5" width="14" height="11" rx="1"/><path d="M15 9h4l3 3v4h-7z"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></svg>`,
    `<svg viewBox="0 0 24 24"><path d="M2 19l2-8h16l2 8H2zM6 11V6h4v5M14 11V4h4v7M1 21c2 1 4 1 6 0s4-1 6 0 4 1 6 0 4-1 5 0"/></svg>`,
    `<svg viewBox="0 0 24 24"><path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg>`,
    `<svg viewBox="0 0 24 24"><path d="M13 3l8 8M9 7l8 8M2 14l8 8M5 11l8 8M14.5 9.5l-5 5"/><circle cx="12" cy="12" r="2"/><path d="M3 21l3-3"/></svg>`,
    `<svg viewBox="0 0 24 24"><path d="M12 4a9 9 0 00-9 9c0 2.8 1.3 5.3 3.3 7h11.4c2-1.7 3.3-4.2 3.3-7a9 9 0 00-9-9z"/><path d="M12 13l3.5-3.5"/><circle cx="12" cy="13" r="1.5"/></svg>`,
    `<svg viewBox="0 0 24 24"><path d="M12 2a7 7 0 00-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 00-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>`,
    `<svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="6" stroke-dasharray="2 3"/></svg>`,
    `<svg viewBox="0 0 24 24"><path d="M4 4h10v16H4zM14 9h3a2 2 0 012 2v7a1 1 0 001 1v0a1 1 0 001-1V8l-3-3M7 8h4"/></svg>`,
    `<svg viewBox="0 0 24 24"><path d="M4 5h2M4 9h2M4 13h2M4 17h2M8 5v14M11 5v14M15 5v14M18 5h2M18 9h2M18 13h2M18 17h2"/></svg>`,
    `<svg viewBox="0 0 24 24"><path d="M3 7l9-4 9 4-9 4-9-4zM3 7v10l9 4 9-4V7M12 11v10"/></svg>`,
    `<svg viewBox="0 0 24 24"><path d="M12 2L3 6v6c0 5.5 3.8 10.7 9 12 5.2-1.3 9-6.5 9-12V6l-9-4zM9 12l2 2 4-4"/></svg>`,
    `<svg viewBox="0 0 24 24"><path d="M12 8a3 3 0 100 6 3 3 0 000-6zM5 6l4 3M19 6l-4 3M5 18l4-3M19 18l-4-3"/><circle cx="4" cy="5" r="2"/><circle cx="20" cy="5" r="2"/><circle cx="4" cy="19" r="2"/><circle cx="20" cy="19" r="2"/></svg>`,
    `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 010 8.49M7.76 16.24a6 6 0 010-8.49M19.07 4.93a10 10 0 010 14.14M4.93 19.07a10 10 0 010-14.14"/></svg>`,
    `<svg viewBox="0 0 24 24"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.77 3.77z"/></svg>`,
    `<svg viewBox="0 0 24 24"><rect x="2" y="7" width="16" height="10" rx="2"/><path d="M22 11v2M6 10v4M10 10v4M14 10v4"/></svg>`,
    `<svg viewBox="0 0 24 24"><path d="M3 3v18h18M7 14l4-4 4 4 5-6"/></svg>`,
    `<svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M8 17a4 4 0 018 0"/></svg>`,
    `<svg viewBox="0 0 24 24"><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M9 12h6M9 16h4"/></svg>`,
    `<svg viewBox="0 0 24 24"><path d="M3 21h18M4 21V9l8-5 8 5v12M9 21v-6h6v6"/></svg>`,
    `<svg viewBox="0 0 24 24"><path d="M2 12h20M12 2a10 10 0 0110 10M12 6a6 6 0 016 6M12 10a2 2 0 022 2"/></svg>`,
    `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/><path d="M12 3v6M12 15v6M3 12h6M15 12h6"/></svg>`
  ];

  function buildOrbitingIcons() {
    floatingIconsContainer.innerHTML = '';
    const totalIcons = transportIcons.length;
    const rx = 270;
    const ry = 280;

    for (let i = 0; i < totalIcons; i++) {
      const angle = (i / totalIcons) * 2 * Math.PI - (Math.PI / 2);
      const jitterRadius = (Math.sin(i * 3.7) * 26);
      const curRx = rx + jitterRadius;
      const curRy = ry + (Math.cos(i * 2.3) * 24);

      const x = Math.round(Math.cos(angle) * curRx);
      const y = Math.round(Math.sin(angle) * curRy);
      const rot = Math.round((Math.sin(i * 1.5) * 25));

      const iconElem = document.createElement('div');
      iconElem.className = `orbit-icon float-anim-${(i % 3) + 1}`;
      iconElem.style.setProperty('--ox', x);
      iconElem.style.setProperty('--oy', y);
      iconElem.style.setProperty('--rot', `${rot}deg`);
      
      const scale = 0.92 + ((i % 5) * 0.05);
      iconElem.style.transform = `translate(${x}px, ${y}px) rotate(${rot}deg) scale(${scale})`;
      iconElem.innerHTML = transportIcons[i];

      floatingIconsContainer.appendChild(iconElem);
    }
  }

  buildOrbitingIcons();

  // 3D Card Flip Animation
  let isFlipping = false;

  function flipCardToBack() {
    if (isFlipping) return;
    isFlipping = true;

    floatingIconsContainer.classList.remove('orbit-burst');
    floatingIconsContainer.classList.add('orbit-implode');

    setTimeout(() => {
      cardFlipper.classList.add('is-flipped');
    }, 120);

    setTimeout(() => {
      floatingIconsContainer.classList.remove('orbit-implode');
      floatingIconsContainer.classList.add('orbit-burst');
      isFlipping = false;

      const resetUser = document.getElementById('resetUsername');
      if (resetUser) resetUser.focus();
    }, 600);
  }

  function flipCardToFront() {
    if (isFlipping) return;
    isFlipping = true;

    floatingIconsContainer.classList.remove('orbit-burst');
    floatingIconsContainer.classList.add('orbit-implode');

    setTimeout(() => {
      cardFlipper.classList.remove('is-flipped');
    }, 120);

    setTimeout(() => {
      floatingIconsContainer.classList.remove('orbit-implode');
      floatingIconsContainer.classList.add('orbit-burst');
      isFlipping = false;

      if (loginEmail) loginEmail.focus();
    }, 600);
  }

  toForgotPwdBtn.addEventListener('click', (e) => {
    e.preventDefault();
    flipCardToBack();
  });

  backToLoginBtn.addEventListener('click', (e) => {
    e.preventDefault();
    flipCardToFront();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && cardFlipper.classList.contains('is-flipped')) {
      flipCardToFront();
    }
  });

  // Password Visibility Toggle
  if (toggleLoginPwd && loginPassword) {
    const eyeOpen = toggleLoginPwd.querySelector('.eye-open');
    const eyeClosed = toggleLoginPwd.querySelector('.eye-closed');

    toggleLoginPwd.addEventListener('click', () => {
      const isPwd = loginPassword.type === 'password';
      loginPassword.type = isPwd ? 'text' : 'password';
      eyeOpen.classList.toggle('hidden', isPwd);
      eyeClosed.classList.toggle('hidden', !isPwd);
    });
  }

  // Toast Helper
  let toastTimer = null;
  function showToast(text, type = 'success') {
    if (toastTimer) clearTimeout(toastTimer);
    toastText.textContent = text;
    toastMessage.className = `toast toast-${type}`;
    
    toastTimer = setTimeout(() => {
      toastMessage.classList.add('hidden');
    }, 4000);
  }

  // Handle URL security parameters (?denied=true, ?logged_out=true)
  const urlParams = new URLSearchParams(window.location.search);
  const alertBanner = document.getElementById('authAlertBanner');

  if (urlParams.get('denied') === 'true') {
    if (alertBanner) {
      alertBanner.className = 'auth-alert-banner alert-denied';
      alertBanner.innerHTML = `
        <div style="display: flex; align-items: flex-start; gap: 0.6rem;">
          <span style="font-size: 1.2rem; line-height: 1;">⛔</span>
          <div>
            <strong style="display: block; font-size: 0.85rem; margin-bottom: 0.15rem;">Access Denied</strong>
            <span style="font-size: 0.78rem; opacity: 0.95;">Authentication required. You must log in with authorized credentials to access the Operations Dashboard.</span>
          </div>
        </div>
      `;
      alertBanner.style.display = 'block';
    }
  } else if (urlParams.get('logged_out') === 'true') {
    if (alertBanner) {
      alertBanner.className = 'auth-alert-banner alert-logout';
      alertBanner.innerHTML = `
        <div style="display: flex; align-items: center; gap: 0.6rem;">
          <span style="font-size: 1.1rem; line-height: 1;">🔒</span>
          <span style="font-size: 0.8rem;">Session terminated securely. Please log in again to resume.</span>
        </div>
      `;
      alertBanner.style.display = 'block';
    }
  } else if (urlParams.get('error') === 'authentik_offline') {
    if (alertBanner) {
      alertBanner.className = 'auth-alert-banner alert-warning';
      alertBanner.innerHTML = `
        <div style="display: flex; align-items: flex-start; gap: 0.6rem;">
          <span style="font-size: 1.2rem; line-height: 1;">⚠️</span>
          <div>
            <strong style="display: block; font-size: 0.85rem; margin-bottom: 0.2rem;">Authentik SSO Server Offline (Port 9000)</strong>
            <span style="font-size: 0.76rem; opacity: 0.95; line-height: 1.45; display: block;">
              Authentik runs inside Docker on port 9000, but Docker Desktop is not started.
              <br>• <strong>To run real Authentik:</strong> Open Docker Desktop, then run:<br>
              <code style="background: rgba(0,0,0,0.35); padding: 2px 6px; border-radius: 4px; font-size: 0.72rem; display: inline-block; margin-top: 3px;">docker compose -f docker-compose.authentik.yml up -d</code>
              <br><br>• <strong>Or test SSO instantly with 1-click OIDC simulation:</strong>
              <div style="margin-top: 6px; display: flex; gap: 6px; flex-wrap: wrap;">
                <a href="/api/auth/authentik/simulate?role=admin" style="padding: 4px 9px; font-size: 0.72rem; text-decoration: none; border-radius: 6px; background: #06B6D4; color: #04101E; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;">👑 SSO as Admin</a>
                <a href="/api/auth/authentik/simulate?role=manager" style="padding: 4px 9px; font-size: 0.72rem; text-decoration: none; border-radius: 6px; background: #3B82F6; color: #FFFFFF; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;">🧭 SSO as Manager</a>
                <a href="/api/auth/authentik/simulate?role=user" style="padding: 4px 9px; font-size: 0.72rem; text-decoration: none; border-radius: 6px; background: #10B981; color: #FFFFFF; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;">🚚 SSO as Driver</a>
              </div>
            </span>
          </div>
        </div>
      `;
      alertBanner.style.display = 'block';
    }
  } else if (urlParams.get('error')) {
    if (alertBanner) {
      alertBanner.className = 'auth-alert-banner alert-denied';
      alertBanner.innerHTML = `
        <div style="display: flex; align-items: flex-start; gap: 0.6rem;">
          <span style="font-size: 1.2rem; line-height: 1;">❌</span>
          <div>
            <strong style="display: block; font-size: 0.85rem; margin-bottom: 0.15rem;">Authentication Failed</strong>
            <span style="font-size: 0.78rem; opacity: 0.95;">Authentik authentication was cancelled or returned an error. Please try again.</span>
          </div>
        </div>
      `;
      alertBanner.style.display = 'block';
    }
  }

  // Persona Autofill matching backend/routes/auth.py DEMO_ACCOUNTS & VALID_CREDENTIALS
  const personas = {
    admin: { email: 'admin@fleetvision.ai', pass: 'fleet2026', label: 'Director James Vance (Admin)' },
    manager: { email: 'manager@fleetvision.ai', pass: 'fleet2026', label: 'Sarah Chen (Manager)' },
    user: { email: 'user@fleetvision.ai', pass: 'fleet2026', label: 'Marcus Brody (Driver)' }
  };

  if (loginEmail && loginPassword) {
    loginEmail.value = personas.admin.email;
    loginPassword.value = personas.admin.pass;
  }

  personaChips.forEach(chip => {
    chip.addEventListener('click', () => {
      personaChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');

      const roleKey = chip.getAttribute('data-role');
      const p = personas[roleKey];
      if (p) {
        loginEmail.value = p.email;
        loginPassword.value = p.pass;
        loginEmail.classList.remove('input-error');
        loginPassword.classList.remove('input-error');
        if (alertBanner && !urlParams.get('denied')) {
          alertBanner.style.display = 'none';
        }
        showToast(`Signing in as ${p.label}...`, 'success');
        
        // Auto-submit login form for 1-click experience
        setTimeout(() => {
          if (loginForm) {
            loginForm.requestSubmit ? loginForm.requestSubmit() : loginForm.dispatchEvent(new Event('submit', { cancelable: true }));
          }
        }, 150);
      }
    });
  });

  // Submit to FastAPI /api/auth/login
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById('loginSubmitBtn');
    const btnText = submitBtn.querySelector('.btn-text');
    const btnSpinner = submitBtn.querySelector('.btn-spinner');

    const email = loginEmail.value.trim();
    const password = loginPassword.value.trim();

    let hasError = false;
    if (!email) {
      loginEmail.classList.add('input-error');
      hasError = true;
    }
    if (!password) {
      loginPassword.classList.add('input-error');
      hasError = true;
    }

    if (hasError) {
      showToast('Please enter both operator email and password.', 'error');
      return;
    }

    submitBtn.disabled = true;
    btnText.textContent = 'Verifying...';
    btnSpinner.classList.remove('hidden');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();

      if (response.ok && data.status === 'success') {
        // Save user state in localStorage and cookie via auth.js
        if (typeof setCurrentUser === 'function') {
          setCurrentUser(data.user);
        } else {
          localStorage.setItem('fleetvision_auth_user', JSON.stringify(data.user));
          document.cookie = `fleetvision_auth_user=${encodeURIComponent(JSON.stringify(data.user))}; Path=/; Max-Age=86400; SameSite=Lax`;
        }

        showToast(`Access Granted: ${data.user.name} (${data.user.role.toUpperCase()})`, 'success');
        setTimeout(() => {
          window.location.href = '/dashboard';
        }, 500);
      } else {
        submitBtn.disabled = false;
        btnText.textContent = 'Log in';
        btnSpinner.classList.add('hidden');
        loginPassword.classList.add('input-error');
        loginEmail.classList.add('input-error');

        const isLockout = response.status === 429;
        const errMsg = data.detail || data.message || 'Access Denied: Invalid operator credentials.';
        showToast(errMsg, 'error');

        if (alertBanner) {
          alertBanner.className = 'auth-alert-banner alert-denied';
          alertBanner.innerHTML = `
            <div style="display: flex; align-items: flex-start; gap: 0.6rem;">
              <span style="font-size: 1.1rem; line-height: 1;">${isLockout ? '🔒' : '❌'}</span>
              <div>
                <strong style="display: block; font-size: 0.82rem; margin-bottom: 0.1rem;">${isLockout ? 'Brute-Force Lockout Active' : 'Access Denied'}</strong>
                <span style="font-size: 0.76rem;">${errMsg}</span>
              </div>
            </div>
          `;
          alertBanner.style.display = 'block';
        }
      }

    } catch (err) {
      console.error('Auth error:', err);
      submitBtn.disabled = false;
      btnText.textContent = 'Log in';
      btnSpinner.classList.add('hidden');
      showToast('Authentication server connection error. Access Denied.', 'error');
    }
  });

  // Reset Password Submission
  resetForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const resetUsername = document.getElementById('resetUsername');
    const resetEmail = document.getElementById('resetEmail');
    const submitBtn = document.getElementById('resetSubmitBtn');
    const btnText = submitBtn.querySelector('.btn-text');
    const btnSpinner = submitBtn.querySelector('.btn-spinner');

    let hasError = false;
    if (!resetUsername.value.trim()) {
      resetUsername.classList.add('input-error');
      hasError = true;
    }
    if (!resetEmail.value.trim() || !resetEmail.value.includes('@')) {
      resetEmail.classList.add('input-error');
      hasError = true;
    }

    if (hasError) {
      showToast('Please provide a valid operator ID and corporate email.', 'error');
      return;
    }

    submitBtn.disabled = true;
    btnText.textContent = 'Dispatching Token...';
    btnSpinner.classList.remove('hidden');

    setTimeout(() => {
      submitBtn.disabled = false;
      btnText.textContent = 'Reset password';
      btnSpinner.classList.add('hidden');
      showToast(`Recovery token dispatched to ${resetEmail.value.trim()}!`, 'success');

      setTimeout(() => {
        flipCardToFront();
      }, 1400);
    }, 1200);
  });

  document.querySelectorAll('.form-input').forEach(input => {
    input.addEventListener('input', () => {
      input.classList.remove('input-error');
    });
  });
});
