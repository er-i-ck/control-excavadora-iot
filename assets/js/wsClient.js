/**
 * Módulo Cliente WebSocket Seguro Compartido (WSS)
 * Mantiene UNA sola sesión WSS para CONTROL y MONITOREO, aplica reconexión
 * con espera progresiva y dispara resincronización REST al recuperar conexión.
 */

import { CONFIG } from "./config.js?v=8";
import { uiState } from "./uiState.js?v=8";

class WsClient {
  constructor() {
    this.socket = null;
    this.reconnectTimer = null;
    this.hasConnectedOnce = false;
    this.reconnectAttempts = 0;
    this.eventListeners = new Set();
    this.reconnectListeners = new Set();
  }

  /**
   * Suscribe controladores (DEMO, MONITOREO) a los mensajes JSON entrantes.
   */
  onMessage(callback) {
    this.eventListeners.add(callback);
  }

  /**
   * Suscribe controladores al evento de reconexión exitosa (Punto 6.2 y 7.4).
   */
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

      // Punto 6.2 y 7.4: Al reconectar WSS, resincronizar estado e historial por REST
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

  // Punto 8.4: Reconexión controlada con espera progresiva (exponential backoff)
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

    // Punto 8.4: Filtrar estrictamente eventos de otros vehículos
    if (payload.id_vehiculo && Number(payload.id_vehiculo) !== CONFIG.VEHICULO_ID) {
      return;
    }

    const evento = payload.evento || "EVENTO";

    if (evento === "ESTADO_ACTUAL") {
      uiState.markWsEventReceived(`ESTADO_ACTUAL (Vehículo #${payload.id_vehiculo || CONFIG.VEHICULO_ID})`);
    } else if (evento === "NUEVO_MOVIMIENTO") {
      uiState.markWsEventReceived(
        `NUEVO_MOVIMIENTO · ID Cmd: ${payload.id_comando} (Vehículo #${payload.id_vehiculo})`
      );
    } else if (evento === "MOVIMIENTO_DEMO") {
      uiState.markWsEventReceived(
        `DEMO PASO: ${payload.comando || payload.id_comando} (${payload.duracion_ms || 0} ms)`
      );
    } else if (evento === "INICIO_DEMO" || evento === "FIN_DEMO" || evento === "DEMO_CANCELADA") {
      uiState.markWsEventReceived(`${evento} (Vehículo #${payload.id_vehiculo || CONFIG.VEHICULO_ID})`);
    }

    this.eventListeners.forEach((cb) => cb(payload));
  }
}

export const wsClient = new WsClient();