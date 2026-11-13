/**
 * Módulo Cliente WebSocket Seguro Compartido (WSS - v12)
 */

import { CONFIG } from "./config.js?v=12";
import { uiState } from "./uiState.js?v=12";

class WsClient {
  constructor() {
    this.socket = null;
    this.reconnectTimer = null;
    this.hasConnectedOnce = false;
    this.reconnectAttempts = 0;
    this.eventListeners = new Set();
    this.reconnectListeners = new Set();
  }

  onMessage(callback) {
    this.eventListeners.add(callback);
  }

  onReconnect(callback) {
    this.reconnectListeners.add(callback);
  }

  connect(idVehiculo = CONFIG.VEHICULO_ID) {
    if (
      this.socket &&
      (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    const wsUrl = `${CONFIG.WS_BASE_URL}/${idVehiculo}`;
    uiState.setWsStatus(this.hasConnectedOnce ? "RECONNECTING" : "CONNECTING");

    try {
      this.socket = new WebSocket(wsUrl);
    } catch {
      uiState.setWsStatus("OFFLINE");
      this._scheduleReconnect(idVehiculo);
      return;
    }

    this.socket.addEventListener("open", () => {
      const wasReconnecting = this.hasConnectedOnce;
      this.hasConnectedOnce = true;
      this.reconnectAttempts = 0;
      uiState.setWsStatus("ONLINE");

      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }

      if (wasReconnecting) {
        this.reconnectListeners.forEach((cb) => cb());
      }
    });

    this.socket.addEventListener("message", (event) => {
      this._handleIncomingMessage(event.data);
    });

    this.socket.addEventListener("error", () => {
      uiState.setWsStatus("OFFLINE");
    });

    this.socket.addEventListener("close", () => {
      uiState.setWsStatus("OFFLINE");
      this._scheduleReconnect(idVehiculo);
    });
  }

  _scheduleReconnect(idVehiculo) {
    if (this.reconnectTimer) return;
    this.reconnectAttempts += 1;
    const delay = Math.min(
      CONFIG.WS_RECONNECT_BASE_MS * Math.pow(1.4, this.reconnectAttempts - 1),
      CONFIG.WS_RECONNECT_MAX_MS
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      uiState.setWsStatus("RECONNECTING");
      this.connect(idVehiculo);
    }, Math.round(delay));
  }

  _handleIncomingMessage(rawText) {
    let payload;
    try {
      payload = JSON.parse(rawText);
    } catch {
      return;
    }

    if (payload.id_vehiculo && Number(payload.id_vehiculo) !== CONFIG.VEHICULO_ID) {
      return;
    }

    const evento = String(payload.evento || "EVENTO").trim().toUpperCase();

    if (evento === "ESTADO_ACTUAL") {
      uiState.markWsEventReceived(`ESTADO_ACTUAL (Vehículo #${payload.id_vehiculo || CONFIG.VEHICULO_ID})`);
    } else if (evento === "NUEVO_MOVIMIENTO") {
      uiState.markWsEventReceived(
        `NUEVO_MOVIMIENTO · ID Cmd: ${payload.id_comando} (Vehículo #${payload.id_vehiculo})`
      );
    } else if (evento === "MOVIMIENTO_DEMO") {
      const cmdLabel = payload.comando || `Comando #${payload.id_comando}`;
      uiState.markWsEventReceived(`DEMO PASO: ${cmdLabel} (${payload.duracion_ms || 0} ms)`);
      uiState.syncDemoLockState(true, `Paso: ${cmdLabel}`, "warning text-dark");
    } else if (evento === "INICIO_DEMO") {
      uiState.markWsEventReceived(`INICIO_DEMO (Vehículo #${payload.id_vehiculo || CONFIG.VEHICULO_ID})`);
      uiState.syncDemoLockState(true, "En ejecución (WSS)", "warning text-dark");
    } else if (evento === "FIN_DEMO" || evento === "DEMO_FINALIZADA") {
      uiState.markWsEventReceived(`${evento} (Vehículo #${payload.id_vehiculo || CONFIG.VEHICULO_ID})`);
      // Desbloqueo directo e inmediato de Joystick, Botones y Alerta
      uiState.syncDemoLockState(false, "Finalizada", "success");
    } else if (evento === "DEMO_CANCELADA") {
      uiState.markWsEventReceived(`DEMO_CANCELADA (Vehículo #${payload.id_vehiculo || CONFIG.VEHICULO_ID})`);
      uiState.syncDemoLockState(false, "Cancelada", "secondary");
    }

    this.eventListeners.forEach((cb) => cb(payload));
  }
}

export const wsClient = new WsClient();