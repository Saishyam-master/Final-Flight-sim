/**
 * physics.js
 *
 * Provides realistic physics simulation for an aircraft, including aerodynamic forces,
 * multi-point collision detection, water interactions, crash cutscenes, and advanced
 * fire & smoke particle streams at impact points.
 */
import * as THREE from 'three';

// Turning physics constants
const TURN_COORDINATION    = 0.3;
const BANK_ANGLE_FACTOR    = 0.02;
const MIN_TURN_SPEED       = 10;

// Water physics constants
const WATER_SURFACE_LEVEL      = 10;
const MAX_UNDERWATER_DEPTH     = 15;
const WATER_BUOYANCY_FORCE     = 25;
const WATER_DRAG_COEFFICIENT   = 0.08;
const WATER_RESISTANCE_FACTOR  = 0.6;
const SAFE_WATER_LANDING_SPEED = 25;
const WATER_SPLASH_THRESHOLD   = 5;

// Preload fire & smoke textures
const loader    = new THREE.TextureLoader();
const SMOKE_TEX = loader.load('textures/smoke.png');
const FIRE_TEX  = loader.load('textures/fire.png');

/**
 * Initializes and manages the physics simulation for an aircraft.
 *
 * Defines multi-point collision impact, aerodynamic forces, water logic,
 * crash cutscene, and advanced fire & smoke streams at impact.
 *
 * @param {THREE.Object3D} aircraft - The aircraft mesh to control.
 * @param {Function} onTakeoff      - Callback invoked once on takeoff.
 * @param {THREE.Object3D} terrain  - Terrain mesh for collision.
 * @param {THREE.Object3D} ocean    - Ocean mesh for water interaction.
 * @param {THREE.PerspectiveCamera} camera - Camera for crash cutscenes.
 * @returns {void}
 */
