/**
 * Controlador de Administración, Roles, Mis Vehículos, Editor de DEMOs, Movimientos e Invitados (v20)
 */

import { CONFIG, obtenerIconoVehiculo } from "./config.js?v=20";
import { apiClient } from "./apiClient.js?v=20";
import { sessionStore } from "./sessionStore.js?v=20";
import { navigation } from "./navigation.js?v=20";
import { formatearFechaHora } from "./dateUtils.js?v=20";

const COMANDOS_CATALOGO_LISTA = Object.values(CONFIG.COMANDOS).sort((a, b) => a.codigo - b.codigo);

class AdminController {
  constructor() {
    this.initialized = false;
    this.currentSubtab = null;
    this.modelosCache = [];
    this.unidadesCache = [];
    this.clientesCache = [];
    this.comandosCache = [];
    this.editorPasos = [];
    this.editorComandosUnidad = [];
    this.guestCountdownInterval = null;
    this.guestInactivityTimer = null;
    this.onSessionReadyCallback = null;
    this.onVehicleSelectedCallback = null;
    this.onDemosUpdatedCallback = null;
    this.onLogoutCallback = null;
  }

  configureCallbacks({ onSessionReady, onVehicleSelected, onDemosUpdated, onLogout }) {
    this.onSessionReadyCallback = onSessionReady;
    this.onVehicleSelectedCallback = onVehicleSelected;
    this.onDemosUpdatedCallback = onDemosUpdated;
    this.onLogoutCallback = onLogout;
  }

  init() {
    if (this.initialized) return;
    this.initialized = true;
    this._renderCheckboxesModelo();
    this._bindEvents();
  }

  showFeedback(mensaje, tipo = "info") {
    const el = document.getElementById("admin-global-feedback");
    if (!el) return;
    if (!mensaje) {
      el.classList.add("d-none");
      return;
    }
    el.className = `alert alert-${tipo} py-2 px-3 mb-2 small`;
    el.textContent = mensaje;
    el.classList.remove("d-none");
  }

  _bindEvents() {
    const formLogin = document.getElementById("form-login");
    if (formLogin) {
      formLogin.addEventListener("submit", (e) => {
        e.preventDefault();
        this._handleLoginSubmit();
      });
    }

    document.getElementById("btn-refresh-catalogo")?.addEventListener("click", () => this.cargarCatalogoPublico());
    document.getElementById("btn-invitado-ir-control")?.addEventListener("click", () => navigation.switchView("control"));
    document.getElementById("btn-invitado-ir-monitor")?.addEventListener("click", () => navigation.switchView("monitor"));
    document.getElementById("btn-invitado-finalizar")?.addEventListener("click", () => this.finalizarPruebaInvitado(false));

    document.querySelectorAll(".admin-subtab").forEach((btn) => {
      btn.addEventListener("click", () => this.switchSubtab(btn.dataset.subtab));
    });

    document.getElementById("btn-reload-dashboard")?.addEventListener("click", () => this.cargarDashboard());
    document.getElementById("btn-reload-auditoria")?.addEventListener("click", () => this.cargarAuditoria());
    document.getElementById("btn-filtrar-auditoria")?.addEventListener("click", () => this.cargarAuditoria());
    document.getElementById("btn-limpiar-auditoria")?.addEventListener("click", () => {
      const f1 = document.getElementById("audit-fecha-inicio");
      const f2 = document.getElementById("audit-fecha-fin");
      const ac = document.getElementById("audit-tipo-accion");
      if (f1) f1.value = "";
      if (f2) f2.value = "";
      if (ac) ac.value = "";
      this.cargarAuditoria();
    });

    document.getElementById("btn-toggle-registro")?.addEventListener("click", () => {
      const fReg = document.getElementById("form-registro");
      const fLog = document.getElementById("form-login");
      const btn = document.getElementById("btn-toggle-registro");
      const mostrandoReg = fReg && !fReg.classList.contains("d-none");
      fReg?.classList.toggle("d-none", mostrandoReg);
      fLog?.classList.toggle("d-none", !mostrandoReg);
      if (btn) btn.textContent = mostrandoReg ? "¿No tienes cuenta? Regístrate aquí" : "¿Ya tienes cuenta? Inicia sesión";
    });

    document.getElementById("form-registro")?.addEventListener("submit", (e) => {
      e.preventDefault();
      this._handleRegistroSubmit();
    });

    window.addEventListener("iot-guest-activity", () => {
      if (sessionStore.getRole() === "INVITADO") {
        this._resetGuestInactivityTimer();
      }
    });

    this._initGoogleSignIn();
    document.getElementById("btn-reload-mis-vehiculos")?.addEventListener("click", () => this.renderMisVehiculos());

    document.getElementById("form-modelo")?.addEventListener("submit", (e) => {
      e.preventDefault();
      this._guardarModelo();
    });
    document.getElementById("btn-cancelar-modelo")?.addEventListener("click", () => this._limpiarFormModelo());

    document.getElementById("form-unidad")?.addEventListener("submit", (e) => {
      e.preventDefault();
      this._guardarUnidad();
    });
    document.getElementById("btn-cancelar-unidad")?.addEventListener("click", () => this._limpiarFormUnidad());
    document.getElementById("filtro-unidades-estado")?.addEventListener("change", () => this.cargarUnidades());
    document.getElementById("filtro-unidades-buscar")?.addEventListener("input", () => this.cargarUnidades());

    document.getElementById("form-cliente")?.addEventListener("submit", (e) => {
      e.preventDefault();
      this._crearCliente();
    });
    document.getElementById("form-asignacion")?.addEventListener("submit", (e) => {
      e.preventDefault();
      this._asignarUnidad();
    });

    document.getElementById("editor-demo-vehiculo")?.addEventListener("change", () => this.cargarDemosParaEditor());
    document.getElementById("btn-nueva-demo")?.addEventListener("click", () => this._resetEditorDemo());
    document.getElementById("btn-cancelar-editor-demo")?.addEventListener("click", () => this._resetEditorDemo());
    document.getElementById("btn-agregar-paso-demo")?.addEventListener("click", () => this._agregarPasoEditor());
    document.getElementById("form-editor-demo")?.addEventListener("submit", (e) => {
      e.preventDefault();
      this._guardarDemoCompleta();
    });

    document.getElementById("mov-cmd-vehiculo")?.addEventListener("change", () => {
      this._resetFormComando();
      this.cargarComandosGestion();
    });
    document.getElementById("btn-reload-comandos")?.addEventListener("click", () => this.cargarComandosGestion());
    document.getElementById("btn-cancelar-comando")?.addEventListener("click", () => this._resetFormComando());
    document.getElementById("form-comando")?.addEventListener("submit", (e) => {
      e.preventDefault();
      this._handleGuardarComando();
    });
  }

  async syncForSession() {
    this.showFeedback("");
    const rol = sessionStore.getRole();
    const panelPublico = document.getElementById("panel-publico");
    const panelInvitado = document.getElementById("panel-invitado-activo");
    const panelWorkspace = document.getElementById("panel-workspace");

    this._stopGuestCountdown();

    if (!sessionStore.isAuthenticated()) {
      panelPublico?.classList.remove("d-none");
      panelInvitado?.classList.add("d-none");
      panelWorkspace?.classList.add("d-none");
      await this.cargarCatalogoPublico();
      return;
    }

    if (rol === "INVITADO") {
      panelPublico?.classList.add("d-none");
      panelWorkspace?.classList.add("d-none");
      panelInvitado?.classList.remove("d-none");
      this._renderGuestActivePanel();
      return;
    }

    panelPublico?.classList.add("d-none");
    panelInvitado?.classList.add("d-none");
    panelWorkspace?.classList.remove("d-none");

    const isAdmin = rol === "ADMIN";
    document.querySelectorAll(".role-admin-only").forEach((el) => {
      el.classList.toggle("d-none", !isAdmin);
    });

    const defaultSubtab = isAdmin ? "dashboard" : "mis-vehiculos";
    await this.switchSubtab(defaultSubtab);
  }

