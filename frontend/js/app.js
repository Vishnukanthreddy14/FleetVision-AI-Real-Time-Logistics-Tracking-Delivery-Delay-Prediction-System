// FleetVision AI - Landing Page Controller

import { INITIAL_FLEETS, FAQ_LIST } from "./data.js";
import { getCurrentUser, isAuthenticated, loginUser, signupUser, logoutUser, initTheme, toggleTheme, DEMO_PERSONAS } from "./auth.js";

document.addEventListener("DOMContentLoaded", () => {
  setupTheme();
  setupAuthUI();
  renderHeroFleets();
  renderDetailedFleetCards();
  renderFaq();
  bindLandingEvents();
  checkUrlParams();
});

// --- Theme Management ---
function setupTheme() {
  const current = initTheme();
  updateThemeIcon(current);

  const btn = document.getElementById("themeToggleBtn");
  if (btn) {
    btn.addEventListener("click", () => {
      const next = toggleTheme();
      updateThemeIcon(next);
      showToast(`Switched to ${next === 'light' ? 'Daylight Light' : 'Obsidian Dark'} mode`);
    });
  }
}

function updateThemeIcon(theme) {
  const icon = document.getElementById("themeIcon");
  if (icon) {
    icon.textContent = (theme === "light") ? "🌙" : "☀️";
  }
}

// --- Session & Navigation Status ---
function setupAuthUI() {
  const unauthActions = document.getElementById("unauthActions");
  const authActions = document.getElementById("authActions");

  if (isAuthenticated()) {
    if (unauthActions) unauthActions.style.display = "none";
    if (authActions) authActions.style.display = "flex";
  } else {
    if (unauthActions) unauthActions.style.display = "flex";
    if (authActions) authActions.style.display = "none";
  }

  const navLogoutBtn = document.getElementById("navLogoutBtn");
  if (navLogoutBtn) {
    navLogoutBtn.addEventListener("click", () => logoutUser());
  }
}

