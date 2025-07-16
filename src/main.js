// main.js
import * as THREE from 'three';
import { setupEnvironment, terrainMesh, oceanMesh, checkAltitudeLimit, startFlightTimer, stopFlightTimer, updateFlightTimerDisplay } from './environment.js';
import { setupPhysics } from './physics.js';
import { setupControls } from './controls.js';
import { loadAircraft } from './aircraft.js';
import { setupHUD } from './hud.js';
import { MissionManager } from './mission.js';
import { emitCrashStream } from './physics.js';

const START_HEIGHT = 50;
const CAMERA_LERP = 0.1;
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  10000
);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Lighting
const sun = new THREE.DirectionalLight(0xffffff, 1.2);
sun.position.set(100, 200, 100);
scene.add(sun);
scene.add(new THREE.AmbientLight(0x666666));

setupEnvironment(scene);

function waitForMeshesReady(callback) {
  // Poll until both meshes are defined
  const check = () => {
    if (terrainMesh && oceanMesh) {
      callback();
    } else {
      setTimeout(check, 30);
    }
  };
  check();
}

let aircraft = null;
let camPos = new THREE.Vector3();
let camLook = new THREE.Vector3();
let missionManager = null;

// --- NEW: Wind and turbulence parameters ---
/**
 * @typedef {Object} Wind
 * @property {THREE.Vector3} direction - Wind direction and strength.
 * @property {number} turbulence - Turbulence strength.
 */
const wind = {
  direction: new THREE.Vector3(8, 0, 0), // steady wind to the east
  turbulence: 2.5 // random gusts
};

waitForMeshesReady(() => {
  loadAircraft(scene).then((plane) => {
    aircraft = plane;
    // Only use meshes if defined
    let groundY = 0;
    const _origin = new THREE.Vector3(0, 1000, 0);
    const _down = new THREE.Vector3(0, -1, 0);
    const meshes = [];
    if (terrainMesh) meshes.push(terrainMesh);
    if (oceanMesh) meshes.push(oceanMesh);
    if (meshes.length > 0) {
      const raycaster = new THREE.Raycaster(_origin, _down, 0, 2000);
      const hits = raycaster.intersectObjects(meshes, true);
      groundY = hits.length > 0 ? hits[0].point.y : 0;
    }
    aircraft.position.set(0, groundY + START_HEIGHT, 0);
    setupPhysics(aircraft, () => console.log('✈️ Airborne!'), terrainMesh, oceanMesh);
    setupControls(aircraft);
    setupHUD(aircraft);
    missionManager = new MissionManager(aircraft);
    camPos.copy(aircraft.position).add(new THREE.Vector3(0, 10, 30));
    camLook.copy(aircraft.position);
  });
});

function getGroundHeight(x, z) {
  // NEW: Robust null checks for terrainMesh and oceanMesh
  if (!terrainMesh && !oceanMesh) return 0;
  const meshes = [];
  if (terrainMesh) meshes.push(terrainMesh);
  if (oceanMesh) meshes.push(oceanMesh);
  if (meshes.length === 0) return 0;
  const origin = new THREE.Vector3(x, 1000, z);
  const down = new THREE.Vector3(0, -1, 0);
  const ray = new THREE.Raycaster(origin, down, 0, 2000);
  const hits = ray.intersectObjects(meshes, true);
  return hits.length > 0 ? hits[0].point.y : 0;
}

function animate() {
  requestAnimationFrame(animate);

  if (
    aircraft &&
    typeof aircraft.updatePhysics === 'function' &&
    aircraft.position &&
    aircraft.velocity &&
    aircraft.quaternion
  ) {
    // --- NEW: Apply wind and turbulence ---
    applyWindAndTurbulence(aircraft);
    aircraft.updatePhysics(0.016);
    // --- NEW: Altitude/fire effect ---
    checkAltitudeLimit(aircraft);
    if (aircraft.isOnFire && !aircraft.fireEffectActive) {
      emitCrashStream(aircraft.position);
      aircraft.fireEffectActive = true;
    }
    // --- NEW: Control lockout ---
    if (aircraft.isOnFire || aircraft.crashed) {
      aircraft.controlsLocked = true;
    } else {
      aircraft.controlsLocked = false;
    }
  }

  // --- NEW: Timer triggers ---
  if (aircraft && aircraft.airborne && !window.timerStarted) {
    startFlightTimer();
    window.timerStarted = true;
  }
  // Stop timer if at finish line (simple proximity check)
  if (aircraft && typeof mazeGoal !== 'undefined') {
    const dx = aircraft.position.x - mazeGoal.x;
    const dz = aircraft.position.z - mazeGoal.y;
    if (Math.sqrt(dx*dx + dz*dz) < 200 && window.timerStarted) {
      stopFlightTimer();
      window.timerStarted = false;
    }
  }
  updateFlightTimerDisplay(); // NEW: update timer display

  if (missionManager) missionManager.update();

  if (aircraft && aircraft.position && aircraft.velocity) {
    const groundY = getGroundHeight(aircraft.position.x, aircraft.position.z);
    const MIN_CLEARANCE = 1.2;
    if (aircraft.position.y <= groundY + MIN_CLEARANCE) {
      aircraft.position.y = groundY + MIN_CLEARANCE;
      if (typeof aircraft.velocity.y === 'number') {
        if (aircraft.velocity.y < 0) aircraft.velocity.y = 0;
        aircraft.velocity.x *= 0.9;
        aircraft.velocity.z *= 0.9;
      }
    }

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(aircraft.quaternion).normalize();
    const speed = aircraft.velocity.length();
    const offsetBack = THREE.MathUtils.clamp(speed * 0.5, 30, 100);
    const offsetUp = THREE.MathUtils.clamp(speed * 0.3, 20, 60);

    const desiredPos = aircraft.position.clone()
      .add(forward.clone().multiplyScalar(-offsetBack))
      .add(new THREE.Vector3(0, offsetUp, 0));

    const lookAtPos = aircraft.position.clone().add(forward.clone().multiplyScalar(10));
    camPos.lerp(desiredPos, CAMERA_LERP);
    camLook.lerp(lookAtPos, CAMERA_LERP);

    camera.position.copy(camPos);
    camera.lookAt(camLook);
  }

  renderer.render(scene, camera);
}

animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/**
 * NEW: Applies wind and turbulence to the aircraft.
 * @param {THREE.Object3D} aircraft
 */
function applyWindAndTurbulence(aircraft) {
  if (!aircraft.velocity) return;
  // Steady wind
  aircraft.velocity.addScaledVector(wind.direction, 0.016 * 0.05);
  // Turbulence (random gusts)
  const gust = new THREE.Vector3(
    (Math.random() - 0.5) * wind.turbulence,
    (Math.random() - 0.5) * wind.turbulence * 0.5,
    (Math.random() - 0.5) * wind.turbulence
  );
  aircraft.velocity.addScaledVector(gust, 0.016 * 0.2);
}