  async switchSubtab(target) {
    const rol = sessionStore.getRole();
    if (rol !== "ADMIN" && !["mis-vehiculos", "editor-demos", "movimientos"].includes(target)) {
      target = "mis-vehiculos";
    }
    this.currentSubtab = target;

    document.querySelectorAll(".admin-subtab").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.subtab === target);
    });
    document.querySelectorAll(".admin-subpane").forEach((pane) => {
      pane.classList.toggle("d-none", pane.id !== `subtab-${target}`);
    });

    if (target === "dashboard") await this.cargarDashboard();
    else if (target === "modelos") await this.cargarModelos();
    else if (target === "unidades") {
      await this.cargarModelos(true);
      await this.cargarUnidades();
    } else if (target === "clientes") {
      await Promise.all([this.cargarClientes(), this.cargarUnidades(true)]);
    } else if (target === "mis-vehiculos") {
      this.renderMisVehiculos();
    } else if (target === "editor-demos") {
      await this.prepararEditorDemos();
    } else if (target === "movimientos") {
      await this.prepararGestionMovimientos();
    } else if (target === "auditoria") {
      await this.cargarAuditoria();
    }
  }

  async _handleLoginSubmit() {
    const correo = document.getElementById("login-correo")?.value.trim() || "";
    const password = document.getElementById("login-password")?.value || "";
    const errBox = document.getElementById("login-error-box");
    const btn = document.getElementById("btn-submit-login");

    errBox?.classList.add("d-none");
    if (!correo || !password) {
      if (errBox) {
        errBox.textContent = "Ingresa tu correo y contraseña.";
        errBox.classList.remove("d-none");
      }
      return;
    }

    if (btn) btn.disabled = true;
    try {
      const data = await apiClient.login(correo, password);
      const actor = {
        tipo: "USUARIO",
        id_usuario: data.usuario.id_usuario,
        id_sesion_invitado: null,
        nombre: data.usuario.nombre,
        correo: data.usuario.correo,
        rol: data.usuario.rol,
        id_vehiculo_reservado: null,
        comandos_permitidos: null,
        expira_en: data.expira_en
      };
      sessionStore.setSession(data.access_token, actor);
      document.getElementById("login-password").value = "";
      if (this.onSessionReadyCallback) await this.onSessionReadyCallback();
    } catch (error) {
      if (errBox) {
        errBox.textContent = error.message || "Error al iniciar sesión.";
        errBox.classList.remove("d-none");
      }
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async _handleRegistroSubmit() {
    const nombre = document.getElementById("reg-nombre")?.value.trim() || "";
    const correo = document.getElementById("reg-correo")?.value.trim() || "";
    const password = document.getElementById("reg-password")?.value || "";
    const errBox = document.getElementById("login-error-box");
    errBox?.classList.add("d-none");

    try {
      const data = await apiClient.registrarCuenta(nombre, correo, password);
      sessionStore.setSession(data.access_token, {
        tipo: "USUARIO",
        id_usuario: data.usuario.id_usuario,
        id_sesion_invitado: null,
        nombre: data.usuario.nombre,
        correo: data.usuario.correo,
        rol: data.usuario.rol,
        id_vehiculo_reservado: null,
        comandos_permitidos: null,
        expira_en: data.expira_en
      });
      document.getElementById("form-registro")?.reset();
      if (this.onSessionReadyCallback) await this.onSessionReadyCallback();
    } catch (error) {
      if (errBox) {
        errBox.textContent = error.message || "No se pudo crear la cuenta.";
        errBox.classList.remove("d-none");
      }
    }
  }

  _initGoogleSignIn(intentos = 0) {
    const container = document.getElementById("google-signin-btn");
    if (!container || !CONFIG.GOOGLE_CLIENT_ID) return;
    if (!window.google?.accounts?.id) {
      if (intentos < 15) setTimeout(() => this._initGoogleSignIn(intentos + 1), 400);
      return;
    }
    window.google.accounts.id.initialize({
      client_id: CONFIG.GOOGLE_CLIENT_ID,
      callback: (response) => this._handleGoogleCredential(response)
    });
    container.innerHTML = "";
    window.google.accounts.id.renderButton(container, {
      theme: "filled_black",
      size: "medium",
      text: "continue_with",
      shape: "pill",
      width: 260
    });
  }

  async _handleGoogleCredential(response) {
    const errBox = document.getElementById("login-error-box");
    errBox?.classList.add("d-none");
    try {
      const data = await apiClient.loginConGoogle(response.credential);
      sessionStore.setSession(data.access_token, {
        tipo: "USUARIO",
        id_usuario: data.usuario.id_usuario,
        id_sesion_invitado: null,
        nombre: data.usuario.nombre,
        correo: data.usuario.correo,
        rol: data.usuario.rol,
        id_vehiculo_reservado: null,
        comandos_permitidos: null,
        expira_en: data.expira_en
      });
      if (this.onSessionReadyCallback) await this.onSessionReadyCallback();
    } catch (error) {
      if (errBox) {
        errBox.textContent = error.message || "Error al iniciar sesión con Google.";
        errBox.classList.remove("d-none");
      }
    }
  }

  _resetGuestInactivityTimer() {
    if (this.guestInactivityTimer) clearTimeout(this.guestInactivityTimer);
    if (sessionStore.getRole() !== "INVITADO") return;
    this.guestInactivityTimer = setTimeout(() => {
      if (sessionStore.getRole() === "INVITADO") {
        this.finalizarPruebaInvitado(true, "Sesión cerrada por inactividad (45s sin movimiento) para liberar la unidad.");
      }
    }, CONFIG.GUEST_INACTIVITY_MS);
  }

  async cargarCatalogoPublico() {
    const contUnidades = document.getElementById("catalogo-exhibicion-container");
    const contModelos = document.getElementById("catalogo-modelos-container");
    if (!contUnidades || !contModelos) return;

    try {
      const data = await apiClient.obtenerCatalogoInvitado();
      const unidades = data.unidades_exhibicion || [];
      const modelos = data.modelos || [];

      contUnidades.innerHTML = "";
      if (unidades.length === 0) {
        contUnidades.innerHTML = '<div class="col-12 small text-secondary">No hay unidades de exhibición disponibles por el momento.</div>';
      } else {
        unidades.forEach((u) => {
          const col = document.createElement("div");
          col.className = "col-12 col-md-6";
          const estadoBadge = u.disponible
            ? '<span class="badge bg-success badge-xs">Disponible</span>'
            : `<span class="badge bg-danger badge-xs">Ocupada (${u.segundos_restantes_reserva}s)</span>`;

          col.innerHTML = `
            <div class="p-2 rounded border border-secondary bg-dark h-100 d-flex flex-column justify-content-between">
              <div>
                <div class="d-flex justify-content-between align-items-center mb-1">
                  <strong class="text-warning small">${obtenerIconoVehiculo(u.nombre, u.modelo_nombre)}${this._esc(u.nombre)}</strong>
                  ${estadoBadge}
                </div>
                <div class="small text-secondary mb-2">
                  Serie: <span class="text-info">${this._esc(u.codigo_serie)}</span> · Modelo: ${this._esc(u.modelo_nombre || "Estándar")}
                </div>
              </div>
              <button type="button" class="btn btn-sm ${u.disponible ? "btn-info text-dark fw-bold" : "btn-outline-secondary"}" data-reservar-vehiculo="${u.id_vehiculo}" ${u.disponible ? "" : "disabled"}>
                <i class="bi bi-play-circle me-1"></i>${u.disponible ? "Reservar y Probar" : "En uso por otro invitado"}
              </button>
            </div>
          `;
          contUnidades.appendChild(col);
        });

        contUnidades.querySelectorAll("[data-reservar-vehiculo]").forEach((btn) => {
          btn.addEventListener("click", () => this._reservarUnidadInvitado(Number(btn.dataset.reservarVehiculo)));
        });
      }

      contModelos.innerHTML = "";
      modelos.forEach((m) => {
        const col = document.createElement("div");
        col.className = "col-12 col-sm-6";
        const caps = (m.capacidades || []).map((c) => c.nombre_comando).join(", ") || "Sin datos";
        col.innerHTML = `
          <div class="p-2 rounded border border-secondary-subtle bg-dark h-100">
            <div class="fw-bold small text-light">${this._esc(m.nombre)} <span class="text-secondary">(${this._esc(m.codigo_modelo)})</span></div>
            <div class="small text-secondary">${this._esc(m.descripcion || "Sin descripción")}</div>
            <div class="mt-1 small text-info">Capacidades: ${this._esc(caps)}</div>
          </div>
        `;
        contModelos.appendChild(col);
      });
    } catch (error) {
      contUnidades.innerHTML = `<div class="col-12 small text-danger">Error cargando catálogo: ${this._esc(error.message)}</div>`;
    }
  }

  async _reservarUnidadInvitado(idVehiculo) {
    const nombre = document.getElementById("invitado-nombre")?.value.trim() || "Invitado";
    const duracion = Number(document.getElementById("invitado-duracion")?.value || 120);
    this.showFeedback("Reservando unidad de exhibición en AWS...", "info");

    try {
      const res = await apiClient.iniciarSesionInvitado(idVehiculo, nombre, duracion);
      const actor = {
        tipo: "INVITADO",
        id_usuario: null,
        id_sesion_invitado: res.id_sesion_invitado,
        nombre,
        correo: null,
        rol: "INVITADO",
        id_vehiculo_reservado: res.id_vehiculo,
        unidad_nombre: res.unidad_nombre,
        codigo_serie: res.codigo_serie,
        comandos_permitidos: res.comandos_permitidos,
        expira_en: res.expira_en
      };
      sessionStore.setSession(res.access_token, actor);
      this.showFeedback(`Reserva exclusiva otorgada para ${res.unidad_nombre} (${res.codigo_serie}).`, "success");
      if (this.onSessionReadyCallback) await this.onSessionReadyCallback();
      navigation.switchView("control");
    } catch (error) {
      this.showFeedback(error.message || "No se pudo iniciar la prueba de invitado.", "danger");
      await this.cargarCatalogoPublico();
    }
  }

  _renderGuestActivePanel() {
    const actor = sessionStore.getActor();
    const det = document.getElementById("invitado-panel-detalle");
    if (det && actor) {
      det.textContent = `Unidad reservada en exclusiva: #${actor.id_vehiculo_reservado} (${actor.unidad_nombre || "Unidad de Exhibición"}).`;
    }
    this._startGuestCountdown();
  }

  _startGuestCountdown() {
    this._stopGuestCountdown();
    const actor = sessionStore.getActor();
    if (!actor || actor.rol !== "INVITADO" || !actor.expira_en) return;

    const expStr = String(actor.expira_en).endsWith("Z") || String(actor.expira_en).includes("+")
      ? actor.expira_en
      : `${actor.expira_en}Z`;
    const expMs = Date.parse(expStr);
    const badgeHeader = document.getElementById("guest-timer-badge");
    const txtHeader = document.getElementById("guest-timer-text");
    const txtPanel = document.getElementById("invitado-panel-timer");

    badgeHeader?.classList.remove("d-none");

    const tick = () => {
      const restSec = Math.max(0, Math.floor((expMs - Date.now()) / 1000));
      const mm = String(Math.floor(restSec / 60)).padStart(2, "0");
      const ss = String(restSec % 60).padStart(2, "0");
      const fmt = `${mm}:${ss}`;
      if (txtHeader) txtHeader.textContent = fmt;
      if (txtPanel) txtPanel.textContent = fmt;

      if (restSec <= 0) {
        this._stopGuestCountdown();
        this.finalizarPruebaInvitado(true);
      }
    };
    tick();
    this.guestCountdownInterval = setInterval(tick, 1000);
    this._resetGuestInactivityTimer();
  }

  _stopGuestCountdown() {
    if (this.guestInactivityTimer) {
      clearTimeout(this.guestInactivityTimer);
      this.guestInactivityTimer = null;
    }
    if (this.guestCountdownInterval) {
      clearInterval(this.guestCountdownInterval);
      this.guestCountdownInterval = null;
    }
    document.getElementById("guest-timer-badge")?.classList.add("d-none");
  }

  async finalizarPruebaInvitado(porExpiracion = false, mensajePersonalizado = null) {
    this._stopGuestCountdown();
    const idVeh = sessionStore.getActiveVehicleId();
    if (idVeh) {
      try {
        await apiClient.enviarMovimiento(5, idVeh);
      } catch {
        // Ignorar si ya expiró
      }
    }
    try {
      await apiClient.finalizarSesionInvitado();
    } catch {
      // Ignorar si ya expiró
    }
    if (this.onLogoutCallback) await this.onLogoutCallback(true);
    const msg = mensajePersonalizado || (porExpiracion
      ? "Tu sesión temporal de invitado expiró. Se envió detención segura y se liberó la unidad."
      : "Sesión de invitado finalizada y unidad de exhibición liberada.");
    this.showFeedback(msg, "warning");
  }

  async cargarDashboard() {
    const grid = document.getElementById("admin-metrics-grid");
    const tbody = document.getElementById("dashboard-audit-tbody");
    if (!grid || !tbody) return;
    grid.innerHTML = '<div class="col-12 small text-secondary">Consultando métricas reales en RDS...</div>';

    try {
      const data = await apiClient.obtenerDashboardAdmin();
      const m = data.metricas || {};
      const cards = [
        { label: "Modelos Activos", val: m.modelos_activos, cls: "text-info" },
        { label: "Unidades Activas", val: m.unidades_totales, cls: "text-warning" },
        { label: "Vendidas / Asignadas", val: m.unidades_vendidas, cls: "text-success" },
        { label: "Disponibles", val: m.unidades_disponibles, cls: "text-light" },
        { label: "Exhibición Invitados", val: m.unidades_exhibicion, cls: "text-info" },
        { label: "Clientes Activos", val: m.clientes_activos, cls: "text-warning" },
        { label: "DEMOs Registradas", val: m.demos_activas, cls: "text-light" },
        { label: "Movimientos en RDS", val: m.historial_total, cls: "text-success" }
      ];

      grid.innerHTML = cards
        .map(
          (c) => `
          <div class="col-6 col-md-3">
            <div class="metric-tile h-100">
              <div class="metric-value ${c.cls}">${c.val ?? "Sin datos"}</div>
              <div class="metric-label">${c.label}</div>
            </div>
          </div>`
        )
        .join("");

      const logs = data.auditoria_reciente || [];
      tbody.innerHTML = logs.length
        ? logs
            .map((l) => {
              const fh = formatearFechaHora(l.fecha_evento, "Sin fecha");
              return `<tr>
                <td>#${l.id_auditoria}</td>
                <td class="fw-semibold text-warning">${this._esc(l.accion)}</td>
                <td>${this._esc(l.recurso || "—")}</td>
                <td>${this._esc(l.actor_nombre || "Invitado/Sistema")}</td>
                <td><span class="badge ${l.resultado === "EXITO" ? "bg-success" : "bg-danger"} badge-xs">${this._esc(l.resultado)}</span></td>
                <td class="text-secondary">${fh.fecha} ${fh.hora}</td>
              </tr>`;
            })
            .join("")
        : '<tr><td colspan="6" class="text-center text-secondary">Sin eventos registrados.</td></tr>';
    } catch (error) {
      this.showFeedback(`Error cargando Dashboard: ${error.message}`, "danger");
    }
  }

  _renderCheckboxesModelo() {
    const cont = document.getElementById("modelo-comandos-checks");
    if (!cont) return;
    cont.innerHTML = COMANDOS_CATALOGO_LISTA.map((c) => {
      const checked = [1, 2, 3, 4, 5].includes(c.codigo) ? "checked" : "";
      const dis = c.codigo === 5 ? "disabled" : "";
      return `
        <label class="form-check form-check-inline m-0">
          <input class="form-check-input modelo-cmd-check" type="checkbox" value="${c.codigo}" ${checked} ${dis} />
          <span class="form-check-label">${c.codigo}: ${c.etiqueta}</span>
        </label>`;
    }).join("");
  }

  async cargarModelos(soloSelect = false) {
    try {
      this.modelosCache = await apiClient.obtenerModelosAdmin();
      const selUnidad = document.getElementById("unidad-modelo");
      if (selUnidad) {
        selUnidad.innerHTML = this.modelosCache
          .filter((m) => m.activo)
          .map((m) => `<option value="${m.id_modelo}">${this._esc(m.codigo_modelo)} · ${this._esc(m.nombre)}</option>`)
          .join("");
      }
      if (soloSelect) return;

      const tbody = document.getElementById("admin-modelos-tbody");
      if (!tbody) return;
      tbody.innerHTML = this.modelosCache
        .map((m) => {
          const caps = (m.capacidades || []).map((c) => c.codigo_comando).join(", ");
          return `<tr>
            <td>#${m.id_modelo}</td>
            <td class="text-info fw-semibold">${this._esc(m.codigo_modelo)}</td>
            <td>${this._esc(m.nombre)}<div class="text-secondary small">${this._esc(m.descripcion || "")}</div></td>
            <td class="small text-secondary">${caps || "—"}</td>
            <td><button type="button" class="btn btn-xs btn-outline-warning" data-edit-modelo="${m.id_modelo}">Editar</button></td>
          </tr>`;
        })
        .join("");

      tbody.querySelectorAll("[data-edit-modelo]").forEach((btn) => {
        btn.addEventListener("click", () => this._cargarModeloEnForm(Number(btn.dataset.editModelo)));
      });
    } catch (error) {
      this.showFeedback(`Error cargando modelos: ${error.message}`, "danger");
    }
  }

  _cargarModeloEnForm(idModelo) {
    const m = this.modelosCache.find((x) => x.id_modelo === idModelo);
    if (!m) return;
    document.getElementById("modelo-edit-id").value = String(m.id_modelo);
    document.getElementById("modelo-codigo").value = m.codigo_modelo;
    document.getElementById("modelo-codigo").disabled = true;
    document.getElementById("modelo-nombre").value = m.nombre;
    document.getElementById("modelo-desc").value = m.descripcion || "";
    document.getElementById("titulo-form-modelo").textContent = `Editando Modelo #${m.id_modelo}`;

    const setCaps = new Set((m.capacidades || []).map((c) => Number(c.codigo_comando)));
    setCaps.add(5);
    document.querySelectorAll(".modelo-cmd-check").forEach((chk) => {
      chk.checked = setCaps.has(Number(chk.value));
    });
  }

  _limpiarFormModelo() {
    document.getElementById("modelo-edit-id").value = "";
    document.getElementById("modelo-codigo").value = "";
    document.getElementById("modelo-codigo").disabled = false;
    document.getElementById("modelo-nombre").value = "";
    document.getElementById("modelo-desc").value = "";
    document.getElementById("titulo-form-modelo").textContent = "Registrar Modelo Comercial";
    this._renderCheckboxesModelo();
  }

  async _guardarModelo() {
    const editId = document.getElementById("modelo-edit-id").value;
    const codigo_modelo = document.getElementById("modelo-codigo").value.trim();
    const nombre = document.getElementById("modelo-nombre").value.trim();
    const descripcion = document.getElementById("modelo-desc").value.trim();
    const comandos_codigos = Array.from(document.querySelectorAll(".modelo-cmd-check:checked")).map((el) => Number(el.value));

    try {
      if (editId) {
        await apiClient.actualizarModeloAdmin(Number(editId), { nombre, descripcion, comandos_codigos });
        this.showFeedback("Modelo comercial actualizado correctamente.", "success");
      } else {
        await apiClient.crearModeloAdmin({ codigo_modelo, nombre, descripcion, comandos_codigos });
        this.showFeedback("Modelo comercial creado correctamente.", "success");
      }
      this._limpiarFormModelo();
      await this.cargarModelos();
    } catch (error) {
      this.showFeedback(error.message, "danger");
    }
  }

  async cargarUnidades(soloSelect = false) {
    try {
      const estado = soloSelect ? "" : document.getElementById("filtro-unidades-estado")?.value || "";
      const buscar = soloSelect ? "" : document.getElementById("filtro-unidades-buscar")?.value.trim() || "";
      this.unidadesCache = await apiClient.obtenerUnidadesAdmin({ estado, buscar });

      const selAsig = document.getElementById("asig-unidad");
      if (selAsig) {
        selAsig.innerHTML = this.unidadesCache
          .filter((u) => u.activo)
          .map((u) => `<option value="${u.id_vehiculo}">#${u.id_vehiculo} · ${this._esc(u.codigo_serie)} (${this._esc(u.nombre)}) [${u.estado_operativo}]</option>`)
          .join("");
      }
      if (soloSelect) return;

      const tbody = document.getElementById("admin-unidades-tbody");
      if (!tbody) return;
      tbody.innerHTML = this.unidadesCache
        .map((u) => {
          const badgeMap = {
            DISPONIBLE: "bg-secondary",
            VENDIDO: "bg-success",
            EXHIBICION: "bg-info text-dark",
            INACTIVO: "bg-danger"
          };
          const bCls = badgeMap[u.estado_operativo] || "bg-secondary";
          const ownerTxt = u.propietario_nombre
            ? `${this._esc(u.propietario_nombre)}<div class="text-secondary small">${this._esc(u.propietario_correo || "")}</div>`
            : '<span class="text-secondary">Sin asignar</span>';

          return `<tr>
            <td><strong>#${u.id_vehiculo}</strong><div class="text-info small">${this._esc(u.codigo_serie || "—")}</div></td>
            <td>${obtenerIconoVehiculo(u.nombre, u.modelo_nombre)}${this._esc(u.nombre)}<div class="text-secondary small">${this._esc(u.modelo_nombre || "Sin modelo")}</div></td>
            <td><span class="badge ${bCls} badge-xs">${this._esc(u.estado_operativo)}</span></td>
            <td>${ownerTxt}</td>
            <td class="text-nowrap">
              <button type="button" class="btn btn-xs btn-outline-warning me-1" data-edit-unidad="${u.id_vehiculo}">Editar</button>
              ${u.propietario_id ? `<button type="button" class="btn btn-xs btn-outline-info me-1" data-liberar-unidad="${u.id_vehiculo}" title="Revocar propietario y dejar disponible">Liberar</button>` : ""}
              ${u.activo ? `<button type="button" class="btn btn-xs btn-outline-danger" data-baja-unidad="${u.id_vehiculo}" title="Baja lógica (conserva historial)">Baja</button>` : ""}
            </td>
          </tr>`;
        })
        .join("");

      tbody.querySelectorAll("[data-edit-unidad]").forEach((b) => b.addEventListener("click", () => this._cargarUnidadEnForm(Number(b.dataset.editUnidad))));
      tbody.querySelectorAll("[data-liberar-unidad]").forEach((b) => b.addEventListener("click", () => this._liberarUnidad(Number(b.dataset.liberarUnidad))));
      tbody.querySelectorAll("[data-baja-unidad]").forEach((b) => b.addEventListener("click", () => this._bajaLogicaUnidad(Number(b.dataset.bajaUnidad))));
    } catch (error) {
      this.showFeedback(`Error cargando unidades: ${error.message}`, "danger");
    }
  }

  _cargarUnidadEnForm(idVehiculo) {
    const u = this.unidadesCache.find((x) => x.id_vehiculo === idVehiculo);
    if (!u) return;
    document.getElementById("unidad-edit-id").value = String(u.id_vehiculo);
    document.getElementById("unidad-serie").value = u.codigo_serie || "";
    document.getElementById("unidad-nombre").value = u.nombre || "";
    document.getElementById("unidad-modelo").value = String(u.id_modelo || 1);
    document.getElementById("unidad-estado").value = u.estado_operativo || "DISPONIBLE";
    document.getElementById("unidad-mcu").value = u.microcontrolador || "ESP8266";
    document.getElementById("titulo-form-unidad").textContent = `Editando Unidad #${u.id_vehiculo}`;
  }

  _limpiarFormUnidad() {
    document.getElementById("unidad-edit-id").value = "";
    document.getElementById("unidad-serie").value = "";
    document.getElementById("unidad-nombre").value = "";
    document.getElementById("unidad-estado").value = "DISPONIBLE";
    document.getElementById("unidad-mcu").value = "ESP8266";
    document.getElementById("titulo-form-unidad").textContent = "Registrar Unidad Física";
  }

  async _guardarUnidad() {
    const editId = document.getElementById("unidad-edit-id").value;
    const payload = {
      codigo_serie: document.getElementById("unidad-serie").value.trim(),
      nombre: document.getElementById("unidad-nombre").value.trim(),
      id_modelo: Number(document.getElementById("unidad-modelo").value),
      estado_operativo: document.getElementById("unidad-estado").value,
      microcontrolador: document.getElementById("unidad-mcu").value.trim() || "ESP8266"
    };

    try {
      if (editId) {
        await apiClient.actualizarUnidadAdmin(Number(editId), { ...payload, activo: payload.estado_operativo === "INACTIVO" ? 0 : 1 });
        this.showFeedback("Unidad física actualizada correctamente.", "success");
      } else {
        await apiClient.crearUnidadAdmin(payload);
        this.showFeedback("Unidad física registrada correctamente.", "success");
      }
      this._limpiarFormUnidad();
      await this.cargarUnidades();
      await this._refrescarListaMisVehiculos();
    } catch (error) {
      this.showFeedback(error.message, "danger");
    }
  }

  async _liberarUnidad(idVehiculo) {
    try {
      await apiClient.liberarUnidadAdmin(idVehiculo, "DISPONIBLE");
      this.showFeedback(`Unidad #${idVehiculo} liberada y permisos del titular anterior revocados.`, "success");
      await this.cargarUnidades();
      await this._refrescarListaMisVehiculos();
    } catch (error) {
      this.showFeedback(error.message, "danger");
    }
  }

  async _bajaLogicaUnidad(idVehiculo) {
    try {
      await apiClient.desactivarUnidadAdmin(idVehiculo);
      this.showFeedback(`Baja lógica aplicada a Unidad #${idVehiculo}; historial conservado en RDS.`, "warning");
      await this.cargarUnidades();
      await this._refrescarListaMisVehiculos();
    } catch (error) {
      this.showFeedback(error.message, "danger");
    }
  }

  async cargarClientes() {
    try {
      this.clientesCache = await apiClient.obtenerClientesAdmin();
      const selCli = document.getElementById("asig-cliente");
      if (selCli) {
        selCli.innerHTML = this.clientesCache
          .filter((c) => c.activo)
          .map((c) => `<option value="${c.id_usuario}">#${c.id_usuario} · ${this._esc(c.nombre)} (${this._esc(c.correo)}) [${c.rol}]</option>`)
          .join("");
      }

      const tbody = document.getElementById("admin-clientes-tbody");
      if (!tbody) return;
      tbody.innerHTML = this.clientesCache
        .map((c) => `<tr>
          <td>#${c.id_usuario}</td>
          <td><strong>${this._esc(c.nombre)}</strong><div class="text-secondary small">${this._esc(c.correo)}</div></td>
          <td><span class="badge ${c.rol === "ADMIN" ? "bg-warning text-dark" : "bg-info text-dark"} badge-xs">${this._esc(c.rol)}</span></td>
          <td class="text-center fw-bold">${c.total_unidades}</td>
          <td><span class="badge ${c.activo ? "bg-success" : "bg-danger"} badge-xs">${c.activo ? "Activo" : "Inactivo"}</span></td>
          <td>
            <button type="button" class="btn btn-xs ${c.activo ? "btn-outline-danger" : "btn-outline-success"}" data-toggle-cliente="${c.id_usuario}" data-next-activo="${c.activo ? 0 : 1}">
              ${c.activo ? "Desactivar" : "Reactivar"}
            </button>
          </td>
        </tr>`)
        .join("");

      tbody.querySelectorAll("[data-toggle-cliente]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          try {
            await apiClient.cambiarEstadoClienteAdmin(Number(btn.dataset.toggleCliente), Number(btn.dataset.nextActivo));
            this.showFeedback("Estado de cuenta actualizado.", "success");
            await this.cargarClientes();
          } catch (error) {
            this.showFeedback(error.message, "danger");
          }
        });
      });
    } catch (error) {
      this.showFeedback(`Error cargando clientes: ${error.message}`, "danger");
    }
  }

  async _crearCliente() {
    const payload = {
      nombre: document.getElementById("cliente-nombre").value.trim(),
      correo: document.getElementById("cliente-correo").value.trim(),
      password: document.getElementById("cliente-password").value,
      rol: document.getElementById("cliente-rol").value
    };
    try {
      await apiClient.crearClienteAdmin(payload);
      document.getElementById("form-cliente").reset();
      this.showFeedback("Cliente/Usuario registrado correctamente en RDS.", "success");
      await this.cargarClientes();
    } catch (error) {
      this.showFeedback(error.message, "danger");
    }
  }

  async _asignarUnidad() {
    const id_vehiculo = Number(document.getElementById("asig-unidad").value);
    const id_usuario = Number(document.getElementById("asig-cliente").value);
    try {
      const res = await apiClient.asignarUnidadAdmin({ id_vehiculo, id_usuario });
      this.showFeedback(res.mensaje || "Unidad asignada correctamente.", "success");
      await Promise.all([this.cargarClientes(), this.cargarUnidades(true), this._refrescarListaMisVehiculos()]);
    } catch (error) {
      this.showFeedback(error.message, "danger");
    }
  }

  async _refrescarListaMisVehiculos() {
    try {
      const vehs = await apiClient.obtenerMisVehiculos();
      sessionStore.setVehicles(vehs);
    } catch {
      // ignore
    }
  }

  renderMisVehiculos() {
    const grid = document.getElementById("mis-vehiculos-grid");
    if (!grid) return;
    const vehs = sessionStore.getVehicles();
    const activeId = Number(sessionStore.getActiveVehicleId());

    if (!vehs.length) {
      grid.innerHTML = `<div class="col-12"><div class="admin-card p-3 rounded-3 text-secondary small">
        No tienes unidades operables asignadas en este momento. ${sessionStore.getRole() === "ADMIN" ? "(Las unidades vendidas a compradores están protegidas contra operación directa del administrador)." : ""}
      </div></div>`;
      return;
    }

    grid.innerHTML = vehs
      .map((v) => {
        const isCurrent = Number(v.id_vehiculo) === activeId;
        const cmds = (v.comandos_permitidos || []).length;
        return `
        <div class="col-12 col-md-6">
          <div class="admin-card p-3 rounded-3 h-100 ${isCurrent ? "vehicle-card-active" : ""}">
            <div class="d-flex justify-content-between align-items-center mb-1">
              <strong class="text-warning">${obtenerIconoVehiculo(v.nombre, v.modelo_nombre)}${this._esc(v.nombre)}</strong>
              <span class="badge ${isCurrent ? "bg-warning text-dark" : "bg-secondary"} badge-xs">${isCurrent ? "ACTIVA" : v.estado_operativo}</span>
            </div>
            <div class="small text-secondary mb-2">
              ID #${v.id_vehiculo} · Serie: <span class="text-info">${this._esc(v.codigo_serie)}</span> · Modelo: ${this._esc(v.modelo_nombre || "Estándar")} · ${cmds} comandos soportados
            </div>
            <div class="d-flex flex-wrap gap-2">
              <button type="button" class="btn btn-sm btn-warning text-dark fw-bold" data-select-go="${v.id_vehiculo}" data-dest="control">
                <i class="bi bi-controller me-1"></i>Controlar
              </button>
              <button type="button" class="btn btn-sm btn-outline-info" data-select-go="${v.id_vehiculo}" data-dest="monitor">
                <i class="bi bi-activity me-1"></i>Monitorear
              </button>
              <button type="button" class="btn btn-sm btn-outline-light" data-select-go="${v.id_vehiculo}" data-dest="demos">
                <i class="bi bi-sliders me-1"></i>DEMOs
              </button>
            </div>
          </div>
        </div>`;
      })
      .join("");

    grid.querySelectorAll("[data-select-go]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = Number(btn.dataset.selectGo);
        const dest = btn.dataset.dest;
        if (this.onVehicleSelectedCallback) await this.onVehicleSelectedCallback(id);
        if (dest === "demos") {
          await this.switchSubtab("editor-demos");
        } else {
          navigation.switchView(dest);
        }
      });
    });
  }

  async prepararEditorDemos() {
    const selVeh = document.getElementById("editor-demo-vehiculo");
    if (!selVeh) return;

    const vehs = sessionStore.getRole() === "ADMIN"
      ? (await apiClient.obtenerUnidadesAdmin()).filter((u) => u.activo)
      : sessionStore.getVehicles();

    if (!vehs.length) {
      selVeh.innerHTML = '<option value="">Sin unidades disponibles</option>';
      return;
    }

    const activeId = Number(sessionStore.getActiveVehicleId() || vehs[0].id_vehiculo);
    selVeh.innerHTML = vehs
      .map((v) => `<option value="${v.id_vehiculo}" ${Number(v.id_vehiculo) === activeId ? "selected" : ""}>#${v.id_vehiculo} · ${this._esc(v.codigo_serie || "")} ${this._esc(v.nombre)}</option>`)
      .join("");

    await this.cargarDemosParaEditor();
  }

  async cargarDemosParaEditor() {
    const idVeh = Number(document.getElementById("editor-demo-vehiculo")?.value);
    const listaEl = document.getElementById("editor-demos-lista");
    if (!idVeh || !listaEl) return;

    listaEl.innerHTML = '<div class="text-secondary py-2">Cargando DEMOs...</div>';
    try {
      const [demos, cmds] = await Promise.all([
        apiClient.obtenerDemosVehiculo(idVeh),
        apiClient.obtenerComandosVehiculo(idVeh)
      ]);
      this.editorComandosUnidad = cmds.length ? cmds : COMANDOS_CATALOGO_LISTA.map((c) => ({ id_comando: c.id, codigo: c.codigo, nombre: c.nombre }));

      if (!demos.length) {
        listaEl.innerHTML = '<div class="text-secondary py-2">No hay DEMOs para esta unidad. Crea la primera con "Nueva DEMO".</div>';
      } else {
        const actor = sessionStore.getActor();
        listaEl.innerHTML = demos
          .map((d) => {
            const puedeEditar = actor.rol === "ADMIN" || (d.tipo_demo === "PRIVADA" && d.id_usuario_creador === actor.id_usuario);
            return `
            <div class="list-group-item bg-transparent text-light border-secondary px-1 py-2 d-flex justify-content-between align-items-center gap-2">
              <div>
                <span class="badge ${d.tipo_demo === "FABRICA" ? "bg-warning text-dark" : "bg-info text-dark"} badge-xs me-1">${d.tipo_demo}</span>
                <strong>${this._esc(d.nombre)}</strong>
                <div class="small text-secondary">${d.total_pasos ?? 0} pasos · ${d.duracion_total_ms ?? 0} ms</div>
              </div>
              <div class="d-flex gap-1">
                ${puedeEditar ? `<button type="button" class="btn btn-xs btn-outline-warning" data-edit-demo="${d.id_demo}">Editar</button>` : '<span class="badge bg-dark text-secondary">Solo lectura</span>'}
                ${puedeEditar ? `<button type="button" class="btn btn-xs btn-outline-danger" data-del-demo="${d.id_demo}"><i class="bi bi-trash"></i></button>` : ""}
              </div>
            </div>`;
          })
          .join("");

        listaEl.querySelectorAll("[data-edit-demo]").forEach((btn) => {
          btn.addEventListener("click", () => {
            const d = demos.find((x) => x.id_demo === Number(btn.dataset.editDemo));
            if (d) this._cargarDemoEnEditor(d);
          });
        });
        listaEl.querySelectorAll("[data-del-demo]").forEach((btn) => {
          btn.addEventListener("click", () => this._eliminarDemoEditor(Number(btn.dataset.delDemo)));
        });
      }

      this._resetEditorDemo();
    } catch (error) {
      listaEl.innerHTML = `<div class="text-danger py-2">${this._esc(error.message)}</div>`;
    }
  }

  _resetEditorDemo() {
    document.getElementById("editor-demo-id").value = "";
    document.getElementById("editor-demo-nombre").value = "";
    document.getElementById("editor-demo-desc").value = "";
    document.getElementById("titulo-editor-demo").textContent = "Nueva Secuencia DEMO";
    const firstCmd = this.editorComandosUnidad[0]?.id_comando || 1;
    this.editorPasos = [{ id_comando: firstCmd, duracion_ms: 1000, pausa_ms: 300 }];
    this._renderPasosEditor();
  }

  async _cargarDemoEnEditor(demo) {
    document.getElementById("editor-demo-id").value = String(demo.id_demo);
    document.getElementById("editor-demo-nombre").value = demo.nombre || "";
    document.getElementById("editor-demo-desc").value = demo.descripcion || "";
    const tipoEl = document.getElementById("editor-demo-tipo");
    if (tipoEl) tipoEl.value = demo.tipo_demo || "FABRICA";
    document.getElementById("titulo-editor-demo").textContent = `Editando DEMO #${demo.id_demo}`;

    try {
      const pasos = await apiClient.obtenerMovimientosDemo(demo.id_demo);
      this.editorPasos = pasos.map((p) => ({
        id_comando: Number(p.id_comando),
        duracion_ms: Number(p.duracion_ms || 1000),
        pausa_ms: Number(p.pausa_ms || 300)
      }));
      if (!this.editorPasos.length) this._agregarPasoEditor();
      else this._renderPasosEditor();
    } catch (error) {
      this.showFeedback(`No se pudieron cargar los pasos: ${error.message}`, "danger");
    }
  }

  _agregarPasoEditor() {
    if (this.editorPasos.length >= 15) {
      this.showFeedback("Límite máximo de 15 pasos por secuencia DEMO.", "warning");
      return;
    }
    const firstCmd = this.editorComandosUnidad[0]?.id_comando || 1;
    this.editorPasos.push({ id_comando: firstCmd, duracion_ms: 1000, pausa_ms: 300 });
    this._renderPasosEditor();
  }

  _renderPasosEditor() {
    const cont = document.getElementById("editor-pasos-container");
    if (!cont) return;

    const optsHtml = (selectedId) =>
      this.editorComandosUnidad
        .map((c) => `<option value="${c.id_comando}" ${Number(c.id_comando) === Number(selectedId) ? "selected" : ""}>[${c.codigo}] ${this._esc(c.nombre)}</option>`)
        .join("");

    cont.innerHTML = this.editorPasos
      .map((p, idx) => `
      <div class="demo-step-row row g-2 align-items-end" data-step-index="${idx}">
        <div class="col-12 col-sm-5">
          <label class="form-label small mb-0 text-warning">Paso #${idx + 1} · Comando</label>
          <select class="form-select form-select-sm bg-dark text-light border-secondary step-cmd">${optsHtml(p.id_comando)}</select>
        </div>
        <div class="col-4 col-sm-2">
          <label class="form-label small mb-0">Dur. (ms)</label>
          <input type="number" class="form-control form-control-sm bg-dark text-light border-secondary step-dur" min="200" max="5000" step="100" value="${p.duracion_ms}" />
        </div>
        <div class="col-4 col-sm-2">
          <label class="form-label small mb-0">Pausa (ms)</label>
          <input type="number" class="form-control form-control-sm bg-dark text-light border-secondary step-pau" min="0" max="3000" step="100" value="${p.pausa_ms}" />
        </div>
        <div class="col-4 col-sm-3 d-flex justify-content-end gap-1">
          <button type="button" class="btn btn-xs btn-outline-light step-up" title="Subir" ${idx === 0 ? "disabled" : ""}><i class="bi bi-arrow-up"></i></button>
          <button type="button" class="btn btn-xs btn-outline-light step-down" title="Bajar" ${idx === this.editorPasos.length - 1 ? "disabled" : ""}><i class="bi bi-arrow-down"></i></button>
          <button type="button" class="btn btn-xs btn-outline-danger step-del" title="Quitar" ${this.editorPasos.length <= 1 ? "disabled" : ""}><i class="bi bi-x-lg"></i></button>
        </div>
      </div>`)
      .join("");

    cont.querySelectorAll(".demo-step-row").forEach((row) => {
      const idx = Number(row.dataset.stepIndex);
      row.querySelector(".step-cmd").addEventListener("change", (e) => {
        this.editorPasos[idx].id_comando = Number(e.target.value);
      });
      row.querySelector(".step-dur").addEventListener("input", (e) => {
        this.editorPasos[idx].duracion_ms = Number(e.target.value || 0);
        this._actualizarDuracionTotalEditor();
      });
      row.querySelector(".step-pau").addEventListener("input", (e) => {
        this.editorPasos[idx].pausa_ms = Number(e.target.value || 0);
        this._actualizarDuracionTotalEditor();
      });
      row.querySelector(".step-up").addEventListener("click", () => {
        if (idx > 0) {
          [this.editorPasos[idx - 1], this.editorPasos[idx]] = [this.editorPasos[idx], this.editorPasos[idx - 1]];
          this._renderPasosEditor();
        }
      });
      row.querySelector(".step-down").addEventListener("click", () => {
        if (idx < this.editorPasos.length - 1) {
          [this.editorPasos[idx + 1], this.editorPasos[idx]] = [this.editorPasos[idx], this.editorPasos[idx + 1]];
          this._renderPasosEditor();
        }
      });
      row.querySelector(".step-del").addEventListener("click", () => {
        if (this.editorPasos.length > 1) {
          this.editorPasos.splice(idx, 1);
          this._renderPasosEditor();
        }
      });
    });

    this._actualizarDuracionTotalEditor();
  }

  _actualizarDuracionTotalEditor() {
    const total = this.editorPasos.reduce((acc, p) => acc + Number(p.duracion_ms || 0) + Number(p.pausa_ms || 0), 0);
    const badge = document.getElementById("editor-duracion-total");
    if (!badge) return;
    badge.textContent = `Total: ${total.toLocaleString()} ms / 30,000 ms`;
    badge.className = total > 30000
      ? "badge bg-danger text-light"
      : "badge bg-dark border border-warning text-warning";
  }

  async _guardarDemoCompleta() {
    const idVeh = Number(document.getElementById("editor-demo-vehiculo").value);
    const editId = document.getElementById("editor-demo-id").value;
    const nombre = document.getElementById("editor-demo-nombre").value.trim();
    const descripcion = document.getElementById("editor-demo-desc").value.trim();
    const tipo_demo = sessionStore.getRole() === "ADMIN" ? document.getElementById("editor-demo-tipo").value : "PRIVADA";

    const payload = {
      id_demo: editId ? Number(editId) : null,
      id_vehiculo: idVeh,
      nombre,
      descripcion,
      tipo_demo,
      pasos: this.editorPasos.map((p, i) => ({
        id_comando: Number(p.id_comando),
        orden: i + 1,
        duracion_ms: Number(p.duracion_ms),
        pausa_ms: Number(p.pausa_ms)
      }))
    };

    try {
      const res = await apiClient.guardarDemoCompleta(payload);
      this.showFeedback(res.mensaje || "DEMO guardada en Amazon RDS.", "success");
      await this.cargarDemosParaEditor();
      if (this.onDemosUpdatedCallback) await this.onDemosUpdatedCallback();
    } catch (error) {
      this.showFeedback(error.message, "danger");
    }
  }

  async _eliminarDemoEditor(idDemo) {
    try {
      await apiClient.eliminarDemo(idDemo);
      this.showFeedback(`DEMO #${idDemo} desactivada correctamente.`, "warning");
      await this.cargarDemosParaEditor();
      if (this.onDemosUpdatedCallback) await this.onDemosUpdatedCallback();
    } catch (error) {
      this.showFeedback(error.message, "danger");
    }
  }

  // ==========================
  // GESTIÓN DE MOVIMIENTOS / COMANDOS (ADMIN Y USUARIO)
  // ==========================
  async prepararGestionMovimientos() {
    const selVeh = document.getElementById("mov-cmd-vehiculo");
    if (!selVeh) return;

    this._resetFormComando();

    const vehs = sessionStore.getRole() === "ADMIN"
      ? (await apiClient.obtenerUnidadesAdmin()).filter((u) => u.activo)
      : sessionStore.getVehicles();

    if (!vehs.length) {
      selVeh.innerHTML = '<option value="">Sin unidades disponibles</option>';
      const tbody = document.getElementById("comandos-tbody");
      if (tbody) tbody.innerHTML = '<tr><td colspan="4" class="text-secondary text-center py-3">No tienes vehículos asignados.</td></tr>';
      return;
    }

    const activeId = Number(sessionStore.getActiveVehicleId() || vehs[0].id_vehiculo);
    selVeh.innerHTML = vehs
      .map((v) => `<option value="${v.id_vehiculo}" ${Number(v.id_vehiculo) === activeId ? "selected" : ""}>#${v.id_vehiculo} · ${this._esc(v.codigo_serie || "")} ${this._esc(v.nombre)}</option>`)
      .join("");

    await this.cargarComandosGestion();
  }

  async cargarComandosGestion() {
    const idVeh = Number(document.getElementById("mov-cmd-vehiculo")?.value);
    const tbody = document.getElementById("comandos-tbody");
    if (!idVeh || !tbody) return;

    tbody.innerHTML = '<tr><td colspan="4" class="text-secondary text-center py-3">Cargando movimientos en RDS...</td></tr>';
    try {
      const lista = await apiClient.obtenerComandosVehiculo(idVeh);
      this.comandosCache = Array.isArray(lista) ? lista : [];

      if (!this.comandosCache.length) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-secondary text-center py-3">Este vehículo aún no tiene movimientos registrados.</td></tr>';
        return;
      }

      tbody.innerHTML = this.comandosCache
        .map((c) => `
          <tr>
            <td><span class="badge bg-secondary">${c.codigo}</span></td>
            <td class="fw-semibold text-light">${this._esc(c.nombre)}</td>
            <td class="text-secondary">${this._esc(c.descripcion || "—")}</td>
            <td class="text-end text-nowrap">
              <button type="button" class="btn btn-xs btn-outline-info me-1 btn-edit-cmd" data-id="${c.id_comando}">
                <i class="bi bi-pencil" aria-hidden="true"></i>
              </button>
              <button type="button" class="btn btn-xs btn-outline-danger btn-del-cmd" data-id="${c.id_comando}">
                <i class="bi bi-trash" aria-hidden="true"></i>
              </button>
            </td>
          </tr>
        `)
        .join("");

      tbody.querySelectorAll(".btn-edit-cmd").forEach((btn) => {
        btn.addEventListener("click", () => this._cargarComandoEnFormulario(Number(btn.dataset.id)));
      });
      tbody.querySelectorAll(".btn-del-cmd").forEach((btn) => {
        btn.addEventListener("click", () => this._desactivarComando(Number(btn.dataset.id)));
      });
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="4" class="text-danger text-center py-3">${this._esc(err.message)}</td></tr>`;
    }
  }

  _cargarComandoEnFormulario(idComando) {
    const cmd = this.comandosCache.find((c) => Number(c.id_comando) === idComando);
    if (!cmd) return;

    document.getElementById("cmd-edit-id").value = String(cmd.id_comando);
    document.getElementById("cmd-nombre").value = cmd.nombre || "";
    document.getElementById("cmd-codigo").value = cmd.codigo ?? "";
    document.getElementById("cmd-descripcion").value = cmd.descripcion || "";

    const titulo = document.getElementById("cmd-form-titulo");
    if (titulo) titulo.textContent = `Editar Movimiento #${cmd.id_comando}`;
    const btnSub = document.getElementById("btn-submit-comando");
    if (btnSub) btnSub.innerHTML = '<i class="bi bi-check-circle me-1" aria-hidden="true"></i>Actualizar Movimiento';
    document.getElementById("btn-cancelar-comando")?.classList.remove("d-none");
  }

  _resetFormComando() {
    const editId = document.getElementById("cmd-edit-id");
    if (editId) editId.value = "";
    const nombre = document.getElementById("cmd-nombre");
    if (nombre) nombre.value = "";
    const codigo = document.getElementById("cmd-codigo");
    if (codigo) codigo.value = "";
    const desc = document.getElementById("cmd-descripcion");
    if (desc) desc.value = "";

    const titulo = document.getElementById("cmd-form-titulo");
    if (titulo) titulo.textContent = "Agregar Movimiento / Comando";
    const btnSub = document.getElementById("btn-submit-comando");
    if (btnSub) btnSub.innerHTML = '<i class="bi bi-plus-circle me-1" aria-hidden="true"></i>Guardar Movimiento';
    document.getElementById("btn-cancelar-comando")?.classList.add("d-none");
  }

  async _handleGuardarComando() {
    const idEdit = Number(document.getElementById("cmd-edit-id")?.value || 0);
    const idVeh = Number(document.getElementById("mov-cmd-vehiculo")?.value || 0);
    const nombre = (document.getElementById("cmd-nombre")?.value || "").trim().toUpperCase();
    const codigo = Number(document.getElementById("cmd-codigo")?.value);
    const descripcion = (document.getElementById("cmd-descripcion")?.value || "").trim();
    const btn = document.getElementById("btn-submit-comando");

    if (!idVeh || !nombre || Number.isNaN(codigo) || codigo < 1) {
      this.showFeedback("Completa vehículo, nombre y un código numérico válido.", "warning");
      return;
    }

    if (btn) btn.disabled = true;
    try {
      if (idEdit) {
        await apiClient.actualizarComando(idEdit, {
          nombre,
          codigo,
          descripcion,
          activo: 1
        });
        this.showFeedback(`Movimiento "${nombre}" actualizado correctamente.`, "success");
      } else {
        await apiClient.crearComando({
          id_vehiculo: idVeh,
          nombre,
          codigo,
          descripcion
        });
        this.showFeedback(`Movimiento "${nombre}" registrado en RDS.`, "success");
      }

      this._resetFormComando();
      await this.cargarComandosGestion();
    } catch (err) {
      this.showFeedback(`No se pudo guardar el movimiento: ${err.message}`, "danger");
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async _desactivarComando(idComando) {
    const cmd = this.comandosCache.find((c) => Number(c.id_comando) === idComando);
    const etiqueta = cmd ? `${cmd.nombre} (Cód. ${cmd.codigo})` : `#${idComando}`;
    if (!window.confirm(`¿Desactivar el movimiento ${etiqueta}? Se aplicará baja lógica conservando el historial.`)) {
      return;
    }

    try {
      await apiClient.eliminarComando(idComando);
      this.showFeedback(`Movimiento ${etiqueta} desactivado.`, "info");
      if (Number(document.getElementById("cmd-edit-id")?.value) === idComando) {
        this._resetFormComando();
      }
      await this.cargarComandosGestion();
    } catch (err) {
      this.showFeedback(`Error al desactivar movimiento: ${err.message}`, "danger");
    }
  }

  async cargarAuditoria() {
    const tbody = document.getElementById("admin-auditoria-tbody");
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-secondary">Cargando bitácora...</td></tr>';

    try {
      const logs = await apiClient.obtenerAuditoriaAdmin({
        limit: 80,
        fecha_inicio: document.getElementById("audit-fecha-inicio")?.value || "",
        fecha_fin: document.getElementById("audit-fecha-fin")?.value || "",
        accion: document.getElementById("audit-tipo-accion")?.value || ""
      });
      tbody.innerHTML = logs.length
        ? logs
            .map((l) => {
              const fh = formatearFechaHora(l.fecha_evento, "Sin fecha");
              const det = l.detalle_json ? this._esc(typeof l.detalle_json === "string" ? l.detalle_json : JSON.stringify(l.detalle_json)) : "—";
              return `<tr>
                <td>#${l.id_auditoria}</td>
                <td class="text-secondary text-nowrap">${fh.fecha} ${fh.hora}</td>
                <td class="fw-semibold text-warning">${this._esc(l.accion)}</td>
                <td>${this._esc(l.recurso || "—")}</td>
                <td>${this._esc(l.actor_nombre || (l.id_sesion_invitado ? `Invitado #${l.id_sesion_invitado}` : "Sistema"))}</td>
                <td><span class="badge ${l.resultado === "EXITO" ? "bg-success" : "bg-danger"} badge-xs">${this._esc(l.resultado)}</span></td>
                <td class="small text-secondary text-break">${det}</td>
              </tr>`;
            })
            .join("")
        : '<tr><td colspan="7" class="text-center text-secondary">Sin eventos de auditoría.</td></tr>';
    } catch (error) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger">${this._esc(error.message)}</td></tr>`;
    }
  }

  _esc(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
}

export const adminController = new AdminController();