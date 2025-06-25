//main.js
import * as THREE from 'three';
import { setupEnvironment } from './environment.js';
import { setupPhysics } from './physics.js';
import { setupControls } from './controls.js';
import { loadAircraft } from './aircraft.js';
import { setupHUD } from './hud.js';

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
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(100, 200, 100);
scene.add(sun);
scene.add(new THREE.AmbientLight(0x555555));

// Environment
setupEnvironment(scene);

let aircraft = null;

let currentCameraPos = new THREE.Vector3();
let currentCameraLookAt = new THREE.Vector3();

loadAircraft(scene).then((loadedAircraft) => {
  aircraft = loadedAircraft;

  setupPhysics(aircraft);
  setupControls(aircraft);
  setupHUD(aircraft);

  // Initialize camera position/lookAt to avoid jump
  currentCameraPos.copy(aircraft.position).add(new THREE.Vector3(0, 10, 30));
  currentCameraLookAt.copy(aircraft.position);
});

const minHeight = 1.2; // ground height where wheels contact

function animate() {
  requestAnimationFrame(animate);

  if (aircraft) {
    aircraft.updatePhysics(0.016);

    // Clamp aircraft vertical position and velocity to simulate ground wheels
    if (aircraft.position.y <= minHeight) {
      aircraft.position.y = minHeight;

      if (aircraft.velocity.y < 0) aircraft.velocity.y = 0;

      // Optional: apply friction when on ground
      aircraft.velocity.x *= 0.98;
      aircraft.velocity.z *= 0.98;
    }

    const forward = new THREE.Vector3(0, 0, -1)
      .applyQuaternion(aircraft.quaternion)
      .normalize();

    // Get speed magnitude
    const speed = aircraft.velocity.length();

    // Calculate dynamic camera offsets for smooth chase
    const offsetBack = THREE.MathUtils.clamp(speed * 1.5, 30, 70);
    const offsetUp = THREE.MathUtils.clamp(speed * 0.5, 15, 40);

    const desiredPos = aircraft.position
      .clone()
      .add(forward.clone().multiplyScalar(-offsetBack))
      .add(new THREE.Vector3(0, offsetUp, 0));

    const lookAheadDistance = 10;
    const desiredLookAt = aircraft.position.clone().add(forward.clone().multiplyScalar(lookAheadDistance));

    // Smoothly interpolate camera position and lookAt
    currentCameraPos.lerp(desiredPos, 0.1);
    currentCameraLookAt.lerp(desiredLookAt, 0.1);

    camera.position.copy(currentCameraPos);
    camera.lookAt(currentCameraLookAt);
  }

  renderer.render(scene, camera);
}

animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
