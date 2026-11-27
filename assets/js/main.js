/**
 * Punto de Entrada Integrado: CONTROL + MONITOREO + ADMINISTRACIÓN (main.js - v20)
 */

import { CONFIG } from "./config.js?v=21";
import { apiClient } from "./apiClient.js?v=21";
import { wsClient } from "./wsClient.js?v=21";
import { uiState } from "./uiState.js?v=21";
import { movementController } from "./movementController.js?v=21";
import { JoystickComponent } from "./joystick.js?v=21";
import { demoController } from "./demoController.js?v=21";
import { navigation } from "./navigation.js?v=21";
import { monitorController } from "./monitorController.js?v=21";
import { sessionStore } from "./sessionStore.js?v=21";
import { adminController } from "./adminController.js?v=21";

class AppInitializer {
  constructor() {
    this.healthTimer = null;
    this.joystick = null;
  }

  async start() {
    navigation.init();
    adminController.init();

    adminController.configureCallbacks({
      onSessionReady: () => this.onSessionAuthenticated(),
      onVehicleSelected: (id) => this.selectActiveVehicle(id),
      onDemosUpdated: () => demoController.cargarCatalogoDemos(),
      onLogout: (skipRemote) => this.handleLogout(skipRemote)
    });

    apiClient.onUnauthorized((msg) => {
      this.handleLogout(true, msg || "Tu sesión expiró. Inicia sesión nuevamente.");
    });

    navigation.onViewChange((vistaActiva) => {
      if (vistaActiva === "monitor" && sessionStore.isAuthenticated()) {
        monitorController.sincronizarTodoPorRest(false);
      }
      if (vistaActiva === "control" && sessionStore.isAuthenticated()) {
        demoController.cargarCatalogoDemos();
      }
    });

    this.joystick = new JoystickComponent("joystick-zone", "joystick-knob");
    this._bindGlobalControls();

    // Diagnóstico real AWS y RDS en paralelo sin requerir sesión previa
    await this.checkInfrastructureHealth();
    this.healthTimer = setInterval(
      () => this.checkInfrastructureHealth(),
      CONFIG.HEALTH_POLL_INTERVAL_MS
    );

    // Restaurar sesión vigente si existe token en sessionStorage
    if (sessionStore.getToken()) {
      try {
        const perfil = await apiClient.obtenerPerfilActual();
        sessionStore.setSession(sessionStore.getToken(), perfil);
        await this.onSessionAuthenticated();
      } catch {
        sessionStore.clearSession();
        await this.renderUnauthenticatedState();
      }
    } else {
      await this.renderUnauthenticatedState();
    }
  }

