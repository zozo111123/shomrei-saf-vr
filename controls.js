// controls.js - how the viewer looks around outside a headset: mouse/touch drag on desktop, the gyroscope on a phone.
// Inside a WebXR session the headset drives the camera and this file does nothing.
import * as THREE from 'three';

export function createLook(renderer, camera) {
  let lon = 0, lat = 0, dragging = false, px = 0, py = 0, useOrient = false;
  const el = renderer.domElement;
  el.addEventListener('pointerdown', e => { dragging = true; px = e.clientX; py = e.clientY; });
  addEventListener('pointerup', () => { dragging = false; });
  addEventListener('pointermove', e => {
    if (!dragging) return;
    lon -= (e.clientX - px) * 0.18; lat += (e.clientY - py) * 0.18; lat = THREE.MathUtils.clamp(lat, -85, 85);
    px = e.clientX; py = e.clientY;
  });

  // phone: the classic device-orientation to camera-quaternion mapping
  let orient = null, screenAngle = 0;
  addEventListener('deviceorientation', e => { if (e.alpha == null) return; orient = e; useOrient = true; });
  addEventListener('orientationchange', () => { screenAngle = (screen.orientation && screen.orientation.angle) || window.orientation || 0; });
  const zee = new THREE.Vector3(0, 0, 1), eul = new THREE.Euler(), q0 = new THREE.Quaternion(), q1 = new THREE.Quaternion(-Math.SQRT1_2, 0, 0, Math.SQRT1_2);
  function applyOrientation() {
    const a = THREE.MathUtils.degToRad(orient.alpha), b = THREE.MathUtils.degToRad(orient.beta), g = THREE.MathUtils.degToRad(orient.gamma), o = THREE.MathUtils.degToRad(screenAngle);
    eul.set(b, a, -g, 'YXZ'); camera.quaternion.setFromEuler(eul); camera.quaternion.multiply(q1); camera.quaternion.multiply(q0.setFromAxisAngle(zee, -o));
  }

  return {
    // call once per frame when not presenting in XR
    update() {
      if (useOrient && orient && !dragging) applyOrientation();
      else camera.quaternion.setFromEuler(new THREE.Euler(THREE.MathUtils.degToRad(lat), THREE.MathUtils.degToRad(-lon), 0, 'YXZ'));
    },
    // iOS asks for permission inside a user gesture
    async requestSensors() {
      if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) { try { await DeviceOrientationEvent.requestPermission(); } catch (e) { /* denied: drag still works */ } }
    },
    look(yawDeg, pitchDeg) { lon = yawDeg; lat = pitchDeg; useOrient = false; },
  };
}
