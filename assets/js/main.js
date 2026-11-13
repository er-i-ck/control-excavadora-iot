/**
 * Punto de Entrada Principal (main.js)
 * Inicializa CONTROL (Práctica 4.1) y MONITOREO (Práctica 4.2) compartiendo
 * una única sesión WSS, el cliente REST y los 3 indicadores de infraestructura.
 */

import { CONFIG } from "./config.js?v=8";
import { apiClient } from "./apiClient.js?v=8";
import { wsClient } from "./wsClient.js?v=8";
import { uiState } from "./uiState.js?v=8";
import { movementController } from "./movementController.js?v=8";
import { JoystickComponent } from "./joystick.js?v=8";
import { demoController } from "./demoController.js?v=8";
import { navigation } from "./navigation.js?v=8";
import { monitorController } from "./monitorController.js?v=8";

class AppInitializer {
  constructor() {
    this.healthTimer = null;
    this.joystick = null;
  }

  async start() {
    // 1. Configurar títulos del vehículo
    const titleEl = document.getElementById("vehicle-title");
    const subEl = document.getElementById("vehicle-subtitle");
    if (titleEl) titleEl.textContent = CONFIG.VEHICULO_NOMBRE;
    if (subEl) subEl.textContent = `ID #${CONFIG.VEHICULO_ID} · Control y Monitoreo WSS/REST`;

    // 2. Inicializar navegación entre CONTROL y MONITOREO (Punto 3.1 y 7.4)
    navigation.init();
    navigation.onViewChange((vistaActiva) => {
      if (vistaActiva === "monitor") {
        monitorController.sincronizarTodoPorRest(false);
      }
    });

    // 3. Inicializar Joystick circular y botones de CONTROL (Práctica 4.1 intacta)
    this.joystick = new JoystickComponent("joystick-zone", "joystick-knob");
    this._bindActionButtons();

    // 4. Abrir la conexión WebSocket Segura (WSS) única compartida (Punto 6.2 y 8.1)
    wsClient.connect(CONFIG.VEHICULO_ID);

    // 5. Comprobación inicial y periódica de salud AWS y RDS (Punto 6.3)
    await this.checkInfrastructureHealth();
    this.healthTimer = setInterval(
      () => this.checkInfrastructureHealth(),
      CONFIG.HEALTH_POLL_INTERVAL_MS
    );

    // 6. Inicializar módulo de MONITOREO (Práctica 4.2) y módulo de DEMO (Práctica 4.1)
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