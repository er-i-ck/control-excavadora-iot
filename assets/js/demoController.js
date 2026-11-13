/**
 * Controlador de Secuencias DEMO (Demo Controller)
 * Escucha la misma instancia compartida de WebSocket (?v=8) y libera
 * automáticamente el Joystick y los botones en cuanto concluye la DEMO.
 */

import { CONFIG } from "./config.js?v=8";
import { apiClient } from "./apiClient.js?v=8";
import { wsClient } from "./wsClient.js?v=8";
import { movementController } from "./movementController.js?v=8";
import { uiState } from "./uiState.js?v=8";

class DemoController {
  constructor() {
    this.selectEl = document.getElementById("select-demo");
    this.previewEl = document.getElementById("demo-steps-preview");
    this.btnStart = document.getElementById("btn-start-demo");
    this.btnCancel = document.getElementById("btn-cancel-demo");

    this.demos = [];
    this.isRunning = false;
    this.currentDemoDurationMs = 15000;
    this.autoUnlockTimer = null;
  }

  async init() {
    this._bindEvents();
    await this.cargarCatalogoDemos();

    movementController.onEmergencyStop(() => {
      if (this.isRunning) {
        this.cancelarDemoActiva(true);
      }
    });

    wsClient.onMessage((payload) => this._handleWsDemoEvents(payload));
  }

  _bindEvents() {
    if (this.selectEl) {
      this.selectEl.addEventListener("change", () => {
        const idDemo = this.selectEl.value;
        this.mostrarPasosDemo(idDemo);
      });
    }

    if (this.btnStart) {
      this.btnStart.addEventListener("click", () => this.iniciarDemoSeleccionada());
    }

    if (this.btnCancel) {
      this.btnCancel.addEventListener("click", () => this.cancelarDemoActiva(false));
    }
  }

  async cargarCatalogoDemos() {
    if (!this.selectEl) return;
    this.selectEl.innerHTML = "";

    const defaultOpt = document.createElement("option");
    defaultOpt.value = "";
    defaultOpt.textContent = "Cargando catálogo de DEMOs...";
    this.selectEl.appendChild(defaultOpt);

    try {
      const lista = await apiClient.obtenerDemosVehiculo(CONFIG.VEHICULO_ID);
      this.demos = lista.filter((d) => d.activo !== 0);

      this.selectEl.innerHTML = "";
      if (this.demos.length === 0) {
        const emptyOpt = document.createElement("option");
        emptyOpt.value = "";
        emptyOpt.textContent = "No hay secuencias DEMO registradas";
        this.selectEl.appendChild(emptyOpt);
        return;
      }

      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "-- Selecciona una secuencia DEMO --";
      this.selectEl.appendChild(placeholder);

      this.demos.forEach((demo) => {
        const opt = document.createElement("option");
        opt.value = String(demo.id_demo);
        opt.textContent = `#${demo.id_demo} · ${demo.nombre} (${demo.descripcion || "Secuencia IoT"})`;
        this.selectEl.appendChild(opt);
      });

      this.selectEl.value = String(this.demos[0].id_demo);
      await this.mostrarPasosDemo(this.demos[0].id_demo);
    } catch {
      this.selectEl.innerHTML = "";
      const errOpt = document.createElement("option");
      errOpt.value = "";
      errOpt.textContent = "No se pudo cargar el catálogo de DEMOs";
      this.selectEl.appendChild(errOpt);
    }
  }

  async mostrarPasosDemo(idDemo) {
    if (!this.previewEl) return;
    if (!idDemo) {
      this.previewEl.textContent = "Selecciona una DEMO para ver sus pasos.";
      return;
    }

    this.previewEl.textContent = "Consultando pasos de la secuencia...";
    try {
      const pasos = await apiClient.obtenerMovimientosDemo(idDemo);
      if (!pasos || pasos.length === 0) {
        this.previewEl.textContent = "Esta DEMO no tiene pasos asignados.";
        this.currentDemoDurationMs = 5000;
        return;
      }

      // Calcular duración total de los pasos para el desbloqueo automático de seguridad
      const totalMs = pasos.reduce(
        (acc, p) => acc + Number(p.duracion_ms || 0) + Number(p.pausa_ms || 0),
        0
      );
      this.currentDemoDurationMs = Math.max(3000, totalMs);

      this.previewEl.innerHTML = "";
      const listaOl = document.createElement("div");
      listaOl.className = "d-flex flex-wrap gap-1";

      pasos.forEach((paso, idx) => {
        const chip = document.createElement("span");
        chip.className = "badge bg-dark text-warning border border-secondary px-2 py-1";
        const nombreCmd = paso.comando || paso.nombre || `ID ${paso.id_comando}`;
        const orden = paso.orden || idx + 1;
        chip.textContent = `${orden}. ${nombreCmd} (${paso.duracion_ms}ms / pausa ${paso.pausa_ms}ms)`;
        listaOl.appendChild(chip);
      });

      this.previewEl.appendChild(listaOl);
    } catch {
      this.previewEl.textContent = "No fue posible obtener el detalle de pasos de esta DEMO.";
    }
  }

