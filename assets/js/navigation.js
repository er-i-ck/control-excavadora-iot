/**
 * Módulo de Navegación de 3 Vistas: CONTROL | MONITOREO | ADMINISTRACIÓN (navigation.js - v20)
 */

class NavigationController {
  constructor() {
    this.currentView = "admin";
    this.btnControl = document.getElementById("tab-btn-control");
    this.btnMonitor = document.getElementById("tab-btn-monitor");
    this.btnAdmin = document.getElementById("tab-btn-admin");

    this.viewControl = document.getElementById("view-control");
    this.viewMonitor = document.getElementById("view-monitor");
    this.viewAdmin = document.getElementById("view-admin");

    this.onViewChangeCallbacks = new Set();
  }

  init() {
    if (this.btnControl) this.btnControl.addEventListener("click", () => this.switchView("control"));
    if (this.btnMonitor) this.btnMonitor.addEventListener("click", () => this.switchView("monitor"));
    if (this.btnAdmin) this.btnAdmin.addEventListener("click", () => this.switchView("admin"));
  }

  onViewChange(callback) {
    this.onViewChangeCallbacks.add(callback);
  }

  updateTabLabels(role) {
    const adminLabel = document.getElementById("tab-label-admin");
    if (!adminLabel) return;
    if (role === "ADMIN") adminLabel.textContent = "ADMINISTRACIÓN";
    else if (role === "USUARIO") adminLabel.textContent = "MIS VEHÍCULOS";
    else adminLabel.textContent = "CATÁLOGO / DEMO";
  }

  switchView(targetView) {
    if (!["control", "monitor", "admin"].includes(targetView)) return;
    this.currentView = targetView;

    const map = [
      { key: "control", btn: this.btnControl, view: this.viewControl },
      { key: "monitor", btn: this.btnMonitor, view: this.viewMonitor },
      { key: "admin", btn: this.btnAdmin, view: this.viewAdmin }
    ];

    map.forEach(({ key, btn, view }) => {
      const active = key === targetView;
      if (view) {
        view.classList.toggle("d-none", !active);
        view.setAttribute("aria-hidden", String(!active));
      }
      if (btn) {
        btn.classList.toggle("active", active);
        btn.setAttribute("aria-selected", String(active));
      }
    });

    this.onViewChangeCallbacks.forEach((cb) => cb(targetView));
  }
}

export const navigation = new NavigationController();
