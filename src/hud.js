//hud.js
export function setupHUD(aircraft) {
  const hud = document.createElement('div');
  hud.style = `
    position: absolute;
    top: 10px;
    left: 10px;
    padding: 12px 16px;
    background: rgba(0, 0, 0, 0.7);
    color: #0f0;
    font-family: monospace;
    font-size: 14px;
    border-radius: 8px;
    z-index: 100;
    pointer-events: none;
  `;
  document.body.appendChild(hud);

  function update() {
    const speed = aircraft.velocity.length().toFixed(1);
    const alt = aircraft.position.y.toFixed(1);
    const thr = Math.round(aircraft.throttle * 100);
    hud.innerHTML = `
      <b>Flight HUD</b><br>
      Speed: ${speed} m/s<br>
      Altitude: ${alt} m<br>
      Throttle: ${thr}%
    `;
    requestAnimationFrame(update);
  }

  update();
}
