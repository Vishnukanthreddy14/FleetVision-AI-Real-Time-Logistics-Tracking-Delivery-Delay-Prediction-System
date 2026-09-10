/**
 * FleetVisionAI: Main Dashboard Controller
 * Integrates WebSocket live streaming, Leaflet maps, Chart.js analytics,
 * simulation controls, and role-based UI adaptations.
 */

let mapManager = null;
let chartsManager = null;
let currentVehicles = [];
let selectedVehicle = null;
let currentUser = null;
let telemetrySocket = null;
let pollingInterval = null;

document.addEventListener("DOMContentLoaded", () => {
  currentUser = requireAuth();
  if (!currentUser) return; // Strict guard: halts execution and redirects immediately

  applyRolePermissions(currentUser);

  // Initialize Map & Charts
  mapManager = new FleetMapManager("map");
  chartsManager = new FleetChartsManager();

  mapManager.onVehicleSelectCallback = (vehicleId) => {
    selectVehicleById(vehicleId);
  };

  // Setup Event Listeners
  setupSimulationControls();
  setupTableFilters();
  setupModals();

  // Connect Real-Time Telemetry Stream
  connectTelemetryWebSocket();

  // Fetch initial charts and alerts
  fetchAnalyticsCharts();
  fetchActiveAlerts();
  setInterval(fetchActiveAlerts, 6000);
});

function applyRolePermissions(user) {
  // Update Profile badge
  const nameEl = document.getElementById("headerUserName");
  const roleEl = document.getElementById("headerUserRole");
  const avatarEl = document.getElementById("headerUserAvatar");

  if (nameEl) nameEl.innerText = user.name;
  if (roleEl) {
    roleEl.innerText = user.role.toUpperCase();
    roleEl.className = `role-badge ${user.role}`;
  }
  if (avatarEl) avatarEl.src = user.avatar;

  // Role-based visibility & controls
  const driverBanner = document.getElementById("driverRoleBanner");
  const simControls = document.getElementById("simControlsContainer");
  const incidentBtn = document.getElementById("openIncidentModalBtn");

  if (user.role === "user") {
    // User / Driver mode:
    if (driverBanner) driverBanner.style.display = "flex";
    if (simControls) simControls.style.display = "none";
    if (incidentBtn) incidentBtn.style.display = "none";

    // Adjust KPI title for assigned vehicle mode
    const kpiActiveTitle = document.querySelector(".kpi-card .kpi-title");
    if (kpiActiveTitle) kpiActiveTitle.innerText = "Assigned Shipment";
    const kpiActiveSub = document.querySelector(".kpi-card .kpi-subtext");
    if (kpiActiveSub) kpiActiveSub.innerText = "Tracking vehicle TRK-101";
  } else if (user.role === "manager") {
    // Manager mode: dispatch optimization permitted, incident injection locked to admin
    if (driverBanner) driverBanner.style.display = "none";
    if (incidentBtn) incidentBtn.style.display = "none";
  } else {
    // Admin mode: all features and controls active
    if (driverBanner) driverBanner.style.display = "none";
  }
}

function connectTelemetryWebSocket() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${protocol}//${window.location.host}/ws/telemetry`;

  try {
    telemetrySocket = new WebSocket(wsUrl);

    telemetrySocket.onopen = () => {
      console.log("WebSocket connected to FleetVisionAI stream.");
      const statusPill = document.getElementById("streamStatusPill");
      if (statusPill) statusPill.innerText = "Live Stream Active";
    };

    telemetrySocket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        handleTelemetryUpdate(payload);
      } catch (err) {
        console.error("Error parsing telemetry packet:", err);
      }
    };

    telemetrySocket.onclose = () => {
      console.warn("WebSocket disconnected, attempting reconnect in 3s...");
      setTimeout(connectTelemetryWebSocket, 3000);
    };
  } catch (err) {
    console.error("WebSocket setup failed, falling back to REST polling:", err);
    startRestPolling();
  }
}

