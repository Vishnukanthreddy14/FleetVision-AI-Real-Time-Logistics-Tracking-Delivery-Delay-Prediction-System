// FleetVision AI - Client-Side Authentication & Session Controller

const AUTH_KEY = "fleetvision_auth_user";
const THEME_KEY = "fleetvision_theme";

export const DEMO_PERSONAS = [
  {
    role: "admin",
    roleTitle: "Fleet Operations Administrator",
    name: "Director James Vance",
    email: "admin@fleetvision.ai",
    badge: "Operations Admin",
    initials: "JV",
    password: "fleet2026"
  },
  {
    role: "super_admin",
    roleTitle: "Super Administrator",
    name: "System Owner",
    email: "superadmin@fleetvision.ai",
    badge: "System Control",
    initials: "SA",
    password: "fleet2026"
  },
  {
    role: "customer",
    roleTitle: "Customer Fleet Viewer",
    name: "Fleet Customer",
    email: "customer@fleetvision.ai",
    badge: "Customer Access",
    initials: "FC",
    password: "fleet2026"
  }
];

export function getCurrentUser() {
  // 1. Check localStorage session
  const stored = localStorage.getItem(AUTH_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (parsed && parsed.email) return parsed;
    } catch (_) { }
  }

  // 2. Check document cookie
  const match = document.cookie.match(/fleetvision_auth_user=([^;]+)/);
  if (match) {
    try {
      const decoded = JSON.parse(decodeURIComponent(match[1]));
      if (decoded && decoded.email) {
        localStorage.setItem(AUTH_KEY, JSON.stringify(decoded));
        return decoded;
      }
    } catch (_) { }
  }

  return null;
}

export function isAuthenticated() {
  return !!getCurrentUser();
}

export function requireAuth() {
  const user = getCurrentUser();
  if (!user) {
    window.location.replace("/index.html?auth=required");
    return null;
  }
  return user;
}

export function setCurrentUser(user) {
  if (user) {
    localStorage.setItem(AUTH_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(AUTH_KEY);
  }
}

export async function loginUser(email, password) {
  const cleanEmail = email.trim().toLowerCase();

  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: cleanEmail, password: password })
    });
    const data = await res.json();

    if (res.ok && data.status === "success") {
      const u = data.user || {};
      const user = {
        name: u.name || "Fleet Operator",
        email: u.email || cleanEmail,
        role: u.role || "manager",
        roleTitle: u.role_title || "Operations Dispatcher",
        badge: u.badge || "Operations Hub",
        initials: u.initials || (u.name ? u.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase() : "OP"),
        token: data.token || ("token_" + Date.now())
      };
      setCurrentUser(user);
      return { success: true, user };
    }

    if (data && data.detail) {
      return { success: false, message: data.detail };
    }
  } catch (err) {
    console.warn("Backend login failed or offline, using fallback auth:", err);
  }

  const matched = DEMO_PERSONAS.find(p => p.email.toLowerCase() === cleanEmail);
  if (matched && password === matched.password) {
    const user = {
      ...matched,
      roleTitle: matched.roleTitle,
      role: matched.role,
      token: "demo_token_" + Date.now()
    };
    setCurrentUser(user);
    return { success: true, user };
  }

  return {
    success: false,
    message: "Invalid credentials. Use a demo account or request admin approval for a new account."
  };
}

export async function signupUser(name, email, password) {
  const res = await fetch("/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email: email.trim().toLowerCase(), password, role: "customer" })
  });
  const data = await res.json();
  return { success: res.ok && data.status === "pending_approval", message: data.message || data.detail };
}

export async function logoutUser() {
  setCurrentUser(null);
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } catch (_) { }
  window.location.replace("/index.html?logged_out=true");
}

export async function validateSession() {
  // Validates the current session with the server
  try {
    const res = await fetch("/api/auth/me", {
      method: "GET",
      credentials: "include"
    });
    if (!res.ok) {
      // Session is invalid on server side, clear local storage
      setCurrentUser(null);
      return false;
    }
    const data = await res.json();
    if (data.status === "authenticated" && data.user) setCurrentUser(data.user);
    return data.status === "authenticated";
  } catch (err) {
    console.warn("Session validation failed:", err);
    return false;
  }
}

export function initTheme() {
  let saved = localStorage.getItem(THEME_KEY) || "dark";
  if (saved !== "light") saved = "dark";
  document.documentElement.setAttribute("data-theme", saved);
  return saved;
}

export function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme") || "dark";
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem(THEME_KEY, next);
  return next;
}
