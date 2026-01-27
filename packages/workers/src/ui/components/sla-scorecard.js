/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* global document */

export function renderSlaScorecard(container, payload) {
  if (!container) return;
  const status = payload?.status || 'unknown';
  const score = payload?.score ?? '-';

  // Clear existing content safely
  while (container.firstChild) {
    container.firstChild.remove();
  }

  // Create main card element
  const card = document.createElement('div');
  card.className = `ui-sla-card sla-${status}`;

  // Create score element
  const scoreEl = document.createElement('div');
  scoreEl.className = 'ui-sla-score';
  scoreEl.textContent = score; // Safe: textContent doesn't execute HTML

  // Create status element
  const statusEl = document.createElement('div');
  statusEl.className = 'ui-sla-status';
  statusEl.textContent = String(status).toUpperCase(); // Safe: textContent

  // Assemble the card
  card.appendChild(scoreEl);
  card.appendChild(statusEl);
  container.appendChild(card);
}
