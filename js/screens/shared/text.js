// Small text helpers for editor forms.

/** Non-empty trimmed lines of a textarea value. */
export const lines = (s) => String(s || '').split('\n').map((x) => x.trim()).filter(Boolean);
