/**
 * Controlador de Movimientos (Movement Controller)
 * Unifica la lógica de negocio para el Joystick y los botones complementarios.
 * Garantiza prioridad absoluta para DETENER y evita condiciones de carrera o ráfagas.
 */

import { CONFIG } from "./config.js";
import { apiClient } from "./apiClient.js";
import { uiState } from "./uiState.js";

class MovementController {
  constructor() {
    this.activeCommandKey = null;
    this.lastSentTimestamp = 0;
    this.requestSequence = 0; // Evita que respuestas HTTP viejas pisen a DETENER (Punto 5.4)
    this.isDemoRunning = false;
    this.onEmergencyStopCallback = null;
  }

  setDemoRunningState(isRunning) {
    this.isDemoRunning = isRunning;
    // Bloquear botones de movimiento mientras corre una DEMO, excepto DETENER (Puntos 5.4 y 9.4)
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
   * Ejecuta un comando por su clave de catálogo (ej. 'AVANZAR', 'PARAR', 'LUZ')
   */
  async executeCommand(commandKey, options = { fromJoystick: false, force: false }) {
    const cmdInfo = CONFIG.COMANDOS[commandKey];
    if (!cmdInfo) {
      uiState.showAlert(`Comando no reconocido en catálogo: ${commandKey}`);
      return false;
    }

    const isStopCommand = commandKey === "PARAR";

    // Punto 5.4: DETENER tiene prioridad absoluta incluso si hay una DEMO en curso
    if (isStopCommand) {
      return await this.triggerPriorityStop();
    }

    // Punto 9.4: Impedir comandos manuales conflictivos mientras se ejecuta una DEMO
    if (this.isDemoRunning) {
      uiState.showAlert("Hay una secuencia DEMO en ejecución. Presiona DETENER o Cancelar antes de enviar comandos manuales.");
      return false;
    }

    // Punto 4.4 y 7.5: Evitar duplicados continuos al arrastrar el joystick en la misma dirección
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

    this.activeCommandKey = commandKey;
    this.lastSentTimestamp = now;
    const currentSeq = ++this.requestSequence;

    // 1. Marcar estado "Solicitado" en UI y botón (Puntos 4.5 y 5.3)
    uiState.clearAllButtonStates();
    uiState.setButtonState(commandKey, "sending");
    uiState.markCommandRequested(cmdInfo.etiqueta, cmdInfo.id);

    try {
      const res = await apiClient.enviarMovimiento(cmdInfo.id, CONFIG.VEHICULO_ID);

      // Si mientras esperaba respuesta el usuario presionó DETENER, ignorar esta respuesta tardía (Punto 5.4)
      if (currentSeq !== this.requestSequence) {
        return false;
      }

      // 2. Marcar estado "Aceptado por API" (Punto 4.5)
      uiState.setButtonState(commandKey, "active");
      uiState.markCommandAcceptedByApi(cmdInfo.etiqueta, res.status);
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
   * Acción prioritaria DETENER (Punto 5.4):
   * Invalida peticiones anteriores pendientes, cancela DEMO si está activa y envía PARAR (ID 5).
   */
  async triggerPriorityStop() {
    const stopCmd = CONFIG.COMANDOS.PARAR;
    this.activeCommandKey = "PARAR";
    const stopSeq = ++this.requestSequence;

    uiState.clearAllButtonStates();
    uiState.setButtonState("PARAR", "sending");
    uiState.setJoystickLabel("Centro · Neutro", false);
    uiState.markCommandRequested(stopCmd.etiqueta, stopCmd.id);

    // Si había una DEMO corriendo, notificar su cancelación inmediata
    if (this.isDemoRunning && this.onEmergencyStopCallback) {
      this.onEmergencyStopCallback();
    }

    try {
      const res = await apiClient.enviarMovimiento(stopCmd.id, CONFIG.VEHICULO_ID);
      if (stopSeq === this.requestSequence) {
        uiState.setButtonState("PARAR", "active");
        uiState.markCommandAcceptedByApi(stopCmd.etiqueta, res.status);
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