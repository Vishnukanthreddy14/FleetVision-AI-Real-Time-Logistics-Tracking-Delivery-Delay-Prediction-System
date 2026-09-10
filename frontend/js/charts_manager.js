/**
 * FleetVisionAI: Chart.js Visualizations Manager
 * Manages dynamic rendering of ETA model comparisons, fuel telemetry, and risk distribution.
 */

class FleetChartsManager {
  constructor() {
    this.etaChart = null;
    this.fuelChart = null;
    this.riskChart = null;
    this.speedChart = null;
    this.initCharts();
  }

  getChartColors() {
    const isDark = document.documentElement.getAttribute("data-theme") !== "light";
    return {
      textColor: isDark ? "#94A3B8" : "#475569",
      gridColor: isDark ? "rgba(255, 255, 255, 0.06)" : "rgba(0, 0, 0, 0.06)",
      cyan: "#06B6D4",
      blue: "#3B82F6",
      purple: "#8B5CF6",
      emerald: "#10B981",
      amber: "#F59E0B",
      rose: "#EF4444"
    };
  }

  initCharts() {
    const colors = this.getChartColors();

    // 1. ETA Model Comparison Chart (RF vs LSTM)
    const etaCtx = document.getElementById("etaComparisonChart");
    if (etaCtx) {
      this.etaChart = new Chart(etaCtx, {
        type: "bar",
        data: {
          labels: [],
          datasets: [
            {
              label: "Random Forest ETA (min)",
              data: [],
              backgroundColor: "rgba(6, 182, 212, 0.75)",
              borderColor: colors.cyan,
              borderWidth: 1,
              borderRadius: 4
            },
            {
              label: "LSTM Sequence ETA (min)",
              data: [],
              backgroundColor: "rgba(139, 92, 246, 0.75)",
              borderColor: colors.purple,
              borderWidth: 1,
              borderRadius: 4
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { labels: { color: colors.textColor, font: { family: "Outfit" } } },
            tooltip: { mode: "index", intersect: false }
          },
          scales: {
            x: { grid: { color: colors.gridColor }, ticks: { color: colors.textColor } },
            y: { grid: { color: colors.gridColor }, ticks: { color: colors.textColor }, title: { display: true, text: "Minutes", color: colors.textColor } }
          }
        }
      });
    }

    // 2. Fuel Consumption & Level Chart
    const fuelCtx = document.getElementById("fuelChart");
    if (fuelCtx) {
      this.fuelChart = new Chart(fuelCtx, {
        type: "bar",
        data: {
          labels: [],
          datasets: [
            {
              label: "Fuel Burn Rate (L/100km)",
              data: [],
              backgroundColor: "rgba(245, 158, 11, 0.75)",
              borderColor: colors.amber,
              borderWidth: 1,
              borderRadius: 4,
              yAxisID: "y"
            },
            {
              type: "line",
              label: "Remaining Fuel %",
              data: [],
              borderColor: colors.emerald,
              backgroundColor: "rgba(16, 185, 129, 0.15)",
              borderWidth: 2.5,
              tension: 0.3,
              fill: true,
              yAxisID: "y1"
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { labels: { color: colors.textColor, font: { family: "Outfit" } } }
          },
          scales: {
            x: { grid: { color: colors.gridColor }, ticks: { color: colors.textColor } },
            y: {
              type: "linear",
              display: true,
              position: "left",
              grid: { color: colors.gridColor },
              ticks: { color: colors.textColor },
              title: { display: true, text: "L / 100km", color: colors.textColor }
            },
            y1: {
              type: "linear",
              display: true,
              position: "right",
              grid: { drawOnChartArea: false },
              ticks: { color: colors.textColor, min: 0, max: 100 },
              title: { display: true, text: "Fuel %", color: colors.textColor }
            }
          }
        }
      });
    }

    // 3. Delay Risk Breakdown Chart
    const riskCtx = document.getElementById("riskChart");
    if (riskCtx) {
      this.riskChart = new Chart(riskCtx, {
        type: "doughnut",
        data: {
          labels: ["Low Risk (On Time)", "Moderate Risk", "High Risk (Delayed)"],
          datasets: [
            {
              data: [11, 2, 1],
              backgroundColor: [colors.emerald, colors.amber, colors.rose],
              borderWidth: 0,
              hoverOffset: 6
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: "68%",
          plugins: {
            legend: { position: "bottom", labels: { color: colors.textColor, font: { family: "Outfit" } } }
          }
        }
      });
    }

    // 4. Fleet Speed Distribution Chart
    const speedCtx = document.getElementById("speedChart");
    if (speedCtx) {
      this.speedChart = new Chart(speedCtx, {
        type: "line",
        data: {
          labels: [],
          datasets: [
            {
              label: "Speed (km/h)",
              data: [],
              borderColor: colors.cyan,
              backgroundColor: "rgba(6, 182, 212, 0.15)",
              fill: true,
              borderWidth: 2,
              tension: 0.35,
              pointRadius: 4,
              pointBackgroundColor: colors.cyan
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { labels: { color: colors.textColor, font: { family: "Outfit" } } }
          },
          scales: {
            x: { grid: { color: colors.gridColor }, ticks: { color: colors.textColor } },
            y: { grid: { color: colors.gridColor }, ticks: { color: colors.textColor }, title: { display: true, text: "Speed km/h", color: colors.textColor } }
          }
        }
      });
    }
  }

  updateData(chartPayload) {
    if (!chartPayload) return;

    // Update ETA chart
    if (this.etaChart && chartPayload.eta_comparison) {
      this.etaChart.data.labels = chartPayload.eta_comparison.labels;
      this.etaChart.data.datasets[0].data = chartPayload.eta_comparison.random_forest;
      this.etaChart.data.datasets[1].data = chartPayload.eta_comparison.lstm;
      this.etaChart.update("none");
    }

    // Update Fuel chart
    if (this.fuelChart && chartPayload.fuel_telemetry) {
      this.fuelChart.data.labels = chartPayload.fuel_telemetry.labels;
      this.fuelChart.data.datasets[0].data = chartPayload.fuel_telemetry.fuel_rate;
      this.fuelChart.data.datasets[1].data = chartPayload.fuel_telemetry.fuel_level;
      this.fuelChart.update("none");
    }

    // Update Risk chart
    if (this.riskChart && chartPayload.risk_distribution) {
      this.riskChart.data.datasets[0].data = chartPayload.risk_distribution.data;
      this.riskChart.update("none");
    }

    // Update Speed chart
    if (this.speedChart && chartPayload.speed_telemetry) {
      this.speedChart.data.labels = chartPayload.speed_telemetry.labels;
      this.speedChart.data.datasets[0].data = chartPayload.speed_telemetry.speeds;
      this.speedChart.update("none");
    }
  }
}
