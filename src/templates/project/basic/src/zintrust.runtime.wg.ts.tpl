const serviceManifestModule = await import('./bootstrap/service-manifest.ts').catch(() =>
	import('./bootstrap/service-manifest.js')
);

const serviceManifest = serviceManifestModule.default ?? serviceManifestModule.serviceManifest ?? [];

export { serviceManifest };

export default Object.freeze({ serviceManifest });
