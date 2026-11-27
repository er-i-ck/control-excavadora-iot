/**
 * Módulo Cliente WebSocket Seguro Compartido (wsClient.js - v20)
 * Autenticado por token, con cambio limpio de vehículo sin conexiones duplicadas.
 */

import { CONFIG } from "./config.js?v=21";
import { uiState } from "./uiState.js?v=21";
import { sessionStore } from "./sessionStore.js?v=21";

class WsClient {
  constructor() {
    this.socket = null;
    this.currentVehicleId = null;
    this.reconnectTimer = null;
    this.manualDisconnect = false;
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

  disconnect() {
    this.manualDisconnect = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      try {
        this.socket.close(1000, "Cambio de unidad o cierre de sesión");
      } catch {
        // ignore
      }
      this.socket = null;
    }
    this.currentVehicleId = null;
    this.hasConnectedOnce = false;
    this.reconnectAttempts = 0;
    uiState.setWsStatus("OFFLINE");
  }

  switchVehicle(idVehiculo) {
    const targetId = idVehiculo ? Number(idVehiculo) : null;
    if (!targetId || !sessionStore.getToken()) {
      this.disconnect();
      return;
    }
    if (
      this.currentVehicleId === targetId &&
      this.socket &&
      (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }
    this.disconnect();
    this.connect(targetId);
  }

  connect(idVehiculo = sessionStore.getActiveVehicleId()) {
    const token = sessionStore.getToken();
    const targetId = idVehiculo ? Number(idVehiculo) : null;

    if (!token || !targetId) {
      uiState.setWsStatus("OFFLINE");
      return;
    }

    if (
      this.socket &&
      this.currentVehicleId === targetId &&
      (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    this.manualDisconnect = false;
    this.currentVehicleId = targetId;

    const wsUrl = `${CONFIG.WS_BASE_URL}/${targetId}?token=${encodeURIComponent(token)}`;
    uiState.setWsStatus(this.hasConnectedOnce ? "RECONNECTING" : "CONNECTING");

    let ws;
    try {
      ws = new WebSocket(wsUrl);
      this.socket = ws;
    } catch {
      uiState.setWsStatus("OFFLINE");
      this._scheduleReconnect(targetId);
      return;
    }

    ws.addEventListener("open", () => {
      if (this.socket !== ws) return;
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

    ws.addEventListener("message", (event) => {
      if (this.socket !== ws) return;
      this._handleIncomingMessage(event.data);
    });

    ws.addEventListener("error", () => {
      if (this.socket !== ws) return;
      uiState.setWsStatus("OFFLINE");
    });

    ws.addEventListener("close", (ev) => {
      if (this.socket !== ws) return;
      this.socket = null;
      uiState.setWsStatus("OFFLINE");

      if (this.manualDisconnect || ev.code === 4401 || ev.code === 4403) {
        if (ev.code === 4403) {
          uiState.showAlert("Canal WSS rechazado (403): no tienes permiso para esta unidad.");
        }
        return;
      }
      this._scheduleReconnect(targetId);
    });
  }

  _scheduleReconnect(idVehiculo) {
    if (this.reconnectTimer || this.manualDisconnect || !sessionStore.getToken()) return;
    this.reconnectAttempts += 1;
    const delay = Math.min(
      CONFIG.WS_RECONNECT_BASE_MS * Math.pow(1.4, this.reconnectAttempts - 1),
      CONFIG.WS_RECONNECT_MAX_MS
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.manualDisconnect || Number(sessionStore.getActiveVehicleId()) !== Number(idVehiculo)) return;
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

    if (payload.evento === "ERROR_AUTH") {
      uiState.showAlert(payload.mensaje || "Acceso WSS no autorizado.");
      return;
    }

    const activeId = Number(this.currentVehicleId || sessionStore.getActiveVehicleId());
    if (payload.id_vehiculo && activeId && Number(payload.id_vehiculo) !== activeId) {
      return;
    }

    const evento = String(payload.evento || "EVENTO").trim().toUpperCase();

    if (evento === "ESTADO_ACTUAL") {
      uiState.markWsEventReceived(`ESTADO_ACTUAL (Vehículo #${payload.id_vehiculo || activeId})`);
    } else if (evento === "NUEVO_MOVIMIENTO") {
      uiState.markWsEventReceived(
        `NUEVO_MOVIMIENTO · Cmd: ${payload.nombre_comando || payload.id_comando} (#${payload.id_vehiculo})`
      );
    } else if (evento === "MOVIMIENTO_DEMO") {
      const cmdLabel = payload.comando || `Comando #${payload.id_comando}`;
      uiState.markWsEventReceived(`DEMO PASO: ${cmdLabel} (${payload.duracion_ms || 0} ms)`);
      uiState.syncDemoLockState(true, `Paso: ${cmdLabel}`, "warning text-dark");
    } else if (evento === "INICIO_DEMO") {
      uiState.markWsEventReceived(`INICIO_DEMO (Vehículo #${payload.id_vehiculo || activeId})`);
      uiState.syncDemoLockState(true, "En ejecución (WSS)", "warning text-dark");
    } else if (evento === "FIN_DEMO" || evento === "DEMO_FINALIZADA") {
      uiState.markWsEventReceived(`${evento} (Vehículo #${payload.id_vehiculo || activeId})`);
      uiState.syncDemoLockState(false, "Finalizada", "success");
    } else if (evento === "DEMO_CANCELADA") {
      uiState.markWsEventReceived(`DEMO_CANCELADA (Vehículo #${payload.id_vehiculo || activeId})`);
      uiState.syncDemoLockState(false, "Cancelada", "secondary");
    }

    this.eventListeners.forEach((cb) => cb(payload));
  }
}

export const wsClient = new WsClient();
