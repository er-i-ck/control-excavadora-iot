/**
 * Utilidades de Fecha y Hora (dateUtils.js)
 * Normaliza marcas temporales provenientes de Amazon RDS o eventos WSS
 * sin fabricar fechas inexistentes (Puntos 4.5 y 7.5).
 */

/**
 * Extrae el valor crudo de fecha/hora buscando los nombres de columna habituales en RDS/FastAPI.
 */
export function extraerCampoFecha(obj) {
  if (!obj || typeof obj !== "object") return null;
  return (
    obj.fecha_hora ||
    obj.fecha_movimiento ||
    obj.fecha_registro ||
    obj.ultima_actualizacion ||
    obj.actualizado_en ||
    obj.creado_en ||
    obj.timestamp ||
    obj.fecha ||
    null
  );
}

/**
 * Parsea de forma segura una cadena ISO o MySQL ('YYYY-MM-DD HH:MM:SS') a objeto Date.
 */
export function parsearFechaSegura(rawDate) {
  if (!rawDate) return null;
  if (rawDate instanceof Date) {
    return Number.isNaN(rawDate.getTime()) ? null : rawDate;
  }

  const str = String(rawDate).trim();
  if (!str) return null;

  // Normalizar formato MySQL 'YYYY-MM-DD HH:MM:SS' a ISO 'YYYY-MM-DDTHH:MM:SS'
  const normalized = str.includes(" ") && !str.includes("T") ? str.replace(" ", "T") : str;
  const parsed = new Date(normalized);

  if (!Number.isNaN(parsed.getTime())) {
    return parsed;
  }
  return null;
}

/**
 * Devuelve { fecha, hora, timestampMs, raw } sin inventar valores cuando no existen.
 */
export function formatearFechaHora(rawDate, fallbackTexto = "Sin marca temporal en contrato") {
  if (!rawDate) {
    return {
      fecha: fallbackTexto,
      hora: "—",
      timestampMs: 0,
      tieneFechaReal: false
    };
  }

  const dateObj = parsearFechaSegura(rawDate);
  if (!dateObj) {
    // Si el backend envía fecha como texto no estándar, mostrar el valor literal recibido
    return {
      fecha: String(rawDate),
      hora: "—",
      timestampMs: 0,
      tieneFechaReal: true
    };
  }

  const fecha = dateObj.toLocaleDateString("es-MX", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });

  const hora = dateObj.toLocaleTimeString("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });

  return {
    fecha,
    hora,
    timestampMs: dateObj.getTime(),
    tieneFechaReal: true
  };
}