/**
 * Módulo Cliente REST Compartido (apiClient.js - v20)
 * Adjunta Bearer Token automáticamente y consume rutas 4.1, 4.2 y 4.3.
 */

import { CONFIG } from "./config.js?v=20";
import { sessionStore } from "./sessionStore.js?v=20";

class ApiClient {
  constructor() {
    this.baseUrl = CONFIG.API_BASE_URL;
    this.defaultTimeout = CONFIG.HTTP_TIMEOUT_MS;
    this.onUnauthorizedCallback = null;
  }

  onUnauthorized(callback) {
    this.onUnauthorizedCallback = callback;
  }

  async request(endpoint, options = {}, timeoutMs = this.defaultTimeout) {
    const controller = new AbortController();
    const timerId = setTimeout(() => controller.abort(), timeoutMs);

    const url = `${this.baseUrl}${endpoint}`;
    const token = sessionStore.getToken();
    const skipAuth = Boolean(options.skipAuth);

    const headers = {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(!skipAuth && token ? { Authorization: `Bearer ${token}` } : {}),
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
        let errorMsg = `Error HTTP ${response.status}`;
        if (data) {
          if (typeof data.detail === "string") errorMsg = data.detail;
          else if (Array.isArray(data.detail) && data.detail[0]?.msg) errorMsg = data.detail[0].msg;
          else if (data.mensaje) errorMsg = data.mensaje;
        }
        const err = new Error(errorMsg);
        err.status = response.status;
        err.data = data;

        if (response.status === 401 && !skipAuth && endpoint !== CONFIG.ENDPOINTS.AUTH_LOGIN) {
          if (this.onUnauthorizedCallback) this.onUnauthorizedCallback(errorMsg);
        }
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

  // Diagnóstico auténtico separado: API AWS y Amazon RDS desde /salud
  async verificarInfraestructura() {
    try {
      const res = await this.request(CONFIG.ENDPOINTS.SALUD_DETALLE, { method: "GET", skipAuth: true }, 5000);
      const apiOk = res.data?.api === "DISPONIBLE" ? "AVAILABLE" : "UNAVAILABLE";
      const rdsOk =
        res.data?.rds === "DISPONIBLE"
          ? "AVAILABLE"
          : res.data?.rds === "NO_DISPONIBLE"
            ? "UNAVAILABLE"
            : "UNVERIFIED";
      return { aws: apiOk, rds: rdsOk };
    } catch {
      return { aws: "UNAVAILABLE", rds: "UNVERIFIED" };
    }
  }

  // ===== AUTENTICACIÓN =====
  async registrarCuenta(nombre, correo, password) {
    const res = await this.request(CONFIG.ENDPOINTS.AUTH_REGISTRO, {
      method: "POST",
      skipAuth: true,
      body: JSON.stringify({ nombre, correo, password })
    });
    return res.data;
  }

  async loginConGoogle(idToken) {
    const res = await this.request(CONFIG.ENDPOINTS.AUTH_GOOGLE, {
      method: "POST",
      skipAuth: true,
      body: JSON.stringify({ id_token: idToken })
    });
    return res.data;
  }

  async login(correo, password) {
    const res = await this.request(CONFIG.ENDPOINTS.AUTH_LOGIN, {
      method: "POST",
      skipAuth: true,
      body: JSON.stringify({ correo, password })
    });
    return res.data;
  }

  async obtenerPerfilActual() {
    const res = await this.request(CONFIG.ENDPOINTS.AUTH_ME, { method: "GET" });
    return res.data;
  }

  async logout() {
    try {
      await this.request(CONFIG.ENDPOINTS.AUTH_LOGOUT, { method: "POST" });
    } catch {
      // Limpiar localmente aunque la sesión ya hubiera expirado
    }
  }

  async obtenerMisVehiculos() {
    const res = await this.request(CONFIG.ENDPOINTS.MIS_VEHICULOS, { method: "GET" });
    return Array.isArray(res.data) ? res.data : [];
  }

  // ===== CONTROL Y MONITOREO (4.1 / 4.2) =====
  async obtenerUltimoEstadoVehiculo(idVehiculo) {
    const res = await this.request(CONFIG.ENDPOINTS.ESTADO_VEHICULO(idVehiculo), { method: "GET" });
    if (Array.isArray(res.data)) {
      return res.data.length > 0 ? res.data[0] : null;
    }
    return res.data || null;
  }

  async obtenerHistorialVehiculo(idVehiculo) {
    const res = await this.request(CONFIG.ENDPOINTS.HISTORIAL_VEHICULO(idVehiculo), { method: "GET" });
    return Array.isArray(res.data) ? res.data : [];
  }

  async obtenerComandosVehiculo(idVehiculo) {
    const res = await this.request(CONFIG.ENDPOINTS.COMANDOS_VEHICULO(idVehiculo), { method: "GET" });
    return Array.isArray(res.data) ? res.data : [];
  }

  async crearComando(payload) {
    return this.request(CONFIG.ENDPOINTS.CREAR_COMANDO, {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  async actualizarComando(idComando, payload) {
    return this.request(CONFIG.ENDPOINTS.ACTUALIZAR_COMANDO(idComando), {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  async eliminarComando(idComando) {
    return this.request(CONFIG.ENDPOINTS.ELIMINAR_COMANDO(idComando), {
      method: "POST"
    });
  }

  async enviarMovimiento(codigoOIdComando, idVehiculo) {
    const payload = {
      id_vehiculo: Number(idVehiculo),
      id_comando: Number(codigoOIdComando),
      origen: CONFIG.ORIGEN_CLIENTE
    };
    return await this.request(CONFIG.ENDPOINTS.REGISTRAR_MOVIMIENTO, {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  // ===== DEMOS (EJECUCIÓN Y EDITOR VISUAL) =====
  async obtenerDemosVehiculo(idVehiculo) {
    const res = await this.request(CONFIG.ENDPOINTS.DEMOS_VEHICULO(idVehiculo), { method: "GET" });
    return Array.isArray(res.data) ? res.data : [];
  }

  async obtenerMovimientosDemo(idDemo) {
    const res = await this.request(CONFIG.ENDPOINTS.MOVIMIENTOS_DEMO(idDemo), { method: "GET" });
    return Array.isArray(res.data) ? res.data : [];
  }

  async guardarDemoCompleta(payload) {
    const res = await this.request(CONFIG.ENDPOINTS.GUARDAR_DEMO_COMPLETA, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    return res.data;
  }

  async eliminarDemo(idDemo) {
    const res = await this.request(CONFIG.ENDPOINTS.ELIMINAR_DEMO(idDemo), { method: "POST" });
    return res.data;
  }

  async iniciarDemo(idDemo, idVehiculo) {
    return await this.request(CONFIG.ENDPOINTS.INICIAR_DEMO, {
      method: "POST",
      body: JSON.stringify({ id_vehiculo: Number(idVehiculo), id_demo: Number(idDemo) })
    });
  }

  async cancelarDemo(idVehiculo) {
    return await this.request(CONFIG.ENDPOINTS.CANCELAR_DEMO, {
      method: "POST",
      body: JSON.stringify({ id_vehiculo: Number(idVehiculo) })
    });
  }

  // ===== ADMINISTRACIÓN (SOLO ADMIN) =====
  async obtenerDashboardAdmin() {
    const res = await this.request(CONFIG.ENDPOINTS.ADMIN_DASHBOARD, { method: "GET" });
    return res.data;
  }

  async obtenerModelosAdmin() {
    const res = await this.request(CONFIG.ENDPOINTS.ADMIN_MODELOS, { method: "GET" });
    return Array.isArray(res.data) ? res.data : [];
  }

  async crearModeloAdmin(payload) {
    const res = await this.request(CONFIG.ENDPOINTS.ADMIN_MODELOS, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    return res.data;
  }

  async actualizarModeloAdmin(idModelo, payload) {
    const res = await this.request(CONFIG.ENDPOINTS.ADMIN_MODELO_ID(idModelo), {
      method: "PUT",
      body: JSON.stringify(payload)
    });
    return res.data;
  }

  async obtenerUnidadesAdmin(filtros = {}) {
    const params = new URLSearchParams();
    if (filtros.estado) params.set("estado", filtros.estado);
    if (filtros.buscar) params.set("buscar", filtros.buscar);
    const qs = params.toString() ? `?${params.toString()}` : "";
    const res = await this.request(`${CONFIG.ENDPOINTS.ADMIN_UNIDADES}${qs}`, { method: "GET" });
    return Array.isArray(res.data) ? res.data : [];
  }

  async crearUnidadAdmin(payload) {
    const res = await this.request(CONFIG.ENDPOINTS.ADMIN_UNIDADES, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    return res.data;
  }

  async actualizarUnidadAdmin(idVehiculo, payload) {
    const res = await this.request(CONFIG.ENDPOINTS.ADMIN_UNIDAD_ID(idVehiculo), {
      method: "PUT",
      body: JSON.stringify(payload)
    });
    return res.data;
  }

  async desactivarUnidadAdmin(idVehiculo) {
    const res = await this.request(CONFIG.ENDPOINTS.ADMIN_UNIDAD_DESACTIVAR(idVehiculo), {
      method: "PATCH"
    });
    return res.data;
  }

  async obtenerClientesAdmin() {
    const res = await this.request(CONFIG.ENDPOINTS.ADMIN_CLIENTES, { method: "GET" });
    return Array.isArray(res.data) ? res.data : [];
  }

  async crearClienteAdmin(payload) {
    const res = await this.request(CONFIG.ENDPOINTS.ADMIN_CLIENTES, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    return res.data;
  }

  async cambiarEstadoClienteAdmin(idUsuario, activo) {
    const res = await this.request(CONFIG.ENDPOINTS.ADMIN_CLIENTE_ESTADO(idUsuario), {
      method: "PATCH",
      body: JSON.stringify({ activo })
    });
    return res.data;
  }

  async asignarUnidadAdmin(payload) {
    const res = await this.request(CONFIG.ENDPOINTS.ADMIN_ASIGNACIONES, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    return res.data;
  }

  async liberarUnidadAdmin(idVehiculo, nuevoEstado = "DISPONIBLE") {
    const res = await this.request(CONFIG.ENDPOINTS.ADMIN_LIBERAR_UNIDAD(idVehiculo), {
      method: "POST",
      body: JSON.stringify({ nuevo_estado: nuevoEstado })
    });
    return res.data;
  }

  async obtenerAuditoriaAdmin(filtros = {}) {
    const params = new URLSearchParams();
    params.set("limit", String(filtros.limit || 50));
    if (filtros.fecha_inicio) params.set("fecha_inicio", filtros.fecha_inicio);
    if (filtros.fecha_fin) params.set("fecha_fin", filtros.fecha_fin);
    if (filtros.accion) params.set("accion", filtros.accion);
    const res = await this.request(`${CONFIG.ENDPOINTS.ADMIN_AUDITORIA}?${params.toString()}`, { method: "GET" });
    return Array.isArray(res.data) ? res.data : [];
  }

  // ===== INVITADO (CATÁLOGO PÚBLICO Y RESERVA TEMPORAL) =====
  async obtenerCatalogoInvitado() {
    const res = await this.request(CONFIG.ENDPOINTS.INVITADO_CATALOGO, { method: "GET", skipAuth: true });
    return res.data;
  }

  async iniciarSesionInvitado(idVehiculo, nombreInvitado = "Invitado", duracionSegundos = 120) {
    const res = await this.request(CONFIG.ENDPOINTS.INVITADO_SESIONES, {
      method: "POST",
      skipAuth: true,
      body: JSON.stringify({
        id_vehiculo: Number(idVehiculo),
        nombre_invitado: nombreInvitado,
        duracion_segundos: Number(duracionSegundos)
      })
    });
    return res.data;
  }

  async finalizarSesionInvitado() {
    const res = await this.request(CONFIG.ENDPOINTS.INVITADO_FINALIZAR, { method: "POST" });
    return res.data;
  }
}

export const apiClient = new ApiClient();