function calculateFleetEtaText(fleet) {
  const distance = Number(fleet.distanceRemainingKm);
  const speed = Number(fleet.speed);
  if (!Number.isFinite(distance) || distance <= 0) return "0h 00m";
  if (!Number.isFinite(speed) || speed <= 0) return "—";
  const minutes = Math.max(1, Math.round((distance / speed) * 60));
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

// --- Render 6 Simulated Fleets in Hero Card ---
function renderHeroFleets() {
  const container = document.getElementById("heroFleetsContainer");
  if (!container) return;

  container.innerHTML = INITIAL_FLEETS.slice(0, 3).map(fleet => `
    <div class="truck-node-item">
      <div style="display: flex; align-items: center; gap: 0.65rem;">
        <div style="width: 34px; height: 34px; border-radius: 8px; background: var(--bg-surface); border: 1px solid var(--border-subtle); display: flex; align-items: center; justify-content: center; font-size: 1rem;">
          🚛
        </div>
        <div class="truck-node-info">
          <h4>${fleet.plate} • ${fleet.model.split(" ")[0]} ${fleet.model.split(" ")[1] || ""}</h4>
          <p>${fleet.origin.split(" ")[0]} ➔ ${fleet.destination.split(" ")[0]} • ${fleet.speed} km/h</p>
        </div>
      </div>
      <div class="truck-node-eta">
        <div class="eta-val">${calculateFleetEtaText(fleet)}</div>
        <div class="eta-lbl">Est. Arrival</div>
      </div>
    </div>
  `).join("");
}

// --- Render Detailed Fleet Grid ---
function renderDetailedFleetCards() {
  const grid = document.getElementById("detailedFleetGrid");
  if (!grid) return;

  grid.innerHTML = INITIAL_FLEETS.map(f => `
    <div class="feature-card" style="padding: 1.5rem; display: flex; flex-direction: column; justify-content: space-between;">
      <div>
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.85rem;">
          <div>
            <span class="badge" style="margin-bottom: 0.4rem;">${f.id} • ${f.plate}</span>
            <h3 style="font-size: 1.1rem; font-weight: 800; color: var(--text-primary); margin: 0;">${f.model}</h3>
            <p style="font-size: 0.78rem; color: var(--text-muted);">${f.type}</p>
          </div>
          <span style="font-size: 0.75rem; font-weight: 700; color: var(--color-secondary); background: rgba(16, 185, 129, 0.1); padding: 0.2rem 0.6rem; border-radius: 9999px;">
            ${f.status}
          </span>
        </div>

        <div style="background: var(--bg-surface-elevated); padding: 0.75rem; border-radius: 0.65rem; border: 1px solid var(--border-subtle); margin-bottom: 1rem; font-size: 0.82rem;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 0.35rem;">
            <span style="color: var(--text-muted);">Corridor:</span>
            <strong style="color: var(--text-primary);">${f.routeName.split(" (")[0]}</strong>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 0.35rem;">
            <span style="color: var(--text-muted);">Consignment:</span>
            <span style="color: var(--text-secondary);">${f.cargo.slice(0, 24)}...</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="color: var(--text-muted);">Assigned Pilot:</span>
            <strong style="color: var(--text-primary);">${f.driverName}</strong>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem; text-align: center; margin-bottom: 1rem;">
          <div style="background: var(--bg-base); padding: 0.5rem; border-radius: 6px; border: 1px solid var(--border-subtle);">
            <div style="font-size: 0.7rem; color: var(--text-muted);">Speed</div>
            <strong style="font-size: 0.88rem; color: var(--text-primary);">${f.speed} km/h</strong>
          </div>
          <div style="background: var(--bg-base); padding: 0.5rem; border-radius: 6px; border: 1px solid var(--border-subtle);">
            <div style="font-size: 0.7rem; color: var(--text-muted);">Fuel Level</div>
            <strong style="font-size: 0.88rem; color: var(--color-secondary);">${f.fuelLevel}%</strong>
          </div>
          <div style="background: var(--bg-base); padding: 0.5rem; border-radius: 6px; border: 1px solid var(--border-subtle);">
            <div style="font-size: 0.7rem; color: var(--text-muted);">On-Time Score</div>
            <strong style="font-size: 0.88rem; color: var(--color-primary);">${f.accuracy}</strong>
          </div>
        </div>
      </div>

      <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border-subtle); padding-top: 0.85rem;">
        <div>
          <span style="font-size: 0.72rem; color: var(--text-muted); display: block;">Arrival Window</span>
          <strong style="font-size: 1.05rem; color: var(--color-primary);">${calculateFleetEtaText(f)}</strong>
        </div>
        <button type="button" class="btn btn-primary btn-sm track-fleet-direct" data-fleet="${f.id}">
          Track in Dashboard ➔
        </button>
      </div>
    </div>
  `).join("");

  document.querySelectorAll(".track-fleet-direct").forEach(btn => {
    btn.addEventListener("click", () => {
      if (isAuthenticated()) {
        window.location.href = "/dashboard.html";
      } else {
        openAuthModal("login");
        showToast("Please sign in to access live radar tracking.");
      }
    });
  });
}

// --- Render FAQ ---
function renderFaq() {
  const container = document.getElementById("faqAccordionContainer");
  if (!container) return;

  container.innerHTML = FAQ_LIST.map((item, idx) => `
    <div class="feature-card" style="padding: 1.25rem 1.5rem; cursor: pointer;" onclick="this.classList.toggle('open')">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <h4 style="font-size: 1.02rem; font-weight: 700; color: var(--text-primary); margin: 0;">${item.q}</h4>
        <span style="color: var(--color-primary); font-size: 1.1rem; margin-left: 1rem;">▼</span>
      </div>
      <p style="margin-top: 0.75rem; color: var(--text-secondary); font-size: 0.9rem; line-height: 1.55;">${item.a}</p>
    </div>
  `).join("");
}

// --- Quick Consignment / Truck Search ---
function bindLandingEvents() {
  const trackBtn = document.getElementById("quickTrackBtn");
  const trackInput = document.getElementById("quickTrackInput");
  const resultDiv = document.getElementById("quickTrackResult");

  if (trackBtn && trackInput) {
    trackBtn.addEventListener("click", () => {
      const q = trackInput.value.trim().toUpperCase();
      if (!q) {
        showToast("Please enter a vehicle ID (e.g. TRK-101) or state plate.");
        return;
      }
      const match = INITIAL_FLEETS.find(f => f.id.toUpperCase() === q || f.plate.toUpperCase().includes(q) || f.origin.toUpperCase().includes(q) || f.destination.toUpperCase().includes(q));
      if (match) {
        if (resultDiv) {
          resultDiv.style.display = "block";
          resultDiv.innerHTML = `🟢 <strong>${match.id} (${match.plate})</strong>: In transit along ${match.routeName.split(" (")[0]}. Speed: ${match.speed} km/h • ETA: <strong>${calculateFleetEtaText(match)}</strong>. <a href="/dashboard.html" style="text-decoration: underline; color: var(--color-primary);">Open Radar ↗</a>`;
        }
      } else {
        if (resultDiv) {
          resultDiv.style.display = "block";
          resultDiv.innerHTML = `⚠️ No matching active corridor record for "${q}". Showing 6 live national fleets below.`;
        }
      }
    });
  }

  // Hero CTAs
  const heroGetStarted = document.getElementById("heroGetStartedBtn");
  if (heroGetStarted) {
    heroGetStarted.addEventListener("click", () => {
      if (isAuthenticated()) {
        window.location.href = "/dashboard.html";
      } else {
        openAuthModal("login");
      }
    });
  }

  const heroSignup = document.getElementById("heroSignupBtn");
  if (heroSignup) {
    heroSignup.addEventListener("click", () => {
      if (isAuthenticated()) {
        window.location.href = "/dashboard.html";
      } else {
        openAuthModal("signup");
      }
    });
  }

  const heroToDashboard = document.getElementById("heroToDashboardBtn");
  if (heroToDashboard) {
    heroToDashboard.addEventListener("click", () => {
      if (isAuthenticated()) {
        window.location.href = "/dashboard.html";
      } else {
        openAuthModal("login");
      }
    });
  }

  // Modal Open/Close Triggers
  const openLogin = document.getElementById("openLoginBtn");
  if (openLogin) openLogin.addEventListener("click", () => openAuthModal("login"));

  const openSignup = document.getElementById("openSignupBtn");
  if (openSignup) openSignup.addEventListener("click", () => openAuthModal("signup"));

  const closeBtn = document.getElementById("closeAuthModalBtn");
  if (closeBtn) closeBtn.addEventListener("click", () => closeAuthModal());

  const modalOverlay = document.getElementById("authModal");
  if (modalOverlay) {
    modalOverlay.addEventListener("click", (e) => {
      if (e.target === modalOverlay) closeAuthModal();
    });
  }

  // Tab switching
  const tabLogin = document.getElementById("tabLoginBtn");
  const tabSignup = document.getElementById("tabSignupBtn");
  if (tabLogin) tabLogin.addEventListener("click", () => switchAuthTab("login"));
  if (tabSignup) tabSignup.addEventListener("click", () => switchAuthTab("signup"));

  // 1-Click Persona chips
  document.querySelectorAll("[data-persona]").forEach(chip => {
    chip.addEventListener("click", (e) => {
      const personaKey = e.currentTarget.getAttribute("data-persona");
      fillPersona(personaKey);
    });
  });

  // Login Form Submission
  const loginForm = document.getElementById("loginForm");
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = document.getElementById("loginEmail").value.trim();
      const pass = document.getElementById("loginPassword").value;
      const submitBtn = document.getElementById("loginSubmitBtn");

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Verifying Access Gate...";
      }

      const res = await loginUser(email, pass);
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Authenticate & Launch Dashboard ➔";
      }

      if (res.success) {
        showToast(`Welcome, ${res.user.name}! Access granted (${res.user.roleTitle || res.user.role}).`);
        closeAuthModal();
        setupAuthUI();
        setTimeout(() => {
          window.location.href = "/dashboard.html";
        }, 350);
      } else {
        showToast(res.message || "Invalid credentials. Please verify your corporate email.", "error");
      }
    });
  }

  // Signup Form Submission
  const signupForm = document.getElementById("signupForm");
  if (signupForm) {
    signupForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = document.getElementById("signupName").value.trim();
      const email = document.getElementById("signupEmail").value.trim();
      const pass = document.getElementById("signupPassword").value;
      const res = await signupUser(name, email, pass);
      if (res.success) {
        showToast("Customer access request submitted. A Super Admin must approve it before you can sign in.");
        signupForm.reset();
      } else {
        showToast(res.message || "Could not submit access request.", "error");
      }
    });
  }

  const forgotTrigger = document.getElementById("forgotPwdTrigger");
  if (forgotTrigger) {
    forgotTrigger.addEventListener("click", () => {
      alert("Corporate Password Recovery: A temporary cryptographic recovery token has been dispatched to your corporate email gateway.");
    });
  }
}

