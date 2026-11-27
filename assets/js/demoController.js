/**
 * Controlador de Secuencias DEMO (demoController.js - v20)
 */

import { apiClient } from "./apiClient.js?v=21";
import { wsClient } from "./wsClient.js?v=21";
import { movementController } from "./movementController.js?v=21";
import { uiState } from "./uiState.js?v=21";
import { sessionStore } from "./sessionStore.js?v=21";

class DemoController {
  constructor() {
    this.selectEl = document.getElementById("select-demo");
    this.previewEl = document.getElementById("demo-steps-preview");
    this.btnStart = document.getElementById("btn-start-demo");
    this.btnCancel = document.getElementById("btn-cancel-demo");

    this.demos = [];
    this.currentDemoDurationMs = 15000;
    this.autoUnlockTimer = null;
    this.initialized = false;
  }

  async init() {
    if (!this.initialized) {
      this._bindEvents();
      movementController.onEmergencyStop(() => {
        if (uiState.isDemoCurrentlyRunning()) {
          this.cancelarDemoActiva(true);
        }
      });
      wsClient.onMessage((payload) => this._handleWsDemoEvents(payload));
      this.initialized = true;
    }
    await this.cargarCatalogoDemos();
  }

  _bindEvents() {
    if (this.selectEl) {
      this.selectEl.addEventListener("change", () => {
        this.mostrarPasosDemo(this.selectEl.value);
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
    const idVehiculo = sessionStore.getActiveVehicleId();

    if (!sessionStore.isAuthenticated() || !idVehiculo) {
      this.demos = [];
      this.selectEl.innerHTML = '<option value="">Selecciona una unidad autorizada</option>';
      if (this.previewEl) this.previewEl.textContent = "Inicia sesión para consultar DEMOs de tu unidad.";
      return;
    }

    if (sessionStore.getRole() === "INVITADO") {
      this.demos = [];
      this.selectEl.innerHTML = '<option value="">Modo Invitado: usa el joystick y DETENER</option>';
      if (this.previewEl) this.previewEl.textContent = "La sesión temporal de invitado permite control manual básico con tiempo limitado.";
      return;
    }

    this.selectEl.innerHTML = '<option value="">Cargando catálogo de DEMOs...</option>';

    try {
      const lista = await apiClient.obtenerDemosVehiculo(idVehiculo);
      this.demos = lista.filter((d) => d.activo !== 0);

      this.selectEl.innerHTML = "";
      if (this.demos.length === 0) {
        this.selectEl.innerHTML = '<option value="">Sin DEMOs para esta unidad (crea una en el Editor)</option>';
        if (this.previewEl) this.previewEl.textContent = "Puedes crear una nueva DEMO desde la pestaña de Administración / Mis Vehículos.";
        return;
      }

      this.demos.forEach((demo) => {
        const opt = document.createElement("option");
        opt.value = String(demo.id_demo);
        const tipoTag = demo.tipo_demo === "PRIVADA" ? "[Privada]" : "[Fábrica]";
        opt.textContent = `${tipoTag} #${demo.id_demo} · ${demo.nombre}`;
        this.selectEl.appendChild(opt);
      });

      this.selectEl.value = String(this.demos[0].id_demo);
      await this.mostrarPasosDemo(this.demos[0].id_demo);
    } catch {
      this.selectEl.innerHTML = '<option value="">No se pudo cargar el catálogo de DEMOs</option>';
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

      const totalMs = pasos.reduce(
        (acc, p) => acc + Number(p.duracion_ms || 0) + Number(p.pausa_ms || 0),
        0
      );
      this.currentDemoDurationMs = Math.max(3000, totalMs);

      this.previewEl.innerHTML = "";
      const lista = document.createElement("div");
      lista.className = "d-flex flex-wrap gap-1";

      pasos.forEach((paso, idx) => {
        const chip = document.createElement("span");
        chip.className = "badge bg-dark text-warning border border-secondary px-2 py-1";
        const nombreCmd = paso.nombre_comando || paso.comando || paso.nombre || `ID ${paso.id_comando}`;
        const orden = paso.orden || idx + 1;
        chip.textContent = `${orden}. ${nombreCmd} (${paso.duracion_ms}ms / pausa ${paso.pausa_ms}ms)`;
        lista.appendChild(chip);
      });

      this.previewEl.appendChild(lista);
    } catch {
      this.previewEl.textContent = "No fue posible obtener el detalle de pasos de esta DEMO.";
    }
  }

  async iniciarDemoSeleccionada() {
    if (uiState.isDemoCurrentlyRunning()) return;
    const idVehiculo = sessionStore.getActiveVehicleId();
    const idDemo = this.selectEl ? this.selectEl.value : "";

    if (!idVehiculo || !idDemo) {
      uiState.showAlert("Selecciona primero una secuencia DEMO del catálogo.");
      return;
    }

    uiState.syncDemoLockState(true, `Ejecutando DEMO #${idDemo}...`, "warning text-dark");
    uiState.markCommandRequested(`Iniciar DEMO #${idDemo}`, idDemo);
    this._programarDesbloqueoRespaldo(this.currentDemoDurationMs + 1500);

    try {
      const res = await apiClient.iniciarDemo(idDemo, idVehiculo);
      uiState.markCommandAcceptedByApi(`DEMO #${idDemo} en curso`, res.status);
    } catch (error) {
      this._clearAutoUnlockTimer();
      uiState.syncDemoLockState(false, "Inactiva", "secondary");
      uiState.showAlert(`No se pudo iniciar la DEMO: ${error.message}`);
    }
  }

  async cancelarDemoActiva(silent = false) {
    this._clearAutoUnlockTimer();
    const idVehiculo = sessionStore.getActiveVehicleId();
    if (!idVehiculo) return;

    try {
      const res = await apiClient.cancelarDemo(idVehiculo);
      uiState.syncDemoLockState(false, "Cancelada", "secondary");
      if (!silent) {
        uiState.markCommandAcceptedByApi("DEMO Cancelada", res.status);
      }
    } catch (error) {
      uiState.syncDemoLockState(false, "Inactiva", "secondary");
      if (!silent) {
        uiState.showAlert(`Error al cancelar DEMO: ${error.message}`);
      }
    }
  }

  _handleWsDemoEvents(payload) {
    const evento = String(payload.evento || "").trim().toUpperCase();
    if (evento === "FIN_DEMO" || evento === "DEMO_FINALIZADA") {
      this._clearAutoUnlockTimer();
      uiState.syncDemoLockState(false, "Finalizada", "success");
    } else if (evento === "DEMO_CANCELADA") {
      this._clearAutoUnlockTimer();
      uiState.syncDemoLockState(false, "Cancelada", "secondary");
    }
  }

  _programarDesbloqueoRespaldo(timeoutMs) {
    this._clearAutoUnlockTimer();
    this.autoUnlockTimer = setTimeout(() => {
      if (uiState.isDemoCurrentlyRunning()) {
        uiState.syncDemoLockState(false, "Finalizada", "success");
      }
    }, timeoutMs);
  }

  _clearAutoUnlockTimer() {
    if (this.autoUnlockTimer) {
      clearTimeout(this.autoUnlockTimer);
      this.autoUnlockTimer = null;
    }
  }
}

export const demoController = new DemoController();
