// physics.js
import * as THREE from 'three';

const TURN_COORDINATION = 0.3; // How quickly velocity aligns with orientation
const BANK_ANGLE_FACTOR = 0.02; // How much to bank during turns
const MIN_TURN_SPEED = 10; // Minimum speed for effective turning

// Water physics constants
const WATER_SURFACE_LEVEL = 10; // Average water surface height
const MAX_UNDERWATER_DEPTH = 15; // Maximum depth plane can go underwater
const WATER_BUOYANCY_FORCE = 25; // Upward force when in water
const WATER_DRAG_COEFFICIENT = 0.08; // Additional drag in water
const WATER_RESISTANCE_FACTOR = 0.6; // Speed reduction factor in water
const SAFE_WATER_LANDING_SPEED = 25; // Speed below which water landing is safe
const WATER_SPLASH_THRESHOLD = 5; /**
 * Initializes and manages the physics simulation for an aircraft, including aerodynamic forces, water and terrain interactions, collision detection, and crash effects.
 *
 * Sets up the aircraft's physical state and attaches an `updatePhysics(dt)` method for per-frame simulation. Handles takeoff logic, stall and lift dynamics, water entry and buoyancy, crash cutscenes, and visual effects for splashes and crashes. Integrates with Three.js objects for terrain, ocean, and camera.
 */

