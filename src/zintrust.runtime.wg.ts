// @ts-expect-error Worker source mode needs the explicit TypeScript extension.
const serviceManifestModule = await import('./bootstrap/service-manifest.ts').catch(
  /* v8 ignore next */
  async () => import('./bootstrap/service-manifest.js')
);

const serviceManifest =
  serviceManifestModule.default ?? serviceManifestModule.serviceManifest ?? [];

export { serviceManifest };

export default Object.freeze({ serviceManifest });