  async iniciarDemoSeleccionada() {
    if (this.isRunning) return;

    const idDemo = this.selectEl ? this.selectEl.value : "";
    if (!idDemo) {
      uiState.showAlert("Selecciona primero una secuencia DEMO del catálogo.");
      return;
    }

    this._setRunningUIState(true, `Ejecutando DEMO #${idDemo}...`);
    uiState.markCommandRequested(`Iniciar DEMO #${idDemo}`, idDemo);

    // Temporizador de respaldo basado en la suma de duraciones de la DEMO + margen de 1.5s
    this._programarDesbloqueoRespaldo(this.currentDemoDurationMs + 1500);

    try {
      const res = await apiClient.iniciarDemo(idDemo, CONFIG.VEHICULO_ID);
      if (this.isRunning) {
        uiState.markCommandAcceptedByApi(`DEMO #${idDemo} en curso`, res.status);
      }
    } catch (error) {
      this._clearAutoUnlockTimer();
      this._setRunningUIState(false, "Inactiva");
      uiState.showAlert(`No se pudo iniciar la DEMO: ${error.message}`);
    }
  }

  async cancelarDemoActiva(silent = false) {
    this._clearAutoUnlockTimer();
    try {
      const res = await apiClient.cancelarDemo(CONFIG.VEHICULO_ID);
      this._setRunningUIState(false, "Cancelada");
      if (!silent) {
        uiState.markCommandAcceptedByApi("DEMO Cancelada", res.status);
      }
    } catch (error) {
      this._setRunningUIState(false, "Inactiva");
      if (!silent) {
        uiState.showAlert(`Error al cancelar DEMO: ${error.message}`);
      }
    }
  }

  _handleWsDemoEvents(payload) {
    const evento = (payload.evento || "").toUpperCase();

    if (evento === "INICIO_DEMO") {
      this._setRunningUIState(true, "En ejecución (WSS)");
    } else if (evento === "MOVIMIENTO_DEMO") {
      const cmdLabel = payload.comando || `Comando #${payload.id_comando}`;
      this._setRunningUIState(true, `Paso: ${cmdLabel}`);
    } else if (
      evento === "FIN_DEMO" ||
      evento === "DEMO_FINALIZADA" ||
      evento === "DEMO_COMPLETADA"
    ) {
      this._clearAutoUnlockTimer();
      this._setRunningUIState(false, "Finalizada");
      uiState.clearAlert();
    } else if (evento === "DEMO_CANCELADA") {
      this._clearAutoUnlockTimer();
      this._setRunningUIState(false, "Cancelada");
      uiState.clearAlert();
    }
  }

  _programarDesbloqueoRespaldo(timeoutMs) {
    this._clearAutoUnlockTimer();
    this.autoUnlockTimer = setTimeout(() => {
      if (this.isRunning) {
        this._setRunningUIState(false, "Finalizada");
        uiState.clearAlert();
      }
    }, timeoutMs);
  }

  _clearAutoUnlockTimer() {
    if (this.autoUnlockTimer) {
      clearTimeout(this.autoUnlockTimer);
      this.autoUnlockTimer = null;
    }
  }

  _setRunningUIState(running, badgeText) {
    this.isRunning = running;
    movementController.setDemoRunningState(running);

    if (this.btnStart) this.btnStart.disabled = running;
    if (this.selectEl) this.selectEl.disabled = running;
    if (this.btnCancel) this.btnCancel.disabled = !running;

    const badgeStyle = running ? "warning text-dark" : badgeText === "Finalizada" ? "success" : "secondary";
    uiState.setDemoStatus(badgeText, badgeStyle);
  }
}

export const demoController = new DemoController();