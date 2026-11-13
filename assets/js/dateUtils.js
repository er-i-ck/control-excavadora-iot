/**
 * Utilidades de Fecha y Hora (dateUtils.js - v15)
 * Convierte las marcas temporales UTC de Amazon RDS a hora local de México (UTC-6).
 */

const ZONA_HORARIA_MX = "America/Mexico_City";

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

export function parsearFechaSegura(rawDate) {
  if (!rawDate) return null;
  if (rawDate instanceof Date) {
    return Number.isNaN(rawDate.getTime()) ? null : rawDate;
  }

  const str = String(rawDate).trim();
  if (!str) return null;

  // Normalizar espacio MySQL ('2026-11-13 07:02:19') a formato ISO ('2026-11-13T07:02:19')
  let normalized = str.includes(" ") && !str.includes("T") ? str.replace(" ", "T") : str;

  // Amazon RDS envía DATETIME en UTC sin la 'Z' final; agregar 'Z' para que JS reste las 6 horas de México
  const tieneHora = normalized.includes("T");
  const tieneZona = /(Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
  if (tieneHora && !tieneZona) {
    normalized = `${normalized}Z`;
  }

  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

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
    return {
      fecha: String(rawDate),
      hora: "—",
      timestampMs: 0,
      tieneFechaReal: true
    };
  }

  const fecha = dateObj.toLocaleDateString("es-MX", {
    timeZone: ZONA_HORARIA_MX,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });

  const hora = dateObj.toLocaleTimeString("es-MX", {
    timeZone: ZONA_HORARIA_MX,
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