/**
 * Módulo de Joystick Circular Intuitivo (Táctil + Mouse)
 */

import { movementController } from "./movementController.js?v=8";
import { uiState } from "./uiState.js?v=8";

export class JoystickComponent {
  constructor(zoneId = "joystick-zone", knobId = "joystick-knob") {
    this.zone = document.getElementById(zoneId);
    this.knob = document.getElementById(knobId);

    this.isDragging = false;
    this.activePointerId = null;
    this.currentDirectionKey = null;
    this.deadZoneRadius = 18;

    if (this.zone && this.knob) {
      this._bindEvents();
    }
  }

  _bindEvents() {
    this.zone.addEventListener("pointerdown", (e) => this._onPointerDown(e));
    window.addEventListener("pointermove", (e) => this._onPointerMove(e));
    window.addEventListener("pointerup", (e) => this._onPointerUpOrCancel(e));
    window.addEventListener("pointercancel", (e) => this._onPointerUpOrCancel(e));

    window.addEventListener("blur", () => {
      if (this.isDragging) {
        this._resetToCenterAndStop();
      }
    });
  }

  _onPointerDown(event) {
    if (movementController.isDemoRunning) {
      uiState.showAlert("Cancela o espera a que termine la DEMO para usar el joystick.");
      return;
    }

    uiState.clearAlert();
    event.preventDefault();
    this.isDragging = true;
    this.activePointerId = event.pointerId;

    if (this.zone.setPointerCapture) {
      try {
        this.zone.setPointerCapture(event.pointerId);
      } catch {
        // Ignorar si no aplica
      }
    }

    this.zone.classList.add("is-active");
    this.knob.classList.add("is-dragging");
    this._processPointerPosition(event.clientX, event.clientY);
  }

  _onPointerMove(event) {
    if (!this.isDragging || event.pointerId !== this.activePointerId) return;
    event.preventDefault();
    this._processPointerPosition(event.clientX, event.clientY);
  }

  _onPointerUpOrCancel(event) {
    if (!this.isDragging || (this.activePointerId !== null && event.pointerId !== this.activePointerId)) {
      return;
    }
    this._resetToCenterAndStop();
  }

  _processPointerPosition(clientX, clientY) {
    const rect = this.zone.getBoundingClientRect();
    const knobRect = this.knob.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const maxRadius = Math.max(28, (rect.width - knobRect.width) / 2 - 4);

    const dx = clientX - centerX;
    const dy = clientY - centerY;
    const distance = Math.hypot(dx, dy);

    const clampedDist = Math.min(distance, maxRadius);
    const angleRad = Math.atan2(dy, dx);

    const knobX = Math.cos(angleRad) * clampedDist;
    const knobY = Math.sin(angleRad) * clampedDist;

    this.knob.style.transform = `translate(${knobX.toFixed(1)}px, ${knobY.toFixed(1)}px)`;

    if (distance < this.deadZoneRadius) {
      if (this.currentDirectionKey !== null) {
        this.currentDirectionKey = null;
        uiState.setJoystickLabel("Centro · Neutro", false);
        movementController.triggerPriorityStop();
      }
      return;
    }

    const angleDeg = angleRad * (180 / Math.PI);
    const { key, label } = this._mapAngleToCommand(angleDeg);

    if (key && key !== this.currentDirectionKey) {
      this.currentDirectionKey = key;
      uiState.setJoystickLabel(label, true);
      movementController.executeCommand(key, { fromJoystick: true, force: false });
    }
  }

  _mapAngleToCommand(angleDeg) {
    if (angleDeg >= -115 && angleDeg <= -65) {
      return { key: "AVANZAR", label: "↑ Avanzar" };
    }
    if (angleDeg > -65 && angleDeg < -25) {
      return { key: "DIAG_DER", label: "↗ Diag. Der." };
    }
    if (angleDeg > -155 && angleDeg < -115) {
      return { key: "DIAG_IZQ", label: "↖ Diag. Izq." };
    }
    if (angleDeg >= -25 && angleDeg <= 45) {
      return { key: "GIRAR_DERECHA", label: "→ Derecha" };
    }
    if (angleDeg >= 135 || angleDeg <= -155) {
      return { key: "GIRAR_IZQUIERDA", label: "← Izquierda" };
    }
    return { key: "RETROCEDER", label: "↓ Retroceder" };
  }

  _resetToCenterAndStop() {
    this.isDragging = false;
    this.activePointerId = null;
    this.zone.classList.remove("is-active");
    this.knob.classList.remove("is-dragging");
    this.knob.style.transform = "translate(0px, 0px)";

    const hadActiveMovement = this.currentDirectionKey !== null;
    this.currentDirectionKey = null;
    uiState.setJoystickLabel("Centro · Neutro", false);

    if (hadActiveMovement) {
      movementController.triggerPriorityStop();
    }
  }
}