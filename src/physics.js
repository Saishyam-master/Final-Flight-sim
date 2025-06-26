// physics.js
import * as THREE from 'three';

const TURN_COORDINATION = 0.3; // How quickly velocity aligns with orientation
const BANK_ANGLE_FACTOR = 0.02; // How much to bank during turns
const MIN_TURN_SPEED = 10; // Minimum speed for effective turning

// Water physics constants - simplified crash detection
const WATER_SURFACE_LEVEL = 10; // Average water surface height
const MAX_UNDERWATER_DEPTH = 15; // Maximum depth plane can go underwater
const WATER_BUOYANCY_FORCE = 25; // Upward force when in water
const WATER_DRAG_COEFFICIENT = 0.08; // Additional drag in water
const WATER_RESISTANCE_FACTOR = 0.6; // Speed reduction factor in water
const SAFE_WATER_LANDING_SPEED = 25; // Speed below which water landing is safe
const WATER_SPLASH_THRESHOLD = 5; // Speed threshold for splash effects

export function setupPhysics(aircraft, onTakeoff, terrain, ocean) {
  aircraft.velocity = new THREE.Vector3(0, 0, 0);
  aircraft.rotationSpeed = { pitch: 0, yaw: 0, roll: 0 };
  aircraft.throttle = 0;
  aircraft.airborne = false;
  aircraft.crashed = false;
  aircraft.inWater = false;
  aircraft.waterDepth = 0;
  aircraft.previouslyInWater = false;

  // constants
  const GROUND_LEVEL = 11;
  const TAKEOFF_SPEED = 30;
  const MAX_THRUST = 3500; // Reduced for more gradual, realistic acceleration
  const DRAG_COEFF = 0.015;
  const LIFT_COEFF = 0.03;
  const GRAVITY = 9.81;
  const MAX_SPEED = 268; // ~600 mph converted to m/s for realistic but fun gameplay
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

  function checkWaterInteraction() {
    // Check if aircraft is near or in water
    const ray = new THREE.Raycaster(
      aircraft.position.clone().add(new THREE.Vector3(0, 100, 0)),
      new THREE.Vector3(0, -1, 0),
      0,
      200
    );
    
    const waterHits = ray.intersectObject(ocean, true);
    
    if (waterHits.length > 0) {
      const waterSurfaceY = waterHits[0].point.y;
      const aircraftY = aircraft.position.y;
      
      // Check if aircraft is in water
      if (aircraftY <= waterSurfaceY + 2) {
        aircraft.inWater = true;
        aircraft.waterDepth = Math.max(0, waterSurfaceY - aircraftY + 2);
        // Aircraft is in water but still above crash threshold
        aircraft.inWater = true;
        aircraft.waterDepth = Math.max(0, waterSurfaceY - aircraftY + 2);
      } else {
        aircraft.inWater = false;
        aircraft.waterDepth = 0;
      }
    } else {
      aircraft.inWater = false;
      aircraft.waterDepth = 0;
    }
  }

  function handleCollisions() {
    const ray = new THREE.Raycaster(
      aircraft.position.clone().add(new THREE.Vector3(0, 100, 0)),
      new THREE.Vector3(0, -1, 0),
      0,
      200
    );
    
    const terrainHits = ray.intersectObject(terrain, true);
    const waterHits = ray.intersectObject(ocean, true);
    
    // Handle terrain collision (always crashes)
    if (terrainHits.length > 0 && aircraft.position.y - terrainHits[0].point.y < 2) {
      aircraft.crashed = true;
      aircraft.velocity.set(0, 0, 0);
      emitCrashParticles(aircraft.position, 'terrain');
      return;
    }
    
    // Handle water collision - crash when going underwater
    if (waterHits.length > 0) {
      const waterSurfaceY = waterHits[0].point.y;
      
      // Crash if aircraft goes underwater (below surface level)
      if (aircraft.position.y <= waterSurfaceY + 1) {
        aircraft.crashed = true;
        aircraft.velocity.set(0, 0, 0);
        emitCrashParticles(aircraft.position, "water");
        return;
      }
    }
      
      // Create splash effect when entering water at moderate speed
      if (aircraft.inWater && !aircraft.previouslyInWater && speed > WATER_SPLASH_THRESHOLD) {
        emitSplashParticles(aircraft.position);
      }
    }
    
    aircraft.previouslyInWater = aircraft.inWater;
  }

  function emitSplashParticles(position) {
    const geometry = new THREE.BufferGeometry();
    const particles = 150;
    const positions = new Float32Array(particles * 3);

    for (let i = 0; i < particles; i++) {
      const i3 = i * 3;
      positions[i3 + 0] = position.x + (Math.random() - 0.5) * 20;
      positions[i3 + 1] = position.y + Math.random() * 10;
      positions[i3 + 2] = position.z + (Math.random() - 0.5) * 20;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: 0x88ccff,
      size: 2,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.8
    });

    const points = new THREE.Points(geometry, material);
    terrain.parent.add(points);

    let fade = 0.8;
    const fadeInterval = setInterval(() => {
      fade -= 0.03;
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

    // Check water interaction
    checkWaterInteraction();

    // forces
    const thrust = forward.clone().multiplyScalar(aircraft.throttle * MAX_THRUST);
    
    // Apply different drag based on water interaction
    let dragCoeff = DRAG_COEFF;
    if (aircraft.inWater) {
      dragCoeff += WATER_DRAG_COEFFICIENT;
    }
    const drag = aircraft.velocity.clone().multiplyScalar(
      -0.5 * AIR_DENSITY * speed * dragCoeff * WING_AREA / MASS
    );
    
    const liftMag = 0.5 * AIR_DENSITY * speed * speed * WING_AREA * LIFT_COEFF;
    const baseDrag = 0.5 * AIR_DENSITY * speed * dragCoeff * WING_AREA / MASS;
    // Add progressive drag that increases with speed for more realistic acceleration curve
    const speedFactor = 1 + (speed / MAX_SPEED) * 0.8; // Progressive drag increase
    const drag = aircraft.velocity.clone().multiplyScalar(-baseDrag * speedFactor);
    const gravity = new THREE.Vector3(0, -GRAVITY, 0);

    // Add buoyancy force when in water
    const buoyancy = aircraft.inWater ? 
      new THREE.Vector3(0, WATER_BUOYANCY_FORCE * Math.min(aircraft.waterDepth / 5, 1), 0) : 
      new THREE.Vector3(0, 0, 0);

    // net force and integration
    const net = new THREE.Vector3();
    net.add(thrust).add(drag).add(lift).add(gravity).add(buoyancy);
    aircraft.velocity.addScaledVector(net, dt);
    
    // Apply water resistance to velocity
    if (aircraft.inWater) {
      aircraft.velocity.multiplyScalar(1 - (1 - WATER_RESISTANCE_FACTOR) * dt * 2);
    }

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

    // Enhanced collision detection
    handleCollisions();
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