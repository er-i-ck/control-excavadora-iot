/**
 * Controlador de Movimientos (Movement Controller)
 * - Botones de movimiento (Brazo y Diagonales): funcionan como interruptor (al tocarlos de nuevo envían PARAR y se apagan).
 * - Botones auxiliares (Luz, Sonido, Prender/Apagar RC): se iluminan solo durante su pulso temporal y se apagan solos.
 * - Joystick: se mantiene activo al arrastrar y envía PARAR automáticamente al soltar.
 */

import { CONFIG } from "./config.js";
import { apiClient } from "./apiClient.js";
import { uiState } from "./uiState.js";

// Duración exacta de los pulsos físicos en el ESP8266 (en milisegundos)
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
    this.isDemoRunning = false;
    this.onEmergencyStopCallback = null;
  }

  setDemoRunningState(isRunning) {
    this.isDemoRunning = isRunning;
    document.querySelectorAll("[data-command-key]").forEach((btn) => {
      const key = btn.getAttribute("data-command-key");
      if (key !== "PARAR") {
        btn.disabled = isRunning;
      }
    });
  }

  onEmergencyStop(callback) {
    this.onEmergencyStopCallback = callback;
  }

  /**
   * Ejecuta un comando por su clave de catálogo (ej. 'GRUA_BAJAR', 'PARAR', 'LUZ')
   */
  async executeCommand(commandKey, options = { fromJoystick: false, force: false }) {
    const cmdInfo = CONFIG.COMANDOS[commandKey];
    if (!cmdInfo) {
      uiState.showAlert(`Comando no reconocido en catálogo: ${commandKey}`);
      return false;
    }

    // 1. Si es el botón DETENER, ejecutar paro prioritario inmediato
    if (commandKey === "PARAR") {
      return await this.triggerPriorityStop();
    }

    // 2. Impedir comandos manuales mientras corre una DEMO
    if (this.isDemoRunning) {
      uiState.showAlert("Hay una secuencia DEMO en ejecución. Presiona DETENER o Parar antes de usar controles manuales.");
      return false;
    }

    // 3. SI ES UN BOTÓN DE MOVIMIENTO CONTINUO Y YA ESTÁ ILUMINADO -> APAGARLO (Enviar PARAR)
    const isPulseCommand = Object.prototype.hasOwnProperty.call(PULSE_DURATIONS_MS, commandKey);
    if (!options.fromJoystick && !isPulseCommand && this.activeCommandKey === commandKey) {
      return await this.triggerPriorityStop();
    }

    // 4. Control anti-ráfagas para el Joystick
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

    // 5. Distinguir visualmente entre Pulso Temporal y Movimiento Continuo
    if (!isPulseCommand) {
      this.activeCommandKey = commandKey;
      uiState.clearAllButtonStates();
    }

    this.lastSentTimestamp = now;
    const currentSeq = ++this.requestSequence;

    uiState.setButtonState(commandKey, "sending");
    uiState.markCommandRequested(cmdInfo.etiqueta, cmdInfo.id);

    try {
      const res = await apiClient.enviarMovimiento(cmdInfo.id, CONFIG.VEHICULO_ID);

      if (currentSeq !== this.requestSequence && !isPulseCommand) {
        return false;
      }

      uiState.setButtonState(commandKey, "active");
      uiState.markCommandAcceptedByApi(cmdInfo.etiqueta, res.status);

      // Si es un botón de pulso (Luz, Sonido, Prender, Apagar), apagar su iluminación al terminar el pulso
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

  /**
   * Acción prioritaria DETENER:
   * Apaga cualquier movimiento activo en pantalla, cancela DEMO si aplica y envía PARAR (ID 5).
   */
  async triggerPriorityStop() {
    const stopCmd = CONFIG.COMANDOS.PARAR;
    this.activeCommandKey = null;
    const stopSeq = ++this.requestSequence;

    uiState.clearAllButtonStates();
    uiState.setButtonState("PARAR", "sending");
    uiState.setJoystickLabel("Centro · Neutro", false);
    uiState.markCommandRequested(stopCmd.etiqueta, stopCmd.id);

    if (this.isDemoRunning && this.onEmergencyStopCallback) {
      this.onEmergencyStopCallback();
    }

    try {
      const res = await apiClient.enviarMovimiento(stopCmd.id, CONFIG.VEHICULO_ID);
      if (stopSeq === this.requestSequence) {
        uiState.markCommandAcceptedByApi(stopCmd.etiqueta, res.status);
        // Iluminar brevemente DETENER en confirmación y luego dejar todos los botones apagados
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