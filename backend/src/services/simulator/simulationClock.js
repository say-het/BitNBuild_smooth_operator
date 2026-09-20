export class SimulationClock {
  constructor({ timeScale = 1, initialTime = 0, now = () => Date.now() } = {}) {
    this.timeScale = timeScale;
    this.elapsed = initialTime;
    this.now = now;
    this.lastRealTime = null;
    this.status = 'CREATED';
  }

  start() {
    if (this.status === 'RUNNING') return this.elapsed;
    this.status = 'RUNNING';
    this.lastRealTime = this.now();
    return this.elapsed;
  }

  pause() {
    this.#sync();
    this.status = 'PAUSED';
    this.lastRealTime = null;
    return this.elapsed;
  }

  resume() {
    return this.start();
  }

  stop() {
    this.#sync();
    this.status = 'STOPPED';
    this.lastRealTime = null;
    return this.elapsed;
  }

  step(seconds) {
    this.elapsed += seconds;
    return this.elapsed;
  }

  getCurrentTime() {
    this.#sync();
    return this.elapsed;
  }

  getElapsedTime() {
    return this.getCurrentTime();
  }

  #sync() {
    if (this.status !== 'RUNNING') return;
    const current = this.now();
    this.elapsed += ((current - this.lastRealTime) / 1000) * this.timeScale;
    this.lastRealTime = current;
  }
}
