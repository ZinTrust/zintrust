const encodeSvgDataUri = (svg: string): string => {
  return `data:image/svg+xml,${encodeURIComponent(svg.replaceAll(/\s+/g, ' ').trim())}`;
};

const buildQueueMonitorFavicon = (): string => {
  return encodeSvgDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="none">
      <rect width="256" height="256" rx="56" fill="#0f172a"/>
      <circle cx="128" cy="128" r="64" stroke="#1e293b" stroke-width="24"/>
      <path d="M128 64 A64 64 0 0 1 192 128" stroke="#0ea5e9" stroke-width="24" stroke-linecap="round"/>
      <circle cx="128" cy="128" r="24" fill="#22c55e"/>
    </svg>
  `);
};

export const BrandFavicon = Object.freeze({
  forQueueMonitor(): string {
    return buildQueueMonitorFavicon();
  },
});
