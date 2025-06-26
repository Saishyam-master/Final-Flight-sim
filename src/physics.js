import * as THREE from 'three';

export function setupPhysics(aircraft, onTakeoff, terrain, ocean) {
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

    const thrustForce = forward.clone().multiplyScalar(aircraft.throttle * MAX_THRUST);
    const dragForce = aircraft.velocity.clone().multiplyScalar(-0.5 * AIR_DENSITY * speed * DRAG_COEFF * WING_AREA / MASS);

    const liftMagnitude = 0.5 * AIR_DENSITY * speed * speed * WING_AREA * LIFT_COEFF;
    const liftForce = up.clone().multiplyScalar((aircraft.position.y > 5 ? liftMagnitude : 0) / MASS);

    const gravityForce = new THREE.Vector3(0, -GRAVITY, 0);

    const netForce = new THREE.Vector3();
    netForce.add(thrustForce);
    netForce.add(dragForce);
    netForce.add(gravityForce);
    netForce.add(liftForce);

    const acceleration = netForce;
    aircraft.velocity.add(acceleration.multiplyScalar(deltaTime));

    if (aircraft.velocity.length() > MAX_SPEED) {
      aircraft.velocity.setLength(MAX_SPEED);
    }

    if (!aircraft.airborne) {
      aircraft.velocity.y = 0;
      aircraft.position.y = GROUND_LEVEL;
    }

    if (!aircraft.airborne && aircraft.velocity.dot(forward) > TAKEOFF_SPEED) {
      aircraft.airborne = true;
      if (onTakeoff) onTakeoff();
    }

    const pitchRate = aircraft.rotationSpeed.pitch * deltaTime;
    const rollRate = aircraft.rotationSpeed.roll * deltaTime;
    const yawRate = aircraft.rotationSpeed.yaw * deltaTime;

    const qPitch = new THREE.Quaternion().setFromAxisAngle(right, pitchRate);
    const qRoll = new THREE.Quaternion().setFromAxisAngle(forward, rollRate);
    const qYaw = new THREE.Quaternion().setFromAxisAngle(up, yawRate);

    aircraft.quaternion.multiply(qYaw).multiply(qPitch).multiply(qRoll).normalize();

    aircraft.position.addScaledVector(aircraft.velocity, deltaTime);

    // Terrain or water collision detection
    const ray = new THREE.Raycaster(
      aircraft.position.clone().add(new THREE.Vector3(0, 100, 0)),
      new THREE.Vector3(0, -1, 0),
      0,
      200
    );
    const intersects = ray.intersectObject(terrain, true).concat(ray.intersectObject(ocean, true));
    if (intersects.length > 0) {
      const contactY = intersects[0].point.y;
      const distToGround = aircraft.position.y - contactY;

      if (distToGround < 2.0) {
        aircraft.crashed = true;
        aircraft.velocity.set(0, 0, 0);
        console.log("\uD83D\uDCA5 Aircraft crashed into terrain or water!");
      }
    }
  };
}
