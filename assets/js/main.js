/**
 * Punto de Entrada Principal (main.js - v15)
 */

import { CONFIG } from "./config.js?v=15";
import { apiClient } from "./apiClient.js?v=15";
import { wsClient } from "./wsClient.js?v=15";
import { uiState } from "./uiState.js?v=15";
import { movementController } from "./movementController.js?v=15";
import { JoystickComponent } from "./joystick.js?v=15";
import { demoController } from "./demoController.js?v=15";
import { navigation } from "./navigation.js?v=15";
import { monitorController } from "./monitorController.js?v=15";

class AppInitializer {
  constructor() {
    this.healthTimer = null;
    this.joystick = null;
  }

  async start() {
    const titleEl = document.getElementById("vehicle-title");
    const subEl = document.getElementById("vehicle-subtitle");
    if (titleEl) titleEl.textContent = CONFIG.VEHICULO_NOMBRE;
    if (subEl) subEl.textContent = `ID #${CONFIG.VEHICULO_ID} · Control y Monitoreo WSS/REST`;

    navigation.init();
    navigation.onViewChange((vistaActiva) => {
      if (vistaActiva === "monitor") {
        monitorController.sincronizarTodoPorRest(false);
      }
    });

    this.joystick = new JoystickComponent("joystick-zone", "joystick-knob");
    this._bindActionButtons();

    wsClient.connect(CONFIG.VEHICULO_ID);

    await this.checkInfrastructureHealth();
    this.healthTimer = setInterval(
      () => this.checkInfrastructureHealth(),
      CONFIG.HEALTH_POLL_INTERVAL_MS
    );

    await Promise.allSettled([
      monitorController.init(),
      demoController.init(),
      this._verifyCatalogCommands()
    ]);
  }

  _bindActionButtons() {
    document.querySelectorAll("[data-command-key]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const commandKey = btn.getAttribute("data-command-key");
        movementController.executeCommand(commandKey, { fromJoystick: false, force: true });
      });
    });

    const btnRefresh = document.getElementById("btn-refresh-health");
    if (btnRefresh) {
      btnRefresh.addEventListener("click", () => {
        this.checkInfrastructureHealth(true);
        if (navigation.currentView === "monitor") {
          monitorController.sincronizarTodoPorRest(true);
        }
      });
    }
  }

  async checkInfrastructureHealth(showCheckingState = false) {
    if (showCheckingState) {
      uiState.setAwsStatus("CHECKING");
    }

    const result = await apiClient.verificarInfraestructura(CONFIG.VEHICULO_ID);
    uiState.setAwsStatus(result.aws);
    uiState.setRdsStatus(result.rds);
  }

  async _verifyCatalogCommands() {
    try {
      await apiClient.obtenerComandosVehiculo(CONFIG.VEHICULO_ID);
    } catch {
      // Manejado por el indicador de salud AWS/RDS
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const app = new AppInitializer();
  app.start();
});