// --- Auth Modal Helpers ---
function openAuthModal(mode = "login") {
  const modal = document.getElementById("authModal");
  if (modal) {
    modal.classList.add("active");
    switchAuthTab(mode);
  }
}

function closeAuthModal() {
  const modal = document.getElementById("authModal");
  if (modal) modal.classList.remove("active");
}

function switchAuthTab(mode) {
  const tabLogin = document.getElementById("tabLoginBtn");
  const tabSignup = document.getElementById("tabSignupBtn");
  const loginForm = document.getElementById("loginForm");
  const signupForm = document.getElementById("signupForm");
  const modalTitle = document.getElementById("modalTitle");

  if (mode === "login") {
    tabLogin?.classList.add("active");
    tabSignup?.classList.remove("active");
    if (loginForm) loginForm.style.display = "block";
    if (signupForm) signupForm.style.display = "none";
    if (modalTitle) modalTitle.textContent = "Sign In to Fleet Operations";
  } else {
    tabSignup?.classList.add("active");
    tabLogin?.classList.remove("active");
    if (loginForm) loginForm.style.display = "none";
    if (signupForm) signupForm.style.display = "block";
    if (modalTitle) modalTitle.textContent = "Create Fleet Member Account";
  }
}

function fillPersona(roleKey) {
  const persona = DEMO_PERSONAS.find(p => p.role === roleKey) || DEMO_PERSONAS[0];
  const emailInput = document.getElementById("loginEmail");
  const passInput = document.getElementById("loginPassword");

  if (emailInput && passInput) {
    emailInput.value = persona.email;
    passInput.value = persona.password;
    showToast(`Loaded ${persona.roleTitle}: ${persona.name}`);
  }
}

// --- URL Parameter Gating Notification ---
function checkUrlParams() {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get("auth") === "required") {
    openAuthModal("login");
    showToast("⚠️ Authentication required: Please sign in to view the Operations Dashboard.");
  } else if (urlParams.get("logged_out") === "true") {
    showToast("Logged out of Operations Dashboard successfully.");
  }
}

// --- Toast Manager ---
export function showToast(message, type = "info") {
  const toastBox = document.getElementById("toastBox");
  const toastMsg = document.getElementById("toastMsg");
  const toastIcon = document.getElementById("toastIcon");

  if (!toastBox || !toastMsg) return;

  toastMsg.textContent = message;
  toastIcon.textContent = (type === "error") ? "❌" : (type === "success") ? "✅" : "🔔";

  toastBox.classList.add("show");
  clearTimeout(toastBox._timer);
  toastBox._timer = setTimeout(() => {
    toastBox.classList.remove("show");
  }, 4000);
}

// Event bus and modal controller connected
