// Runs in the page's MAIN world to use its existing jQuery UI search method.
// The extension's isolated world cannot access window.jQuery directly.
(() => {
  if (location.origin !== 'https://eticket.railway.gov.bd' || window.__railwayAutocompleteBridge) return;
  window.__railwayAutocompleteBridge = true;
  document.addEventListener('railway-assistant:station-search', event => {
    const {id, value} = event.detail || {};
    if (!['dest_from', 'dest_to'].includes(id) || typeof value !== 'string' || value.length > 40) return;
    const input = document.getElementById(id);
    const jq = window.jQuery;
    if (!input || input.readOnly || input.disabled || input.value !== value || !jq?.fn?.autocomplete) return;
    // Native focus may not fire again when a popup owns focus or the field was
    // already focused. The site's focus listener initializes its station source.
    input.dispatchEvent(new FocusEvent('focus'));
    try { jq(input).autocomplete('search', value); } catch { /* UI reports timeout. */ }
  });
})();
