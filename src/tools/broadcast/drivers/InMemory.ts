export const InMemoryDriver = Object.freeze({
  _events: [] as Array<{ channel: string; event: string; data: unknown }>,

  async send(_config: unknown, channel: string, event: string, data: unknown) {
    // ensure function is async and returns a resolved promise
    await Promise.resolve();
    this._events.push({ channel, event, data });
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
