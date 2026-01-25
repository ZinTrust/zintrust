export function createTableExpander(container) {
  if (!container) throw new Error('container required');

  function renderRow(rowEl, detailHtml) {
    const details = document.createElement('tr');
    details.className = 'ui-detail-row';
    const td = document.createElement('td');
    td.colSpan = rowEl.children.length;
    td.innerHTML = detailHtml || '';
    details.appendChild(td);
    rowEl.insertAdjacentElement('afterend', details);
    return details;
  }

  function removeDetail(detailsEl) {
    if (detailsEl && detailsEl.parentNode) detailsEl.parentNode.removeChild(detailsEl);
  }

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
