/**
 * FleetVisionAI: Leaflet Interactive Map & Google Maps Navigation Directions Engine
 * 100% Free & Open — Requires NO API Key (Zero watermarks, zero rate limits).
 * Features high-visibility highway corridors, animated directional arrows,
 * prominent Google Maps destination pins, and dynamic vehicle steering angles.
 */

class FleetMapManager {
  constructor(containerId = "map") {
    this.containerId = containerId;
    this.map = null;
    this.markers = {};
    this.routeCasings = {};
    this.routePolylines = {};
    this.routeActiveCorridors = {};
    this.glowingTrails = {};
    this.destMarkers = {};
    this.originMarkers = {};
    this.selectedVehicleId = "TRK-101";
    this.onVehicleSelectCallback = null;
    this.initMap();
  }

  initMap() {
    // Centered specifically on the Indian subcontinent
    this.map = L.map(this.containerId, {
      center: [22.5, 79.5],
      zoom: 5,
      minZoom: 4,
      maxZoom: 19,
      zoomControl: false,
      attributionControl: false
    });

    // Add custom zoom control in bottom right
    L.control.zoom({ position: "bottomright" }).addTo(this.map);

    // Official OpenStreetMap (OSM) — 100% Free, NO API Key required, Zero watermarks
    this.osmLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a> contributors"
    }).addTo(this.map);

    // Theme reactivity
    window.onThemeChanged = (newTheme) => {
      this.updateTileStyle(newTheme);
    };
  }

  updateTileStyle(theme) {
    if (this.map) {
      this.map.invalidateSize();
    }
  }

  calculateBearing(lat1, lon1, lat2, lon2) {
    const toRad = deg => (deg * Math.PI) / 180;
    const toDeg = rad => (rad * 180) / Math.PI;
    const φ1 = toRad(lat1), φ2 = toRad(lat2);
    const Δλ = toRad(lon2 - lon1);
    const y = Math.sin(Δλ) * Math.cos(φ2);
    const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
    return (toDeg(Math.atan2(y, x)) + 360) % 360;
  }

  createTruckIcon(vehicle, bearing) {
    const risk = vehicle.delay_risk || "Low";
    const riskClass = risk === "High" ? "high-risk" : (risk === "Moderate" ? "mod-risk" : "low-risk");
    const isIncident = vehicle.active_incident ? "active-incident" : "";
    const isSelected = vehicle.vehicle_id === this.selectedVehicleId ? "selected-vehicle" : "";

    const html = `
      <div class="gmaps-nav-wrapper ${riskClass} ${isIncident} ${isSelected}">
        <!-- Radar Pulse Aura -->
        <div class="gmaps-nav-aura"></div>
        
        <!-- Forward Directional Headlight Beam -->
        <div class="gmaps-headlight-cone" style="transform: rotate(${bearing}deg);"></div>

        <!-- Rotatable Vehicle Token -->
        <div class="gmaps-nav-token" style="transform: rotate(${bearing}deg);" title="${vehicle.vehicle_id} - ${vehicle.driver_name}">
          <!-- Navigation Arrow Chevron -->
          <div class="gmaps-nav-arrow"></div>
          
          <!-- Commercial Freight Truck SVG -->
          <svg class="gmaps-truck-svg" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18 18.5a1.5 1.5 0 0 1-1.5-1.5 1.5 1.5 0 0 1 1.5 1.5 1.5 1.5 0 0 1 1.5 1.5 1.5 1.5 0 0 1-1.5 1.5m1.5-9l1.96 2.5H17V9.5h2.5M6 18.5A1.5 1.5 0 0 1 4.5 17 1.5 1.5 0 0 1 6 15.5 1.5 1.5 0 0 1 7.5 17 1.5 1.5 0 0 1 6 18.5M20 8h-3V4H3a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2 3 3 0 0 0 6 0h6a3 3 0 0 0 6 0 2 2 0 0 0 2-2v-5l-3-4z"/>
          </svg>
        </div>

        <!-- Vehicle Callout Tag -->
        <div class="gmaps-nav-tag">${vehicle.vehicle_id}</div>
      </div>
    `;

    return L.divIcon({
      html: html,
      className: "custom-gmaps-truck-icon",
      iconSize: [44, 44],
      iconAnchor: [22, 22]
    });
  }

  createDestinationPin(vehicle) {
    const destCity = vehicle.destination.split(",")[0].trim().toUpperCase();
    const isSelected = vehicle.vehicle_id === this.selectedVehicleId ? "selected-dest" : "";

    const html = `
      <div class="gmaps-dest-pin-wrap ${isSelected}" title="Destination: ${vehicle.destination}">
        <div class="gmaps-dest-pulse"></div>
        <div class="gmaps-dest-pin">
          <svg width="28" height="38" viewBox="0 0 28 38" fill="none">
            <path d="M14 0C6.268 0 0 6.268 0 14c0 10.5 14 24 14 24s14-13.5 14-24C28 6.268 21.732 0 14 0z" fill="#EA4335" stroke="#B31412" stroke-width="1.2"/>
            <circle cx="14" cy="14" r="6" fill="#FFFFFF"/>
            <circle cx="14" cy="14" r="3" fill="#C5221F"/>
          </svg>
        </div>
        <div class="gmaps-dest-label">
          <span style="color: #F87171; margin-right: 2px;">🏁</span> ${destCity}
        </div>
      </div>
    `;

    return L.divIcon({
      html: html,
      className: "custom-gmaps-dest-icon",
      iconSize: [40, 52],
      iconAnchor: [20, 42]
    });
  }

  createOriginPin(vehicle) {
    const originCity = vehicle.origin.split(",")[0].trim().toUpperCase();

    const html = `
      <div class="gmaps-origin-pin-wrap" title="Origin: ${vehicle.origin}">
        <div class="gmaps-origin-pin"></div>
        <div class="gmaps-origin-label">
          <span style="color: #34D399; margin-right: 2px;">🟢</span> ${originCity}
        </div>
      </div>
    `;

    return L.divIcon({
      html: html,
      className: "custom-gmaps-origin-icon",
      iconSize: [36, 30],
      iconAnchor: [18, 15]
    });
  }

  updateVehicles(vehicles) {
    vehicles.forEach(v => {
      const vid = v.vehicle_id;
      const lat = v.current_location.latitude;
      const lon = v.current_location.longitude;
      const pos = [lat, lon];
      const waypoints = v.waypoints || [];
      const isSelected = vid === this.selectedVehicleId;

      // 1. Draw High-Visibility Highway Corridors
      if (!this.routePolylines[vid] && waypoints.length > 0) {
        // Outer Highway Casing
        this.routeCasings[vid] = L.polyline(waypoints, {
          color: "#0F172A",
          weight: 7,
          opacity: 0.95,
          lineCap: "round",
          lineJoin: "round"
        }).addTo(this.map);

        // Core Vibrant Highway Line (Google Maps Blue)
        this.routePolylines[vid] = L.polyline(waypoints, {
          color: isSelected ? "#00F0FF" : "#2563EB",
          weight: isSelected ? 5 : 3.5,
          opacity: isSelected ? 1.0 : 0.85,
          lineCap: "round",
          lineJoin: "round"
        }).addTo(this.map);

        // Animated Directional Dash Overlay (Chevrons flowing toward destination)
        this.routeActiveCorridors[vid] = L.polyline(waypoints, {
          color: isSelected ? "#FFFFFF" : "#60A5FA",
          weight: 2.5,
          opacity: 0.9,
          dashArray: "8, 14",
          className: "gmaps-flowing-direction-path",
          lineCap: "round",
          lineJoin: "round"
        }).addTo(this.map);
      } else if (this.routePolylines[vid]) {
        // Update highlight style dynamically on selection
        this.routePolylines[vid].setStyle({
          color: isSelected ? "#00F0FF" : "#2563EB",
          weight: isSelected ? 5 : 3.5,
          opacity: isSelected ? 1.0 : 0.85
        });
      }

      // 2. Add Google Maps Origin Pin at first waypoint
      if (!this.originMarkers[vid] && waypoints.length > 0) {
        const originPos = waypoints[0];
        const originIcon = this.createOriginPin(v);
        const originMarker = L.marker(originPos, { icon: originIcon, zIndexOffset: 150 }).addTo(this.map);
        originMarker.bindPopup(`
          <div class="gmaps-popup">
            <div class="gmaps-popup-header" style="color: #059669;">🟢 Trip Origin</div>
            <div class="gmaps-popup-body">
              <strong>${v.origin}</strong><br>
              Corridor: ${v.route_name}<br>
              Vehicle: <span style="color: #0284C7; font-weight: 700;">${v.vehicle_id}</span>
            </div>
          </div>
        `);
        this.originMarkers[vid] = originMarker;
      }

      // 3. Add Google Maps Destination Pin at final waypoint
      if (!this.destMarkers[vid] && waypoints.length > 0) {
        const destPos = waypoints[waypoints.length - 1];
        const destIcon = this.createDestinationPin(v);
        const destMarker = L.marker(destPos, { icon: destIcon, zIndexOffset: 300 }).addTo(this.map);
        destMarker.bindPopup(`
          <div class="gmaps-popup">
            <div class="gmaps-popup-header" style="color: #DC2626;">🏁 Target Destination</div>
            <div class="gmaps-popup-body">
              <strong>${v.destination}</strong><br>
              Route: <strong>${v.route_name}</strong><br>
              Assigned Vehicle: <span style="color: #1A73E8; font-weight: 700;">${v.vehicle_id}</span> (${v.plate})<br>
              Distance Remaining: <strong>${v.distance_remaining_km} km</strong><br>
              Estimated Arrival: <strong>${v.estimated_arrival_time_min} mins</strong>
            </div>
          </div>
        `);
        this.destMarkers[vid] = destMarker;
      } else if (this.destMarkers[vid]) {
        // Refresh destination icon selection state
        this.destMarkers[vid].setIcon(this.createDestinationPin(v));
      }

      // 4. Draw Active Traveled Trail up to current vehicle position
      const trailCoords = v.trail_history && v.trail_history.length > 1 ? v.trail_history : [pos];
      const riskColor = v.delay_risk === "High" ? "#EF4444" : (v.delay_risk === "Moderate" ? "#F59E0B" : "#00F0FF");

      if (!this.glowingTrails[vid]) {
        this.glowingTrails[vid] = L.polyline(trailCoords, {
          color: riskColor,
          weight: 4.5,
          opacity: 0.95,
          lineCap: "round",
          lineJoin: "round",
          className: "gmaps-active-trail"
        }).addTo(this.map);
      } else {
        this.glowingTrails[vid].setLatLngs(trailCoords);
        this.glowingTrails[vid].setStyle({ color: riskColor });
      }

      // 5. Calculate smooth bearing
      let bearing = v.bearing !== undefined ? v.bearing : 0;
      if (v.trail_history && v.trail_history.length >= 2) {
        const p1 = v.trail_history[v.trail_history.length - 2];
        const p2 = v.trail_history[v.trail_history.length - 1];
        if (p1[0] !== p2[0] || p1[1] !== p2[1]) {
          bearing = this.calculateBearing(p1[0], p1[1], p2[0], p2[1]);
        }
      }

      // 6. Update or create vehicle marker
      const icon = this.createTruckIcon(v, bearing);
      if (!this.markers[vid]) {
        const marker = L.marker(pos, { icon: icon, zIndexOffset: 500 }).addTo(this.map);
        marker.on("click", () => {
          this.selectVehicle(vid);
        });

        // Rich Telemetry Popup
        marker.bindPopup(`
          <div class="gmaps-popup">
            <div class="gmaps-popup-header">
              <span class="gmaps-popup-badge">${v.vehicle_id}</span>
              <span style="font-size: 11px; color: #64748B;">${v.plate}</span>
            </div>
            <div class="gmaps-popup-body">
              <strong>${v.vehicle_type}</strong> | Driver: <strong>${v.driver_name}</strong><br>
              <div style="margin: 4px 0; color: #1E293B;">
                📍 <strong>${v.origin}</strong> ➔ 🏁 <strong>${v.destination}</strong>
              </div>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; font-size: 11px; margin-top: 6px; padding-top: 6px; border-top: 1px solid #E2E8F0;">
                <div>⚡ Speed: <strong>${v.speed_kmh} km/h</strong></div>
                <div>⛽ Fuel: <strong>${v.fuel_level_pct}%</strong></div>
                <div>🚦 Traffic: <strong>${v.traffic_congestion}</strong></div>
                <div>🕒 ML ETA: <strong>${v.estimated_arrival_time_min}m</strong></div>
              </div>
              <div style="margin-top: 5px; font-size: 11px; color: ${v.delay_risk === 'High' ? '#DC2626' : (v.delay_risk === 'Moderate' ? '#D97706' : '#16A34A')}; font-weight: 700;">
                ● Risk Status: ${v.delay_risk} Risk (${v.delivery_status})
              </div>
            </div>
          </div>
        `);
        this.markers[vid] = marker;
      } else {
        this.markers[vid].setLatLng(pos);
        this.markers[vid].setIcon(icon);
      }
    });
  }

  selectVehicle(vehicleId) {
    this.selectedVehicleId = vehicleId;
    // Highlight selected route and destination
    Object.keys(this.routePolylines).forEach(vid => {
      const isSel = vid === vehicleId;
      if (this.routePolylines[vid]) {
        this.routePolylines[vid].setStyle({
          color: isSel ? "#00F0FF" : "#2563EB",
          weight: isSel ? 6 : 3.5,
          opacity: isSel ? 1.0 : 0.65
        });
      }
    });

    if (this.onVehicleSelectCallback) {
      this.onVehicleSelectCallback(vehicleId);
    }
  }

  focusVehicle(vehicleId) {
    const marker = this.markers[vehicleId];
    if (marker) {
      const pos = marker.getLatLng();
      this.map.flyTo(pos, 8, { duration: 1.2 });
      marker.openPopup();
    }
  }

  fitFleetView() {
    // Collect all vehicle locations and destination coordinates
    const allCoords = [];
    Object.values(this.markers).forEach(m => allCoords.push(m.getLatLng()));
    Object.values(this.destMarkers).forEach(m => allCoords.push(m.getLatLng()));
    if (allCoords.length > 0) {
      const bounds = L.latLngBounds(allCoords);
      this.map.fitBounds(bounds, { padding: [40, 40] });
    } else {
      this.resetFleetView();
    }
  }

  resetFleetView() {
    // Focus back on the full Indian subcontinent
    this.map.flyTo([22.5, 79.5], 5, { duration: 1.0 });
  }
}

// Global instance initialized for dashboard usage
window.FleetMapManager = FleetMapManager;

