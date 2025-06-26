// missions.js

/**
 * MissionManager handles game objectives and mission completions.
 * Each mission has:
 *  - id: string identifier
 *  - description: human-readable task
 *  - condition: function that returns true when complete
 *  - completed: whether it's already done
 */
export class MissionManager {
  constructor(aircraft) {
    this.aircraft = aircraft;
    this.missions = this._createMissions();
  }

  /**
   * Defines available missions.
   */
  _createMissions() {
    return [
      {
        id: 'takeoff_once',
        description: 'Successfully take off from the ground.',
        condition: () => this.aircraft.airborne,
        completed: false
      },
      {
        id: 'distance_10km',
        description: 'Fly 10 kilometers total.',
        condition: () => this.aircraft.totalDistance >= 10000,
        completed: false
      },
      {
        id: 'max_speed_15s',
        description: 'Maintain 550 m/s+ for 15 seconds.',
        condition: () => this.aircraft.maxSpeedTime >= 15,
        completed: false
      }
    ];
  }

  /**
   * Called every frame to check mission status.
   */
  update() {
    for (const mission of this.missions) {
      if (!mission.completed && mission.condition()) {
        mission.completed = true;
        this._announceCompletion(mission.description);
      }
    }
  }

  /**
   * Displays a brief banner when a mission is completed.
   */
  _announceCompletion(description) {
    const banner = document.createElement('div');
    banner.textContent = `MISSION COMPLETE: ${description}`;
    Object.assign(banner.style, {
      position: 'fixed',
      top: '30px',
      left: '50%',
      transform: 'translateX(-50%)',
      padding: '12px 24px',
      background: '#22cc88',
      color: '#fff',
      fontWeight: 'bold',
      fontFamily: 'sans-serif',
      fontSize: '16px',
      borderRadius: '8px',
      boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
      zIndex: 9999
    });
    document.body.appendChild(banner);
    setTimeout(() => banner.remove(), 3000);
  }

  /**
   * Returns mission data (e.g. for UI).
   */
  getStatus() {
    return this.missions.map(({ id, description, completed }) => ({
      id,
      description,
      completed
    }));
  }
}
