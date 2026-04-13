const encodeSvgDataUri = (svg: string): string => {
  return `data:image/svg+xml,${encodeURIComponent(svg.replaceAll(/\s+/g, ' ').trim())}`;
};

const buildQueueMonitorFavicon = (): string => {
  return encodeSvgDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none">
      <defs>
        <linearGradient id="zt-queue-favicon" x1="14" y1="18" x2="84" y2="82" gradientUnits="userSpaceOnUse">
          <stop stop-color="#22c55e" />
          <stop offset="1" stop-color="#38bdf8" />
        </linearGradient>
        <radialGradient id="zt-queue-shell" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(50 50) rotate(90) scale(52)">
          <stop stop-color="#14243f" />
          <stop offset="1" stop-color="#08111f" />
        </radialGradient>
      </defs>
      <rect x="6" y="6" width="88" height="88" rx="24" fill="url(#zt-queue-shell)" />
      <circle cx="50" cy="50" r="34" stroke="rgba(255,255,255,0.14)" stroke-width="4" />
      <ellipse cx="50" cy="50" rx="40" ry="18" stroke="url(#zt-queue-favicon)" stroke-width="4" />
      <ellipse cx="50" cy="50" rx="18" ry="40" stroke="url(#zt-queue-favicon)" stroke-width="4" opacity="0.78" />
      <circle cx="50" cy="50" r="6" fill="url(#zt-queue-favicon)" />
      <path d="M40 52C35 52 32 49 32 44C32 39 35 36 40 36H48" stroke="white" stroke-width="6" stroke-linecap="round" />
      <path d="M60 48C65 48 68 51 68 56C68 61 65 64 60 64H52" stroke="white" stroke-width="6" stroke-linecap="round" />
      <path d="M44 50H56" stroke="rgba(255,255,255,0.22)" stroke-width="6" stroke-linecap="round" />
      <rect x="27" y="41" width="46" height="8" rx="4" fill="white" />
      <rect x="27" y="54" width="34" height="8" rx="4" fill="white" opacity="0.96" />
      <rect x="27" y="67" width="22" height="8" rx="4" fill="white" opacity="0.88" />
      <circle cx="68" cy="58" r="5" fill="#fbbf24" />
    </svg>
  `);
};

export const BrandFavicon = Object.freeze({
  forQueueMonitor(): string {
    return buildQueueMonitorFavicon();
  },
});
