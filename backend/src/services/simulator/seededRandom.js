export class SeededRandom {
  constructor(seed) {
    this.state = (Number(seed) >>> 0) || 1;
  }

  next() {
    let value = (this.state += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }

  integer(min, max) {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  pick(values) {
    return values[this.integer(0, values.length - 1)];
  }
}
