/**
 * Módulo de Configuración Centralizada
 * Define las rutas reales del backend en AWS EC2, el canal WSS y el mapeo de comandos.
 */

export const CONFIG = Object.freeze({
  // 1.1 URL base HTTPS y WebSocket Seguro (WSS)
  API_BASE_URL: "https://api-vehiculo-erick.duckdns.org",
  WS_BASE_URL: "wss://api-vehiculo-erick.duckdns.org/ws",
  
  // Identificador del vehículo de prueba
  VEHICULO_ID: 1,
  VEHICULO_NOMBRE: "Excavadora IoT RC · Unidad 01",
  ORIGEN_CLIENTE: "Web-Control-GitHubPages",

  // Tiempos de control y red (ms)
  HTTP_TIMEOUT_MS: 6000,
  HEALTH_POLL_INTERVAL_MS: 15000, // Comprobación periódica controlada (Punto 6.3)
  WS_RECONNECT_DELAY_MS: 4000,
  JOYSTICK_COOLDOWN_MS: 180,      // Evita ráfagas al arrastrar (Punto 4.4)

  // Rutas documentadas en los 21 servicios de FastAPI (Punto 1.2 y 1.4)
  ENDPOINTS: {
    ESTADO_VEHICULO: (idVehiculo) => `/estado/${idVehiculo}`,
    COMANDOS_VEHICULO: (idVehiculo) => `/comandos/vehiculo/${idVehiculo}`,
    REGISTRAR_MOVIMIENTO: "/movimientos/",
    HISTORIAL_VEHICULO: (idVehiculo) => `/movimientos/historial/${idVehiculo}`,
    DEMOS_VEHICULO: (idVehiculo) => `/gestion-demos/vehiculo/${idVehiculo}`,
    MOVIMIENTOS_DEMO: (idDemo) => `/gestion-demos/movimientos/${idDemo}`,
    INICIAR_DEMO: "/gestion-demos/iniciar",
    CANCELAR_DEMO: "/gestion-demos/cancelar"
  },

  // Mapeo exacto con la columna id_comando de la tabla 'comandos' en RDS MySQL
  COMANDOS: {
    AVANZAR:         { id: 1,  codigo: 1,  nombre: "AVANZAR",         etiqueta: "Avanzar" },
    RETROCEDER:      { id: 2,  codigo: 2,  nombre: "RETROCEDER",      etiqueta: "Retroceder" },
    GIRAR_IZQUIERDA: { id: 3,  codigo: 3,  nombre: "GIRAR_IZQUIERDA", etiqueta: "Girar Izquierda" },
    GIRAR_DERECHA:   { id: 4,  codigo: 4,  nombre: "GIRAR_DERECHA",   etiqueta: "Girar Derecha" },
    PARAR:           { id: 5,  codigo: 5,  nombre: "PARAR",           etiqueta: "Detener Todo" },
    GRUA_SUBIR:      { id: 6,  codigo: 6,  nombre: "GRUA_SUBIR",      etiqueta: "Subir Brazo / Pala" },
    GRUA_BAJAR:      { id: 7,  codigo: 7,  nombre: "GRUA_BAJAR",      etiqueta: "Bajar Brazo / Pala" },
    DIAG_IZQ:        { id: 8,  codigo: 8,  nombre: "DIAG_IZQ",        etiqueta: "Diagonal Izquierda" },
    DIAG_DER:        { id: 9,  codigo: 9,  nombre: "DIAG_DER",        etiqueta: "Diagonal Derecha" },
    LUZ:             { id: 11, codigo: 10, nombre: "LUZ",             etiqueta: "Luz / LED" },
    SONIDO:          { id: 12, codigo: 11, nombre: "SONIDO",          etiqueta: "Sonido" },
    ENCENDER:        { id: 13, codigo: 12, nombre: "ENCENDER",        etiqueta: "Encender Control" },
    APAGAR:          { id: 14, codigo: 13, nombre: "APAGAR",          etiqueta: "Apagar Control" }
  }
});