// aircraft.js
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export async function loadAircraft(scene) {
  const loader = new GLTFLoader();

  return new Promise((resolve, reject) => {
    loader.load(
      '/cessna.glb',
      (gltf) => {
        const root = gltf.scene;
        root.scale.set(3, 3, 3);
        root.position.set(0, 1.2, 0);

        console.group('Aircraft Hierarchy');
        console.log(root);
        root.traverse((node) => console.log(node.type, node.name));
        console.groupEnd();

        root.traverse((node) => {
          if (node.isMesh) {
            node.rotation.set(0, -Math.PI / 2, 0);
            node.castShadow = true;
            node.receiveShadow = true;
          }
        });

        scene.add(root);   // 🚨 Adds the plane directly to the scene
        resolve(root);     // Then resolves it
      },
      undefined,
      reject
    );
  });
}