function startRestPolling() {
  if (pollingInterval) clearInterval(pollingInterval);
  pollingInterval = setInterval(async () => {
    try {
      const res = await fetch("/api/vehicles");
      const vehicles = await res.json();
      handleTelemetryUpdate({ vehicles: vehicles });
    } catch (e) {
      console.error("Polling error:", e);
    }
  }, 1000);
}

function handleTelemetryUpdate(payload) {
  if (payload.vehicles) {
    let vehiclesToDisplay = payload.vehicles;

    // Strict Role-Based Data Isolation for Driver / Operator
    if (currentUser && currentUser.role === "user") {
      vehiclesToDisplay = payload.vehicles.filter(v => v.vehicle_id === "TRK-101");
    }

    currentVehicles = vehiclesToDisplay;
    mapManager.updateVehicles(currentVehicles);
    renderVehiclesTable(currentVehicles);

    // Keep inspector updated
    if (!selectedVehicle && currentVehicles.length > 0) {
      selectVehicleById(currentVehicles[0].vehicle_id);
    } else if (selectedVehicle) {
      const updated = currentVehicles.find(v => v.vehicle_id === selectedVehicle.vehicle_id);
      if (updated) {
        renderVehicleInspector(updated);
      }
    }
  }

  // Update KPI Tiles
  if (payload.kpi) {
    if (currentUser && currentUser.role === "user" && currentVehicles.length > 0) {
      const v = currentVehicles[0];
      updateKPICards({
        total_vehicles: "TRK-101",
        on_time_rate_pct: v.delay_risk === "Low" ? "100.0" : (v.delay_risk === "Moderate" ? "65.0" : "25.0"),
        avg_fuel_rate: v.fuel_consumption_rate,
        avg_eta_min: v.estimated_arrival_time_min,
        delayed_count: v.delay_risk === "High" ? 1 : 0
      });
    } else {
      updateKPICards(payload.kpi);
    }
  }

  // Update 5-Minute Simulation Progress (Admin and Manager only)
  if (payload.simulation && (!currentUser || currentUser.role !== "user")) {
    updateSimulationProgress(payload.simulation);
  }
}

function updateKPICards(kpi) {
  const activeEl = document.getElementById("kpiActiveFleet");
  const onTimeEl = document.getElementById("kpiOnTimeRate");
  const fuelEl = document.getElementById("kpiAvgFuel");
  const etaEl = document.getElementById("kpiAvgEta");
  const riskEl = document.getElementById("kpiCriticalRisks");

  if (activeEl) activeEl.innerText = `${kpi.total_vehicles || 14}`;
  if (onTimeEl) onTimeEl.innerText = `${kpi.on_time_rate_pct || 96.5}%`;
  if (fuelEl) fuelEl.innerText = `${kpi.avg_fuel_rate || 28.5} L`;
  if (etaEl) etaEl.innerText = `${kpi.avg_eta_min || 180} m`;
  if (riskEl) riskEl.innerText = `${kpi.delayed_count || 0}`;
}

function updateSimulationProgress(sim) {
  const fill = document.getElementById("simProgressBarFill");
  const timeText = document.getElementById("simTimeText");
  const playBtn = document.getElementById("simPlayBtn");

  const step = sim.current_step || 0;
  const total = sim.total_steps || 300;
  const pct = Math.min(100, Math.round((step / total) * 100));

  if (fill) fill.style.width = `${pct}%`;

  const elapsedSecs = step;
  const mins = Math.floor(elapsedSecs / 60).toString().padStart(2, "0");
  const secs = (elapsedSecs % 60).toString().padStart(2, "0");
  if (timeText) timeText.innerText = `${mins}:${secs} / 05:00`;

  if (playBtn) {
    playBtn.innerHTML = sim.is_running ? "⏸️" : "▶️";
    playBtn.title = sim.is_running ? "Pause Simulation" : "Start Simulation";
  }
}

function selectVehicleById(vehicleId) {
  const v = currentVehicles.find(x => x.vehicle_id === vehicleId);
  if (v) {
    selectedVehicle = v;
    renderVehicleInspector(v);
    if (mapManager && mapManager.selectedVehicleId !== vehicleId) {
      mapManager.selectVehicle(vehicleId);
    }
  }
}

