// FleetVision AI - Operations Dashboard Controller

import { INITIAL_FLEETS, INITIAL_DRIVERS, INITIAL_ROUTES, INITIAL_BOOKINGS, FAQ_LIST } from "./data.js";
import { getCurrentUser, requireAuth, logoutUser, initTheme, toggleTheme, validateSession } from "./auth.js";

class DashboardApp {
  constructor() {
    this.currentUser = null;
    this.currentRole = "customer";
    this.fleets = JSON.parse(JSON.stringify(INITIAL_FLEETS));
    this.fleets.forEach((fleet) => this.initializeFleetRoute(fleet));
    this.fleets.forEach((fleet) => this.updateFleetEta(fleet));
    this.drivers = [...INITIAL_DRIVERS];
    this.routes = [...INITIAL_ROUTES];
    this.bookings = [...INITIAL_BOOKINGS];
    this.selectedFleetId = this.fleets[0].id;
    this.simSpeed = 1;
    this.isSimRunning = true;

    // Leaflet state
    this.map = null;
    this.markers = {};
    this.routePolylines = [];
    this.activeView = "view-fleets";
    this.customerFleetAssignments = [];

    this.init();
  }

  async init() {
    // 1. Strict Security Guard with server-side validation
    this.currentUser = requireAuth();
    if (!this.currentUser) return;

    // 2. Validate session with server
    const isValid = await validateSession();
    if (!isValid) {
      window.location.replace("/index.html?auth=required");
      return;
    }

    this.currentUser = getCurrentUser() || this.currentUser;
    this.currentRole = this.currentUser.role || "customer";
    if (this.currentRole === "customer") {
      const assignedIds = new Set(this.currentUser.fleet_ids || []);
      this.fleets = this.fleets.filter((fleet) => assignedIds.has(fleet.id));
      this.drivers = this.drivers.filter((driver) => assignedIds.has(driver.assignedTruck));
      this.routes = this.routes.filter((route) => this.fleets.some((fleet) => fleet.routeId === route.id));
      this.selectedFleetId = this.fleets[0]?.id || null;
    }
    await this.loadRoadRoutes();
    this.setupTheme();
    this.applyRoleVisibility();
    this.renderUserProfile();
    this.bindNavigationTabs();
    this.initLeafletMap();
    this.renderFleetsTable();
    this.updateInspector(this.selectedFleetId);
    this.renderDrivers();
    this.renderRoutes();
    this.renderBookingsQueue();
    this.renderHelpFaq();
    this.bindInspectorActions();
    this.bindBookingForm();
    if (["admin", "super_admin"].includes(this.currentRole)) this.loadCustomerFleetManager();
    this.startSimulationLoop();
  }

