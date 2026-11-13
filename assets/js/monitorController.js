/**
 * Controlador de Monitoreo en Tiempo Real (monitorController.js - v15)
 */

import { CONFIG, resolverComandoInfo } from "./config.js?v=15";
import { apiClient } from "./apiClient.js?v=15";
import { wsClient } from "./wsClient.js?v=15";
import { extraerCampoFecha, formatearFechaHora } from "./dateUtils.js?v=15";

class MonitorController {
  constructor() {
    this.lastMoveNameEl = document.getElementById("mon-last-movement");
    this.lastMoveCodeEl = document.getElementById("mon-last-code");
    this.lastMoveVehicleEl = document.getElementById("mon-last-vehicle");
    this.lastMoveDateEl = document.getElementById("mon-last-date");
    this.lastMoveTimeEl = document.getElementById("mon-last-time");
    this.lastMoveOriginEl = document.getElementById("mon-last-origin");
    this.lastMoveSyncBadge = document.getElementById("mon-last-sync-badge");

    this.tableBodyEl = document.getElementById("mon-history-tbody");
    this.historyStatusBadge = document.getElementById("mon-history-badge");
    this.btnSyncManual = document.getElementById("btn-sync-monitor");
    this.monitorAlertEl = document.getElementById("mon-alert-box");

    this.syncSequence = 0;
    this.lastWsUpdateLocalMs = 0;
    this.lastProcessedEventSignature = null;
    this.historyRefreshTimer = null;
  }

  async init() {
    if (this.btnSyncManual) {
      this.btnSyncManual.addEventListener("click", () => this.sincronizarTodoPorRest(true));
    }

    wsClient.onMessage((payload) => this._handleIncomingWsEvent(payload));

    wsClient.onReconnect(() => {
      this.sincronizarTodoPorRest(false);
    });

    await this.sincronizarTodoPorRest(true);
  }

  async sincronizarTodoPorRest(mostrarEstadoCarga = false) {
    const currentSeq = ++this.syncSequence;
    const syncStartLocalMs = Date.now();

    if (mostrarEstadoCarga) {
      this._setHistoryBadge("Cargando...", "warning text-dark");
    }
    this._clearMonitorAlert();

    const [estadoResult, historialResult] = await Promise.allSettled([
      apiClient.obtenerUltimoEstadoVehiculo(CONFIG.VEHICULO_ID),
      apiClient.obtenerHistorialVehiculo(CONFIG.VEHICULO_ID)
    ]);

    if (currentSeq !== this.syncSequence) return;

    let registrosOrdenados = [];
    if (historialResult.status === "fulfilled") {
      registrosOrdenados = this._ordenarYLimitarDiez(historialResult.value);
      this._renderizarTablaHistorial(registrosOrdenados);
      this._setHistoryBadge(`${registrosOrdenados.length} / 10 registros (RDS)`, "success");
    } else {
      this._renderizarErrorTabla(historialResult.reason?.message || "Error al consultar historial en RDS.");
      this._setHistoryBadge("Error REST", "danger");
      this._showMonitorAlert(`No se pudo sincronizar el historial: ${historialResult.reason?.message}`);
    }

    if (syncStartLocalMs < this.lastWsUpdateLocalMs) {
      return;
    }

    if (estadoResult.status === "fulfilled" && estadoResult.value) {
      const estadoObj = estadoResult.value;
      const masRecienteHistorial = registrosOrdenados.length > 0 ? registrosOrdenados[0] : null;
      this._actualizarPanelDesdeRest(estadoObj, masRecienteHistorial);
    } else if (registrosOrdenados.length > 0) {
      this._actualizarPanelDesdeRest(registrosOrdenados[0], null);
    } else if (estadoResult.status === "rejected") {
      this._marcarPanelSinDatos("Sin datos actualizados (Error REST)");
    } else {
      this._marcarPanelSinDatos("Sin movimientos registrados");
    }
  }

