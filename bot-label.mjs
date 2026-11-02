/* Bot nameplate selection + compact/open helpers.
   Interaction state only — Visual/UI own the look via .lb-compact / .lb-open.
   API (also on window.__office): selectBot(b|null), getSelected(), onSelection(fn).
*/
export function shortName(name, max = 6) {
  const chars = [...String(name ?? '')];
  if (chars.length <= max) return chars.join('');
  return chars.slice(0, Math.max(1, max - 1)).join('') + '…';
}

export function createBotLabelSelection({ bots = () => [], findBot, onChange } = {}) {
  let selected = null; // bot object | null
  const listeners = new Set();
  if (typeof onChange === 'function') listeners.add(onChange);

  function list() {
    try { return typeof bots === 'function' ? (bots() || []) : (bots || []); }
    catch { return []; }
  }

  function resolve(b) {
    if (b == null || b === false) return null;
    if (typeof b === 'object' && b.name != null) return b;
    if (typeof findBot === 'function') return findBot(b) || null;
    const n = String(b);
    return list().find(x => x && x.name === n) || null;
  }

  function syncFlags(next) {
    for (const bot of list()) {
      if (!bot) continue;
      bot._selected = !!(next && bot === next);
    }
  }

  function emit(next, prev) {
    for (const fn of [...listeners]) {
      try { fn(next, prev); } catch (e) { console.warn('[bot-label] onSelection', e); }
    }
  }

  /** selectBot(b|null) — null clears / collapses. Same bot re-select is a no-op. */
  function selectBot(b) {
    const next = resolve(b);
    const prev = selected;
    if (next === prev) {
      syncFlags(next);
      return next;
    }
    selected = next;
    syncFlags(next);
    emit(next, prev);
    return next;
  }

  function getSelected() { return selected; }

  function getSelectedName() { return selected ? selected.name : null; }

  function onSelection(fn) {
    if (typeof fn !== 'function') return () => {};
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  return {
    selectBot,
    getSelected,
    getSelectedName,
    onSelection,
    shortName,
    get selectedName() { return selected ? selected.name : null; },
  };
}
