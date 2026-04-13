const encodeSvgDataUri = (svg: string): string => {
  return `data:image/svg+xml,${encodeURIComponent(svg.replaceAll(/\s+/g, ' ').trim())}`;
};

const buildBrandFavicon = (kind: 'workers' | 'telemetry'): string => {
  if (kind === 'telemetry') {
    return encodeSvgDataUri(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="none">
        <rect width="256" height="256" rx="56" fill="#0f172a"/>
        <path d="M48 200 L208 200" stroke="#1e293b" stroke-width="12" stroke-linecap="round"/>
        <path d="M48 180 Q80 120, 128 150 T208 80 L208 200 L48 200 Z" fill="#0ea5e9" opacity="0.4"/>
        <path d="M48 180 Q80 120, 128 150 T208 80" stroke="#0ea5e9" stroke-width="16" stroke-linecap="round"/>
        <circle cx="208" cy="80" r="12" fill="#22c55e"/>
      </svg>
    `);
  }

  return encodeSvgDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="none">
      <rect width="256" height="256" rx="56" fill="#0f172a"/>
      <path d="M128 56 L200 96 L128 136 L56 96 Z" fill="#0ea5e9" opacity="0.2" stroke="#0ea5e9" stroke-width="4" stroke-linejoin="round"/>
      <path d="M128 104 L200 144 L128 184 L56 144 Z" fill="#0ea5e9" opacity="0.4" stroke="#0ea5e9" stroke-width="4" stroke-linejoin="round"/>
      <path d="M128 152 L200 192 L128 232 L56 192 Z" fill="#1e293b" stroke="#22c55e" stroke-width="6" stroke-linejoin="round"/>
      <circle cx="128" cy="192" r="8" fill="#22c55e"/>
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
