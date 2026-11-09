/**
 * Controlador de Secuencias DEMO (Demo Controller)
 * Gestiona la consulta del catálogo de DEMOs en RDS, previsualización de pasos,
 * ejecución asíncrona, prevención de doble inicio y cancelación.
 */

import { CONFIG } from "./config.js";
import { apiClient } from "./apiClient.js";
import { wsClient } from "./wsClient.js";
import { movementController } from "./movementController.js";
import { uiState } from "./uiState.js";

class DemoController {
  constructor() {
    this.selectEl = document.getElementById("select-demo");
    this.previewEl = document.getElementById("demo-steps-preview");
    this.btnStart = document.getElementById("btn-start-demo");
    this.btnCancel = document.getElementById("btn-cancel-demo");

    this.demos = [];
    this.isRunning = false;
  }

  async init() {
    this._bindEvents();
    await this.cargarCatalogoDemos();

    // Si el usuario presiona el botón rojo DETENER prioritario mientras corre una DEMO, cancelarla
    movementController.onEmergencyStop(() => {
      if (this.isRunning) {
        this.cancelarDemoActiva(true);
      }
    });

    // Escuchar eventos WSS para saber cuándo avanza o termina la DEMO en el servidor (Punto 9.3)
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
        emptyOpt.textContent = "No hay secuencias DEMO registradas para este vehículo";
        this.selectEl.appendChild(emptyOpt);
        return;
      }

      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "-- Selecciona una secuencia DEMO --";
      this.selectEl.appendChild(placeholder);

      // Punto 10.5: Representación segura en el DOM usando textContent
      this.demos.forEach((demo) => {
        const opt = document.createElement("option");
        opt.value = String(demo.id_demo);
        opt.textContent = `#${demo.id_demo} · ${demo.nombre} (${demo.descripcion || "Secuencia IoT"})`;
        this.selectEl.appendChild(opt);
      });

      // Seleccionar la primera por comodidad y mostrar sus pasos
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
      this.previewEl.textContent = "Selecciona una DEMO para ver su secuencia de movimientos programados.";
      return;
    }

    this.previewEl.textContent = "Consultando pasos de la secuencia...";
    try {
      const pasos = await apiClient.obtenerMovimientosDemo(idDemo);
      if (!pasos || pasos.length === 0) {
        this.previewEl.textContent = "Esta DEMO aún no tiene pasos asignados en la base de datos.";
        return;
      }

      // Construir lista segura en el DOM (Punto 10.5)
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

  // Punto 9.2 y 9.4: Iniciar DEMO e impedir que se inicie dos veces
  async iniciarDemoSeleccionada() {
    if (this.isRunning) return;

    const idDemo = this.selectEl ? this.selectEl.value : "";
    if (!idDemo) {
      uiState.showAlert("Selecciona primero una secuencia DEMO del catálogo.");
      return;
    }

    this._setRunningUIState(true, `Ejecutando DEMO #${idDemo}...`);
    uiState.markCommandRequested(`Iniciar DEMO #${idDemo}`, idDemo);

    try {
      const res = await apiClient.iniciarDemo(idDemo, CONFIG.VEHICULO_ID);
      uiState.markCommandAcceptedByApi(`DEMO #${idDemo} en curso`, res.status);
    } catch (error) {
      this._setRunningUIState(false, "Inactiva");
      uiState.showAlert(`No se pudo iniciar la DEMO: ${error.message}`);
    }
  }

  async cancelarDemoActiva(silent = false) {
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
    const evento = payload.evento || "";
    if (evento === "INICIO_DEMO") {
      this._setRunningUIState(true, "En ejecución (WSS)");
    } else if (evento === "MOVIMIENTO_DEMO") {
      const cmdLabel = payload.comando || `Comando #${payload.id_comando}`;
      this._setRunningUIState(true, `Paso: ${cmdLabel}`);
    } else if (evento === "FIN_DEMO") {
      this._setRunningUIState(false, "Finalizada");
    } else if (evento === "DEMO_CANCELADA") {
      this._setRunningUIState(false, "Cancelada");
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