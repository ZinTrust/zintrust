const serviceManifestModule = await import('./bootstrap/service-manifest').catch(
  async () => import('./bootstrap/service-manifest.js')
);

const serviceManifest =
  serviceManifestModule.default ?? serviceManifestModule.serviceManifest ?? [];

export { serviceManifest };

export default Object.freeze({ serviceManifest });
