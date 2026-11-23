/**
 * Módulo de Sesión y Vehículo Activo (sessionStore.js - v20)
 * Usa sessionStorage para permitir pruebas simultáneas con 2 o 3 cuentas en pestañas distintas.
 */

const STORAGE_KEY = "iot_excavadora_session_v1";

class SessionStore {
  constructor() {
    this.token = null;
    this.actor = null;
    this.vehicles = [];
    this.activeVehicleId = null;
    this.listeners = new Set();
    this._hydrate();
  }

  _hydrate() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      this.token = parsed.token || null;
      this.actor = parsed.actor || null;
      this.activeVehicleId = parsed.activeVehicleId ? Number(parsed.activeVehicleId) : null;
    } catch {
      this.clearSession(false);
    }
  }

  _persist() {
    try {
      if (!this.token || !this.actor) {
        sessionStorage.removeItem(STORAGE_KEY);
        return;
      }
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          token: this.token,
          actor: this.actor,
          activeVehicleId: this.activeVehicleId
        })
      );
    } catch {
      // Ignorar si sessionStorage no está disponible
    }
  }

  onChange(cb) {
    this.listeners.add(cb);
  }

  _notify(reason = "update") {
    this.listeners.forEach((cb) => cb(reason, this.getSnapshot()));
  }

  getSnapshot() {
    return {
      token: this.token,
      actor: this.actor,
      rol: this.getRole(),
      vehicles: this.vehicles,
      activeVehicleId: this.activeVehicleId,
      activeVehicle: this.getActiveVehicle()
    };
  }

  getToken() {
    return this.token;
  }

  getActor() {
    return this.actor;
  }

  getRole() {
    return this.actor?.rol || null;
  }

  isAuthenticated() {
    return Boolean(this.token && this.actor);
  }

  setSession(token, actor) {
    this.token = token;
    this.actor = actor;
    if (actor?.rol === "INVITADO" && actor?.id_vehiculo_reservado) {
      this.activeVehicleId = Number(actor.id_vehiculo_reservado);
    }
    this._persist();
    this._notify("session");
  }

  clearSession(notify = true) {
    this.token = null;
    this.actor = null;
    this.vehicles = [];
    this.activeVehicleId = null;
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    if (notify) this._notify("logout");
  }

  setVehicles(list) {
    this.vehicles = Array.isArray(list) ? list : [];
    const exists = this.vehicles.some((v) => Number(v.id_vehiculo) === Number(this.activeVehicleId));
    if (!exists) {
      this.activeVehicleId = this.vehicles.length > 0 ? Number(this.vehicles[0].id_vehiculo) : null;
    }
    this._persist();
    this._notify("vehicles");
  }

  getVehicles() {
    return this.vehicles;
  }

  getActiveVehicleId() {
    return this.activeVehicleId;
  }

  getActiveVehicle() {
    if (!this.activeVehicleId) return null;
    return this.vehicles.find((v) => Number(v.id_vehiculo) === Number(this.activeVehicleId)) || null;
  }

  setActiveVehicleId(idVehiculo) {
    const numId = idVehiculo ? Number(idVehiculo) : null;
    if (numId === this.activeVehicleId) return false;
    this.activeVehicleId = numId;
    this._persist();
    this._notify("vehicle-change");
    return true;
  }

  getAllowedCommandCodes() {
    if (this.getRole() === "INVITADO") {
      return this.actor?.comandos_permitidos || [1, 2, 3, 4, 5];
    }
    const veh = this.getActiveVehicle();
    if (veh && Array.isArray(veh.comandos_permitidos) && veh.comandos_permitidos.length > 0) {
      return veh.comandos_permitidos.map(Number);
    }
    return [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14];
  }

  isCommandAllowed(codigoComando) {
    const cod = Number(codigoComando);
    if (cod === 5) return true; // PARAR siempre permitido por seguridad
    return this.getAllowedCommandCodes().includes(cod);
  }
}

export const sessionStore = new SessionStore();
