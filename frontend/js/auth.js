/**
 * FleetVisionAI: Client-side Authentication & Role State
 */

const AUTH_KEY = "fleetvision_auth_user";
const THEME_KEY = "fleetvision_theme";

const DEFAULT_USERS = {
  admin: {
    email: "admin@fleetvision.ai",
    name: "Sarah Connor",
    role: "admin",
    role_title: "Enterprise Fleet Administrator",
    avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
    permissions: ["full_fleet_control", "simulation_control", "incident_injection", "model_retraining"]
  },
  manager: {
    email: "manager@fleetvision.ai",
    name: "Marcus Sterling",
    role: "manager",
    role_title: "Logistics Dispatch Manager",
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80",
    permissions: ["fleet_monitoring", "route_optimization", "fuel_analytics", "delay_mitigation"]
  },
  user: {
    email: "user@fleetvision.ai",
    name: "Jordan Lee",
    role: "user",
    role_title: "Assigned Shipment Operator",
    avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80",
    permissions: ["assigned_vehicle_tracking", "shipment_eta_view"]
  }
};

function getCookie(name) {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[2]) : null;
}

function getCurrentUser() {
  // 1. Check localStorage first
  const stored = localStorage.getItem(AUTH_KEY);
  if (stored) {
    try {
      const user = JSON.parse(stored);
      if (user && user.role) return user;
    } catch (e) {
      console.warn("Invalid localStorage auth cache:", e);
      localStorage.removeItem(AUTH_KEY);
    }
  }

  // 2. Check session cookie (e.g. Authentik OIDC or FastAPI set-cookie)
  const cookieVal = getCookie("fleetvision_auth_user");
  if (cookieVal) {
    try {
      const user = JSON.parse(cookieVal);
      if (user && user.role) {
        localStorage.setItem(AUTH_KEY, JSON.stringify(user));
        return user;
      }
    } catch (e) {
      console.warn("Invalid cookie auth:", e);
    }
  }

  // 3. Strict: Return null if unauthenticated (no admin fallback)
  return null;
}

function requireAuth() {
  const user = getCurrentUser();
  if (!user) {
    window.location.replace("/login?denied=true");
    return null;
  }
  return user;
}

function setCurrentUser(user) {
  if (user) {
    localStorage.setItem(AUTH_KEY, JSON.stringify(user));
    document.cookie = `fleetvision_auth_user=${encodeURIComponent(JSON.stringify(user))}; Path=/; Max-Age=86400; SameSite=Lax`;
  } else {
    localStorage.removeItem(AUTH_KEY);
    document.cookie = "fleetvision_auth_user=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;";
  }
}

function logout() {
  localStorage.removeItem(AUTH_KEY);
  document.cookie = "fleetvision_auth_user=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;";
  try {
    fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
  } catch (_) {}
  window.location.href = "/login?logged_out=true";
}

function initTheme() {
  const savedTheme = localStorage.getItem(THEME_KEY) || "dark";
  document.documentElement.setAttribute("data-theme", savedTheme);
  updateThemeToggleIcons(savedTheme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme") || "dark";
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem(THEME_KEY, next);
  updateThemeToggleIcons(next);
  if (window.onThemeChanged) {
    window.onThemeChanged(next);
  }
}

function updateThemeToggleIcons(theme) {
  document.querySelectorAll(".theme-toggle-btn").forEach(btn => {
    btn.innerHTML = theme === "dark" ? "☀️" : "🌙";
    btn.setAttribute("title", `Switch to ${theme === "dark" ? "Light" : "Dark"} Mode`);
  });
}

// Initialize theme on script load
initTheme();
