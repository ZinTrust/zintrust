export const renderWorkerHealthChart = (): string => {
  return `
    <div class="zt-card">
      <div class="zt-card-header">
        <h3 class="zt-card-title">Worker Health</h3>
        <span class="zt-card-meta">Last 24h</span>
      </div>
      <canvas id="workerHealthChart" class="zt-chart"></canvas>
    </div>
  `;
};
