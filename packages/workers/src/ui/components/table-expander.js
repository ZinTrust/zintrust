/* eslint-disable no-restricted-syntax */
/* eslint-disable no-undef */
/* eslint-disable @typescript-eslint/explicit-function-return-type */

function removeDetail(detailsEl) {
  if (detailsEl) detailsEl.remove();
}

function renderRow(rowEl, detailHtml) {
  const details = document.createElement('tr');
  details.className = 'ui-detail-row';
  const td = document.createElement('td');
  td.colSpan = rowEl.children.length;
  td.innerHTML = detailHtml || '';
  details.appendChild(td);
  rowEl.after(details);
  return details;
}

export function createTableExpander(container) {
  if (!container) throw new Error('container required');

  function toggle(rowEl, loader) {
    const next = rowEl.nextElementSibling;
    if (next && next.classList.contains('ui-detail-row')) {
      removeDetail(next);
      return null;
    }
    const placeholder = renderRow(rowEl, loader || '<div class="ui-loading">Loading...</div>');
    return placeholder;
  }

  return Object.freeze({ toggle, renderRow, removeDetail });
}
