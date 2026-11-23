/**
 * Módulo de Configuración Centralizada (v20)
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
  GOOGLE_CLIENT_ID: "469048615486-8jaebc0175cfl19a18ph7crrheiuba3q.apps.googleusercontent.com",

  VEHICULO_ID: 1,
  VEHICULO_NOMBRE: "Plataforma Vehículos IoT · AWS & RDS",
  ORIGEN_CLIENTE: "Web-Control-GitHubPages",
  HISTORIAL_MAX_ROWS: 10,

  HTTP_TIMEOUT_MS: 8000,
  HEALTH_POLL_INTERVAL_MS: 15000,
  WS_RECONNECT_BASE_MS: 3000,
  WS_RECONNECT_MAX_MS: 15000,
  JOYSTICK_COOLDOWN_MS: 180,
  GUEST_INACTIVITY_MS: 45000, // 45 seg sin mover el carrito libera la sesión de invitado

  ENDPOINTS: {
    SALUD_API: "/",
    SALUD_DETALLE: "/salud",
    AUTH_LOGIN: "/auth/login",
    AUTH_REGISTRO: "/auth/registro",
    AUTH_GOOGLE: "/auth/google",
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

export function obtenerIconoVehiculo(nombre = "", modelo = "") {
  const txt = `${nombre} ${modelo}`.toLowerCase();
  if (txt.includes("excavadora") || txt.includes("grua") || txt.includes("exc")) {
    return '<i class="bi bi-truck-front-fill text-warning me-1" aria-hidden="true"></i>';
  }
  if (txt.includes("batman") || txt.includes("bat") || txt.includes("deportivo")) {
    return '<i class="bi bi-lightning-charge-fill text-info me-1" aria-hidden="true"></i>';
  }
  if (txt.includes("prueba") || txt.includes("test")) {
    return '<i class="bi bi-cpu-fill text-success me-1" aria-hidden="true"></i>';
  }
  return '<i class="bi bi-car-front-fill text-light me-1" aria-hidden="true"></i>';
}
