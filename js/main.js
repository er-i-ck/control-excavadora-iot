/**
 * Punto de Entrada Principal (main.js)
 * Inicializa la interfaz responsiva, el cliente WSS, la comprobación periódica de salud AWS/RDS,
 * el Joystick táctil/mouse, los botones de movimiento y el controlador de DEMO.
 */

import { CONFIG } from "./config.js";
import { apiClient } from "./apiClient.js";
import { wsClient } from "./wsClient.js";
import { uiState } from "./uiState.js";
import { movementController } from "./movementController.js";
import { JoystickComponent } from "./joystick.js";
import { demoController } from "./demoController.js";

class AppInitializer {
  constructor() {
    this.healthTimer = null;
    this.joystick = null;
  }

  async start() {
    // 1. Configurar títulos del vehículo desde CONFIG
    const titleEl = document.getElementById("vehicle-title");
    const subEl = document.getElementById("vehicle-subtitle");
    if (titleEl) titleEl.textContent = CONFIG.VEHICULO_NOMBRE;
    if (subEl) subEl.textContent = `ID Vehículo: #${CONFIG.VEHICULO_ID} · WSS & REST API (21 servicios)`;

    // 2. Inicializar Joystick circular (Punto 4)
    this.joystick = new JoystickComponent("joystick-zone", "joystick-knob");

    // 3. Vincular todos los botones de movimiento y DETENER a la misma lógica (Punto 5.2)
    this._bindActionButtons();

    // 4. Iniciar conexión WebSocket Seguro (WSS) en tiempo real (Puntos 6.2 y 8.1)
    wsClient.connect(CONFIG.VEHICULO_ID);

    // 5. Ejecutar diagnóstico inicial de AWS y RDS y programar sondeo controlado (Punto 6.3)
    await this.checkInfrastructureHealth();
    this.healthTimer = setInterval(
      () => this.checkInfrastructureHealth(),
      CONFIG.HEALTH_POLL_INTERVAL_MS
    );

    // 6. Inicializar catálogo de secuencias DEMO (Punto 9)
    await demoController.init();

    // 7. Sincronizar catálogo de comandos desde la API (Punto 7.2)
    this._verifyCatalogCommands();
  }

  _bindActionButtons() {
    // Todos los botones con data-command-key invocan movementController (Punto 5.2)
    document.querySelectorAll("[data-command-key]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const commandKey = btn.getAttribute("data-command-key");
        movementController.executeCommand(commandKey, { fromJoystick: false, force: true });
      });
    });

    // Botón de verificación manual de servicios en el encabezado
    const btnRefresh = document.getElementById("btn-refresh-health");
    if (btnRefresh) {
      btnRefresh.addEventListener("click", () => this.checkInfrastructureHealth(true));
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
      // Silencioso: el indicador de AWS/RDS ya reporta cualquier caída de red
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const app = new AppInitializer();
  app.start();
});