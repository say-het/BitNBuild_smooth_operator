export class EventScheduler {
  constructor(timeline, nextEventIndex = 0) {
    this.timeline = [...timeline].sort((left, right) => left.at - right.at || left.order - right.order);
    this.nextEventIndex = nextEventIndex;
    this.cancelled = false;
  }

  get pendingCount() {
    return this.timeline.length - this.nextEventIndex;
  }

  peek() {
    return this.cancelled ? undefined : this.timeline[this.nextEventIndex];
  }

  takeNext() {
    const next = this.peek();
    if (!next) return undefined;
    this.nextEventIndex += 1;
    return next;
  }

  takeDue(simulationTime) {
    const due = [];
    while (this.peek() && this.peek().at <= simulationTime) due.push(this.takeNext());
    return due;
  }

  cancel() {
    this.cancelled = true;
  }
}
