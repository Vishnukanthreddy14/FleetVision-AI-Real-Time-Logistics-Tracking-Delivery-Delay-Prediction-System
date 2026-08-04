/* =============================================================================
 * FleetVision AI — MongoDB VS Code Interactive Playground
 * =============================================================================
 * How to run in VS Code:
 * 1. Install "MongoDB for VS Code" extension (mongodb.mongodb-vscode)
 * 2. Connect to: mongodb://localhost:27017
 * 3. Press Cmd+Option+R (macOS) or Ctrl+Alt+R (Windows/Linux) or click the "Execute" button.
 * ============================================================================= */

// 1. Select Database
use('fleetvision_ai');

// 2. Collection Overview & Counts
console.log("=== COLLECTION DOCUMENT COUNTS ===");
console.log("Vehicles:          ", db.vehicles.countDocuments());
console.log("Telemetry History: ", db.telemetry_history.countDocuments());
console.log("Alerts:            ", db.alerts.countDocuments());

// 3. Inspect Live Vehicles along Indian Corridors
db.vehicles.find(
  {},
  {
    vehicle_id: 1,
    plate: 1,
    driver_name: 1,
    route_name: 1,
    speed_kmh: 1,
    fuel_level_pct: 1,
    delay_risk: 1,
    "current_location.latitude": 1,
    "current_location.longitude": 1
  }
).limit(5);

// 4. Find High Risk or Weather-Impacted Vehicles
db.vehicles.find({
  $or: [
    { delay_risk: { $in: ["Moderate", "High"] } },
    { weather_condition: { $ne: "Clear" } }
  ]
});

// 5. Query Recent Telemetry Stream Entries
db.telemetry_history.find().sort({ timestamp: -1 }).limit(10);

// 6. Query Security & Authentication Audit Logs
db.system_logs.find().sort({ timestamp: -1 }).limit(10);
