/**
 * Módulo Cliente WebSocket Seguro (WSS)
 * Abre y mantiene la conexión en tiempo real con AWS para actualizar el indicador WSS
 * y reflejar los eventos emitidos por el backend.
 */

import { CONFIG } from "./config.js";
import { uiState } from "./uiState.js";

class WsClient {
  constructor() {
    this.socket = null;
    this.reconnectTimer = null;
    this.hasConnectedOnce = false;
    this.eventListeners = new Set();
  }

  /**
   * Permite que otros controladores (como DEMO o Movimientos) escuchen los mensajes WSS.
   */
  onMessage(callback) {
    this.eventListeners.add(callback);
  }

  connect(idVehiculo = CONFIG.VEHICULO_ID) {
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
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
      this.hasConnectedOnce = true;
      uiState.setWsStatus("ONLINE");
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
    });

    this.socket.addEventListener("message", (event) => {
      this._handleIncomingMessage(event.data);
    });

    this.socket.addEventListener("error", () => {
      uiState.setWsStatus("OFFLINE");
    });

    this.socket.addEventListener("close", () => {
      // Punto 6.2: Si la conexión se pierde, abandona inmediatamente "En línea"
      uiState.setWsStatus("OFFLINE");
      this._scheduleReconnect(idVehiculo);
    });
  }

  _scheduleReconnect(idVehiculo) {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      uiState.setWsStatus("RECONNECTING");
      this.connect(idVehiculo);
    }, CONFIG.WS_RECONNECT_DELAY_MS);
  }

  _handleIncomingMessage(rawText) {
    let payload;
    try {
      payload = JSON.parse(rawText);
    } catch {
      return;
    }

    // Filtrar eventos que no correspondan al vehículo propio
    if (payload.id_vehiculo && Number(payload.id_vehiculo) !== CONFIG.VEHICULO_ID) {
      return;
    }

    const evento = payload.evento || "EVENTO";

    // Formatear resumen legible sin inventar atributos (Punto 8.4)
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

    // Notificar a los controladores suscritos
    this.eventListeners.forEach((cb) => cb(payload));
  }
}

export const wsClient = new WsClient();