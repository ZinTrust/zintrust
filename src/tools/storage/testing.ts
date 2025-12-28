export type FakePut = {
  disk: string;
  path: string;
  contents: Buffer;
};

import { ErrorFactory } from '@exceptions/ZintrustError';

export const FakeStorage = Object.freeze({
  _puts: [] as Array<FakePut>,

  async put(disk: string, path: string, contents: Buffer) {
    this._puts.push({ disk, path, contents });
    // emulate async write
    return Promise.resolve();
  },

  get(disk: string, path: string) {
    const found = this._puts.find((p) => p.disk === disk && p.path === path);
    if (!found) throw ErrorFactory.createNotFoundError(`FakeStorage: ${disk}:${path} not found`);
    return found.contents;
  },

  exists(disk: string, path: string) {
    return this._puts.some((p) => p.disk === disk && p.path === path);
  },

  async delete(disk: string, path: string) {
    // mutate the internal array rather than replacing the property (object is frozen)
    this._puts.splice(
      0,
      this._puts.length,
      ...this._puts.filter((p) => !(p.disk === disk && p.path === path))
    );
    return Promise.resolve();
  },

  // url builder is a convenience: returns a pseudo-url for testing
  url(disk: string, path: string) {
    return `fake://${disk}/${path}`;
  },

  // Test assertions
  assertExists(disk: string, path: string) {
    if (!this._puts.some((p) => p.disk === disk && p.path === path)) {
      throw ErrorFactory.createValidationError(`Expected ${disk}:${path} to exist in FakeStorage`);
    }
  },

  assertMissing(disk: string, path: string) {
    if (this._puts.some((p) => p.disk === disk && p.path === path)) {
      throw ErrorFactory.createValidationError(
        `Expected ${disk}:${path} to be missing in FakeStorage`
      );
    }
  },

  getPuts() {
    return this._puts.slice();
  },

  reset() {
    // clear the array in-place
    this._puts.length = 0;
  },
});

export default FakeStorage;