function renderVehicleInspector(v) {
  const titleEl = document.getElementById("inspVehicleId");
  const subtitleEl = document.getElementById("inspDriverInfo");
  const badgeEl = document.getElementById("inspStatusBadge");
  const speedEl = document.getElementById("inspSpeed");
  const fuelRateEl = document.getElementById("inspFuelRate");
  const fuelLvlEl = document.getElementById("inspFuelLvl");
  const trafficEl = document.getElementById("inspTraffic");
  const weatherEl = document.getElementById("inspWeather");
  const distEl = document.getElementById("inspDistance");
  const rfEtaEl = document.getElementById("inspRfEta");
  const lstmEtaEl = document.getElementById("inspLstmEta");
  const blendedEtaEl = document.getElementById("inspBlendedEta");
  const optTitleEl = document.getElementById("inspOptTitle");
  const optTextEl = document.getElementById("inspOptText");
  const optBtn = document.getElementById("inspOptimizeBtn");

  if (titleEl) titleEl.innerText = `${v.vehicle_id} • ${v.plate}`;
  if (subtitleEl) subtitleEl.innerText = `${v.driver_name} (${v.driver_id}) | ${v.vehicle_type}`;

  if (badgeEl) {
    badgeEl.innerText = v.delivery_status;
    badgeEl.className = `status-badge ${v.delay_risk === 'High' ? 'high' : (v.delay_risk === 'Moderate' ? 'moderate' : 'low')}`;
  }

  if (speedEl) speedEl.innerText = `${v.speed_kmh} km/h`;
  if (fuelRateEl) fuelRateEl.innerText = `${v.fuel_consumption_rate} L/100km`;
  if (fuelLvlEl) fuelLvlEl.innerText = `${v.fuel_level_pct}%`;
  if (trafficEl) trafficEl.innerText = v.traffic_congestion;
  if (weatherEl) weatherEl.innerText = v.weather_condition;
  if (distEl) distEl.innerText = `${v.distance_remaining_km} km`;

  // Dual ML Predictions
  if (rfEtaEl) rfEtaEl.innerText = `${v.rf_eta_min} min`;
  if (lstmEtaEl) lstmEtaEl.innerText = `${v.lstm_eta_min} min`;
  if (blendedEtaEl) blendedEtaEl.innerText = `${v.estimated_arrival_time_min} min`;

  // AI Route Optimization advice
  if (v.optimization && optTitleEl && optTextEl) {
    optTitleEl.innerText = v.optimization.status || "Optimal Path Maintained";
    const minsSaved = v.optimization.estimated_minutes_saved || 0;
    const fuelSaved = v.optimization.estimated_fuel_saved_liters || 0;
    if (minsSaved > 0) {
      optTextEl.innerText = `Bypass alert: Potential saving of ${minsSaved} mins and ${fuelSaved}L fuel via dynamic alternate corridor.`;
    } else {
      optTextEl.innerText = "Vehicle progressing within standard fuel and speed tolerances. No rerouting needed.";
    }
  }

  if (optBtn) {
    optBtn.onclick = () => executeRouteOptimization(v.vehicle_id);
  }
}

async function executeRouteOptimization(vehicleId) {
  if (currentUser && currentUser.role === "user") {
    alert("Access Denied: AI Dynamic Rerouting is restricted to Logistics Dispatch Managers and Fleet Administrators.");
    return;
  }
  try {
    const res = await fetch(`/api/vehicles/optimize/${vehicleId}`, { method: "POST" });
    const data = await res.json();
    alert(`AI Rerouting Applied for ${vehicleId}!\nTraffic bottleneck cleared. Speed restored to optimal cruising.`);
    fetchAnalyticsCharts();
  } catch (err) {
    console.error("Optimization failed:", err);
  }
}