  _actualizarPanelDesdeRest(registroPrimario, registroRespaldo = null) {
    const idCmd =
      registroPrimario.id_comando ??
      registroPrimario.ultimo_comando_id ??
      registroPrimario.codigo ??
      registroRespaldo?.id_comando ??
      null;

    const nombreRaw =
      registroPrimario.nombre_comando ||
      registroPrimario.ultimo_comando ||
      registroPrimario.comando ||
      registroPrimario.movimiento ||
      registroPrimario.nombre ||
      registroRespaldo?.nombre_comando ||
      registroRespaldo?.comando ||
      null;

    const infoCatalogo = resolverComandoInfo(idCmd ?? nombreRaw);
    const nombreMostrar = infoCatalogo
      ? `${infoCatalogo.etiqueta} (${infoCatalogo.nombre})`
      : nombreRaw || (idCmd ? `Comando #${idCmd}` : "Sin movimientos");

    const rawFecha = extraerCampoFecha(registroPrimario) || extraerCampoFecha(registroRespaldo);
    const { fecha, hora } = formatearFechaHora(rawFecha, "Confirmado en RDS (Sin fecha)");

    const origen =
      registroPrimario.origen ||
      registroRespaldo?.origen ||
      "Persistido en Amazon RDS (REST)";

    this._pintarTarjetaUltimoMovimiento({
      nombre: nombreMostrar,
      codigoTexto: idCmd !== null && idCmd !== undefined ? `Código / ID: ${idCmd}` : "Código: —",
      vehiculoTexto: `Vehículo #${registroPrimario.id_vehiculo || CONFIG.VEHICULO_ID}`,
      fecha,
      hora,
      origen,
      badgeTexto: "Sincronizado REST",
      badgeStyle: "info text-dark"
    });
  }

  _handleIncomingWsEvent(payload) {
    if (!payload || typeof payload !== "object") return;

    const idVehiculo = Number(payload.id_vehiculo || CONFIG.VEHICULO_ID);
    if (idVehiculo !== CONFIG.VEHICULO_ID) return;

    const evento = payload.evento || "";
    const signature = `${evento}-${payload.id_comando || ""}-${payload.comando || ""}-${payload.id_movimiento || ""}`;
    const now = Date.now();

    if (this.lastProcessedEventSignature === signature && now - this.lastWsUpdateLocalMs < 150) {
      return;
    }

    if (evento === "ESTADO_ACTUAL" && Array.isArray(payload.estado) && payload.estado.length > 0) {
      const est = payload.estado[0];
      if (now >= this.lastWsUpdateLocalMs) {
        this._actualizarPanelDesdeRest(est, null);
      }
      return;
    }

    if (evento === "NUEVO_MOVIMIENTO") {
      this.lastWsUpdateLocalMs = now;
      this.lastProcessedEventSignature = signature;

      const idCmd = payload.id_comando ?? payload.codigo ?? null;
      const infoCmd = resolverComandoInfo(idCmd ?? payload.comando);
      const nombreMostrar = infoCmd
        ? `${infoCmd.etiqueta} (${infoCmd.nombre})`
        : payload.comando || `Comando #${idCmd}`;

      const rawFecha = extraerCampoFecha(payload);
      const { fecha, hora } = formatearFechaHora(rawFecha, "En vivo · Sincronizando fecha RDS...");

      this._pintarTarjetaUltimoMovimiento({
        nombre: nombreMostrar,
        codigoTexto: idCmd !== null ? `Código / ID: ${idCmd}` : "Código: —",
        vehiculoTexto: `Vehículo #${idVehiculo}`,
        fecha,
        hora,
        origen: payload.origen ? `WSS en vivo (${payload.origen})` : "Evento WSS en tiempo real",
        badgeTexto: "Evento WSS en vivo",
        badgeStyle: "success"
      });

      this._programarReconciliacionHistorial();
      return;
    }

    if (evento === "MOVIMIENTO_DEMO" || evento === "INICIO_DEMO" || evento === "FIN_DEMO" || evento === "DEMO_CANCELADA") {
      this.lastWsUpdateLocalMs = now;
      this.lastProcessedEventSignature = signature;

      let nombreDemo = evento;
      let codigoTexto = "Secuencia DEMO";

      if (evento === "MOVIMIENTO_DEMO") {
        const idCmd = payload.id_comando ?? null;
        const infoCmd = resolverComandoInfo(idCmd ?? payload.comando);
        const cmdLabel = infoCmd ? infoCmd.etiqueta : payload.comando || `ID ${idCmd}`;
        nombreDemo = `DEMO · ${cmdLabel}`;
        codigoTexto = `Duración: ${payload.duracion_ms || 0} ms`;
      } else if (evento === "INICIO_DEMO") {
        nombreDemo = "DEMO Iniciada";
      } else if (evento === "FIN_DEMO") {
        nombreDemo = "DEMO Finalizada (Detenido)";
      } else if (evento === "DEMO_CANCELADA") {
        nombreDemo = "DEMO Cancelada (Detenido)";
      }

      const rawFecha = extraerCampoFecha(payload);
      const { fecha, hora } = formatearFechaHora(rawFecha, "Evento DEMO WSS (No genera historial)");

      this._pintarTarjetaUltimoMovimiento({
        nombre: nombreDemo,
        codigoTexto,
        vehiculoTexto: `Vehículo #${idVehiculo}`,
        fecha,
        hora,
        origen: "Secuencia DEMO por WSS (Sin registro en tabla individual)",
        badgeTexto: "DEMO en WSS",
        badgeStyle: "warning text-dark"
      });
    }
  }

