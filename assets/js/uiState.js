/**
 * Módulo de Estado de Interfaz (UI State - v12)
 * Gestiona los 3 indicadores de infraestructura (WSS, AWS, RDS),
 * la barra de evidencia de 3 pasos y el bloqueo/desbloqueo directo de DEMO.
 */

class UIStateManager {
  constructor() {
    this.badgeWs = document.getElementById("badge-ws");
    this.iconWs = document.getElementById("icon-ws");
    this.textWs = document.getElementById("text-ws");

    this.badgeAws = document.getElementById("badge-aws");
    this.iconAws = document.getElementById("icon-aws");
    this.textAws = document.getElementById("text-aws");

    this.badgeRds = document.getElementById("badge-rds");
    this.iconRds = document.getElementById("icon-rds");
    this.textRds = document.getElementById("text-rds");

    this.traceRequested = document.getElementById("trace-requested");
    this.traceApi = document.getElementById("trace-api");
    this.traceWs = document.getElementById("trace-ws");
    this.alertBox = document.getElementById("alert-box");

    this.joystickBadge = document.getElementById("joystick-direction-badge");
    this.demoBadge = document.getElementById("demo-status-badge");
  }

  _updatePill(badgeEl, iconEl, textEl, statusClass, iconClass, textValue) {
    if (!badgeEl || !iconEl || !textEl) return;
    badgeEl.className = `status-pill ${statusClass}`;
    iconEl.className = `bi ${iconClass}`;
    textEl.textContent = textValue;
  }

  setWsStatus(state) {
    switch (state) {
      case "ONLINE":
        this._updatePill(this.badgeWs, this.iconWs, this.textWs, "status-online", "bi-broadcast-pin", "En línea");
        break;
      case "CONNECTING":
        this._updatePill(this.badgeWs, this.iconWs, this.textWs, "status-checking", "bi-arrow-repeat spin-icon", "Conectando...");
        break;
      case "RECONNECTING":
        this._updatePill(this.badgeWs, this.iconWs, this.textWs, "status-checking", "bi-arrow-repeat spin-icon", "Reconectando...");
        break;
      default:
        this._updatePill(this.badgeWs, this.iconWs, this.textWs, "status-offline", "bi-wifi-off", "Desconectado");
        break;
    }
  }

  setAwsStatus(state) {
    switch (state) {
      case "AVAILABLE":
        this._updatePill(this.badgeAws, this.iconAws, this.textAws, "status-online", "bi-cloud-check-fill", "Disponible");
        break;
      case "CHECKING":
        this._updatePill(this.badgeAws, this.iconAws, this.textAws, "status-checking", "bi-arrow-repeat spin-icon", "Comprobando...");
        break;
      default:
        this._updatePill(this.badgeAws, this.iconAws, this.textAws, "status-offline", "bi-cloud-slash-fill", "No disponible");
        break;
    }
  }

  setRdsStatus(state) {
    switch (state) {
      case "AVAILABLE":
        this._updatePill(this.badgeRds, this.iconRds, this.textRds, "status-online", "bi-database-fill-check", "Disponible");
        break;
      case "UNAVAILABLE":
        this._updatePill(this.badgeRds, this.iconRds, this.textRds, "status-offline", "bi-database-fill-x", "No disponible");
        break;
      default:
        this._updatePill(this.badgeRds, this.iconRds, this.textRds, "status-unverified", "bi-database-exclamation", "Sin verificar");
        break;
    }
  }

  markCommandRequested(etiquetaComando, idComando) {
    const hora = new Date().toLocaleTimeString();
    if (this.traceRequested) {
      this.traceRequested.textContent = `${etiquetaComando} (ID ${idComando}) · ${hora}`;
      this.traceRequested.className = "telemetry-value text-warning";
    }
    if (this.traceApi) {
      this.traceApi.textContent = "Enviando POST...";
      this.traceApi.className = "telemetry-value text-secondary";
    }
    this.clearAlert();
  }

  markCommandAcceptedByApi(etiquetaComando, httpStatus = 200) {
    const hora = new Date().toLocaleTimeString();
    if (this.traceApi) {
      this.traceApi.textContent = `HTTP ${httpStatus} OK (${etiquetaComando}) · ${hora}`;
      this.traceApi.className = "telemetry-value text-success";
    }
  }

  markWsEventReceived(detalleEvento) {
    const hora = new Date().toLocaleTimeString();
    if (this.traceWs) {
      this.traceWs.textContent = `${detalleEvento} · ${hora}`;
      this.traceWs.className = "telemetry-value text-info";
    }
  }

  setJoystickLabel(texto, activo = false) {
    if (!this.joystickBadge) return;
    this.joystickBadge.textContent = texto;
    this.joystickBadge.className = activo
      ? "badge bg-warning text-dark fw-bold badge-xs"
      : "badge bg-dark border border-secondary text-light badge-xs";
  }

  setDemoStatus(texto, style = "secondary") {
    if (!this.demoBadge) return;
    this.demoBadge.textContent = texto;
    this.demoBadge.className = `badge bg-${style} badge-xs`;
  }

  /**
   * Sincroniza directamente en el DOM el estado de bloqueo/desbloqueo de la DEMO.
   * Garantiza que al llegar FIN_DEMO o DEMO_CANCELADA por WSS, el joystick y los botones
   * queden libres inmediatamente.
   */
  syncDemoLockState(isRunning, badgeText, badgeStyle = null) {
    document.body.dataset.demoRunning = isRunning ? "true" : "false";

    const btnStart = document.getElementById("btn-start-demo");
    const btnCancel = document.getElementById("btn-cancel-demo");
    const selectDemo = document.getElementById("select-demo");

    if (btnStart) btnStart.disabled = isRunning;
    if (selectDemo) selectDemo.disabled = isRunning;
    if (btnCancel) btnCancel.disabled = !isRunning;

    document.querySelectorAll("[data-command-key]").forEach((btn) => {
      const key = btn.getAttribute("data-command-key");
      if (key !== "PARAR") {
        btn.disabled = isRunning;
      }
    });

    const computedStyle =
      badgeStyle || (isRunning ? "warning text-dark" : badgeText === "Finalizada" ? "success" : "secondary");
    this.setDemoStatus(badgeText, computedStyle);

    if (!isRunning) {
      this.clearAlert();
    }
  }

  isDemoCurrentlyRunning() {
    return document.body.dataset.demoRunning === "true";
  }

  setButtonState(commandKey, state) {
    const buttons = document.querySelectorAll(`[data-command-key="${commandKey}"]`);
    buttons.forEach((btn) => {
      btn.classList.remove("is-sending", "is-active", "is-error");
      if (state === "sending") btn.classList.add("is-sending");
      if (state === "active") btn.classList.add("is-active");
      if (state === "error") btn.classList.add("is-error");
    });
  }

  clearAllButtonStates() {
    document.querySelectorAll("[data-command-key]").forEach((btn) => {
      btn.classList.remove("is-sending", "is-active", "is-error");
    });
  }

  showAlert(mensaje) {
    if (!this.alertBox) return;
    this.alertBox.textContent = mensaje;
    this.alertBox.classList.remove("d-none");
  }

  clearAlert() {
    if (!this.alertBox) return;
    this.alertBox.textContent = "";
    this.alertBox.classList.add("d-none");
  }
}

export const uiState = new UIStateManager();