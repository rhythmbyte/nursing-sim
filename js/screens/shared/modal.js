// Modal dialog on top of <dialog>. Returns { el, close }.
// actions: [{ label, kind?: 'primary'|'danger'|'ghost', onClick?(close) }]. onClick returning false keeps it open.
// dismissable=false blocks Esc (for steps that must be finished on purpose, like closing a handoff).

import { textDraft } from './drafts.js';
import { h } from './dom.js';

export function openModal({ title, body, actions = [], onClose = null, dismissable = true, wide = false }) {
  let closed = false;
  const dialog = h('dialog', { class: `modal${wide ? ' modal-wide' : ''}`, 'aria-label': title });

  function close() {
    if (closed) return;
    closed = true;
    dialog.close();
    dialog.remove();
    if (onClose) onClose();
  }

  dialog.addEventListener('cancel', (e) => {
    if (!dismissable) e.preventDefault();
    else { e.preventDefault(); close(); }
  });

  dialog.append(
    h('header', { class: 'modal-header' }, h('h2', {}, title)),
    h('div', { class: 'modal-body' }, body),
    actions.length ? h('footer', { class: 'modal-actions' }, actions.map((a) => h('button', {
      class: `btn${a.kind ? ` btn-${a.kind}` : ''}`,
      onclick: () => { if (!a.onClick || a.onClick(close) !== false) close(); },
    }, a.label))) : null,
  );
  document.body.append(dialog);
  dialog.showModal();
  return { el: dialog, close };
}

/** Promise-based confirm with a list of warnings. Resolves true (proceed) or false. */
export function confirmWarnings(title, intro, warnings, proceedLabel = 'Proceed anyway') {
  return new Promise((resolve) => {
    let answer = false;
    openModal({
      title,
      body: h('div', {}, h('p', {}, intro), h('ul', { class: 'warning-list' }, warnings.map((w) => h('li', {}, w)))),
      actions: [
        { label: 'Cancel', kind: 'ghost' },
        { label: proceedLabel, kind: 'danger', onClick: () => { answer = true; } },
      ],
      onClose: () => resolve(answer),
    });
  });
}

/** Promise-based single text prompt. Resolves the text, or null if cancelled. */
export function promptText(title, label, { required = true, okLabel = 'Save', draftKey = null, value = '' } = {}) {
  return new Promise((resolve) => {
    let answer = null;
    const input = h('input', { type: 'text', class: 'input', 'aria-label': label, value });
    const draft = draftKey ? textDraft(input, draftKey) : null;
    const err = h('p', { class: 'form-error', hidden: true }, 'Required.');
    openModal({
      title,
      body: h('label', { class: 'field' }, h('span', {}, label), input, err),
      actions: [
        { label: 'Cancel', kind: 'ghost' },
        {
          label: okLabel, kind: 'primary', onClick: () => {
            if (required && !input.value.trim()) { err.hidden = false; return false; }
            answer = input.value.trim();
            draft?.clear();
            return true;
          },
        },
      ],
      onClose: () => resolve(answer),
    });
    input.focus();
  });
}