  _programarReconciliacionHistorial() {
    if (this.historyRefreshTimer) {
      clearTimeout(this.historyRefreshTimer);
    }
    this.historyRefreshTimer = setTimeout(async () => {
      this.historyRefreshTimer = null;
      await this.sincronizarTodoPorRest(false);
    }, 350);
  }

  _ordenarYLimitarDiez(listaCruda) {
    if (!Array.isArray(listaCruda) || listaCruda.length === 0) return [];

    const filtrados = listaCruda.filter((item) => {
      if (item && item.id_vehiculo !== undefined && item.id_vehiculo !== null) {
        return Number(item.id_vehiculo) === CONFIG.VEHICULO_ID;
      }
      return true;
    });

    const vistos = new Set();
    const unicos = [];
    for (const item of filtrados) {
      const idReg = item.id_historial ?? item.id_movimiento ?? item.id ?? null;
      const rawFecha = extraerCampoFecha(item) || "";
      const idCmd = item.id_comando ?? item.codigo ?? item.comando ?? "";
      const claveUnica = idReg !== null ? `ID-${idReg}` : `T-${rawFecha}-${idCmd}`;

      if (!vistos.has(claveUnica)) {
        vistos.add(claveUnica);
        unicos.push(item);
      }
    }

    unicos.sort((a, b) => {
      const idA = Number(a.id_historial ?? a.id_movimiento ?? a.id ?? NaN);
      const idB = Number(b.id_historial ?? b.id_movimiento ?? b.id ?? NaN);

      const fechaA = formatearFechaHora(extraerCampoFecha(a)).timestampMs;
      const fechaB = formatearFechaHora(extraerCampoFecha(b)).timestampMs;

      if (fechaA && fechaB && fechaA !== fechaB) {
        return fechaB - fechaA;
      }
      if (!Number.isNaN(idA) && !Number.isNaN(idB) && idA !== idB) {
        return idB - idA;
      }
      return 0;
    });

    return unicos.slice(0, CONFIG.HISTORIAL_MAX_ROWS);
  }

  _renderizarTablaHistorial(registros) {
    if (!this.tableBodyEl) return;
    this.tableBodyEl.innerHTML = "";

    if (!registros || registros.length === 0) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 5;
      td.className = "text-center text-secondary py-3";
      td.textContent = "Sin movimientos individuales registrados para este vehículo.";
      tr.appendChild(td);
      this.tableBodyEl.appendChild(tr);
      return;
    }

