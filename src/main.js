// main.js
import * as THREE from 'three';
import { setupEnvironment, terrainMesh, oceanMesh } from './environment.js';
import { setupPhysics } from './physics.js';
import { setupControls } from './controls.js';
import { loadAircraft } from './aircraft.js';
import { setupHUD } from './hud.js';

// Configurable start height above local ground
const START_HEIGHT = 50;
const MIN_HEIGHT = 1.2; // ground clamp
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

let aircraft = null;
let camPos = new THREE.Vector3();
let camLook = new THREE.Vector3();

loadAircraft(scene).then((plane) => {
  aircraft = plane;

  // compute local ground height using raycast
  const downRay = new THREE.Raycaster(
    new THREE.Vector3(0, 1000, 0),
    new THREE.Vector3(0, -1, 0),
    0,
    2000
  );
  const hits = downRay.intersectObjects([terrainMesh, oceanMesh], true);
  const groundY = hits.length > 0 ? hits[0].point.y : 0;

  // Position at start height above ground
  aircraft.position.set(0, groundY + START_HEIGHT, 0);

  setupPhysics(aircraft, () => console.log('✈️ Airborne!'), terrainMesh, oceanMesh);
  setupControls(aircraft);
  setupHUD(aircraft);

  // initial camera
  camPos.copy(aircraft.position).add(new THREE.Vector3(0, 10, 30));
  camLook.copy(aircraft.position);
});

function animate() {
  requestAnimationFrame(animate);

  if (aircraft) {
    aircraft.updatePhysics(0.016);

    // clamp to ground
    if (aircraft.position.y <= MIN_HEIGHT) {
      aircraft.position.y = MIN_HEIGHT;
      if (aircraft.velocity.y < 0) aircraft.velocity.y = 0;
      aircraft.velocity.x *= 0.9;
      aircraft.velocity.z *= 0.9;
    }

    // camera follow
    const forward = new THREE.Vector3(0, 0, -1)
      .applyQuaternion(aircraft.quaternion)
      .normalize();
    const speed = aircraft.velocity.length();

    // dynamic offsets
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