function renderVehiclesTable(vehicles) {
  const tbody = document.getElementById("vehiclesTableBody");
  if (!tbody) return;

  const filterStatus = document.querySelector(".table-filter-btn.active")?.getAttribute("data-filter") || "all";
  const searchVal = document.getElementById("vehicleSearchInput")?.value.toLowerCase().trim() || "";

  const filtered = vehicles.filter(v => {
    const matchesSearch = v.vehicle_id.toLowerCase().includes(searchVal) ||
                          v.driver_name.toLowerCase().includes(searchVal) ||
                          v.route_name.toLowerCase().includes(searchVal);
    if (!matchesSearch) return false;

    if (filterStatus === "all") return true;
    if (filterStatus === "delayed") return v.delay_risk === "High" || v.delivery_status === "Delayed";
    if (filterStatus === "transit") return v.delivery_status === "In Transit";
    return true;
  });

  tbody.innerHTML = filtered.map(v => {
    const riskBadgeClass = v.delay_risk === "High" ? "high" : (v.delay_risk === "Moderate" ? "moderate" : "low");
    return `
      <tr>
        <td><strong>${v.vehicle_id}</strong></td>
        <td>${v.driver_name}</td>
        <td>${v.route_name}</td>
        <td>${v.speed_kmh} km/h</td>
        <td>${v.fuel_consumption_rate} L</td>
        <td>${v.traffic_congestion}</td>
        <td><strong>${v.estimated_arrival_time_min}m</strong></td>
        <td><span class="status-badge ${riskBadgeClass}">${v.delay_risk}</span></td>
        <td>
          <button class="table-action-btn" onclick="mapManager.focusVehicle('${v.vehicle_id}'); selectVehicleById('${v.vehicle_id}');">Track</button>
          <button class="table-action-btn" onclick="executeRouteOptimization('${v.vehicle_id}')">Optimize</button>
        </td>
      </tr>
    `;
  }).join("");
}

function setupSimulationControls() {
  const playBtn = document.getElementById("simPlayBtn");
  const resetBtn = document.getElementById("simResetBtn");
  const speedSelect = document.getElementById("simSpeedSelect");

  if (playBtn) {
    playBtn.addEventListener("click", async () => {
      const isRunning = playBtn.innerText.includes("⏸️");
      const endpoint = isRunning ? "/api/simulation/pause" : "/api/simulation/start";
      await fetch(endpoint, { method: "POST" });
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener("click", async () => {
      if (confirm("Reset 5-minute simulation for all 14 vehicles?")) {
        await fetch("/api/simulation/reset", { method: "POST" });
      }
    });
  }

  if (speedSelect) {
    speedSelect.addEventListener("change", async (e) => {
      const multiplier = parseFloat(e.target.value);
      await fetch("/api/simulation/speed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ multiplier: multiplier })
      });
    });
  }
}

function setupTableFilters() {
  const searchInput = document.getElementById("vehicleSearchInput");
  if (searchInput) {
    searchInput.addEventListener("input", () => renderVehiclesTable(currentVehicles));
  }

  document.querySelectorAll(".table-filter-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".table-filter-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      renderVehiclesTable(currentVehicles);
    });
  });
}

function setupModals() {
  const incidentModal = document.getElementById("incidentModal");
  const openIncidentBtn = document.getElementById("openIncidentModalBtn");
  const closeIncidentBtn = document.getElementById("closeIncidentModalBtn");
  const incidentForm = document.getElementById("incidentForm");

  if (openIncidentBtn) {
    openIncidentBtn.addEventListener("click", () => {
      populateIncidentVehicleSelect();
      incidentModal.classList.add("active");
    });
  }

  if (closeIncidentBtn) {
    closeIncidentBtn.addEventListener("click", () => incidentModal.classList.remove("active"));
  }

  if (incidentForm) {
    incidentForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!currentUser || currentUser.role !== "admin") {
        alert("Access Denied: Incident injection is restricted strictly to Enterprise Fleet Administrators.");
        incidentModal.classList.remove("active");
        return;
      }
      const vehicleId = document.getElementById("incidentVehicleSelect").value;
      const incidentType = document.getElementById("incidentTypeSelect").value;

      try {
        const res = await fetch("/api/simulation/incident", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ vehicle_id: vehicleId, incident_type: incidentType })
        });

        if (res.status === 403) {
          alert("Access Denied: You do not have administrator permissions to inject incidents.");
          incidentModal.classList.remove("active");
          return;
        }

        incidentModal.classList.remove("active");
        alert(`Incident '${incidentType}' injected on ${vehicleId}. Watch ML models react live!`);
        mapManager.focusVehicle(vehicleId);
        selectVehicleById(vehicleId);
        fetchAnalyticsCharts();
      } catch (err) {
        console.error("Incident injection failed:", err);
      }
    });
  }
}

