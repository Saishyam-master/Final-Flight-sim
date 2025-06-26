// aircraft.js
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export async function loadAircraft(scene) {
  const loader = new GLTFLoader();
  return new Promise((resolve, reject) => {
    loader.load(
      '/cessna.glb',
      (gltf) => {
        const plane = gltf.scene;
        plane.scale.set(3, 3, 3);
        // initial Y is set externally in main.js
        plane.position.set(0, 0, 0);

        plane.traverse((n) => {
          if (n.isMesh) {
            n.rotation.set(0, -Math.PI / 2, 0);
            n.castShadow = true;
            n.receiveShadow = true;
          }
        });

        scene.add(plane);
        resolve(plane);
      },
      undefined,
      reject
    );
  });
}
