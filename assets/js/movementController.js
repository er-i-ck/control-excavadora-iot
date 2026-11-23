/**
 * Controlador de Movimientos (movementController.js - v20)
 */

import { CONFIG } from "./config.js?v=20";
import { apiClient } from "./apiClient.js?v=20";
import { uiState } from "./uiState.js?v=20";
import { sessionStore } from "./sessionStore.js?v=20";

const PULSE_DURATIONS_MS = {
  LUZ: 300,
  SONIDO: 300,
  ENCENDER: 500,
  APAGAR: 3000
};

class MovementController {
  constructor() {
    this.activeCommandKey = null;
    this.lastSentTimestamp = 0;
    this.requestSequence = 0;
    this.onEmergencyStopCallback = null;
  }

  get isDemoRunning() {
    return uiState.isDemoCurrentlyRunning();
  }

  setDemoRunningState(isRunning, badgeText = null) {
    uiState.syncDemoLockState(isRunning, badgeText || (isRunning ? "En ejecución" : "Inactiva"));
  }

  onEmergencyStop(callback) {
    this.onEmergencyStopCallback = callback;
  }

  async executeCommand(commandKey, options = { fromJoystick: false, force: false }) {
    const idVehiculo = sessionStore.getActiveVehicleId();
    if (!sessionStore.isAuthenticated() || !idVehiculo) {
      uiState.showAlert("Inicia sesión y selecciona una unidad autorizada antes de operar.");
      return false;
    }

    const cmdInfo = CONFIG.COMANDOS[commandKey];
    if (!cmdInfo) {
      uiState.showAlert(`Comando no reconocido en catálogo: ${commandKey}`);
      return false;
    }

    if (commandKey === "PARAR") {
      return await this.triggerPriorityStop();
    }

    if (!sessionStore.isCommandAllowed(cmdInfo.codigo)) {
      uiState.showAlert(`El comando ${cmdInfo.etiqueta} no está habilitado para esta unidad o rol.`);
      return false;
    }

    if (this.isDemoRunning) {
      uiState.showAlert("Hay una secuencia DEMO en ejecución. Presiona DETENER o Parar antes de usar controles manuales.");
      return false;
    }

    const isPulseCommand = Object.prototype.hasOwnProperty.call(PULSE_DURATIONS_MS, commandKey);
    if (!options.fromJoystick && !isPulseCommand && this.activeCommandKey === commandKey) {
      return await this.triggerPriorityStop();
    }

    const now = Date.now();
    if (
      options.fromJoystick &&
      !options.force &&
      this.activeCommandKey === commandKey &&
      now - this.lastSentTimestamp < CONFIG.JOYSTICK_COOLDOWN_MS
    ) {
      return false;
    }

    if (options.fromJoystick && this.activeCommandKey === commandKey) {
      return false;
    }

    if (!isPulseCommand) {
      this.activeCommandKey = commandKey;
      uiState.clearAllButtonStates();
    }

    this.lastSentTimestamp = now;
    const currentSeq = ++this.requestSequence;

    uiState.setButtonState(commandKey, "sending");
    window.dispatchEvent(new CustomEvent("iot-guest-activity"));
    uiState.markCommandRequested(cmdInfo.etiqueta, cmdInfo.codigo);

    try {
      const res = await apiClient.enviarMovimiento(cmdInfo.codigo, idVehiculo);

      if (currentSeq !== this.requestSequence && !isPulseCommand) {
        return false;
      }

      uiState.setButtonState(commandKey, "active");
      uiState.markCommandAcceptedByApi(cmdInfo.etiqueta, res.status);

      if (isPulseCommand) {
        const pulseMs = PULSE_DURATIONS_MS[commandKey] || 400;
        setTimeout(() => {
          uiState.setButtonState(commandKey, "idle");
        }, pulseMs);
      }

      return true;
    } catch (error) {
      if (currentSeq === this.requestSequence) {
        uiState.setButtonState(commandKey, "error");
        uiState.showAlert(`No se pudo enviar ${cmdInfo.etiqueta}: ${error.message}`);
      }
      return false;
    }
  }

  async triggerPriorityStop() {
    const idVehiculo = sessionStore.getActiveVehicleId();
    if (!sessionStore.isAuthenticated() || !idVehiculo) return false;

    const stopCmd = CONFIG.COMANDOS.PARAR;
    this.activeCommandKey = null;
    const stopSeq = ++this.requestSequence;

    uiState.clearAllButtonStates();
    uiState.setButtonState("PARAR", "sending");
    uiState.setJoystickLabel("Centro · Neutro", false);
    uiState.markCommandRequested(stopCmd.etiqueta, stopCmd.codigo);

    if (this.isDemoRunning && this.onEmergencyStopCallback) {
      this.onEmergencyStopCallback();
    }

    try {
      const res = await apiClient.enviarMovimiento(stopCmd.codigo, idVehiculo);
      if (stopSeq === this.requestSequence) {
        uiState.markCommandAcceptedByApi(stopCmd.etiqueta, res.status);
        uiState.setButtonState("PARAR", "active");
        setTimeout(() => {
          uiState.setButtonState("PARAR", "idle");
        }, 350);
      }
      return true;
    } catch (error) {
      uiState.setButtonState("PARAR", "error");
      uiState.showAlert(`Error al enviar paro prioritario: ${error.message}`);
      return false;
    }
  }
}

export const movementController = new MovementController();