export function setupPhysics(aircraft, onTakeoff, terrain, ocean, camera) {
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
  const MAX_THRUST = 8000;
  const DRAG_COEFF = 0.01;
  const LIFT_COEFF = 0.03;
  const GRAVITY = 9.81;
  const MAX_SPEED = 600;
  const MASS = 1200;
  const WING_AREA = 16;
  const AIR_DENSITY = 1.225;

  /**
   * Emits a burst of crash particles at the specified position to visually represent a crash event.
   * 
   * The particle effect differs in color and size depending on whether the crash occurred on water or terrain.
   * Particles are automatically faded out and removed after a short duration.
   * 
   * @param {THREE.Vector3} position - The world position where the crash particles should be emitted.
   * @param {string} type - The type of crash, either 'water' or 'terrain', which determines the particle color and size.
   */
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
  /**
   * Displays a full-screen "Game Over" overlay with a restart button after a crash.
   * Prevents multiple overlays from appearing and reloads the page when the restart button is clicked.
   */
  function showGameOverScreen() {
    if (document.getElementById('game-over-overlay')) return; // Prevent duplicates

    const overlay = document.createElement('div');
    overlay.id = 'game-over-overlay';
    overlay.style.position = 'fixed';
    overlay.style.top = 0;
    overlay.style.left = 0;
    overlay.style.width = '100vw';
    overlay.style.height = '100vh';
    overlay.style.background = 'rgba(0,0,0,0.85)';
    overlay.style.display = 'flex';
    overlay.style.flexDirection = 'column';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.zIndex = 9999;
    overlay.innerHTML = `
      <h1 style="color: #fff; font-size: 3em; margin-bottom: 0.5em;">Game Over</h1>
      <p style="color: #fff; font-size: 1.5em; margin-bottom: 2em;">You crashed!</p>
      <button id="restart-btn" style="font-size: 1.2em; padding: 0.5em 2em;">Restart</button>
    `;
    document.body.appendChild(overlay);

    document.getElementById('restart-btn').onclick = () => {
      window.location.reload();
    };
  }

  /**
   * Plays a crash cutscene with camera shake, zoom, and sound effects, then displays the game over screen.
   * 
   * The cutscene lasts for 2.5 seconds, during which the camera shakes, zooms in, and focuses on the aircraft. If the crash type is 'terrain', a crash sound is played. After the cutscene, the camera is reset and the game over overlay is shown.
   * 
   * @param {THREE.PerspectiveCamera} camera - The camera to animate during the cutscene.
   * @param {string} [crashType='terrain'] - The type of crash ('terrain' or 'water'), which determines if a crash sound is played.
   */
  function triggerCrashCutscene(camera, crashType = 'terrain') {
    const initialFov = camera.fov;
    const originalPosition = camera.position.clone();
    const originalLookAt = aircraft.position.clone();

    let time = 0;
    const duration = 2.5; // seconds for cutscene
    let crashSound;

    // Optional: Load crash sound
    const listener = new THREE.AudioListener();
    camera.add(listener);

    if (!camera.crashAudio && crashType === 'terrain') {
      const audioLoader = new THREE.AudioLoader();
      crashSound = new THREE.Audio(listener);
      audioLoader.load('sounds/crash1.mp3', (buffer) => {
        crashSound.setBuffer(buffer);
        crashSound.setVolume(0.6);
        crashSound.play();
      });
      camera.crashAudio = crashSound;
    }

    const interval = setInterval(() => {
      time += 0.05;

      // Camera shake
      camera.position.x += (Math.random() - 0.5) * 0.8;
      camera.position.y += (Math.random() - 0.5) * 0.8;
      camera.position.z += (Math.random() - 0.5) * 0.8;

      // Zoom in
      camera.fov = initialFov - Math.min(time * 15, 10);
      camera.updateProjectionMatrix();

      // Look at aircraft
      camera.lookAt(aircraft.position);

      // End cutscene
      if (time >= duration) {
        clearInterval(interval);
        camera.fov = initialFov;
        camera.position.copy(originalPosition);
        camera.lookAt(originalLookAt);
        camera.updateProjectionMatrix();

        // Optional: Fade to black
        if (typeof triggerScreenFade === 'function') {
          triggerScreenFade();
        }
        // Show game over overlay
        showGameOverScreen();
      }
    }, 50);
  }

  /**
   * Updates the aircraft's water interaction state by detecting proximity to the water surface.
   *
   * Sets the aircraft's `inWater` and `waterDepth` properties based on its position relative to the water surface. Limits maximum underwater depth and prevents further descent by adjusting position and upward velocity if necessary.
   */
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
        
        // Prevent going too deep underwater
        if (aircraft.waterDepth > MAX_UNDERWATER_DEPTH) {
          aircraft.position.y = waterSurfaceY - MAX_UNDERWATER_DEPTH + 2;
          aircraft.waterDepth = MAX_UNDERWATER_DEPTH;
          // Apply strong upward force to prevent further descent
          aircraft.velocity.y = Math.max(aircraft.velocity.y, 0);
        }
      } else {
        aircraft.inWater = false;
        aircraft.waterDepth = 0;
      }
    } else {
      aircraft.inWater = false;
      aircraft.waterDepth = 0;
    }
  }

  /**
   * Detects and handles collisions between the aircraft and terrain or water.
   *
   * Triggers a crash sequence and particle effects if the aircraft collides with terrain or impacts water at unsafe speed or angle. Emits splash effects when entering water at moderate speed. Updates the aircraft's crash state and previous water state accordingly.
   */
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
      if (camera) triggerCrashCutscene(camera, 'terrain');
      return;
    }
    
    // Handle water collision (depends on speed and angle)
    if (waterHits.length > 0) {
      const waterSurfaceY = waterHits[0].point.y;
      const speed = aircraft.velocity.length();
      
      // Check for water crash (high speed impact)
      if (aircraft.position.y <= waterSurfaceY + 1 && speed > SAFE_WATER_LANDING_SPEED) {
        const verticalSpeed = Math.abs(aircraft.velocity.y);
        
        // Crash if hitting water too fast or at steep angle
        if (verticalSpeed > 15 || speed > 100) {
          aircraft.crashed = true;
          aircraft.velocity.set(0, 0, 0);
          emitCrashParticles(aircraft.position, 'water');
          if (camera) triggerCrashCutscene(camera, 'water');
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

  /**
   * Emits a splash particle effect at the specified position to simulate water impact.
   * 
   * Creates and animates a group of light blue particles that fade out over time, visually representing a splash in the scene.
   * @param {THREE.Vector3} position - The world position where the splash effect should appear.
   */
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
    
    // Calculate angle of attack (AoA)
    const velocityDir = aircraft.velocity.clone().normalize();
    const forwardDir = new THREE.Vector3(0, 0, -1).applyQuaternion(aircraft.quaternion);
    const aoa = velocityDir.angleTo(forwardDir); // radians

    // Stall if AoA > 15 degrees (~0.26 rad)
    const isStalled = aoa > 0.26;

    // Dynamic lift/drag coefficients
    const dynamicLiftCoeff = isStalled ? 0.01 : LIFT_COEFF * Math.cos(aoa);
    const dynamicDragCoeff = DRAG_COEFF + 0.05 * Math.abs(Math.sin(aoa));

    const liftMag = 0.5 * AIR_DENSITY * speed * speed * WING_AREA * dynamicLiftCoeff;
    // Reduce lift effectiveness in water
    const liftEffectiveness = aircraft.inWater ? 0.3 : 1.0;
    const lift = up.clone().multiplyScalar((aircraft.position.y > 5 ? liftMag * liftEffectiveness : 0) / MASS);
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

  /**
   * Updates the aircraft's orientation and velocity direction based on current rotation speeds and speed.
   * 
   * Adjusts pitch, yaw, and roll rates according to speed, applies banking during turns, and gradually aligns the velocity vector with the aircraft's forward direction for coordinated flight.
   * 
   * @param {number} dt - Time step in seconds.
   */
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