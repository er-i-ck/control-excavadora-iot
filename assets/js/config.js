/**
 * Módulo de Configuración Centralizada (Compartido entre CONTROL, MONITOREO y ADMINISTRACIÓN - v20)
 */

const COMANDOS_MAP = {
  AVANZAR:         { id: 1,  codigo: 1,  nombre: "AVANZAR",         etiqueta: "Avanzar" },
  RETROCEDER:      { id: 2,  codigo: 2,  nombre: "RETROCEDER",      etiqueta: "Retroceder" },
  GIRAR_IZQUIERDA: { id: 3,  codigo: 3,  nombre: "GIRAR_IZQUIERDA", etiqueta: "Girar Izquierda" },
  GIRAR_DERECHA:   { id: 4,  codigo: 4,  nombre: "GIRAR_DERECHA",   etiqueta: "Girar Derecha" },
  PARAR:           { id: 5,  codigo: 5,  nombre: "PARAR",           etiqueta: "Detener Todo" },
  GRUA_SUBIR:      { id: 6,  codigo: 6,  nombre: "GRUA_SUBIR",      etiqueta: "Subir Brazo" },
  GRUA_BAJAR:      { id: 7,  codigo: 7,  nombre: "GRUA_BAJAR",      etiqueta: "Bajar Brazo" },
  DIAG_IZQ:        { id: 8,  codigo: 8,  nombre: "DIAG_IZQ",        etiqueta: "Diagonal Izq." },
  DIAG_DER:        { id: 9,  codigo: 9,  nombre: "DIAG_DER",        etiqueta: "Diagonal Der." },
  SONIDO:          { id: 11, codigo: 11, nombre: "SONIDO",          etiqueta: "Sonido" },
  ENCENDER:        { id: 12, codigo: 12, nombre: "ENCENDER",        etiqueta: "Prender RC" },
  APAGAR:          { id: 13, codigo: 13, nombre: "APAGAR",          etiqueta: "Apagar RC" },
  LUZ:             { id: 14, codigo: 14, nombre: "LUZ",             etiqueta: "Luz / LED" }
};

export const CONFIG = Object.freeze({
  API_BASE_URL: "https://api-vehiculo-erick.duckdns.org",
  WS_BASE_URL: "wss://api-vehiculo-erick.duckdns.org/ws",

  VEHICULO_ID: 1,
  VEHICULO_NOMBRE: "Plataforma Vehículos IoT · AWS & RDS",
  ORIGEN_CLIENTE: "Web-Control-GitHubPages",
  HISTORIAL_MAX_ROWS: 10,

  HTTP_TIMEOUT_MS: 8000,
  HEALTH_POLL_INTERVAL_MS: 15000,
  WS_RECONNECT_BASE_MS: 3000,
  WS_RECONNECT_MAX_MS: 15000,
  JOYSTICK_COOLDOWN_MS: 180,

  ENDPOINTS: {
    SALUD_API: "/",
    SALUD_DETALLE: "/salud",
    AUTH_LOGIN: "/auth/login",
    AUTH_ME: "/auth/me",
    AUTH_LOGOUT: "/auth/logout",
    MIS_VEHICULOS: "/mis-vehiculos",

    ESTADO_VEHICULO: (idVehiculo) => `/estado/${idVehiculo}`,
    HISTORIAL_VEHICULO: (idVehiculo) => `/historial/${idVehiculo}`,
    COMANDOS_VEHICULO: (idVehiculo) => `/comandos/vehiculo/${idVehiculo}`,
    REGISTRAR_MOVIMIENTO: "/movimientos/",

    DEMOS_VEHICULO: (idVehiculo) => `/gestion-demos/vehiculo/${idVehiculo}`,
    MOVIMIENTOS_DEMO: (idDemo) => `/gestion-demos/movimientos/${idDemo}`,
    GUARDAR_DEMO_COMPLETA: "/gestion-demos/guardar-completa",
    ELIMINAR_DEMO: (idDemo) => `/gestion-demos/eliminar/${idDemo}`,
    INICIAR_DEMO: "/gestion-demos/iniciar",
    CANCELAR_DEMO: "/gestion-demos/cancelar",

    ADMIN_DASHBOARD: "/admin/dashboard",
    ADMIN_MODELOS: "/admin/modelos",
    ADMIN_MODELO_ID: (id) => `/admin/modelos/${id}`,
    ADMIN_UNIDADES: "/admin/unidades",
    ADMIN_UNIDAD_ID: (id) => `/admin/unidades/${id}`,
    ADMIN_UNIDAD_DESACTIVAR: (id) => `/admin/unidades/${id}/desactivar`,
    ADMIN_CLIENTES: "/admin/clientes",
    ADMIN_CLIENTE_ESTADO: (id) => `/admin/clientes/${id}/estado`,
    ADMIN_ASIGNACIONES: "/admin/asignaciones",
    ADMIN_LIBERAR_UNIDAD: (id) => `/admin/asignaciones/liberar/${id}`,
    ADMIN_AUDITORIA: "/admin/auditoria",

    INVITADO_CATALOGO: "/invitado/catalogo",
    INVITADO_SESIONES: "/invitado/sesiones",
    INVITADO_FINALIZAR: "/invitado/sesiones/finalizar"
  },

  COMANDOS: COMANDOS_MAP
});

export function resolverComandoInfo(idOrName) {
  if (idOrName === null || idOrName === undefined) return null;
  const num = Number(idOrName);
  const str = String(idOrName).trim().toUpperCase();

  for (const cmd of Object.values(COMANDOS_MAP)) {
    if ((!Number.isNaN(num) && (cmd.id === num || cmd.codigo === num)) || cmd.nombre === str) {
      return cmd;
    }
  }
  return null;
}