function populateIncidentVehicleSelect() {
  const select = document.getElementById("incidentVehicleSelect");
  if (!select) return;
  select.innerHTML = currentVehicles.map(v => `
    <option value="${v.vehicle_id}">${v.vehicle_id} - ${v.driver_name} (${v.route_name})</option>
  `).join("");
}

async function fetchAnalyticsCharts() {
  try {
    const res = await fetch("/api/analytics/charts");
    if (!res.ok) return;
    const data = await res.json();
    if (chartsManager) {
      chartsManager.updateData(data);
    }
  } catch (e) {
    console.error("Error updating charts:", e);
  }
}

async function fetchActiveAlerts() {
  try {
    const res = await fetch("/api/analytics/alerts");
    const alerts = await res.json();
    const ticker = document.getElementById("alertsTickerList");
    if (ticker && alerts.length > 0) {
      ticker.innerHTML = alerts.slice(0, 4).map(a => `
        <div style="font-size: 12px; margin-bottom: 4px; display: flex; justify-content: space-between; color: ${a.severity === 'CRITICAL' ? '#EF4444' : '#F59E0B'}">
          <span>⚠️ <strong>${a.vehicle_id}:</strong> ${a.incident}</span>
          <span>${a.traffic || 'Alert'}</span>
        </div>
      `).join("");
    }
  } catch (e) {}
}

// --- Security Audit Trail Modal Integration ---
async function openAuditModal() {
  const modal = document.getElementById("auditModal");
  if (modal) {
    modal.style.display = "flex";
    await fetchAuditLogs();
  }
}

function closeAuditModal() {
  const modal = document.getElementById("auditModal");
  if (modal) {
    modal.style.display = "none";
  }
}

async function fetchAuditLogs() {
  const tbody = document.getElementById("auditTableBody");
  const countEl = document.getElementById("auditLogCount");
  if (!tbody) return;

  try {
    const res = await fetch("/api/auth/audit-logs?limit=50");
    if (!res.ok) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 1rem; color: #EF4444;">Failed to retrieve audit trail</td></tr>`;
      return;
    }
    const data = await res.json();
    const logs = data.logs || [];
    if (countEl) countEl.innerText = `${logs.length} tamper-evident event records loaded`;

    if (logs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 1rem; color: var(--text-secondary);">No audit events recorded yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = logs.map(l => {
      let sevBg = "rgba(59, 130, 246, 0.15)";
      let sevColor = "#60A5FA";
      if (l.severity === "ALERT") {
        sevBg = "rgba(239, 68, 68, 0.2)";
        sevColor = "#EF4444";
      } else if (l.severity === "WARN") {
        sevBg = "rgba(245, 158, 11, 0.2)";
        sevColor = "#F59E0B";
      }
      return `
        <tr style="border-bottom: 1px solid var(--border-color);">
          <td style="padding: 0.5rem; font-family: monospace; white-space: nowrap;">${l.timeString || (l.timestamp ? l.timestamp.slice(11, 19) : '')}</td>
          <td style="padding: 0.5rem;"><span style="background: ${sevBg}; color: ${sevColor}; padding: 0.15rem 0.45rem; border-radius: 4px; font-weight: 700; font-size: 0.7rem;">${l.severity}</span></td>
          <td style="padding: 0.5rem; font-weight: 600; font-family: monospace;">${l.eventType}</td>
          <td style="padding: 0.5rem; white-space: nowrap;">${l.user}</td>
          <td style="padding: 0.5rem; font-family: monospace;">${l.ip}</td>
          <td style="padding: 0.5rem; color: var(--text-secondary);">${l.details}</td>
        </tr>
      `;
    }).join("");
  } catch (err) {
    console.error("Error fetching audit logs:", err);
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 1rem; color: #EF4444;">Error: ${err.message}</td></tr>`;
  }
}

