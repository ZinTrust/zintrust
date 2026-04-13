const encodeSvgDataUri = (svg: string): string => {
  return `data:image/svg+xml,${encodeURIComponent(svg.replaceAll(/\s+/g, ' ').trim())}`;
};

const getOverlay = (kind: 'workers' | 'telemetry'): string => {
  if (kind === 'workers') {
    return `
      <rect x="28" y="58" width="10" height="16" rx="4" fill="white" />
      <rect x="45" y="50" width="10" height="24" rx="4" fill="white" opacity="0.96" />
      <rect x="62" y="42" width="10" height="32" rx="4" fill="white" opacity="0.9" />
      <path d="M26 79H74" stroke="rgba(255,255,255,0.28)" stroke-width="4" stroke-linecap="round" />
    `;
  }

  return `
    <path
      d="M22 58H36L43 43L49 64L56 51L63 58H78"
      stroke="white"
      stroke-width="6"
      stroke-linecap="round"
      stroke-linejoin="round"
      fill="none"
    />
    <circle cx="43" cy="43" r="3.5" fill="#fbbf24" />
    <circle cx="56" cy="51" r="3.5" fill="#fbbf24" opacity="0.95" />
  `;
};

const buildBrandFavicon = (kind: 'workers' | 'telemetry'): string => {
  const gradientId = kind === 'workers' ? 'zt-workers-favicon' : 'zt-telemetry-favicon';

  return encodeSvgDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none">
      <defs>
        <linearGradient id="${gradientId}" x1="14" y1="18" x2="84" y2="82" gradientUnits="userSpaceOnUse">
          <stop stop-color="#22c55e" />
          <stop offset="1" stop-color="#38bdf8" />
        </linearGradient>
        <radialGradient id="zt-shell" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(50 50) rotate(90) scale(52)">
          <stop stop-color="#14243f" />
          <stop offset="1" stop-color="#08111f" />
        </radialGradient>
      </defs>
      <rect x="6" y="6" width="88" height="88" rx="24" fill="url(#zt-shell)" />
      <circle cx="50" cy="50" r="34" stroke="rgba(255,255,255,0.14)" stroke-width="4" />
      <ellipse cx="50" cy="50" rx="40" ry="18" stroke="url(#${gradientId})" stroke-width="4" />
      <ellipse cx="50" cy="50" rx="18" ry="40" stroke="url(#${gradientId})" stroke-width="4" opacity="0.78" />
      <circle cx="50" cy="50" r="6" fill="url(#${gradientId})" />
      <path d="M40 52C35 52 32 49 32 44C32 39 35 36 40 36H48" stroke="white" stroke-width="6" stroke-linecap="round" />
      <path d="M60 48C65 48 68 51 68 56C68 61 65 64 60 64H52" stroke="white" stroke-width="6" stroke-linecap="round" />
      <path d="M44 50H56" stroke="rgba(255,255,255,0.22)" stroke-width="6" stroke-linecap="round" />
      ${getOverlay(kind)}
    </svg>
  `);
};

export const BrandFavicon = Object.freeze({
  forWorkersUi(): string {
    return buildBrandFavicon('workers');
  },
  forTelemetry(): string {
    return buildBrandFavicon('telemetry');
  },
});
