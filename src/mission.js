// mission.js
// Basic objective system: fly from A to B
import * as THREE from 'three';
export function setupMission(aircraft) {
    const target = new THREE.Vector3(0, 0, -1500); // end of runway
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(5, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xff0000 })
    );
    marker.position.copy(target);
    aircraft.parent.add(marker);
  
    const checkMission = () => {
      const distance = aircraft.position.distanceTo(target);
      if (distance < 50) {
        alert("✅ Mission Complete: You reached the target!");
      } else {
        requestAnimationFrame(checkMission);
      }
    };
  
    checkMission();
  }
  