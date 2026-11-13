/**
 * Controlador de Monitoreo en Tiempo Real (monitorController.js)
 * Gestiona el Panel del Último Movimiento Reportado y la Tabla Dinámica de los
 * 10 últimos movimientos individuales persistidos en Amazon RDS.
 */

import { CONFIG, resolverComandoInfo } from "./config.js?v=8";
import { apiClient } from "./apiClient.js?v=8";
import { wsClient } from "./wsClient.js?v=8";
import { extraerCampoFecha, formatearFechaHora } from "./dateUtils.js?v=8";

class MonitorController {
  constructor() {
    // Elementos del Panel de Último Movimiento (Punto 4.1)
    this.lastMoveNameEl = document.getElementById("mon-last-movement");
    this.lastMoveCodeEl = document.getElementById("mon-last-code");
    this.lastMoveVehicleEl = document.getElementById("mon-last-vehicle");
    this.lastMoveDateEl = document.getElementById("mon-last-date");
    this.lastMoveTimeEl = document.getElementById("mon-last-time");
    this.lastMoveOriginEl = document.getElementById("mon-last-origin");
    this.lastMoveSyncBadge = document.getElementById("mon-last-sync-badge");

    // Elementos de la Tabla de 10 Movimientos (Punto 5.1)
    this.tableBodyEl = document.getElementById("mon-history-tbody");
    this.historyStatusBadge = document.getElementById("mon-history-badge");
    this.btnSyncManual = document.getElementById("btn-sync-monitor");
    this.monitorAlertEl = document.getElementById("mon-alert-box");

    // Control de concurrencia, duplicados y orden temporal (Puntos 4.4, 7.4 y 8.4)
    this.syncSequence = 0;
    this.lastWsUpdateLocalMs = 0;
    this.lastProcessedEventSignature = null;
    this.historyRefreshTimer = null;
  }

  async init() {
    if (this.btnSyncManual) {
      this.btnSyncManual.addEventListener("click", () => this.sincronizarTodoPorRest(true));
    }

    // 1. Escuchar eventos en tiempo real del WebSocket compartido (Punto 8.1 y 8.2)
    wsClient.onMessage((payload) => this._handleIncomingWsEvent(payload));

    // 2. Si el WebSocket se reconecta tras una caída, resincronizar todo por REST (Punto 6.2 y 7.4)
    wsClient.onReconnect(() => {
      this.sincronizarTodoPorRest(false);
    });

    // 3. Carga inicial desde REST (Punto 7.2)
    await this.sincronizarTodoPorRest(true);
  }

  /**
   * Consulta en paralelo (GET) el último estado y los últimos 10 movimientos en RDS.
   * Protege contra condiciones de carrera mediante syncSequence (Punto 7.4).
   */
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

    // Si otra sincronización más reciente ya inició, descartar esta respuesta antigua (Punto 7.4)
    if (currentSeq !== this.syncSequence) return;

    // A. Procesar Historial de 10 movimientos persistidos
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

    // B. Procesar Último Movimiento (evitando que una respuesta REST vieja pise un evento WSS más reciente - Punto 4.4)
    if (syncStartLocalMs < this.lastWsUpdateLocalMs) {
      return;
    }

