import * as THREE from 'three';

export function addRunway(scene) {
  const loader = new THREE.TextureLoader();
  const asphalt = loader.load('/assets/runway/Asphalt012_Color.jpg');
  const normal = loader.load('/assets/runway/Asphalt012_NormalGL.jpg');
  const rough = loader.load('/assets/runway/Asphalt012_Roughness.jpg');

  [asphalt, normal, rough].forEach((tex) => {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(12, 400);
  });

  const geo = new THREE.BoxGeometry(45, 3, 1500);
  const mats = [
    new THREE.MeshStandardMaterial({ color: 0x2c2c2c }),
    new THREE.MeshStandardMaterial({ color: 0x2c2c2c }),
    new THREE.MeshStandardMaterial({ map: asphalt, normalMap: normal, roughnessMap: rough, metalness: 0.1, roughness: 1 }),
    new THREE.MeshStandardMaterial({ color: 0x2c2c2c }),
    new THREE.MeshStandardMaterial({ color: 0x2c2c2c }),
    new THREE.MeshStandardMaterial({ color: 0x2c2c2c })
  ];

  const runway = new THREE.Mesh(geo, mats);
  runway.receiveShadow = true;
  runway.position.y = 1.5;
  scene.add(runway);
}