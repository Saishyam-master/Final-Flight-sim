import * as THREE from 'three';

export function setupPhysics(aircraft, onTakeoff) {
  aircraft.velocity = new THREE.Vector3();
  aircraft.rotationSpeed = { pitch: 0, yaw: 0, roll: 0 };
  aircraft.throttle = 0;
  aircraft.airborne = false;
  aircraft.crashed = false;

  const GROUND_LEVEL = 1.2;
  const TAKEOFF_SPEED = 50;
  const MAX_THRUST = 4000;
  const DRAG_COEFF = 0.03;
  const LIFT_COEFF = 0.008;
  const GRAVITY = 9.81;
  const MAX_SPEED = 250;
  const MASS = 1200;
  const WING_AREA = 16;
  const AIR_DENSITY = 1.225;

  aircraft.position.y = GROUND_LEVEL;

  aircraft.updatePhysics = function (deltaTime) {
    if (aircraft.crashed) return;

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(aircraft.quaternion).normalize();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(aircraft.quaternion).normalize();
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(aircraft.quaternion).normalize();
    const speed = aircraft.velocity.length();

    // Thrust only if throttle > 0
    const thrustForce = forward.clone().multiplyScalar(aircraft.throttle * MAX_THRUST);

    // Drag
    const dragForce = aircraft.velocity.clone().multiplyScalar(-0.5 * AIR_DENSITY * speed * DRAG_COEFF * WING_AREA / MASS);

    // Lift
    const liftMagnitude = 0.5 * AIR_DENSITY * speed * speed * WING_AREA * LIFT_COEFF;
    const liftForce = up.clone().multiplyScalar((aircraft.position.y > 5 ? liftMagnitude : 0) / MASS);

    // Gravity
    const gravityForce = new THREE.Vector3(0, -GRAVITY, 0);

    const netForce = new THREE.Vector3();
    netForce.add(thrustForce);
    netForce.add(dragForce);
    netForce.add(gravityForce);
    netForce.add(liftForce);

    const acceleration = netForce;
    aircraft.velocity.add(acceleration.multiplyScalar(deltaTime));

    // Cap speed
    if (aircraft.velocity.length() > MAX_SPEED) {
      aircraft.velocity.setLength(MAX_SPEED);
    }

    // Ground lock before takeoff
    if (!aircraft.airborne) {
      aircraft.velocity.y = 0;
      aircraft.position.y = GROUND_LEVEL;
    }

    // Takeoff
    if (!aircraft.airborne && aircraft.velocity.dot(forward) > TAKEOFF_SPEED) {
      aircraft.airborne = true;
      if (onTakeoff) onTakeoff();
    }

    // Apply rotation
    const pitchRate = aircraft.rotationSpeed.pitch * deltaTime;
    const rollRate = aircraft.rotationSpeed.roll * deltaTime;
    const yawRate = aircraft.rotationSpeed.yaw * deltaTime;

    const qPitch = new THREE.Quaternion().setFromAxisAngle(right, pitchRate);
    const qRoll = new THREE.Quaternion().setFromAxisAngle(forward, rollRate);
    const qYaw = new THREE.Quaternion().setFromAxisAngle(up, yawRate);

    aircraft.quaternion.multiply(qYaw).multiply(qPitch).multiply(qRoll).normalize();

    // Position update
    aircraft.position.addScaledVector(aircraft.velocity, deltaTime);

    // Crash check
    if (aircraft.position.y < 0.5) {
      aircraft.crashed = true;
      aircraft.velocity.set(0, 0, 0);
      console.log("💥 Aircraft crashed!");
    }
  };
}
