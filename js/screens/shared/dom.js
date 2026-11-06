// Tiny DOM builder. Text is always set as text (never innerHTML), so data can't inject markup.
// h('div', { class: 'card', onclick: fn }, 'text', childNode, [moreChildren], null)

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

/** Empties `el` and returns it. Note: Element.append() does NOT flatten arrays or skip null; spread arrays. */
export function clear(el) {
  el.replaceChildren();
  return el;
}
