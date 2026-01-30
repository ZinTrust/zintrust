export const renderCostTracking = (): string => {
  return `
    <div class="zt-card">
      <div class="zt-card-header">
        <h3 class="zt-card-title">Cost Tracking</h3>
        <span class="zt-card-meta">Daily estimate</span>
      </div>
      <div class="zt-card-body">
        <p class="zt-cost-value" id="costTotal">$0.00</p>
        <p class="zt-card-meta">Auto-updated from resource metrics</p>
      </div>
    </div>
  `;
};
