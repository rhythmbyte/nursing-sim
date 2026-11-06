// Student reflection after the sim ends (questions are data: data/catalogs/reflection.json). Pure.
import { simMinOf } from './session.js';
import { append } from './log.js';

/** Saves a student's answers once the sim has ended. answers: { questionId: text }. */
export function submitReflection(state, { userId, answers }, { now, user, catalogs }) {
  if (state.clock.status !== 'ended') throw new Error('Reflection opens when the sim ends');
  if (state.reflections?.[userId]) return state;
  const ids = new Set((catalogs?.reflection?.questions || []).map((q) => q.id));
  const clean = Object.fromEntries(Object.entries(answers || {}).filter(([k, v]) => ids.has(k) && String(v).trim()).map(([k, v]) => [k, String(v).trim()]));
  if (!Object.keys(clean).length) throw new Error('Answer at least one question');
  const draft = structuredClone(state);
  const simMin = simMinOf(state, now);
  draft.reflections[userId] = { atMin: simMin, answers: clean };
  append(draft, { simMin, wallTime: now, ...user, action: 'reflection-submitted', details: { answers: clean } });
  return draft;
}
