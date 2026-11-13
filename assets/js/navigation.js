/**
 * Módulo de Navegación entre CONTROL y MONITOREO (navigation.js)
 * Cambia de vista sin recargar el documento, preserva accesibilidad por teclado
 * y dispara la sincronización REST al entrar a MONITOREO (Puntos 3.1, 3.5 y 7.4).
 */

class NavigationController {
  constructor() {
    this.currentView = "control";
    this.btnControl = document.getElementById("tab-btn-control");
    this.btnMonitor = document.getElementById("tab-btn-monitor");
    this.viewControl = document.getElementById("view-control");
    this.viewMonitor = document.getElementById("view-monitor");
    this.onViewChangeCallbacks = new Set();
  }

  init() {
    if (this.btnControl) {
      this.btnControl.addEventListener("click", () => this.switchView("control"));
    }
    if (this.btnMonitor) {
      this.btnMonitor.addEventListener("click", () => this.switchView("monitor"));
    }
  }

  onViewChange(callback) {
    this.onViewChangeCallbacks.add(callback);
  }

  switchView(targetView) {
    if (targetView !== "control" && targetView !== "monitor") return;
    this.currentView = targetView;

    const isControl = targetView === "control";

    if (this.viewControl) {
      this.viewControl.classList.toggle("d-none", !isControl);
      this.viewControl.setAttribute("aria-hidden", String(!isControl));
    }

    if (this.viewMonitor) {
      this.viewMonitor.classList.toggle("d-none", isControl);
      this.viewMonitor.setAttribute("aria-hidden", String(isControl));
    }

    if (this.btnControl) {
      this.btnControl.classList.toggle("active", isControl);
      this.btnControl.setAttribute("aria-selected", String(isControl));
    }

    if (this.btnMonitor) {
      this.btnMonitor.classList.toggle("active", !isControl);
      this.btnMonitor.setAttribute("aria-selected", String(!isControl));
    }

    this.onViewChangeCallbacks.forEach((cb) => cb(targetView));
  }
}

export const navigation = new NavigationController();