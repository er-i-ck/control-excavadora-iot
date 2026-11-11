/**
 * Módulo Cliente REST (Fetch API + async/await + Timeouts)
 * Centraliza todas las solicitudes HTTPS hacia el backend FastAPI en AWS EC2.
 */

import { CONFIG } from "./config.js";

class ApiClient {
  constructor() {
    this.baseUrl = CONFIG.API_BASE_URL;
    this.defaultTimeout = CONFIG.HTTP_TIMEOUT_MS;
  }

  /**
   * Ejecuta una petición Fetch con control de timeout y manejo seguro de errores JSON.
   */
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
        signal: controller.signal
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
   * Cumple estrictamente con el Punto 6.3.
   */
  async verificarInfraestructura(idVehiculo = CONFIG.VEHICULO_ID) {
    // 1. Verificar Servidor AWS FastAPI (GET /)
    try {
      await this.request(CONFIG.ENDPOINTS.SALUD_API, { method: "GET" }, 4500);
    } catch {
      // Si la API en EC2 no responde, AWS está No disponible y RDS queda Sin verificar (Punto 6.3)
      return { aws: "UNAVAILABLE", rds: "UNVERIFIED", estadoVehiculo: null };
    }

    // 2. Si AWS respondió, verificar diagnóstico de RDS consultando el procedimiento almacenado sp_obtener_estado
    try {
      const resEstado = await this.request(CONFIG.ENDPOINTS.ESTADO_VEHICULO(idVehiculo), { method: "GET" }, 5000);
      if (Array.isArray(resEstado.data)) {
        return { aws: "AVAILABLE", rds: "AVAILABLE", estadoVehiculo: resEstado.data };
      }
      return { aws: "AVAILABLE", rds: "UNVERIFIED", estadoVehiculo: null };
    } catch {
      // AWS está activo pero la consulta a la base de datos falló
      return { aws: "AVAILABLE", rds: "UNAVAILABLE", estadoVehiculo: null };
    }
  }

  // GET: Consultar catálogo de comandos disponibles para el vehículo (Punto 7.2)
  async obtenerComandosVehiculo(idVehiculo = CONFIG.VEHICULO_ID) {
    const res = await this.request(CONFIG.ENDPOINTS.COMANDOS_VEHICULO(idVehiculo), { method: "GET" });
    return Array.isArray(res.data) ? res.data : [];
  }

  // POST: Registrar y emitir un movimiento individual o DETENER (Punto 7.3)
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

  // GET: Consultar catálogo de secuencias DEMO del vehículo (Punto 9.1)
  async obtenerDemosVehiculo(idVehiculo = CONFIG.VEHICULO_ID) {
    const res = await this.request(CONFIG.ENDPOINTS.DEMOS_VEHICULO(idVehiculo), { method: "GET" });
    return Array.isArray(res.data) ? res.data : [];
  }

  // GET: Consultar los pasos que integran una DEMO (Punto 9.1)
  async obtenerMovimientosDemo(idDemo) {
    const res = await this.request(CONFIG.ENDPOINTS.MOVIMIENTOS_DEMO(idDemo), { method: "GET" });
    return Array.isArray(res.data) ? res.data : [];
  }

  // POST: Iniciar secuencia DEMO en segundo plano (Punto 9.2)
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

  // POST: Cancelar DEMO en curso (Punto 9.3)
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