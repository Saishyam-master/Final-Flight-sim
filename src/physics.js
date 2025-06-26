import * as THREE from 'three';

export function setupPhysics(aircraft, onTakeoff, terrain, ocean) {
  // state
  aircraft.velocity = new THREE.Vector3(0, 0, 0);
  aircraft.rotationSpeed = { pitch: 0, yaw: 0, roll: 0 };
  aircraft.throttle = 0;
  aircraft.airborne = false;
  aircraft.crashed = false;

  // constants
  const GROUND_LEVEL = 8;
  const TAKEOFF_SPEED = 30;      // lower threshold for takeoff
  const MAX_THRUST = 10000;      // stronger engines
  const DRAG_COEFF = 0.015;      // reduced drag
  const LIFT_COEFF = 0.03;       // increased lift
  const GRAVITY = 9.81;
  const MAX_SPEED = 600;         // faster top speed
  const MASS = 1200;
  const WING_AREA = 16;
  const AIR_DENSITY = 1.225;

  aircraft.updatePhysics = function (dt) {
    if (aircraft.crashed) return;

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(aircraft.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(aircraft.quaternion);
    const speed = aircraft.velocity.length();

    // forces
    const thrust = forward.clone().multiplyScalar(aircraft.throttle * MAX_THRUST);
    const drag = aircraft.velocity.clone().multiplyScalar(
      -0.5 * AIR_DENSITY * speed * DRAG_COEFF * WING_AREA / MASS
    );
    const liftMag = 0.5 * AIR_DENSITY * speed * speed * WING_AREA * LIFT_COEFF;
    const lift = up.clone().multiplyScalar((aircraft.position.y > 5 ? liftMag : 0) / MASS);
    const gravity = new THREE.Vector3(0, -GRAVITY, 0);

    // net force and integration
    const net = new THREE.Vector3();
    net.add(thrust).add(drag).add(lift).add(gravity);
    aircraft.velocity.addScaledVector(net, dt);

    // speed clamp
    if (aircraft.velocity.length() > MAX_SPEED) aircraft.velocity.setLength(MAX_SPEED);

    // takeoff logic
    if (!aircraft.airborne) {
      aircraft.velocity.y = 0;
      aircraft.position.y = GROUND_LEVEL;
      if (aircraft.velocity.dot(forward) > TAKEOFF_SPEED) {
        aircraft.airborne = true;
        onTakeoff && onTakeoff();
      }
    }

    // apply rotations
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(aircraft.quaternion);
    const qPitch = new THREE.Quaternion().setFromAxisAngle(right, aircraft.rotationSpeed.pitch * dt);
    const qYaw = new THREE.Quaternion().setFromAxisAngle(up, aircraft.rotationSpeed.yaw * dt);
    const qRoll = new THREE.Quaternion().setFromAxisAngle(forward, aircraft.rotationSpeed.roll * dt);
    aircraft.quaternion.multiply(qYaw).multiply(qPitch).multiply(qRoll).normalize();

    // integrate position
    aircraft.position.addScaledVector(aircraft.velocity, dt);

    // collision
    const ray = new THREE.Raycaster(
      aircraft.position.clone().add(new THREE.Vector3(0, 100, 0)),
      new THREE.Vector3(0, -1, 0),
      0,
      200
    );
    const hits = ray.intersectObject(terrain, true).concat(ray.intersectObject(ocean, true));
    if (hits.length > 0 && aircraft.position.y - hits[0].point.y < 2) {
      aircraft.crashed = true;
      aircraft.velocity.set(0, 0, 0);
      console.log("💥 Aircraft crashed!");
    }
  };
}