    if (estadoResult.status === "fulfilled" && estadoResult.value) {
      // Si el estado en RDS no tiene fecha pero el historial sí, complementar con el registro #1 más reciente
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

  /**
   * Actualiza el panel destacado usando datos confirmados de REST (Puntos 4.1, 4.2 y 7.3)
   */
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

    // Tomar marca temporal del estado o, si no viene en estado, del último registro persistido
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

  /**
   * Procesa los mensajes recibidos en tiempo real desde el WebSocket compartido (Puntos 4.2, 8.2, 9.2 y 9.3)
   */
  _handleIncomingWsEvent(payload) {
    if (!payload || typeof payload !== "object") return;

    const idVehiculo = Number(payload.id_vehiculo || CONFIG.VEHICULO_ID);
    if (idVehiculo !== CONFIG.VEHICULO_ID) return;

    const evento = payload.evento || "";

    // Evitar procesar eventos idénticos duplicados en el mismo instante (Punto 4.4 y 8.4)
    const signature = `${evento}-${payload.id_comando || ""}-${payload.comando || ""}-${payload.id_movimiento || ""}`;
    const now = Date.now();
    if (this.lastProcessedEventSignature === signature && now - this.lastWsUpdateLocalMs < 150) {
      return;
    }

    // Caso 1: Estado inicial enviado por el WebSocket al abrir conexión
    if (evento === "ESTADO_ACTUAL" && Array.isArray(payload.estado) && payload.estado.length > 0) {
      const est = payload.estado[0];
      if (now >= this.lastWsUpdateLocalMs) {
        this._actualizarPanelDesdeRest(est, null);
      }
      return;
    }

    // Caso 2: Movimiento individual en vivo (originado en CONTROL local o en cliente/pestaña externa - Punto 8.2 y 8.3)
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

      // Punto 5.3 y 8.2: Reconciliar el historial persistido desde REST para obtener la fila y fecha oficial de RDS
      this._programarReconciliacionHistorial();
      return;
    }

    // Caso 3: Eventos de secuencia DEMO (Puntos 4.3, 9.2 y 9.3)
    // Actualizan el panel de Último Movimiento Reportado, pero NO se agregan al historial de 10 movimientos individuales
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

  /**
   * Reconcilia por REST después de un evento NUEVO_MOVIMIENTO con debounce corto (350 ms)
   * para evitar consultas excesivas y recuperar el timestamp oficial guardado en RDS (Punto 5.3).
   */
  _programarReconciliacionHistorial() {
    if (this.historyRefreshTimer) {
      clearTimeout(this.historyRefreshTimer);
    }
    this.historyRefreshTimer = setTimeout(async () => {
      this.historyRefreshTimer = null;
      await this.sincronizarTodoPorRest(false);
    }, 350);
  }

  /**
   * Ordena del más reciente al más antiguo, filtra al vehículo actual, elimina duplicados
   * y limita estrictamente a 10 registros (Puntos 5.1, 5.2 y 7.2).
   */
  _ordenarYLimitarDiez(listaCruda) {
    if (!Array.isArray(listaCruda) || listaCruda.length === 0) return [];

    // 1. Filtrar por id_vehiculo si el atributo viene presente
    const filtrados = listaCruda.filter((item) => {
      if (item && item.id_vehiculo !== undefined && item.id_vehiculo !== null) {
        return Number(item.id_vehiculo) === CONFIG.VEHICULO_ID;
      }
      return true;
    });

    // 2. Eliminar duplicados por ID de historial/movimiento si existe
    const vistos = new Set();
    const unicos = [];
    for (const item of filtrados) {
      const idReg = item.id_historial ?? item.id_movimiento ?? item.id ?? null;
      const rawFecha = extraerCampoFecha(item) || "";
      const idCmd = item.id_comando ?? item.codigo ?? item.comando ?? "";
      const claveUnica = idReg !== null ? `ID-${idReg}` : ` T-${rawFecha}-${idCmd}`;

      if (!vistos.has(claveUnica)) {
        vistos.add(claveUnica);
        unicos.push(item);
      }
    }

    // 3. Ordenar del más reciente al más antiguo por fecha/hora o por ID descendente (Punto 5.2)
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

    // 4. Limitar estrictamente a los 10 movimientos más recientes (Punto 5.1 y 5.4)
    return unicos.slice(0, CONFIG.HISTORIAL_MAX_ROWS);
  }

  /**
   * Construye de forma segura (textContent) las filas de la tabla de 10 movimientos (Puntos 5.1, 5.4 y 10.5)
   */
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

      // Columna 1: # (1 al 10)
      const tdNum = document.createElement("td");
      tdNum.className = "fw-bold text-warning";
      tdNum.textContent = String(index + 1);

      // Columna 2: Movimiento
      const idCmd = item.id_comando ?? item.codigo ?? null;
      const nombreRaw = item.nombre_comando || item.comando || item.movimiento || item.nombre || null;
      const infoCmd = resolverComandoInfo(idCmd ?? nombreRaw);

      const tdMov = document.createElement("td");
      tdMov.className = "fw-semibold text-light";
      tdMov.textContent = infoCmd
        ? `${infoCmd.etiqueta} (${infoCmd.nombre})`
        : nombreRaw || `Comando #${idCmd ?? "—"}`;

      // Columna 3: Código / ID real (Opcional según Punto 5.1)
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

      // Columnas 4 y 5: Fecha y Hora reales desde RDS
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