export const renderAlertPanel = (): string => {
  return `
    <div class="zt-card">
      <div class="zt-card-header">
        <h3 class="zt-card-title">Alert History</h3>
        <span class="zt-card-meta">Latest events</span>
      </div>
      <ul id="alertList" class="zt-alert-list">
        <li class="zt-alert-item">No alerts yet.</li>
      </ul>
    </div>
  `;
};