    registros.forEach((item, index) => {
      const tr = document.createElement("tr");

      const tdNum = document.createElement("td");
      tdNum.className = "fw-bold text-warning";
      tdNum.textContent = String(index + 1);

      const idCmd = item.id_comando ?? item.codigo ?? null;
      const nombreRaw = item.nombre_comando || item.comando || item.movimiento || item.nombre || null;
      const infoCmd = resolverComandoInfo(idCmd ?? nombreRaw);

      const tdMov = document.createElement("td");
      tdMov.className = "fw-semibold text-light";
      tdMov.textContent = infoCmd
        ? `${infoCmd.etiqueta} (${infoCmd.nombre})`
        : nombreRaw || `Comando #${idCmd ?? "—"}`;

      const idRegistro = item.id_historial ?? item.id_movimiento ?? item.id ?? null;
      const tdCodigo = document.createElement("td");
      tdCodigo.className = "text-info small";
      if (idCmd !== null && idRegistro !== null) {
        tdCodigo.textContent = `Cmd ${idCmd} · Reg #${idRegistro}`;
      } else if (idCmd !== null) {
        tdCodigo.textContent = `Cmd ${idCmd}`;
      } else if (idRegistro !== null) {
        tdCodigo.textContent = `Reg #${idRegistro}`;
      } else {
        tdCodigo.textContent = "—";
      }

      const rawFecha = extraerCampoFecha(item);
      const { fecha, hora } = formatearFechaHora(rawFecha, "Sin fecha");

      const tdFecha = document.createElement("td");
      tdFecha.className = "text-secondary small";
      tdFecha.textContent = fecha;

      const tdHora = document.createElement("td");
      tdHora.className = "text-light small font-monospace";
      tdHora.textContent = hora;

      tr.appendChild(tdNum);
      tr.appendChild(tdMov);
      tr.appendChild(tdCodigo);
      tr.appendChild(tdFecha);
      tr.appendChild(tdHora);

      this.tableBodyEl.appendChild(tr);
    });
  }

  _renderizarErrorTabla(mensajeError) {
    if (!this.tableBodyEl) return;
    this.tableBodyEl.innerHTML = "";
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 5;
    td.className = "text-center text-danger py-3";
    td.textContent = `No se pudieron cargar los movimientos: ${mensajeError}`;
    tr.appendChild(td);
    this.tableBodyEl.appendChild(tr);
  }

  _pintarTarjetaUltimoMovimiento({ nombre, codigoTexto, vehiculoTexto, fecha, hora, origen, badgeTexto, badgeStyle }) {
    if (this.lastMoveNameEl) this.lastMoveNameEl.textContent = nombre;
    if (this.lastMoveCodeEl) this.lastMoveCodeEl.textContent = codigoTexto;
    if (this.lastMoveVehicleEl) this.lastMoveVehicleEl.textContent = vehiculoTexto;
    if (this.lastMoveDateEl) this.lastMoveDateEl.textContent = fecha;
    if (this.lastMoveTimeEl) this.lastMoveTimeEl.textContent = hora;
    if (this.lastMoveOriginEl) this.lastMoveOriginEl.textContent = origen;

    if (this.lastMoveSyncBadge) {
      this.lastMoveSyncBadge.textContent = badgeTexto;
      this.lastMoveSyncBadge.className = `badge bg-${badgeStyle} badge-xs`;
    }
  }

  _marcarPanelSinDatos(motivo) {
    this._pintarTarjetaUltimoMovimiento({
      nombre: motivo,
      codigoTexto: "Código: —",
      vehiculoTexto: `Vehículo #${CONFIG.VEHICULO_ID}`,
      fecha: "—",
      hora: "—",
      origen: "Esperando datos de API / WSS",
      badgeTexto: "Sin datos",
      badgeStyle: "secondary"
    });
  }

  _setHistoryBadge(texto, style) {
    if (!this.historyStatusBadge) return;
    this.historyStatusBadge.textContent = texto;
    this.historyStatusBadge.className = `badge bg-${style} badge-xs`;
  }

  _showMonitorAlert(msg) {
    if (!this.monitorAlertEl) return;
    this.monitorAlertEl.textContent = msg;
    this.monitorAlertEl.classList.remove("d-none");
  }

  _clearMonitorAlert() {
    if (!this.monitorAlertEl) return;
    this.monitorAlertEl.textContent = "";
    this.monitorAlertEl.classList.add("d-none");
  }
}

export const monitorController = new MonitorController();