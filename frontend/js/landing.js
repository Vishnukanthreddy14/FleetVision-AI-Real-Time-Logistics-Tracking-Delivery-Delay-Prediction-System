/**
 * FleetVisionAI: Landing Page Interactivity
 */

document.addEventListener("DOMContentLoaded", () => {
  const modal = document.getElementById("loginModal");
  const openModalBtn = document.getElementById("openLoginModalBtn");
  const closeModalBtn = document.getElementById("closeLoginModalBtn");
  const loginForm = document.getElementById("loginForm");
  const themeToggle = document.getElementById("themeToggleBtn");

  if (themeToggle) {
    themeToggle.addEventListener("click", toggleTheme);
  }

  // Quick 1-click Role Selectors
  document.querySelectorAll("[data-quick-role]").forEach(card => {
    card.addEventListener("click", (e) => {
      const role = card.getAttribute("data-quick-role");
      quickLoginAsRole(role);
    });
  });

  // Modal Open / Close
  if (openModalBtn) {
    openModalBtn.addEventListener("click", () => {
      modal.classList.add("active");
    });
  }

  if (closeModalBtn) {
    closeModalBtn.addEventListener("click", () => {
      modal.classList.remove("active");
    });
  }

  window.addEventListener("click", (e) => {
    if (e.target === modal) {
      modal.classList.remove("active");
    }
  });

  // Custom Form Login
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = document.getElementById("loginEmail").value;
      const password = document.getElementById("loginPassword").value;

      try {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (data.status === "success") {
          setCurrentUser(data.user);
          window.location.href = "/dashboard";
        }
      } catch (err) {
        console.error("Login failed, using fallback client session:", err);
        quickLoginAsRole("admin");
      }
    });
  }

  // Load Live Metrics Ticker
  fetchLiveMetrics();
});

function quickLoginAsRole(role) {
  const user = DEFAULT_USERS[role] || DEFAULT_USERS.admin;
  setCurrentUser(user);
  window.location.href = "/dashboard";
}

async function fetchLiveMetrics() {
  try {
    const res = await fetch("/api/analytics/overview");
    if (!res.ok) return;
    const data = await res.json();
    
    const countEl = document.getElementById("tickerVehicleCount");
    const onTimeEl = document.getElementById("tickerOnTime");
    const etaEl = document.getElementById("tickerAvgEta");
    const effEl = document.getElementById("tickerEfficiency");

    if (countEl) countEl.innerText = `${data.total_vehicles || 14}`;
    if (onTimeEl) onTimeEl.innerText = `${data.on_time_rate_pct || 98.2}%`;
    if (etaEl) etaEl.innerText = `${data.avg_eta_min || 185} min`;
    if (effEl) effEl.innerText = `${data.fleet_efficiency_score || 94.8}/100`;
  } catch (e) {
    // Graceful fallback to static defaults
  }
}