  // --- Theme ---
  setupTheme() {
    const curTheme = initTheme();
    this.updateThemeIcon(curTheme);

    const toggleBtn = document.getElementById("dashThemeToggleBtn");
    if (toggleBtn) {
      toggleBtn.addEventListener("click", () => {
        const next = toggleTheme();
        this.updateThemeIcon(next);
        this.showToast(`Switched to ${next === 'light' ? 'Daylight Light' : 'Obsidian Dark'} mode`);
      });
    }

    const logoutBtn = document.getElementById("dashLogoutBtn");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", () => logoutUser());
    }
  }

  updateThemeIcon(theme) {
    const icon = document.getElementById("dashThemeIcon");
    if (icon) icon.textContent = (theme === "light") ? "🌙" : "☀️";
  }

  calculateEtaMinutes(distanceKm, speedKmh) {
    const distance = Number(distanceKm);
    const speed = Number(speedKmh);
    if (!Number.isFinite(distance) || distance <= 0) return 0;
    if (!Number.isFinite(speed) || speed <= 0) return null;
    return Math.max(1, Math.round((distance / speed) * 60));
  }

  formatEta(minutes) {
    if (minutes === null) return "—";
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${String(remainingMinutes).padStart(2, "0")}m`;
  }

  updateFleetEta(fleet) {
    const minutes = this.calculateEtaMinutes(fleet.distanceRemainingKm, fleet.speed);
    fleet.etaHours = minutes === null ? null : minutes / 60;
    fleet.etaText = this.formatEta(minutes);
    fleet.rfEtaText = this.formatEta(minutes === null ? null : minutes + 3);
    fleet.lstmEtaText = this.formatEta(minutes === null ? null : Math.max(1, minutes - 4));
  }

  distanceBetweenKm(start, end) {
    const radians = (degrees) => (degrees * Math.PI) / 180;
    const [startLat, startLon] = start;
    const [endLat, endLon] = end;
    const latitudeDelta = radians(endLat - startLat);
    const longitudeDelta = radians(endLon - startLon);
    const haversine = Math.sin(latitudeDelta / 2) ** 2
      + Math.cos(radians(startLat)) * Math.cos(radians(endLat)) * Math.sin(longitudeDelta / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
  }

  initializeFleetRoute(fleet) {
    const waypoints = fleet.waypoints.map((waypoint) => waypoint.coords);
    let nearestIndex = 0;
    let nearestDistance = Infinity;
    waypoints.forEach((waypoint, index) => {
      const distance = this.distanceBetweenKm(fleet.currentCoords, waypoint);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });
    fleet.routeSegmentIndex = Math.min(nearestIndex, waypoints.length - 1);
    fleet.routeStartWaypointIndex = nearestIndex;
    fleet.currentCoords = [...fleet.currentCoords];
    fleet.routeAtCheckpoint = nearestDistance < 1;
    if (fleet.routeAtCheckpoint) fleet.currentCoords = [...waypoints[nearestIndex]];
    this.updateRemainingRouteDistance(fleet);
    if (fleet.routeSegmentIndex >= waypoints.length - 1) fleet.status = "Arrived";
  }

  async requestRoadRoute(fleet, checkpoints) {
    const cacheKey = `fleetvision:road-route:v1:${fleet.id}:${JSON.stringify(checkpoints)}`;
    try {
      const cachedRoute = JSON.parse(localStorage.getItem(cacheKey) || "null");
      if (cachedRoute && Date.now() - cachedRoute.savedAt < 7 * 24 * 60 * 60 * 1000) {
        return cachedRoute.route;
      }
    } catch (_) { }

    const osrmCoordinates = checkpoints.map(([latitude, longitude]) => `${longitude},${latitude}`).join(";");
    const url = `https://router.project-osrm.org/route/v1/driving/${osrmCoordinates}?overview=full&geometries=geojson&steps=false&continue_straight=true`;
    try {
      const publicResponse = await fetch(url);
      if (!publicResponse.ok) throw new Error("Road routing service is unavailable.");
      const payload = await publicResponse.json();
      const route = payload.routes?.[0];
      if (payload.code !== "Ok" || !route?.geometry?.coordinates?.length) {
        throw new Error("Road routing service could not find a route for this fleet.");
      }
      const result = {
        coordinates: route.geometry.coordinates.map(([longitude, latitude]) => [latitude, longitude]),
        distance_km: route.distance / 1000,
        source: "OpenStreetMap via OSRM driving profile",
      };
      try {
        localStorage.setItem(cacheKey, JSON.stringify({ savedAt: Date.now(), route: result }));
      } catch (_) { }
      return result;
    } catch (publicError) {
      const backendResponse = await fetch(`/api/vehicles/${encodeURIComponent(fleet.id)}/road-route`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ coordinates: checkpoints }),
      });
      if (!backendResponse.ok) throw publicError;
      return backendResponse.json();
    }
  }

  async loadRoadRoutes() {
    const routeResults = await Promise.all(this.fleets.map(async (fleet) => {
      if (fleet.status === "Arrived") return true;
      const checkpointStart = fleet.routeStartWaypointIndex + (fleet.routeAtCheckpoint ? 1 : 0);
      const checkpoints = [fleet.currentCoords, ...fleet.waypoints.slice(checkpointStart).map((waypoint) => waypoint.coords)];
      if (checkpoints.length < 2) {
        fleet.status = "Arrived";
        fleet.distanceRemainingKm = 0;
        fleet.speed = 0;
        return true;
      }

      try {
        const route = await this.requestRoadRoute(fleet, checkpoints);
        fleet.roadCoordinates = route.coordinates;
        fleet.roadCumulativeKm = [0];
        for (let index = 1; index < fleet.roadCoordinates.length; index += 1) {
          fleet.roadCumulativeKm.push(
            fleet.roadCumulativeKm[index - 1]
            + this.distanceBetweenKm(fleet.roadCoordinates[index - 1], fleet.roadCoordinates[index])
          );
        }
        fleet.routeSegmentIndex = 0;
        fleet.routeUnavailable = false;
        fleet.currentCoords = [...fleet.roadCoordinates[0]];
        this.updateRemainingRouteDistance(fleet);
        this.updateFleetEta(fleet);
        return true;
      } catch (error) {
        fleet.roadCoordinates = [];
        fleet.routeUnavailable = true;
        fleet.status = "Route unavailable";
        fleet.speed = 0;
        return false;
      }
    }));

    if (routeResults.includes(false)) {
      this.showToast("Some road routes could not be loaded; those trucks are paused until road routing is available.", "error");
    }
  }

  updateRemainingRouteDistance(fleet) {
    const routeCoordinates = fleet.roadCoordinates || fleet.waypoints.map((waypoint) => waypoint.coords);
    let distance = 0;
    if (fleet.roadCumulativeKm && fleet.roadCoordinates?.length) {
      const nextIndex = Math.min(fleet.routeSegmentIndex + 1, routeCoordinates.length - 1);
      distance = this.distanceBetweenKm(fleet.currentCoords, routeCoordinates[nextIndex])
        + fleet.roadCumulativeKm[routeCoordinates.length - 1]
        - fleet.roadCumulativeKm[nextIndex];
    } else {
      let from = fleet.currentCoords;
      for (let index = fleet.routeSegmentIndex + 1; index < routeCoordinates.length; index += 1) {
        distance += this.distanceBetweenKm(from, routeCoordinates[index]);
        from = routeCoordinates[index];
      }
    }
    fleet.distanceRemainingKm = +distance.toFixed(3);
    if (fleet.distanceRemainingKm === 0) fleet.status = "Arrived";
  }

  advanceFleetAlongRoute(fleet, distanceKm) {
    const waypoints = fleet.roadCoordinates || [];
    let remainingDistance = Math.max(0, distanceKm);
    while (remainingDistance > 0 && fleet.routeSegmentIndex < waypoints.length - 1) {
      const destination = waypoints[fleet.routeSegmentIndex + 1];
      const segmentDistance = this.distanceBetweenKm(fleet.currentCoords, destination);
      if (segmentDistance <= 0.001) {
        fleet.currentCoords = [...destination];
        fleet.routeSegmentIndex += 1;
        continue;
      }

      if (remainingDistance >= segmentDistance) {
        fleet.currentCoords = [...destination];
        remainingDistance -= segmentDistance;
        fleet.routeSegmentIndex += 1;
      } else {
        const fraction = remainingDistance / segmentDistance;
        fleet.currentCoords = [
          fleet.currentCoords[0] + (destination[0] - fleet.currentCoords[0]) * fraction,
          fleet.currentCoords[1] + (destination[1] - fleet.currentCoords[1]) * fraction,
        ];
        remainingDistance = 0;
      }
    }

    this.updateRemainingRouteDistance(fleet);
    if (fleet.status === "Arrived") fleet.speed = 0;
  }

  // --- User Profile Header ---
  renderUserProfile() {
    const nameEl = document.getElementById("userName");
    const roleEl = document.getElementById("userRole");
    const avatarEl = document.getElementById("userAvatar");

    if (nameEl) nameEl.textContent = this.currentUser.name || "Fleet Operator";
    if (roleEl) roleEl.textContent = this.currentUser.roleTitle || this.currentUser.role || "Operations Dispatcher";
    if (avatarEl) avatarEl.textContent = this.currentUser.initials || "FO";
  }

  applyRoleVisibility() {
    const role = this.currentRole;
    const allowedTabs = {
      super_admin: ["view-fleets", "view-drivers", "view-routes", "view-booking", "view-help", "view-access-requests", "view-customer-fleets"],
      admin: ["view-fleets", "view-drivers", "view-routes", "view-booking", "view-help", "view-customer-fleets"],
      customer: this.currentUser.dashboard_views || [],
    };

    const tabs = document.querySelectorAll(".dash-nav-tab");
    tabs.forEach((tab) => {
      const viewId = tab.getAttribute("data-view");
      const visible = (allowedTabs[role] || []).includes(viewId);
      tab.style.display = visible ? "inline-flex" : "none";
    });

    const canPredict = ["super_admin", "admin"].includes(role);
    const canBooking = ["super_admin", "admin"].includes(role);
    const canRiskAction = ["super_admin", "admin"].includes(role);
    const canControlSimulation = ["super_admin", "admin"].includes(role);

    const rerouteBtn = document.getElementById("btnRerouteOpt");
    const injectBtn = document.getElementById("btnInjectIncident");
    const clearBtn = document.getElementById("btnClearIncident");
    const simSpeedBtn = document.getElementById("btnToggleSimSpeed");
    const bookingForm = document.getElementById("slotBookingForm");
    const etaCard = document.querySelector(".ml-prediction-card");
    const canSeeEta = role !== "customer" || (this.currentUser.permissions || []).includes("eta:read");

    if (rerouteBtn) rerouteBtn.style.display = canPredict ? "block" : "none";
    if (injectBtn) injectBtn.style.display = canRiskAction ? "block" : "none";
    if (clearBtn) clearBtn.style.display = canRiskAction ? "block" : "none";
    if (simSpeedBtn) simSpeedBtn.style.display = canControlSimulation ? "inline-flex" : "none";
    if (etaCard) etaCard.style.display = canSeeEta ? "block" : "none";
    document.querySelectorAll("#view-fleets th:nth-child(7), #fleetsTableBody td:nth-child(7)").forEach((cell) => {
      cell.style.display = canSeeEta ? "" : "none";
    });
    if (bookingForm) bookingForm.querySelectorAll("input, select, button").forEach((el) => {
      el.disabled = !canBooking;
    });

    if (role === "customer") {
      const readOnlyNotice = document.createElement("div");
      readOnlyNotice.id = "driverReadOnlyNotice";
      readOnlyNotice.className = "data-table-card";
      readOnlyNotice.style.marginTop = "1rem";
      readOnlyNotice.innerHTML = this.fleets.length
        ? "<strong>Customer access:</strong> This dashboard is limited to fleet units assigned to your account."
        : "<strong>No fleet assigned:</strong> Contact your FleetVision administrator to request access to a customer fleet.";

      const existingNotice = document.getElementById("driverReadOnlyNotice");
      if (existingNotice) existingNotice.remove();
      const viewFleets = document.getElementById("view-fleets");
      if (viewFleets) viewFleets.appendChild(readOnlyNotice);
      if (!this.fleets.length) {
        document.querySelector("#view-fleets .workspace-grid")?.setAttribute("hidden", "true");
        document.querySelector("#view-fleets .data-table-card")?.setAttribute("hidden", "true");
      }
    }

    if (role === "super_admin") {
      this.setupSuperAdminTabs();
      this.loadPendingUsers();
      this.loadFleetAccessRequests();
    }

    if (role === "customer" && !(this.currentUser.dashboard_views || []).includes("view-fleets")) {
      const firstAllowedTab = [...tabs].find((tab) => tab.style.display !== "none");
      if (firstAllowedTab) {
        tabs.forEach((tab) => tab.classList.remove("active"));
        firstAllowedTab.classList.add("active");
        this.switchView(firstAllowedTab.getAttribute("data-view"));
      }
    }
  }

  setupSuperAdminTabs() {
    const subtabFleet = document.getElementById("subtabFleetRequests");
    const subtabUsers = document.getElementById("subtabUserSignups");
    const panelFleet = document.getElementById("panel-fleet-requests");
    const panelUsers = document.getElementById("panel-user-signups");

    if (subtabFleet && subtabUsers && panelFleet && panelUsers) {
      subtabFleet.onclick = () => {
        subtabFleet.classList.add("active");
        subtabUsers.classList.remove("active");
        panelFleet.style.display = "block";
        panelUsers.style.display = "none";
      };
      subtabUsers.onclick = () => {
        subtabUsers.classList.add("active");
        subtabFleet.classList.remove("active");
        panelFleet.style.display = "none";
        panelUsers.style.display = "block";
      };
    }

    const filterBtns = document.querySelectorAll("[data-far-filter]");
    filterBtns.forEach((btn) => {
      btn.onclick = () => {
        filterBtns.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        const filter = btn.getAttribute("data-far-filter");
        this.loadFleetAccessRequests(filter);
      };
    });

    const refreshBtn = document.getElementById("btnRefreshFleetRequests");
    if (refreshBtn) {
      refreshBtn.onclick = () => {
        const activeFilter = document.querySelector("[data-far-filter].active")?.getAttribute("data-far-filter") || "all";
        this.loadFleetAccessRequests(activeFilter);
        this.loadPendingUsers();
        this.showToast("Access requests refreshed", "info");
      };
    }
  }

  async loadFleetAccessRequests(statusFilter = "all") {
    const container = document.getElementById("fleetAccessRequestsContainer");
    if (!container) return;

    try {
      const url = statusFilter && statusFilter !== "all"
        ? `/api/vehicles/access-requests?status_filter=${encodeURIComponent(statusFilter)}`
        : "/api/vehicles/access-requests";
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) throw new Error("Could not load fleet access requests.");
      const requests = await response.json();
      this.fleetAccessRequests = requests;

      // Update badge counts
      const pendingCount = requests.filter(r => r.status === "pending_superadmin_approval").length;
      const fleetBadge = document.getElementById("badgeFleetReqCount");
      if (fleetBadge) fleetBadge.textContent = pendingCount;
      this.updateTotalAccessRequestsBadge();

      if (!requests.length) {
        container.innerHTML = `<div class="data-table-card" style="text-align:center; padding:2.5rem; color:var(--text-secondary);">
          <div style="font-size:2rem; margin-bottom:0.5rem;">📋</div>
          <strong>No ${statusFilter !== "all" ? statusFilter.replace(/_/g, " ") : ""} fleet access requests found.</strong>
          <p style="font-size:0.85rem; margin-top:0.25rem;">Admins submit fleet access requirements for commercial freight corridors.</p>
        </div>`;
        return;
      }

      container.innerHTML = requests.map((req) => {
        const statusClass = req.status === "approved" ? "approved" : (req.status === "rejected" ? "rejected" : "pending");
        const statusLabel = req.status === "approved" ? "Authorized" : (req.status === "rejected" ? "Rejected" : "Pending Super Admin");
        const priorityBadge = req.priority ? `<span class="far-priority-tag">${this.escapeHtml(req.priority)} Priority</span>` : "";

        return `
          <div class="far-card ${statusClass}" id="far-${this.escapeHtml(req.request_id)}">
            <div class="far-header">
              <div style="display:flex; align-items:center; gap:0.65rem;">
                <span class="far-id">${this.escapeHtml(req.request_id)}</span>
                ${priorityBadge}
                <span class="far-status-pill ${statusClass}">${statusLabel}</span>
              </div>
              <small style="color:var(--text-secondary); font-size:0.75rem;">${new Date(req.created_at).toLocaleString()}</small>
            </div>

            <div class="far-meta-grid">
              <div class="far-meta-item">
                <label>Target Customer</label>
                <span>📦 ${this.escapeHtml(req.customer_name || req.customer_email)} (${this.escapeHtml(req.customer_email)})</span>
              </div>
              <div class="far-meta-item">
                <label>Submitting Admin</label>
                <span>👤 ${this.escapeHtml(req.admin_name || req.admin_email)} (${this.escapeHtml(req.admin_email)})</span>
              </div>
              <div class="far-meta-item">
                <label>Fleet Group / Corridor</label>
                <span>🚛 ${this.escapeHtml(req.fleet_name)}</span>
              </div>
            </div>

            <div style="margin:0.5rem 0;">
              <span style="font-size:0.7rem; color:var(--text-secondary); text-transform:uppercase; font-weight:700;">Requested Vehicles:</span>
              <div class="far-chips-row">
                ${(req.vehicle_ids || []).map(vid => `<span class="far-chip">🚚 ${this.escapeHtml(vid)}</span>`).join("")}
              </div>
            </div>

            <div style="margin:0.5rem 0;">
              <span style="font-size:0.7rem; color:var(--text-secondary); text-transform:uppercase; font-weight:700;">Requested Permissions:</span>
              <div class="far-chips-row">
                ${(req.permissions || []).map(p => `<span class="far-chip perm">🔑 ${this.escapeHtml(p)}</span>`).join("")}
              </div>
            </div>

            ${req.admin_notes ? `
              <div class="far-notes-box">
                <strong>Admin Justification / SLA Notes:</strong>
                "${this.escapeHtml(req.admin_notes)}"
              </div>
            ` : ""}

            ${req.status === "pending_superadmin_approval" ? `
              <div class="far-actions-row">
                <button type="button" class="btn-reject" data-reject-far="${this.escapeHtml(req.request_id)}">
                  ❌ Reject Request
                </button>
                <button type="button" class="btn-approve" data-approve-far="${this.escapeHtml(req.request_id)}">
                  ✅ Authorize &amp; Provision Fleet Access
                </button>
              </div>
            ` : (req.status === "approved" ? `
              <div style="margin-top:0.75rem; padding-top:0.5rem; border-top:1px solid var(--border-subtle); font-size:0.78rem; color:#34C759;">
                ✔ Authorized by <strong>${this.escapeHtml(req.reviewed_by || "Super Admin")}</strong> on ${new Date(req.reviewed_at).toLocaleString()}
              </div>
            ` : `
              <div style="margin-top:0.75rem; padding-top:0.5rem; border-top:1px solid var(--border-subtle); font-size:0.78rem; color:#FF3B30;">
                ✖ Rejected by <strong>${this.escapeHtml(req.reviewed_by || "Super Admin")}</strong> — Reason: ${this.escapeHtml(req.rejection_reason || "Requirements not met")}
              </div>
            `)}
          </div>
        `;
      }).join("");

      // Bind approve buttons
      container.querySelectorAll("[data-approve-far]").forEach((btn) => {
        btn.onclick = async () => {
          const reqId = btn.getAttribute("data-approve-far");
          btn.disabled = true;
          btn.textContent = "Authorizing...";
          try {
            const approveRes = await fetch(`/api/vehicles/access-requests/${encodeURIComponent(reqId)}/approve`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include"
            });
            const result = await approveRes.json();
            if (!approveRes.ok) throw new Error(result.detail || "Approval failed");
            this.showToast("Fleet access authorized and provisioned successfully!", "success");
            const activeFilter = document.querySelector("[data-far-filter].active")?.getAttribute("data-far-filter") || "all";
            await this.loadFleetAccessRequests(activeFilter);
            if (this.loadCustomerFleetManager) this.loadCustomerFleetManager();
          } catch (err) {
            this.showToast(err.message, "error");
            btn.disabled = false;
            btn.innerHTML = "✅ Authorize &amp; Provision Fleet Access";
          }
        };
      });

      // Bind reject buttons
      container.querySelectorAll("[data-reject-far]").forEach((btn) => {
        btn.onclick = async () => {
          const reqId = btn.getAttribute("data-reject-far");
          const reason = prompt("Please provide a reason for rejecting this fleet access request:", "Corridor capacity or SLA requirements not satisfied");
          if (reason === null) return;
          btn.disabled = true;
          try {
            const rejectRes = await fetch(`/api/vehicles/access-requests/${encodeURIComponent(reqId)}/reject`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ reason })
            });
            const result = await rejectRes.json();
            if (!rejectRes.ok) throw new Error(result.detail || "Rejection failed");
            this.showToast("Fleet access request rejected.", "info");
            const activeFilter = document.querySelector("[data-far-filter].active")?.getAttribute("data-far-filter") || "all";
            await this.loadFleetAccessRequests(activeFilter);
          } catch (err) {
            this.showToast(err.message, "error");
            btn.disabled = false;
          }
        };
      });

    } catch (error) {
      container.innerHTML = `<p style="color:#FF3B30; padding:1rem;">${this.escapeHtml(error.message)}</p>`;
    }
  }

  async loadAdminFleetRequests() {
    const container = document.getElementById("adminFleetRequestsList");
    const countBadge = document.getElementById("adminSentRequestsCount");
    if (!container) return;

    try {
      const response = await fetch("/api/vehicles/access-requests", { credentials: "include" });
      if (!response.ok) throw new Error("Could not load submitted requests.");
      const requests = await response.json();
      if (countBadge) countBadge.textContent = requests.length;

      if (!requests.length) {
        container.innerHTML = `<p style="color:var(--text-secondary); font-size:0.85rem; padding:1rem 0;">No access requests submitted to Super Admin yet.</p>`;
        return;
      }

      container.innerHTML = requests.map((req) => {
        const statusClass = req.status === "approved" ? "approved" : (req.status === "rejected" ? "rejected" : "pending");
        const statusLabel = req.status === "approved" ? "Authorized" : (req.status === "rejected" ? "Rejected" : "Pending Review");
        return `
          <div style="padding:0.75rem 0; border-bottom:1px solid var(--border-subtle); font-size:0.85rem;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.25rem;">
              <strong style="color:var(--text-primary);">${this.escapeHtml(req.fleet_name)}</strong>
              <span class="far-status-pill ${statusClass}" style="font-size:0.65rem;">${statusLabel}</span>
            </div>
            <div style="color:var(--text-secondary); font-size:0.78rem;">
              Customer: <strong>${this.escapeHtml(req.customer_email)}</strong> · ${new Date(req.created_at).toLocaleDateString()}
            </div>
            <div style="margin-top:0.25rem;">
              <small style="color:var(--color-primary); font-weight:600;">Units: ${(req.vehicle_ids || []).join(", ")}</small>
            </div>
            ${req.admin_notes ? `<div style="font-size:0.75rem; color:var(--text-secondary); margin-top:0.2rem; font-style:italic;">"${this.escapeHtml(req.admin_notes)}"</div>` : ""}
          </div>
        `;
      }).join("");
    } catch (err) {
      container.innerHTML = `<p style="color:#FF3B30; font-size:0.82rem;">${this.escapeHtml(err.message)}</p>`;
    }
  }

  updateTotalAccessRequestsBadge() {
    const badge = document.getElementById("badgePendingAccessRequests");
    if (!badge) return;
    const pendingUsers = parseInt(document.getElementById("badgeUserSignupCount")?.textContent || "0", 10);
    const pendingFleets = parseInt(document.getElementById("badgeFleetReqCount")?.textContent || "0", 10);
    const total = pendingUsers + pendingFleets;
    if (total > 0) {
      badge.textContent = total;
      badge.style.display = "inline-flex";
    } else {
      badge.style.display = "none";
    }
  }

  async loadCustomerFleetManager() {
    const customerSelect = document.getElementById("fleetCustomerSelect");
    const vehicleContainer = document.getElementById("customerFleetVehicles");
    const assignmentContainer = document.getElementById("customerFleetAssignments");
    const form = document.getElementById("customerFleetForm");
    if (!customerSelect || !vehicleContainer || !assignmentContainer || !form) return;

    try {
      const [customerResponse, assignmentResponse] = await Promise.all([
        fetch("/api/auth/customers", { credentials: "include" }),
        fetch("/api/vehicles/customer-fleets", { credentials: "include" }),
      ]);
      if (!customerResponse.ok || !assignmentResponse.ok) throw new Error("Unable to load customer fleet access.");
      const customers = await customerResponse.json();
      this.customerFleetAssignments = await assignmentResponse.json();

      customerSelect.innerHTML = `<option value="">Select a customer</option>${customers.map((customer) =>
        `<option value="${this.escapeHtml(customer.email)}">${this.escapeHtml(customer.name)} (${this.escapeHtml(customer.email)})</option>`
      ).join("")}`;
      vehicleContainer.innerHTML = INITIAL_FLEETS.map((fleet) => `
        <label><input type="checkbox" name="customerFleetVehicle" value="${this.escapeHtml(fleet.id)}"> ${this.escapeHtml(fleet.id)} · ${this.escapeHtml(fleet.model)} (${this.escapeHtml(fleet.plate)})</label>
      `).join("");
      this.renderCustomerFleetAssignments();
      this.loadAdminFleetRequests();

      // Ensure form submit forwards request to Super Admin
      form.onsubmit = async (event) => {
        event.preventDefault();
        const vehicle_ids = [...form.querySelectorAll('[name="customerFleetVehicle"]:checked')].map((input) => input.value);
        const permissions = [...form.querySelectorAll('[name="customerPermission"]:checked')].map((input) => input.value);
        const customer_email = customerSelect.value;
        const fleet_name = document.getElementById("customerFleetName").value.trim();
        const priority = document.getElementById("customerFleetPriority")?.value || "Standard";
        const admin_notes = document.getElementById("customerFleetNotes")?.value.trim() || "";

        if (!customer_email) {
          this.showToast("Please select a customer account.", "error");
          return;
        }
        if (!vehicle_ids.length) {
          this.showToast("Please select at least one commercial vehicle unit.", "error");
          return;
        }

        const submitBtn = document.getElementById("btnSubmitFleetRequest");
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = "Forwarding to Super Admin...";
        }

        try {
          const response = await fetch("/api/vehicles/access-requests", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              customer_email,
              fleet_name,
              vehicle_ids,
              permissions,
              priority,
              admin_notes,
            }),
          });
          const result = await response.json();
          if (!response.ok) {
            throw new Error(result.detail || "Could not forward fleet access request.");
          }
          this.showToast("Fleet access request successfully forwarded to Super Admin!", "success");
          form.reset();
          await this.loadAdminFleetRequests();
          const updated = await fetch("/api/vehicles/customer-fleets", { credentials: "include" });
          if (updated.ok) {
            this.customerFleetAssignments = await updated.json();
            this.renderCustomerFleetAssignments();
          }
        } catch (err) {
          this.showToast(err.message, "error");
        } finally {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = "🚀 Forward Request to Super Admin";
          }
        }
      };
    } catch (error) {
      assignmentContainer.textContent = error.message;
    }
  }

  renderCustomerFleetAssignments() {
    const container = document.getElementById("customerFleetAssignments");
    if (!container) return;
    if (!this.customerFleetAssignments.length) {
      container.innerHTML = "<p style='color:var(--text-secondary); font-size:0.85rem;'>No customer fleets have been assigned yet.</p>";
      return;
    }
    container.innerHTML = this.customerFleetAssignments.map((assignment) => `
      <div style="padding:0.75rem 0; border-bottom:1px solid var(--border-subtle); font-size:0.85rem;">
        <strong style="color:var(--text-primary);">${this.escapeHtml(assignment.fleet_name)}</strong>
        <div style="color:var(--text-secondary); font-size:0.78rem;">Customer: ${this.escapeHtml(assignment.customer_email)}</div>
        <small style="color:var(--color-primary); font-weight:600;">Units: ${assignment.vehicle_ids.map((id) => this.escapeHtml(id)).join(", ")}</small>
        <div><small style="color:var(--text-secondary);">Permissions: ${assignment.permissions.map((permission) => this.escapeHtml(permission)).join(", ")}</small></div>
      </div>
    `).join("");
  }

  async loadPendingUsers() {
    const container = document.getElementById("pendingUsersContainer");
    const countBadge = document.getElementById("badgeUserSignupCount");
    if (!container) return;

    try {
      const response = await fetch("/api/auth/pending-users", { credentials: "include" });
      if (!response.ok) throw new Error("Could not load access requests.");
      const { users } = await response.json();
      if (countBadge) countBadge.textContent = users.length;
      this.updateTotalAccessRequestsBadge();

      if (!users.length) {
        container.innerHTML = "<p>No user account signup requests are waiting for review.</p>";
        return;
      }

      container.innerHTML = users.map((user) => `
        <div class="pending-user-row" style="display:flex; align-items:center; justify-content:space-between; gap:1rem; padding:1rem 0; border-bottom:1px solid var(--border-subtle);">
          <div><strong>${this.escapeHtml(user.name)}</strong><div>${this.escapeHtml(user.email)}</div></div>
          <div style="display:flex; align-items:center; gap:0.5rem;">
            <select class="form-input" data-role-for="${this.escapeHtml(user.email)}" aria-label="Role for ${this.escapeHtml(user.email)}">
              <option value="customer">Customer</option>
              <option value="admin">Admin</option>
            </select>
            <button class="btn btn-primary btn-sm" type="button" data-approve-user="${this.escapeHtml(user.email)}">Approve</button>
          </div>
        </div>
      `).join("");

      container.querySelectorAll("[data-approve-user]").forEach((button) => {
        button.addEventListener("click", async () => {
          const email = button.getAttribute("data-approve-user");
          const role = container.querySelector(`[data-role-for="${CSS.escape(email)}"]`)?.value || "customer";
          const approval = await fetch("/api/auth/approve-user", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ email, role })
          });
          if (!approval.ok) {
            this.showToast("Could not approve this account.", "error");
            return;
          }
          this.showToast(`${email} approved as ${role}.`, "success");
          this.loadPendingUsers();
        });
      });
    } catch (error) {
      container.textContent = error.message;
    }
  }

  escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[character]);
  }

  // --- Tab Navigation (The Required 5 Menu Options) ---
  bindNavigationTabs() {
    const tabs = document.querySelectorAll(".dash-nav-tab");
    tabs.forEach(tab => {
      tab.addEventListener("click", (e) => {
        tabs.forEach(t => t.classList.remove("active"));
        e.currentTarget.classList.add("active");
        const targetViewId = e.currentTarget.getAttribute("data-view");
        this.switchView(targetViewId);
      });
    });
  }

  switchView(viewId) {
    this.activeView = viewId;
    document.querySelectorAll(".dash-view").forEach(v => v.classList.remove("active"));
    const target = document.getElementById(viewId);
    if (target) {
      target.classList.add("active");
    }

    // Invalidate Leaflet map size when returning to fleets view
    if (viewId === "view-fleets" && this.map) {
      setTimeout(() => this.map.invalidateSize(), 150);
    }
  }

  // --- Leaflet Map with 6 Simulated Fleets ---
  initLeafletMap() {
    const mapEl = document.getElementById("leafletMap");
    if (!mapEl) return;

    // Centered over Central-Western India
    this.map = L.map("leafletMap", {
      zoomControl: true,
      attributionControl: true
    }).setView([20.5937, 78.9629], 5);

    // OpenStreetMap Clean Tiles
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a> | Routing: OSRM'
    }).addTo(this.map);

    const colors = ["#FF6B00", "#10B981", "#3B82F6", "#8B5CF6", "#F59E0B", "#EC4899"];

    // Plot Route Corridors & Animated Markers for 6 fleets
    this.fleets.forEach((fleet, index) => {
      const color = colors[index % colors.length];
      const latlngs = fleet.roadCoordinates || [];

      // Route Polyline
      if (latlngs.length > 1) {
        const poly = L.polyline(latlngs, {
          color: color,
          weight: 4,
          opacity: 0.75,
          dashArray: "6, 8"
        }).addTo(this.map);
        this.routePolylines.push(poly);
      }

      // Custom pulsing vehicle icon
      const customIcon = L.divIcon({
        className: `fleet-marker-icon marker-${fleet.id}`,
        html: `
          <div style="position: relative; display: flex; flex-direction: column; align-items: center; transform: translate(-50%, -50%);">
            <div style="width: 28px; height: 28px; border-radius: 50%; background: ${color}; color: #FFF; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: bold; box-shadow: 0 0 14px ${color}; border: 2px solid #FFF;">
              🚛
            </div>
            <div style="background: rgba(11, 15, 23, 0.9); color: #FFF; font-size: 9px; font-weight: 700; padding: 1px 5px; border-radius: 4px; white-space: nowrap; margin-top: 2px; border: 1px solid ${color};">
              ${fleet.id}
            </div>
          </div>
        `,
        iconSize: [30, 30]
      });

      const marker = L.marker(fleet.currentCoords, { icon: customIcon }).addTo(this.map);
      marker.on("click", () => {
        this.selectFleet(fleet.id);
      });

      this.markers[fleet.id] = marker;
    });

    const fitBtn = document.getElementById("btnFitMap");
    if (fitBtn) {
      fitBtn.addEventListener("click", () => {
        const bounds = L.latLngBounds(this.fleets.map(f => f.currentCoords));
        this.map.fitBounds(bounds, { padding: [40, 40] });
      });
    }

    const simSpeedBtn = document.getElementById("btnToggleSimSpeed");
    if (simSpeedBtn) {
      simSpeedBtn.addEventListener("click", () => {
        this.simSpeed = (this.simSpeed === 1) ? 2 : (this.simSpeed === 2) ? 5 : 1;
        simSpeedBtn.textContent = `Speed: ${this.simSpeed}x`;
        this.showToast(`Simulation accelerated to ${this.simSpeed}x`);
      });
    }
  }

  // --- Real-Time Simulation Loop (Vehicle Movement & Sub-Minute ETAs) ---
  startSimulationLoop() {
    let tickCount = 0;

    setInterval(() => {
      if (!this.isSimRunning) return;
      tickCount++;

      this.fleets.forEach((fleet) => {
        if (fleet.status === "Arrived" || fleet.routeUnavailable) return;

        // Live speed fluctuation
        fleet.speed = +(fleet.speed + (Math.random() * 2 - 1)).toFixed(1);
        if (fleet.speed < 45) fleet.speed = 48.0;
        if (fleet.speed > 85) fleet.speed = 82.0;

        const distanceTravelledKm = (fleet.speed * this.simSpeed) / 3600;
        this.advanceFleetAlongRoute(fleet, distanceTravelledKm);
        this.updateFleetEta(fleet);

        const fleetRow = document.querySelector(`.fleet-row[data-id="${fleet.id}"]`);
        const speedCell = fleetRow?.querySelector("td:nth-child(5) strong");
        const etaCell = fleetRow?.querySelector("td:nth-child(7) strong");
        if (speedCell) speedCell.textContent = `${fleet.speed} km/h`;
        if (etaCell) etaCell.textContent = fleet.etaText;

        // Update Leaflet marker
        const marker = this.markers[fleet.id];
        if (marker) {
          marker.setLatLng(fleet.currentCoords);
          if (this.map && this.activeView === "view-fleets" && this.selectedFleetId === fleet.id) {
            this.map.panInside(fleet.currentCoords, { padding: [80, 80], animate: true });
          }
        }
      });

      // Refresh Inspector if viewing currently selected vehicle
      if (this.activeView === "view-fleets") {
        this.updateInspector(this.selectedFleetId);
      }
    }, 1000);
  }

  selectFleet(fleetId) {
    this.selectedFleetId = fleetId;
    this.updateInspector(fleetId);

    const fleet = this.fleets.find(f => f.id === fleetId);
    if (fleet && this.map) {
      this.map.flyTo(fleet.currentCoords, 9, { animate: true, duration: 0.8 });
    }

    // Highlight row in table
    document.querySelectorAll(".fleet-row").forEach(row => {
      row.style.background = (row.getAttribute("data-id") === fleetId) ? "var(--bg-surface-elevated)" : "";
    });
  }

  // --- Inspector Component ---
  updateInspector(fleetId) {
    const fleet = this.fleets.find(f => f.id === fleetId) || this.fleets[0];
    if (!fleet) return;

    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    set("inspBadge", `${fleet.id} • ${fleet.plate}`);
    set("inspModel", fleet.model);
    set("inspCargo", `Cargo: ${fleet.cargo}`);
    set("inspStatus", fleet.status);
    set("inspRoute", fleet.routeName);
    set("inspDriver", `${fleet.driverName} (${fleet.driverId})`);
    set("inspCoords", `${fleet.currentCoords[0].toFixed(4)}° N, ${fleet.currentCoords[1].toFixed(4)}° E`);

    set("inspSpeed", `${fleet.speed} km/h`);
    set("inspFuel", `${fleet.fuelLevel}%`);
    set("inspDistLeft", `${fleet.distanceRemainingKm} km`);
    set("inspTemp", `${fleet.engineTemp}°C`);
    set("inspTraffic", fleet.traffic);
    set("inspWeather", fleet.weather);

    set("inspRfEta", fleet.rfEtaText || fleet.etaText);
    set("inspLstmEta", fleet.lstmEtaText || fleet.etaText);
    set("inspBlendedEta", fleet.etaText);
  }

  bindInspectorActions() {
    const btnReroute = document.getElementById("btnRerouteOpt");
    if (btnReroute) {
      btnReroute.addEventListener("click", () => {
        const fleet = this.fleets.find(f => f.id === this.selectedFleetId);
        if (fleet) {
          fleet.traffic = "Low (AI Optimized)";
          fleet.delayRisk = "Low";
          fleet.speed = Math.min(80, fleet.speed + 6);
          this.showToast(`⚡ AI Dynamic Reroute dispatched to ${fleet.id} (${fleet.driverName}). Congestion bypassed!`);
          this.updateInspector(fleet.id);
        }
      });
    }

    const btnInject = document.getElementById("btnInjectIncident");
    if (btnInject) {
      btnInject.addEventListener("click", () => {
        const fleet = this.fleets.find(f => f.id === this.selectedFleetId);
        if (fleet) {
          fleet.traffic = "Heavy (Monsoon Waterlogging / Toll Queue)";
          fleet.delayRisk = "High";
          fleet.speed = Math.max(35, fleet.speed - 22);
          this.showToast(`🚨 Incident injected on ${fleet.id}: Speed throttled, ETA recalculated!`, "error");
          this.updateInspector(fleet.id);
        }
      });
    }

    const btnClear = document.getElementById("btnClearIncident");
    if (btnClear) {
      btnClear.addEventListener("click", () => {
        const fleet = this.fleets.find(f => f.id === this.selectedFleetId);
        if (fleet) {
          fleet.traffic = "Nominal";
          fleet.delayRisk = "Low";
          fleet.speed = 64.0;
          this.showToast(`🔄 Telematics reset to nominal cruising speed for ${fleet.id}.`);
          this.updateInspector(fleet.id);
        }
      });
    }
  }

  // --- Telematics Table for Fleets ---
  renderFleetsTable() {
    const tbody = document.getElementById("fleetsTableBody");
    if (!tbody) return;

    const count = document.getElementById("kpiActiveCount");
    if (count) count.textContent = String(this.fleets.length);
    const tableTitle = document.querySelector("#view-fleets .table-head-row h3");
    if (tableTitle) {
      const title = this.currentRole === "customer" ? "assigned fleet units" : "fleet units";
      tableTitle.textContent = `${this.fleets.length} ${title} telematics stream (WGS-84 / OBD-II)`;
    }
    const avgSpeed = document.getElementById("kpiAvgSpeed");
    if (avgSpeed) {
      const value = this.fleets.reduce((total, fleet) => total + fleet.speed, 0) / this.fleets.length;
      avgSpeed.textContent = this.fleets.length ? `${value.toFixed(1)} km/h` : "—";
    }
    const onTimeRate = document.getElementById("kpiOnTimeRate");
    if (onTimeRate) {
      const onTime = this.fleets.filter((fleet) => fleet.delayRisk === "Low").length;
      onTimeRate.textContent = this.fleets.length ? `${((onTime / this.fleets.length) * 100).toFixed(1)}%` : "—";
    }
    const riskAlerts = document.getElementById("kpiRiskAlerts");
    if (riskAlerts) riskAlerts.textContent = String(this.fleets.filter((fleet) => fleet.delayRisk === "High").length);
    if (!this.fleets.length) {
      tbody.innerHTML = '<tr><td colspan="9">No assigned fleet units.</td></tr>';
      return;
    }

    tbody.innerHTML = this.fleets.map(f => `
      <tr class="fleet-row" data-id="${f.id}" style="cursor: pointer;">
        <td><strong style="color: var(--color-primary);">${f.id}</strong></td>
        <td>${f.model.split(" ")[0]} ${f.model.split(" ")[1] || ""} (${f.plate})</td>
        <td>${f.driverName}</td>
        <td>${f.routeName.split(" (")[0]}</td>
        <td><strong>${f.speed} km/h</strong></td>
        <td><span style="color: var(--color-secondary); font-weight: 700;">${f.fuelLevel}%</span></td>
        <td><strong style="color: var(--color-primary);">${f.etaText}</strong></td>
        <td>
          <span style="font-size: 0.75rem; font-weight: 700; padding: 0.2rem 0.6rem; border-radius: 9999px; background: ${f.delayRisk === 'High' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)'}; color: ${f.delayRisk === 'High' ? '#EF4444' : '#10B981'};">
            ${f.delayRisk}
          </span>
        </td>
        <td>
          <button type="button" class="btn btn-outline btn-sm select-fleet-btn" data-id="${f.id}">
            Inspect ➔
          </button>
        </td>
      </tr>
    `).join("");

    const canSeeEta = this.currentRole !== "customer" || (this.currentUser.permissions || []).includes("eta:read");
    document.querySelectorAll("#view-fleets th:nth-child(7), #fleetsTableBody td:nth-child(7)").forEach((cell) => {
      cell.style.display = canSeeEta ? "" : "none";
    });

    tbody.querySelectorAll(".fleet-row").forEach(row => {
      row.addEventListener("click", () => {
        const id = row.getAttribute("data-id");
        this.selectFleet(id);
      });
    });
  }

  // --- Drivers View ---
  renderDrivers() {
    const container = document.getElementById("driversGrid");
    if (!container) return;

    container.innerHTML = this.drivers.map(d => `
      <div class="driver-card">
        <div class="driver-card-header">
          <div class="driver-avatar-box">${d.avatarInitials}</div>
          <div>
            <h3 style="font-size: 1.15rem; font-weight: 800; color: var(--text-primary); margin: 0;">${d.name}</h3>
            <p style="font-size: 0.75rem; color: var(--text-muted);">${d.id} • ${d.licenseClass}</p>
          </div>
        </div>

        <div style="background: var(--bg-surface-elevated); padding: 0.75rem 1rem; border-radius: 0.65rem; border: 1px solid var(--border-subtle); margin-bottom: 1rem; font-size: 0.82rem;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 0.35rem;">
            <span style="color: var(--text-muted);">Assigned Vehicle:</span>
            <strong style="color: var(--color-primary);">${d.assignedTruck} (${d.assignedPlate})</strong>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 0.35rem;">
            <span style="color: var(--text-muted);">Commercial License:</span>
            <span style="font-family: var(--font-mono); color: var(--text-secondary);">${d.license}</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="color: var(--text-muted);">Driving Experience:</span>
            <strong style="color: var(--text-primary);">${d.experience}</strong>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem; text-align: center; margin-bottom: 1rem;">
          <div style="background: var(--bg-base); padding: 0.5rem; border-radius: 6px;">
            <div style="font-size: 0.68rem; color: var(--text-muted);">Safety Score</div>
            <strong style="font-size: 0.95rem; color: var(--color-secondary);">${d.safetyScore}%</strong>
          </div>
          <div style="background: var(--bg-base); padding: 0.5rem; border-radius: 6px;">
            <div style="font-size: 0.68rem; color: var(--text-muted);">On-Time Rate</div>
            <strong style="font-size: 0.95rem; color: var(--text-primary);">${d.onTimeRate}</strong>
          </div>
          <div style="background: var(--bg-base); padding: 0.5rem; border-radius: 6px;">
            <div style="font-size: 0.68rem; color: var(--text-muted);">HOS Remaining</div>
            <strong style="font-size: 0.95rem; color: var(--color-primary);">${d.hosRemainingHours} hrs</strong>
          </div>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border-subtle); padding-top: 0.85rem;">
          <span style="font-size: 0.78rem; font-weight: 700; color: var(--color-secondary);">
            ● ${d.status}
          </span>
          <button type="button" class="btn btn-outline btn-sm" onclick="alert('Radio Dispatch Channel opened to ${d.name} (${d.phone})')">
            Radio Ping 📞
          </button>
        </div>
      </div>
    `).join("");
  }

  // --- Routes View ---
  renderRoutes() {
    const container = document.getElementById("routesGrid");
    if (!container) return;

    container.innerHTML = this.routes.map(r => `
      <div class="route-card">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem;">
          <div>
            <span class="badge" style="margin-bottom: 0.35rem;">${r.code} Corridor</span>
            <h3 style="font-size: 1.25rem; font-weight: 800; color: var(--text-primary); margin: 0;">${r.name}</h3>
            <p style="font-size: 0.82rem; color: var(--text-muted);">${r.origin} ➔ ${r.destination}</p>
          </div>
          <span style="font-size: 0.75rem; font-weight: 700; color: var(--color-secondary); background: rgba(16, 185, 129, 0.1); padding: 0.25rem 0.65rem; border-radius: 9999px;">
            FASTag Active
          </span>
        </div>

        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem; margin-bottom: 1rem; text-align: center;">
          <div style="background: var(--bg-surface-elevated); padding: 0.65rem; border-radius: 8px;">
            <div style="font-size: 0.7rem; color: var(--text-muted);">Total Distance</div>
            <strong style="font-size: 1rem; color: var(--text-primary);">${r.totalKm} km</strong>
          </div>
          <div style="background: var(--bg-surface-elevated); padding: 0.65rem; border-radius: 8px;">
            <div style="font-size: 0.7rem; color: var(--text-muted);">Avg Corridor Pace</div>
            <strong style="font-size: 1rem; color: var(--color-secondary);">${r.avgSpeedKmh} km/h</strong>
          </div>
          <div style="background: var(--bg-surface-elevated); padding: 0.65rem; border-radius: 8px;">
            <div style="font-size: 0.7rem; color: var(--text-muted);">Toll Plazas</div>
            <strong style="font-size: 1rem; color: var(--color-primary);">${r.tollCount} Gates</strong>
          </div>
        </div>

        <div style="font-size: 0.82rem; color: var(--text-secondary); margin-bottom: 0.85rem;">
          <strong>Terrain &amp; Surface:</strong> ${r.terrain} • Condition: <em>${r.currentCondition}</em>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border-subtle); padding-top: 0.85rem;">
          <span style="font-size: 0.78rem; color: var(--text-muted);">Assigned Truck: <strong style="color: var(--text-primary);">${r.assignedFleet}</strong></span>
          <button type="button" class="btn btn-secondary btn-sm" onclick="window.dashApp.switchView('view-fleets')">
            Inspect Route on Map ↗
          </button>
        </div>
      </div>
    `).join("");
  }

  // --- Booking Slot Handler ---
  bindBookingForm() {
    const form = document.getElementById("slotBookingForm");
    const weightInput = document.getElementById("bookTonnage");
    const originSelect = document.getElementById("bookOrigin");
    const destSelect = document.getElementById("bookDest");

    const updateEstimate = () => {
      const weight = parseFloat(weightInput?.value || 20);
      const dist = 984; // default km
      const rate = Math.round(dist * 28 + (weight * 320));
      const hours = (dist / 58 + (weight * 0.05)).toFixed(1);

      const qDist = document.getElementById("quoteDist");
      const qEta = document.getElementById("quoteEta");
      const qRate = document.getElementById("quoteRate");

      if (qDist) qDist.textContent = `${dist} km`;
      if (qEta) qEta.textContent = `${hours} hrs`;
      if (qRate) qRate.textContent = `₹${rate.toLocaleString()}`;
    };

    if (weightInput) weightInput.addEventListener("input", updateEstimate);
    if (originSelect) originSelect.addEventListener("change", updateEstimate);
    if (destSelect) destSelect.addEventListener("change", updateEstimate);

    if (form) {
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const consignor = document.getElementById("bookConsignor")?.value || "Enterprise Consignor";
        const origin = document.getElementById("bookOrigin")?.value || "Mumbai JNPT Port";
        const dest = document.getElementById("bookDest")?.value || "Bengaluru Logistics Hub";
        const tonnage = (document.getElementById("bookTonnage")?.value || "22.5") + " Tons";
        const vehicleType = document.getElementById("bookVehicleType")?.value || "40T Multi-Axle";
        const slotTime = document.getElementById("bookTime")?.value || "Today • 20:00 - 22:00 IST";
        const rate = document.getElementById("quoteRate")?.textContent || "₹34,500";

        const newBooking = {
          bookingId: `BK-IN-${Math.floor(10000 + Math.random() * 90000)}`,
          consignor,
          origin,
          destination: dest,
          slotTime,
          tonnage,
          vehicleType,
          status: "Confirmed (FASTag Pre-Cleared)",
          rateEstimate: rate
        };

        this.bookings.unshift(newBooking);
        this.renderBookingsQueue();
        this.showToast(`✅ Dock Slot Reserved! Booking ID: ${newBooking.bookingId}`, "success");
        form.reset();
        updateEstimate();
      });
    }

    const helpForm = document.getElementById("helpTicketForm");
    if (helpForm) {
      helpForm.addEventListener("submit", (e) => {
        e.preventDefault();
        this.showToast("Support ticket dispatched to Engineering On-Call.", "success");
        helpForm.reset();
      });
    }
  }

  renderBookingsQueue() {
    const container = document.getElementById("bookingQueueContainer");
    if (!container) return;

    container.innerHTML = this.bookings.map(b => `
      <div style="background: var(--bg-surface-elevated); border: 1px solid var(--border-subtle); border-radius: 0.85rem; padding: 1rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.4rem;">
          <strong style="color: var(--color-primary); font-size: 0.95rem;">${b.bookingId}</strong>
          <span style="font-size: 0.72rem; font-weight: 700; color: var(--color-secondary); background: rgba(16, 185, 129, 0.12); padding: 0.2rem 0.5rem; border-radius: 9999px;">
            ${b.status}
          </span>
        </div>
        <div style="font-size: 0.85rem; font-weight: 700; color: var(--text-primary); margin-bottom: 0.2rem;">${b.consignor}</div>
        <div style="font-size: 0.78rem; color: var(--text-muted); margin-bottom: 0.4rem;">
          ${b.origin} ➔ ${b.destination}
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 0.75rem; border-top: 1px dashed var(--border-subtle); padding-top: 0.4rem;">
          <span style="color: var(--text-secondary);">${b.slotTime}</span>
          <strong style="color: var(--color-primary);">${b.rateEstimate}</strong>
        </div>
      </div>
    `).join("");
  }

  // --- Help FAQ ---
  renderHelpFaq() {
    const container = document.getElementById("dashFaqContainer");
    if (!container) return;

    container.innerHTML = FAQ_LIST.map(item => `
      <div style="background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: 0.85rem; padding: 1rem; cursor: pointer;" onclick="this.querySelector('p').style.display = this.querySelector('p').style.display === 'none' ? 'block' : 'none'">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <strong style="font-size: 0.92rem; color: var(--text-primary);">${item.q}</strong>
          <span style="color: var(--color-primary); font-size: 0.85rem;">▼</span>
        </div>
        <p style="margin-top: 0.5rem; font-size: 0.82rem; color: var(--text-secondary); line-height: 1.55; display: none;">${item.a}</p>
      </div>
    `).join("");
  }

  showToast(message, type = "info") {
    const toastBox = document.getElementById("dashToastBox");
    const toastMsg = document.getElementById("dashToastMsg");
    const toastIcon = document.getElementById("dashToastIcon");

    if (!toastBox || !toastMsg) return;

    toastMsg.textContent = message;
    toastIcon.textContent = (type === "error") ? "❌" : (type === "success") ? "✅" : "🔔";

    toastBox.classList.add("show");
    clearTimeout(toastBox._timer);
    toastBox._timer = setTimeout(() => {
      toastBox.classList.remove("show");
    }, 4000);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  window.dashApp = new DashboardApp();
});
