/**
 * Módulo Cliente REST (Fetch API + async/await + Timeouts)
 * Compartido entre CONTROL y MONITOREO sin alterar el envío de comandos.
 */

import { CONFIG } from "./config.js?v=12";

class ApiClient {
  constructor() {
    this.baseUrl = CONFIG.API_BASE_URL;
    this.defaultTimeout = CONFIG.HTTP_TIMEOUT_MS;
    this.resolvedHistoryEndpoint = null;
  }

  async request(endpoint, options = {}, timeoutMs = this.defaultTimeout) {
    const controller = new AbortController();
    const timerId = setTimeout(() => controller.abort(), timeoutMs);

    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    };

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
        cache: "no-store"
      });

      clearTimeout(timerId);

      let data = null;
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        data = await response.json();
      }

      if (!response.ok) {
        const errorMsg = (data && (data.detail || data.mensaje)) || `Error HTTP ${response.status}`;
        const err = new Error(errorMsg);
        err.status = response.status;
        throw err;
      }

      return { ok: true, status: response.status, data };
    } catch (error) {
      clearTimeout(timerId);
      if (error.name === "AbortError") {
        throw new Error("Tiempo de espera agotado al contactar el servidor AWS.");
      }
      throw error;
    }
  }

  /**
   * Comprueba de forma separada la salud de FastAPI (GET /) y la disponibilidad de RDS (GET /estado/1)
   */
  async verificarInfraestructura(idVehiculo = CONFIG.VEHICULO_ID) {
    try {
      await this.request(CONFIG.ENDPOINTS.SALUD_API, { method: "GET" }, 4500);
    } catch {
      return { aws: "UNAVAILABLE", rds: "UNVERIFIED", estadoVehiculo: null };
    }

    try {
      const resEstado = await this.request(CONFIG.ENDPOINTS.ESTADO_VEHICULO(idVehiculo), { method: "GET" }, 5000);
      if (Array.isArray(resEstado.data) || (resEstado.data && typeof resEstado.data === "object")) {
        return { aws: "AVAILABLE", rds: "AVAILABLE", estadoVehiculo: resEstado.data };
      }
      return { aws: "AVAILABLE", rds: "UNVERIFIED", estadoVehiculo: null };
    } catch {
      return { aws: "AVAILABLE", rds: "UNAVAILABLE", estadoVehiculo: null };
    }
  }

  // GET: Consultar último estado reportado del vehículo en RDS (Punto 4.2 y 7.2)
  async obtenerUltimoEstadoVehiculo(idVehiculo = CONFIG.VEHICULO_ID) {
    const res = await this.request(CONFIG.ENDPOINTS.ESTADO_VEHICULO(idVehiculo), { method: "GET" });
    if (Array.isArray(res.data)) {
      return res.data.length > 0 ? res.data[0] : null;
    }
    return res.data || null;
  }

  // GET: Consultar historial de movimientos individuales persistidos en RDS (Punto 5.2 y 7.2)
  async obtenerHistorialVehiculo(idVehiculo = CONFIG.VEHICULO_ID) {
    // Si ya descubrimos cuál de los prefijos de historial usa el router de FastAPI, usarlo directo
    if (this.resolvedHistoryEndpoint) {
      const res = await this.request(this.resolvedHistoryEndpoint(idVehiculo), { method: "GET" });
      return this._normalizarArrayHistorial(res.data);
    }

    const candidates = CONFIG.ENDPOINTS.HISTORIAL_CANDIDATES(idVehiculo);
    let lastError = null;

    for (const path of candidates) {
      try {
        const res = await this.request(path, { method: "GET" });
        // Guardar la ruta exitosa para no probar las demás en siguientes consultas
        const prefix = path.replace(`/${idVehiculo}`, "");
        this.resolvedHistoryEndpoint = (id) => `${prefix}/${id}`;
        return this._normalizarArrayHistorial(res.data);
      } catch (err) {
        lastError = err;
        if (err.status && err.status !== 404) {
          throw err;
        }
      }
    }

    throw lastError || new Error("No se encontró la ruta de historial en la API.");
  }

  _normalizarArrayHistorial(data) {
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.historial)) return data.historial;
    if (data && Array.isArray(data.movimientos)) return data.movimientos;
    if (data && Array.isArray(data.resultados)) return data.resultados;
    return [];
  }

  async obtenerComandosVehiculo(idVehiculo = CONFIG.VEHICULO_ID) {
    const res = await this.request(CONFIG.ENDPOINTS.COMANDOS_VEHICULO(idVehiculo), { method: "GET" });
    return Array.isArray(res.data) ? res.data : [];
  }

  async enviarMovimiento(idComando, idVehiculo = CONFIG.VEHICULO_ID) {
    const payload = {
      id_vehiculo: Number(idVehiculo),
      id_comando: Number(idComando),
      origen: CONFIG.ORIGEN_CLIENTE
    };
    return await this.request(CONFIG.ENDPOINTS.REGISTRAR_MOVIMIENTO, {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  async obtenerDemosVehiculo(idVehiculo = CONFIG.VEHICULO_ID) {
    const res = await this.request(CONFIG.ENDPOINTS.DEMOS_VEHICULO(idVehiculo), { method: "GET" });
    return Array.isArray(res.data) ? res.data : [];
  }

  async obtenerMovimientosDemo(idDemo) {
    const res = await this.request(CONFIG.ENDPOINTS.MOVIMIENTOS_DEMO(idDemo), { method: "GET" });
    return Array.isArray(res.data) ? res.data : [];
  }

  async iniciarDemo(idDemo, idVehiculo = CONFIG.VEHICULO_ID) {
    const payload = {
      id_vehiculo: Number(idVehiculo),
      id_demo: Number(idDemo)
    };
    return await this.request(CONFIG.ENDPOINTS.INICIAR_DEMO, {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  async cancelarDemo(idVehiculo = CONFIG.VEHICULO_ID) {
    const payload = {
      id_vehiculo: Number(idVehiculo)
    };
    return await this.request(CONFIG.ENDPOINTS.CANCELAR_DEMO, {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }
}

export const apiClient = new ApiClient();