  _bindGlobalControls() {
    document.querySelectorAll("[data-command-key]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const commandKey = btn.getAttribute("data-command-key");
        movementController.executeCommand(commandKey, { fromJoystick: false, force: true });
      });
    });

    document.getElementById("btn-refresh-health")?.addEventListener("click", () => {
      this.checkInfrastructureHealth(true);
      if (navigation.currentView === "monitor" && sessionStore.isAuthenticated()) {
        monitorController.sincronizarTodoPorRest(true);
      }
    });

    document.getElementById("btn-header-login")?.addEventListener("click", () => {
      navigation.switchView("admin");
      document.getElementById("login-correo")?.focus();
    });

    document.getElementById("btn-header-logout")?.addEventListener("click", () => {
      if (sessionStore.getRole() === "INVITADO") {
        adminController.finalizarPruebaInvitado(false);
      } else {
        this.handleLogout(false);
      }
    });

    document.getElementById("header-vehicle-select")?.addEventListener("change", (e) => {
      const id = Number(e.target.value);
      if (id) this.selectActiveVehicle(id);
    });
  }

  async onSessionAuthenticated() {
    const actor = sessionStore.getActor();
    navigation.updateTabLabels(actor.rol);
    this._updateHeaderSessionUI();

    try {
      const misVehiculos = await apiClient.obtenerMisVehiculos();
      sessionStore.setVehicles(misVehiculos);
    } catch {
      sessionStore.setVehicles([]);
    }

    this._renderHeaderVehicleSelector();
    await this._syncActiveVehicleContext();
    await adminController.syncForSession();

    // Vista inicial cómoda por rol: Usuario directo a Control si tiene unidad; Admin a Administración
    if (actor.rol === "USUARIO" && sessionStore.getActiveVehicleId()) {
      navigation.switchView("control");
    } else if (actor.rol === "INVITADO") {
      navigation.switchView("control");
    } else {
      navigation.switchView("admin");
    }
  }

  async selectActiveVehicle(idVehiculo) {
    sessionStore.setActiveVehicleId(idVehiculo);
    const sel = document.getElementById("header-vehicle-select");
    if (sel) sel.value = String(idVehiculo);
    await this._syncActiveVehicleContext();
  }

  async _syncActiveVehicleContext() {
    const activeVeh = sessionStore.getActiveVehicle();
    const activeId = sessionStore.getActiveVehicleId();
    const titleEl = document.getElementById("vehicle-title");
    const subEl = document.getElementById("vehicle-subtitle");

    if (activeVeh && activeId) {
      if (titleEl) titleEl.textContent = `${activeVeh.nombre} · ${activeVeh.codigo_serie}`;
      if (subEl) subEl.textContent = `ID #${activeId} · ${activeVeh.modelo_nombre || "IoT"} · WSS/REST`;

      uiState.applyAllowedCommands(
        sessionStore.getAllowedCommandCodes(),
        sessionStore.getRole() === "INVITADO"
      );
      wsClient.switchVehicle(activeId);

      await Promise.allSettled([
        monitorController.init().then(() => monitorController.cambiarVehiculo()),
        demoController.init()
      ]);
    } else {
      if (titleEl) titleEl.textContent = CONFIG.VEHICULO_NOMBRE;
      if (subEl) subEl.textContent = "Sin unidad operativa seleccionada";
      wsClient.disconnect();
      uiState.applyAllowedCommands([], false);
    }
  }

  async renderUnauthenticatedState() {
    wsClient.disconnect();
    navigation.updateTabLabels(null);
    this._updateHeaderSessionUI();
    this._renderHeaderVehicleSelector();

    const titleEl = document.getElementById("vehicle-title");
    const subEl = document.getElementById("vehicle-subtitle");
    if (titleEl) titleEl.textContent = CONFIG.VEHICULO_NOMBRE;
    if (subEl) subEl.textContent = "Inicia sesión o reserva una unidad de exhibición";

    uiState.applyAllowedCommands([], false);
    await adminController.syncForSession();
    navigation.switchView("admin");
  }

  async handleLogout(skipRemote = false, feedbackMsg = null) {
    wsClient.disconnect();
    if (!skipRemote && sessionStore.getToken()) {
      await apiClient.logout();
    }
    sessionStore.clearSession();
    await this.renderUnauthenticatedState();
    if (feedbackMsg) {
      adminController.showFeedback(feedbackMsg, "warning");
    }
  }

  _updateHeaderSessionUI() {
    const actor = sessionStore.getActor();
    const badge = document.getElementById("header-role-badge");
    const nameEl = document.getElementById("header-user-name");
    const btnLogin = document.getElementById("btn-header-login");
    const btnLogout = document.getElementById("btn-header-logout");

    if (!actor) {
      if (badge) {
        badge.textContent = "SIN SESIÓN";
        badge.className = "badge bg-secondary badge-xs";
      }
      if (nameEl) nameEl.textContent = "Acceso público / Invitado";
      btnLogin?.classList.remove("d-none");
      btnLogout?.classList.add("d-none");
      return;
    }

    const colorMap = {
      ADMIN: "bg-warning text-dark",
      USUARIO: "bg-info text-dark",
      INVITADO: "bg-success"
    };
    if (badge) {
      badge.textContent = actor.rol;
      badge.className = `badge ${colorMap[actor.rol] || "bg-secondary"} badge-xs`;
    }
    if (nameEl) nameEl.textContent = actor.nombre || actor.correo || "Invitado";
    btnLogin?.classList.add("d-none");
    btnLogout?.classList.remove("d-none");
  }

  _renderHeaderVehicleSelector() {
    const sel = document.getElementById("header-vehicle-select");
    if (!sel) return;
    const vehs = sessionStore.getVehicles();
    if (!sessionStore.isAuthenticated() || vehs.length === 0) {
      sel.classList.add("d-none");
      sel.innerHTML = "";
      return;
    }
    const activeId = Number(sessionStore.getActiveVehicleId());
    sel.innerHTML = vehs
      .map((v) => `<option value="${v.id_vehiculo}" ${Number(v.id_vehiculo) === activeId ? "selected" : ""}>#${v.id_vehiculo} · ${v.codigo_serie} (${v.nombre})</option>`)
      .join("");
    sel.classList.remove("d-none");
  }

  async checkInfrastructureHealth(showCheckingState = false) {
    if (showCheckingState) {
      uiState.setAwsStatus("CHECKING");
    }
    const result = await apiClient.verificarInfraestructura();
    uiState.setAwsStatus(result.aws);
    uiState.setRdsStatus(result.rds);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const app = new AppInitializer();
  app.start();
});
