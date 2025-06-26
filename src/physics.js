// physics.js
import * as THREE from 'three';

const TURN_COORDINATION = 0.3; // How quickly velocity aligns with orientation
const BANK_ANGLE_FACTOR = 0.02; // How much to bank during turns
const MIN_TURN_SPEED = 10; // Minimum speed for effective turning

export function setupPhysics(aircraft, onTakeoff, terrain, ocean) {
  aircraft.velocity = new THREE.Vector3(0, 0, 0);
  aircraft.rotationSpeed = { pitch: 0, yaw: 0, roll: 0 };
  aircraft.throttle = 0;
  aircraft.airborne = false;
  aircraft.crashed = false;

  // constants
  const GROUND_LEVEL = 11;
  const TAKEOFF_SPEED = 30;
  const MAX_THRUST = 10000;
  const DRAG_COEFF = 0.015;
  const LIFT_COEFF = 0.03;
  const GRAVITY = 9.81;
  const MAX_SPEED = 600;
  const MASS = 1200;
  const WING_AREA = 16;
  const AIR_DENSITY = 1.225;

  function emitCrashParticles(position, type) {
    const geometry = new THREE.BufferGeometry();
    const particles = 200;
    const positions = new Float32Array(particles * 3);

    for (let i = 0; i < particles; i++) {
      const i3 = i * 3;
      positions[i3 + 0] = position.x + (Math.random() - 0.5) * 25;
      positions[i3 + 1] = position.y + Math.random() * 15;
      positions[i3 + 2] = position.z + (Math.random() - 0.5) * 25;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const color = type === 'water' ? 0x33ccff : 0xff5500;
    const size = type === 'water' ? 3 : 2.5;
    const material = new THREE.PointsMaterial({
      color,
      size,
      sizeAttenuation: true,
      transparent: true,
      opacity: 1
    });

    const points = new THREE.Points(geometry, material);
    terrain.parent.add(points);

    let fade = 1;
    const fadeInterval = setInterval(() => {
      fade -= 0.04;
      material.opacity = Math.max(fade, 0);
      if (fade <= 0) {
        clearInterval(fadeInterval);
        terrain.parent.remove(points);
      }
    }, 50);
  }

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

    // apply improved turning logic
    applyTurning(dt);

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
      const hitType = hits[0].object === ocean ? 'water' : 'terrain';
      emitCrashParticles(aircraft.position, hitType);
    }
  };

  function applyTurning(dt) {
    const speed = aircraft.velocity.length();
    
    const speedFactor = Math.max(0.1, MIN_TURN_SPEED / Math.max(speed, MIN_TURN_SPEED));
    const scaledYaw = aircraft.rotationSpeed.yaw * speedFactor;
    const scaledPitch = aircraft.rotationSpeed.pitch * speedFactor;
    const scaledRoll = aircraft.rotationSpeed.roll;

    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(aircraft.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(aircraft.quaternion);
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(aircraft.quaternion);

    const qPitch = new THREE.Quaternion().setFromAxisAngle(right, scaledPitch * dt);
    const qYaw = new THREE.Quaternion().setFromAxisAngle(up, scaledYaw * dt);
    const bankRoll = scaledYaw * BANK_ANGLE_FACTOR * speed;
    const qRoll = new THREE.Quaternion().setFromAxisAngle(forward, (scaledRoll + bankRoll) * dt);

    aircraft.quaternion.multiply(qYaw).multiply(qPitch).multiply(qRoll).normalize();

    if (speed > 1) {
      const currentForward = new THREE.Vector3(0, 0, -1).applyQuaternion(aircraft.quaternion);
      const velocityDirection = aircraft.velocity.clone().normalize();
      const alignment = velocityDirection.lerp(currentForward, TURN_COORDINATION * dt);
      aircraft.velocity.copy(alignment.multiplyScalar(speed));
    }
  }
}
