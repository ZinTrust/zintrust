/**
 * Default maximum number of broadcast events retained by the in-memory driver.
 * The driver is a bounded ring buffer: without a cap every broadcast would be kept for the
 * lifetime of the process (the default driver is used in production deployments).
 */
export const DEFAULT_MAX_BROADCAST_EVENTS = 1000;

let maxEvents = DEFAULT_MAX_BROADCAST_EVENTS;

export const InMemoryDriver = Object.freeze({
  _events: [] as Array<{ channel: string; event: string; data: unknown }>,

  /**
   * Configure the retention cap. Invalid values are ignored so a bad config can never make the
   * buffer unbounded.
   */
  configure(cap: number): void {
    if (Number.isInteger(cap) && cap > 0) maxEvents = cap;
  },

  async send(_config: unknown, channel: string, event: string, data: unknown) {
    // ensure function is async and returns a resolved promise
    await Promise.resolve();
    this._events.push({ channel, event, data });
    while (this._events.length > maxEvents) {
      this._events.shift();
    }
    return { ok: true };
  },

  getEvents() {
    return this._events.slice();
  },

  reset() {
    this._events.length = 0;
  },
});

export default InMemoryDriver;
