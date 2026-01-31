export const renderResourceUsageChart = (): string => {
  return `
    <div class="zt-card">
      <div class="zt-card-header">
        <h3 class="zt-card-title">Resource Usage</h3>
        <span class="zt-card-meta">Current snapshot</span>
      </div>
      <canvas id="resourceUsageChart" class="zt-chart"></canvas>
    </div>
  `;
};