export function setupPhysics(aircraft, onTakeoff, terrain, ocean, camera) {
  /**
   * Impact points in local space for wings, nose, and tail.
   * @type {THREE.Vector3[]}
   */
  aircraft.impactPoints = [
    new THREE.Vector3(  5,  0,  0),  // right wingtip
    new THREE.Vector3( -5,  0,  0),  // left wingtip
    new THREE.Vector3(  0,  0, 10),  // nose
    new THREE.Vector3(  0, -1, -8),  // tail
  ];

  // Initialize aircraft state
  aircraft.velocity          = new THREE.Vector3();
  aircraft.rotationSpeed     = { pitch:0, yaw:0, roll:0 };
  aircraft.throttle          = 0;
  aircraft.airborne          = false;
  aircraft.crashed           = false;
  aircraft.inWater           = false;
  aircraft.waterDepth        = 0;
  aircraft.previouslyInWater = false;

  // Aerodynamic and environment constants
  const GROUND_LEVEL   = 20;
  const TAKEOFF_SPEED  = 30;
  const MAX_THRUST     = 16000; // Increased for more speed
  const DRAG_COEFF     = 0.01;
  const LIFT_COEFF     = 0.03;
  const GRAVITY        = 9.81;
  const MAX_SPEED      = 1200;  // Increased for more fun and realism
  const MASS           = 1200;
  const WING_AREA      = 16;
  const AIR_DENSITY    = 1.225;

  /** @type {{fire: THREE.Points, smoke: THREE.Points, geom: THREE.BufferGeometry, time: number}[]} */
  const activeStreams = [];

  /**
   * Emits a realistic fire + smoke effect at the given world position.
   * Fire appears first, then smoke fades in, both covering the aircraft mesh.
   * @param {THREE.Vector3} position - World impact location.
   */
  function emitCrashStream(position) {
    const group = new THREE.Group();
    const fireCount = 120;
    const smokeCount = 180;
    let smokeSprites = [];

    // Use the exact impact point as the center for all particles
    const center = position.clone();
    // Use a fixed bounding box around the impact point for coverage
    const bbox = new THREE.Box3(
      center.clone().addScalar(-6),
      center.clone().addScalar(6)
    );

    // Helper to create a single particle
    function createParticle(tex, size, color, opacity, pos, vel, fade, expand, animate) {
      const mat = new THREE.SpriteMaterial({
        map: tex,
        color: color,
        opacity: opacity,
        transparent: true,
        depthWrite: false,
        blending: tex === FIRE_TEX ? THREE.AdditiveBlending : THREE.NormalBlending
      });
      const sprite = new THREE.Sprite(mat);
      sprite.position.copy(pos);
      sprite.scale.set(size, size, size);
      sprite.userData = { vel, fade, expand, animate, baseSize: size, opacity };
      group.add(sprite);
      return sprite;
    }

    // Fire core (bright, small, fast, climbs up)
    for (let i = 0; i < fireCount; i++) {
      // Distribute within bounding box centered at impact
      const pos = new THREE.Vector3(
        THREE.MathUtils.lerp(bbox.min.x, bbox.max.x, Math.random()),
        THREE.MathUtils.lerp(bbox.min.y, bbox.max.y, Math.random()),
        THREE.MathUtils.lerp(bbox.min.z, bbox.max.z, Math.random())
      );
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        Math.random() * 8 + 8,
        (Math.random() - 0.5) * 2
      );
      const color = new THREE.Color().setHSL(0.08 + Math.random() * 0.06, 1, 0.5 + Math.random() * 0.2);
      createParticle(
        FIRE_TEX, 8 + Math.random() * 6, color, 1,
        pos, vel, 2.2 + Math.random() * 0.7, 1.5 + Math.random(), true
      );
    }

    // Fire glow (larger, orange, slower, climbs up)
    for (let i = 0; i < fireCount / 2; i++) {
      const pos = new THREE.Vector3(
        THREE.MathUtils.lerp(bbox.min.x, bbox.max.x, Math.random()),
        THREE.MathUtils.lerp(bbox.min.y, bbox.max.y, Math.random()),
        THREE.MathUtils.lerp(bbox.min.z, bbox.max.z, Math.random())
      );
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 1.5,
        Math.random() * 5 + 4,
        (Math.random() - 0.5) * 1.5
      );
      const color = new THREE.Color().setHSL(0.07, 1, 0.35 + Math.random() * 0.1);
      createParticle(
        FIRE_TEX, 16 + Math.random() * 8, color, 0.8,
        pos, vel, 2.8 + Math.random(), 2.5 + Math.random(), true
      );
    }

    terrain.parent.add(group);

    // Animate all particles
    let time = 0;
    function animateFire() {
      time += 0.016;
      for (let i = group.children.length - 1; i >= 0; i--) {
        const sprite = group.children[i];
        const ud = sprite.userData;
        sprite.position.addScaledVector(ud.vel, 0.016);
        ud.vel.y += 0.12 * 0.016;
        ud.vel.x += (Math.random() - 0.5) * 0.02;
        ud.vel.z += (Math.random() - 0.5) * 0.02;
        sprite.scale.setScalar(ud.baseSize + ud.expand * time);
        // Fade less aggressively
        sprite.material.opacity = Math.max(0, ud.opacity * (1 - time / (ud.fade + 1.5)));
        // Animate fire flicker
        if (ud.animate && Math.random() < 0.2) {
          sprite.material.color.offsetHSL(0, 0, (Math.random() - 0.5) * 0.1);
        }
        // Remove if faded
        if (time > ud.fade + 1.5) {
          group.remove(sprite);
        }
      }
      if (group.children.length > 0) {
        requestAnimationFrame(animateFire);
      }
    }
    animateFire();

    // After a short delay, add smoke
    setTimeout(() => {
      // Thick smoke (dark, slow, large, rises and drifts)
      for (let i = 0; i < smokeCount; i++) {
        const pos = new THREE.Vector3(
          THREE.MathUtils.lerp(bbox.min.x, bbox.max.x, Math.random()),
          THREE.MathUtils.lerp(bbox.min.y, bbox.max.y, Math.random()),
          THREE.MathUtils.lerp(bbox.min.z, bbox.max.z, Math.random())
        );
        const vel = new THREE.Vector3(
          (Math.random() - 0.5) * 1.2,
          Math.random() * 4 + 2,
          (Math.random() - 0.5) * 1.2
        );
        const color = new THREE.Color().setHSL(0, 0, 0.08 + Math.random() * 0.12);
        smokeSprites.push(createParticle(
          SMOKE_TEX, 18 + Math.random() * 12, color, 0.7 + Math.random() * 0.2,
          pos, vel, 4.5 + Math.random() * 2, 3 + Math.random() * 2, false
        ));
      }
      // Light smoke (gray, very large, slow, fades out, rises and drifts)
      for (let i = 0; i < smokeCount / 2; i++) {
        const pos = new THREE.Vector3(
          THREE.MathUtils.lerp(bbox.min.x, bbox.max.x, Math.random()),
          THREE.MathUtils.lerp(bbox.min.y, bbox.max.y, Math.random()),
          THREE.MathUtils.lerp(bbox.min.z, bbox.max.z, Math.random())
        );
        const vel = new THREE.Vector3(
          (Math.random() - 0.5) * 0.8,
          Math.random() * 2 + 1,
          (Math.random() - 0.5) * 0.8
        );
        const color = new THREE.Color().setHSL(0, 0, 0.25 + Math.random() * 0.15);
        smokeSprites.push(createParticle(
          SMOKE_TEX, 32 + Math.random() * 16, color, 0.4 + Math.random() * 0.2,
          pos, vel, 6 + Math.random() * 2, 4 + Math.random() * 2, false
        ));
      }
      // Animate smoke
      let smokeTime = 0;
      function animateSmoke() {
        smokeTime += 0.016;
        for (let i = smokeSprites.length - 1; i >= 0; i--) {
          const sprite = smokeSprites[i];
          const ud = sprite.userData;
          sprite.position.addScaledVector(ud.vel, 0.016);
          ud.vel.y += 0.12 * 0.016;
          ud.vel.x += (Math.random() - 0.5) * 0.02;
          ud.vel.z += (Math.random() - 0.5) * 0.02;
          sprite.scale.setScalar(ud.baseSize + ud.expand * smokeTime);
          // Fade less aggressively
          sprite.material.opacity = Math.max(0, ud.opacity * (1 - smokeTime / (ud.fade + 2)));
          if (smokeTime > ud.fade + 2) {
            group.remove(sprite);
            smokeSprites.splice(i, 1);
          }
        }
        if (smokeSprites.length > 0) {
          requestAnimationFrame(animateSmoke);
        } else {
          terrain.parent.remove(group);
        }
      }
      animateSmoke();
    }, 400); // 400ms delay before smoke appears
  }

  /**
   * Updates all active fire & smoke streams.
   * @param {number} dt - Time step in seconds.
   */
  function updateStreams(dt) {
    for (let i = activeStreams.length - 1; i >= 0; i--) {
      const s = activeStreams[i];
      s.time += dt;
      const pAttr = s.geom.getAttribute('position');
      const vAttr = s.geom.getAttribute('velocity');

      for (let j = 0; j < pAttr.count; j++) {
        const j3 = j * 3;
        vAttr.array[j3+1] -= GRAVITY * dt * 0.2;
        pAttr.array[j3]   += vAttr.array[j3]   * dt;
        pAttr.array[j3+1] += vAttr.array[j3+1] * dt;
        pAttr.array[j3+2] += vAttr.array[j3+2] * dt;
      }
      pAttr.needsUpdate = true;

      const fade = 1 - (s.time / 2);
      s.fire.material.opacity  = Math.max(0, fade);
      s.smoke.material.opacity = Math.max(0, fade * 0.6);

      if (s.time > 2) {
        terrain.parent.remove(s.fire, s.smoke);
        activeStreams.splice(i, 1);
      }
    }
  }

  /**
   * Shows a game-over overlay with restart button.
   */

  function showGameOverScreen() {
    if (document.getElementById('game-over-overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'game-over-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;' +
      'background:rgba(0,0,0,0.85);display:flex;flex-direction:column;' +
      'align-items:center;justify-content:center;z-index:9999';
    overlay.innerHTML = `
      <h1 style="color:#fff;font-size:3em;">Game Over</h1>
      <p style="color:#fff;font-size:1.5em;">You crashed!</p>
      <button id="restart-btn" style="font-size:1.2em;padding:0.5em 2em;">Restart</button>
    `;
    document.body.appendChild(overlay);
    document.getElementById('restart-btn').onclick = () => window.location.reload();
  }

  /**
   * Plays crash cutscene (shake, zoom) then shows game-over.
   * @param {THREE.PerspectiveCamera} cam
   * @param {'terrain'|'water'} [type='terrain']
   */
  function triggerCrashCutscene(cam, type = 'terrain') {
    const initialFov = cam.fov;
    const origPos = cam.position.clone();
    const origLook = aircraft.position.clone();
    let t = 0;
    const dur = 2.5;
    const rr = setInterval(() => {
      t += 0.05;
      cam.position.x += (Math.random()-0.5)*0.8;
      cam.position.y += (Math.random()-0.5)*0.8;
      cam.position.z += (Math.random()-0.5)*0.8;
      cam.fov = initialFov - Math.min(t*15, 10);
      cam.updateProjectionMatrix();
      cam.lookAt(aircraft.position);
      if (t >= dur) {
        clearInterval(rr);
        cam.fov = initialFov;
        cam.position.copy(origPos);
        cam.lookAt(origLook);
        cam.updateProjectionMatrix();
        showGameOverScreen();
      }
    }, 50);
  }

  /**
   * Checks and updates water interaction state.
   */
  
  function checkWaterInteraction() {
    const ray = new THREE.Raycaster(
      aircraft.position.clone().add(new THREE.Vector3(0, 100, 0)),
      new THREE.Vector3(0, -1, 0), 0, 200
    );
    const hits = ray.intersectObject(ocean, true);
    if (hits.length) {
      const wy = hits[0].point.y;
      const ay = aircraft.position.y;
      if (ay <= wy + 2) {
        aircraft.inWater = true;
        aircraft.waterDepth = Math.max(0, wy - ay + 2);
        if (aircraft.waterDepth > MAX_UNDERWATER_DEPTH) {
          aircraft.position.y = wy - MAX_UNDERWATER_DEPTH + 2;
          aircraft.waterDepth = MAX_UNDERWATER_DEPTH;
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
   * Emits splash particles when entering water.
   * @param {THREE.Vector3} position
   */
  function emitSplashParticles(position) {
    // TODO: Implement splash effect or leave as is if not needed.
    // For now, this is a stub to avoid runtime errors.
  }

  /**
   * Handles multi-point collisions and triggers crash streams.
   */
  function handleCollisions() {
    const world = aircraft.matrixWorld;
    // Multi-directional raycasts for robust collision detection
    const rayDirections = [
      new THREE.Vector3(0, -1, 0),  // down
      new THREE.Vector3(0, 0, -1),  // forward
      new THREE.Vector3(1, 0, 0),   // right
      new THREE.Vector3(-1, 0, 0),  // left
      new THREE.Vector3(0, 0, 1),   // backward
    ];
    for (const pt of aircraft.impactPoints) {
      if (aircraft.crashed) break;
      const origin = pt.clone().applyMatrix4(world);
      for (const direction of rayDirections) {
        const ray = new THREE.Raycaster(origin, direction, 0, 5);
        const tHits = ray.intersectObject(terrain, true);
        if (tHits.length && tHits[0].distance < 2) {
          aircraft.crashed = true;
          aircraft.velocity.set(0, 0, 0);
          emitCrashStream(tHits[0].point);
          if (camera) triggerCrashCutscene(camera, 'terrain');
          return;
        }
      }
      // Water collision check (original logic)
      const waterRay = new THREE.Raycaster(origin, new THREE.Vector3(0, -1, 0), 0, 200);
      const wHits = waterRay.intersectObject(ocean, true);
      if (wHits.length) {
        const wy = wHits[0].point.y;
        const speed = aircraft.velocity.length();
        if (origin.y <= wy + 1 && speed > SAFE_WATER_LANDING_SPEED) {
          aircraft.crashed = true;
          aircraft.velocity.set(0, 0, 0);
          emitCrashStream(wHits[0].point);
          if (camera) triggerCrashCutscene(camera, 'water');
          return;
        }
        if (aircraft.inWater && !aircraft.previouslyInWater && speed > WATER_SPLASH_THRESHOLD) {
          emitSplashParticles(origin);
        }
      }
    }
    aircraft.previouslyInWater = aircraft.inWater;
  }

  /**
   * Updates physics and streams per frame.
   * @param {number} dt - Time step in seconds.
   */
  aircraft.updatePhysics = function(dt) {
    if (aircraft.crashed) {
      updateStreams(dt);
      return;
    }

    // Aerodynamic forces
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(aircraft.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(aircraft.quaternion);
    const speed = aircraft.velocity.length();

    // Check water interaction
    checkWaterInteraction();

    // Thrust
    const thrust = forward.clone().multiplyScalar(aircraft.throttle * MAX_THRUST);

    // Drag (dynamic, includes AoA)
    let dragCoeff = DRAG_COEFF;
    if (aircraft.inWater) dragCoeff += WATER_DRAG_COEFFICIENT;
    const drag = aircraft.velocity.clone().multiplyScalar(
      -0.5 * AIR_DENSITY * speed * dragCoeff * WING_AREA / MASS
    );

    // Angle of attack (AoA)
    const velocityDir = aircraft.velocity.clone().normalize();
    const forwardDir = new THREE.Vector3(0, 0, -1).applyQuaternion(aircraft.quaternion);
    const aoa = velocityDir.angleTo(forwardDir);
    const isStalled = aoa > 0.26;
    const dynamicLiftCoeff = isStalled ? 0.01 : LIFT_COEFF * Math.cos(aoa);

    // Lift
    const liftMag = 0.5 * AIR_DENSITY * speed * speed * WING_AREA * dynamicLiftCoeff;
    const liftEffectiveness = aircraft.inWater ? 0.3 : 1.0;
    const lift = up.clone().multiplyScalar((aircraft.position.y > 5 ? liftMag * liftEffectiveness : 0) / MASS);

    // Gravity
    const gravity = new THREE.Vector3(0, -GRAVITY, 0);

    // Buoyancy
    const buoyancy = aircraft.inWater
      ? new THREE.Vector3(0, WATER_BUOYANCY_FORCE * Math.min(aircraft.waterDepth / 5, 1), 0)
      : new THREE.Vector3(0, 0, 0);

    // Net force and integration
    const net = new THREE.Vector3();
    net.add(thrust).add(drag).add(lift).add(gravity).add(buoyancy);
    aircraft.velocity.addScaledVector(net, dt);

    // Water resistance
    if (aircraft.inWater) {
      aircraft.velocity.multiplyScalar(1 - (1 - WATER_RESISTANCE_FACTOR) * dt * 2);
    }

    // Speed clamp
    if (aircraft.velocity.length() > MAX_SPEED) aircraft.velocity.setLength(MAX_SPEED);

    // Takeoff logic
    if (!aircraft.airborne) {
      // Only lock to ground if at or below ground level
      if (aircraft.position.y <= GROUND_LEVEL) {
        aircraft.velocity.y = 0;
        aircraft.position.y = GROUND_LEVEL;
      }
      if (aircraft.velocity.dot(forward) > TAKEOFF_SPEED || aircraft.position.y > GROUND_LEVEL + 1) {
        aircraft.airborne = true;
        onTakeoff && onTakeoff();
      }
    }

    // Turning and motion
    applyTurning(dt);
    if (aircraft.airborne) {
      // Apply gravity only when airborne
      aircraft.velocity.y -= GRAVITY * dt;
      // Limit downward speed to prevent excessive fall
      if (aircraft.velocity.y < -MAX_SPEED * 0.5) aircraft.velocity.y = -MAX_SPEED * 0.5;
    } else {
      // Lock to ground when not airborne
      aircraft.velocity.y = 0;
    }
    aircraft.position.addScaledVector(aircraft.velocity, dt);

    // Collisions and streams
    handleCollisions();
    updateStreams(dt);
  };

  /**
   * Applies turning and banking logic.
   * @param {number} dt - Time step in seconds.
   */

  function applyTurning(dt) {
    const speed = aircraft.velocity.length();
    const speedFactor = Math.max(0.1,
      MIN_TURN_SPEED / Math.max(speed, MIN_TURN_SPEED)
    );
    const sy = aircraft.rotationSpeed.yaw   * speedFactor;
    const sp = aircraft.rotationSpeed.pitch * speedFactor * 4.5; // Increased multiplier for drastic pitch
    const sr = aircraft.rotationSpeed.roll;

    const right   = new THREE.Vector3(1,0,0).applyQuaternion(aircraft.quaternion);
    const up      = new THREE.Vector3(0,1,0).applyQuaternion(aircraft.quaternion);
    const forward = new THREE.Vector3(0,0,-1).applyQuaternion(aircraft.quaternion);

    const qPitch   = new THREE.Quaternion().setFromAxisAngle(right,   sp * dt);
    const qYaw     = new THREE.Quaternion().setFromAxisAngle(up,      sy * dt);
    const bankRoll = sy * BANK_ANGLE_FACTOR * speed;
    const qRoll    = new THREE.Quaternion().setFromAxisAngle(
      forward, (sr + bankRoll) * dt
    );

    aircraft.quaternion
      .multiply(qYaw)
      .multiply(qPitch)
      .multiply(qRoll)
      .normalize();

    // More responsive velocity alignment with aircraft orientation
    if (speed > 1) {
      const cf = new THREE.Vector3(0,0,-1).applyQuaternion(aircraft.quaternion);
      const vd = aircraft.velocity.clone().normalize();
      vd.lerp(cf, Math.min(TURN_COORDINATION * 3 * dt, 0.8));
      aircraft.velocity.copy(vd.multiplyScalar(speed));
    }
  }
}

/**
 * NEW: Emits a realistic fire + smoke effect at the given world position.
 * @param {THREE.Vector3} position - World impact location.
 */
export function emitCrashStream(position) {
  const group = new THREE.Group();
  const fireCount = 120;
  const smokeCount = 180;
  let smokeSprites = [];

  // Use the exact impact point as the center for all particles
  const center = position.clone();
  // Use a fixed bounding box around the impact point for coverage
  const bbox = new THREE.Box3(
    center.clone().addScalar(-6),
    center.clone().addScalar(6)
  );

  // Helper to create a single particle
  function createParticle(tex, size, color, opacity, pos, vel, fade, expand, animate) {
    const mat = new THREE.SpriteMaterial({
      map: tex,
      color: color,
      opacity: opacity,
      transparent: true,
      depthWrite: false,
      blending: tex === FIRE_TEX ? THREE.AdditiveBlending : THREE.NormalBlending
    });
    const sprite = new THREE.Sprite(mat);
    sprite.position.copy(pos);
    sprite.scale.set(size, size, size);
    sprite.userData = { vel, fade, expand, animate, baseSize: size, opacity };
    group.add(sprite);
    return sprite;
  }

  // Fire core (bright, small, fast, climbs up)
  for (let i = 0; i < fireCount; i++) {
    // Distribute within bounding box centered at impact
    const pos = new THREE.Vector3(
      THREE.MathUtils.lerp(bbox.min.x, bbox.max.x, Math.random()),
      THREE.MathUtils.lerp(bbox.min.y, bbox.max.y, Math.random()),
      THREE.MathUtils.lerp(bbox.min.z, bbox.max.z, Math.random())
    );
    const vel = new THREE.Vector3(
      (Math.random() - 0.5) * 2,
      Math.random() * 8 + 8,
      (Math.random() - 0.5) * 2
    );
    const color = new THREE.Color().setHSL(0.08 + Math.random() * 0.06, 1, 0.5 + Math.random() * 0.2);
    createParticle(
      FIRE_TEX, 8 + Math.random() * 6, color, 1,
      pos, vel, 2.2 + Math.random() * 0.7, 1.5 + Math.random(), true
    );
  }

  // Fire glow (larger, orange, slower, climbs up)
  for (let i = 0; i < fireCount / 2; i++) {
    const pos = new THREE.Vector3(
      THREE.MathUtils.lerp(bbox.min.x, bbox.max.x, Math.random()),
      THREE.MathUtils.lerp(bbox.min.y, bbox.max.y, Math.random()),
      THREE.MathUtils.lerp(bbox.min.z, bbox.max.z, Math.random())
    );
    const vel = new THREE.Vector3(
      (Math.random() - 0.5) * 1.5,
      Math.random() * 5 + 4,
      (Math.random() - 0.5) * 1.5
    );
    const color = new THREE.Color().setHSL(0.07, 1, 0.35 + Math.random() * 0.1);
    createParticle(
      FIRE_TEX, 16 + Math.random() * 8, color, 0.8,
      pos, vel, 2.8 + Math.random(), 2.5 + Math.random(), true
    );
  }

  terrain.parent.add(group);

  // Animate all particles
  let time = 0;
  function animateFire() {
    time += 0.016;
    for (let i = group.children.length - 1; i >= 0; i--) {
      const sprite = group.children[i];
      const ud = sprite.userData;
      sprite.position.addScaledVector(ud.vel, 0.016);
      ud.vel.y += 0.12 * 0.016;
      ud.vel.x += (Math.random() - 0.5) * 0.02;
      ud.vel.z += (Math.random() - 0.5) * 0.02;
      sprite.scale.setScalar(ud.baseSize + ud.expand * time);
      // Fade less aggressively
      sprite.material.opacity = Math.max(0, ud.opacity * (1 - time / (ud.fade + 1.5)));
      // Animate fire flicker
      if (ud.animate && Math.random() < 0.2) {
        sprite.material.color.offsetHSL(0, 0, (Math.random() - 0.5) * 0.1);
      }
      // Remove if faded
      if (time > ud.fade + 1.5) {
        group.remove(sprite);
      }
    }
    if (group.children.length > 0) {
      requestAnimationFrame(animateFire);
    }
  }
  animateFire();

  // After a short delay, add smoke
  setTimeout(() => {
    // Thick smoke (dark, slow, large, rises and drifts)
    for (let i = 0; i < smokeCount; i++) {
      const pos = new THREE.Vector3(
        THREE.MathUtils.lerp(bbox.min.x, bbox.max.x, Math.random()),
        THREE.MathUtils.lerp(bbox.min.y, bbox.max.y, Math.random()),
        THREE.MathUtils.lerp(bbox.min.z, bbox.max.z, Math.random())
      );
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 1.2,
        Math.random() * 4 + 2,
        (Math.random() - 0.5) * 1.2
      );
      const color = new THREE.Color().setHSL(0, 0, 0.08 + Math.random() * 0.12);
      smokeSprites.push(createParticle(
        SMOKE_TEX, 18 + Math.random() * 12, color, 0.7 + Math.random() * 0.2,
        pos, vel, 4.5 + Math.random() * 2, 3 + Math.random() * 2, false
      ));
    }
    // Light smoke (gray, very large, slow, fades out, rises and drifts)
    for (let i = 0; i < smokeCount / 2; i++) {
      const pos = new THREE.Vector3(
        THREE.MathUtils.lerp(bbox.min.x, bbox.max.x, Math.random()),
        THREE.MathUtils.lerp(bbox.min.y, bbox.max.y, Math.random()),
        THREE.MathUtils.lerp(bbox.min.z, bbox.max.z, Math.random())
      );
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 0.8,
        Math.random() * 2 + 1,
        (Math.random() - 0.5) * 0.8
      );
      const color = new THREE.Color().setHSL(0, 0, 0.25 + Math.random() * 0.15);
      smokeSprites.push(createParticle(
        SMOKE_TEX, 32 + Math.random() * 16, color, 0.4 + Math.random() * 0.2,
        pos, vel, 6 + Math.random() * 2, 4 + Math.random() * 2, false
      ));
    }
    // Animate smoke
    let smokeTime = 0;
    function animateSmoke() {
      smokeTime += 0.016;
      for (let i = smokeSprites.length - 1; i >= 0; i--) {
        const sprite = smokeSprites[i];
        const ud = sprite.userData;
        sprite.position.addScaledVector(ud.vel, 0.016);
        ud.vel.y += 0.12 * 0.016;
        ud.vel.x += (Math.random() - 0.5) * 0.02;
        ud.vel.z += (Math.random() - 0.5) * 0.02;
        sprite.scale.setScalar(ud.baseSize + ud.expand * smokeTime);
        // Fade less aggressively
        sprite.material.opacity = Math.max(0, ud.opacity * (1 - smokeTime / (ud.fade + 2)));
        if (smokeTime > ud.fade + 2) {
          group.remove(sprite);
          smokeSprites.splice(i, 1);
        }
      }
      if (smokeSprites.length > 0) {
        requestAnimationFrame(animateSmoke);
      } else {
        terrain.parent.remove(group);
      }
    }
    animateSmoke();
  }, 400); // 400ms delay before smoke appears
}
