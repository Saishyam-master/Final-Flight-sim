import * as THREE from 'three';

export function setupControls(aircraft) {
  const pitchSpeed = Math.PI * 0.3;
  const yawSpeed = Math.PI * 0.4;
  const rollSpeed = Math.PI * 0.6;
  const throttleStep = 0.02;
  const throttleDecayRate = 0.01;

  const keys = {
    KeyW: false,
    KeyS: false,
    KeyA: false,
    KeyD: false,
    ArrowLeft: false,
    ArrowRight: false,
    ArrowUp: false,
  };

  function updateControlInputs() {
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(aircraft.quaternion);
    const forwardSpeed = aircraft.velocity.dot(forward);

    aircraft.rotationSpeed.pitch = 0;
    aircraft.rotationSpeed.yaw = 0;
    aircraft.rotationSpeed.roll = 0;

    const allowPitch = forwardSpeed >= 60 || aircraft.airborne;
    const allowYaw = forwardSpeed <= 50 || !aircraft.airborne;

    // PITCH
    if (allowPitch) {
      if (keys.KeyW) aircraft.rotationSpeed.pitch = pitchSpeed;
      if (keys.KeyS) aircraft.rotationSpeed.pitch = -pitchSpeed;
    }

    // YAW (ground/low speed only)
    if (allowYaw) {
      if (keys.KeyA) aircraft.rotationSpeed.yaw = yawSpeed;
      if (keys.KeyD) aircraft.rotationSpeed.yaw = -yawSpeed;
    }

    // ROLL
    if (keys.ArrowLeft) aircraft.rotationSpeed.roll = -rollSpeed;
    if (keys.ArrowRight) aircraft.rotationSpeed.roll = rollSpeed;
  }

  window.addEventListener('keydown', (event) => {
    if (event.code in keys) {
      keys[event.code] = true;
      updateControlInputs();
    }

    if (event.code === 'ArrowDown') {
      aircraft.throttle = Math.max(0, aircraft.throttle - throttleStep);
    }
  });

  window.addEventListener('keyup', (event) => {
    if (event.code in keys) {
      keys[event.code] = false;
      updateControlInputs();
    }
  });

  // 🧠 Decay throttle when up arrow not held
  setInterval(() => {
    if (!keys.ArrowUp) {
      aircraft.throttle = Math.max(0, aircraft.throttle - throttleDecayRate);
    } else {
      aircraft.throttle = Math.min(1, aircraft.throttle + throttleStep);
    }
  }, 100); // Every 100ms
}
