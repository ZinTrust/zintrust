export function renderSlaScorecard(container, payload) {
  if (!container) return;
  const status = payload?.status || 'unknown';
  const score = payload?.score ?? '-';
  container.innerHTML = `
    <div class="ui-sla-card sla-${status}">
      <div class="ui-sla-score">${score}</div>
      <div class="ui-sla-status">${String(status).toUpperCase()}</div>
    </div>
  `;
}
