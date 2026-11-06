// Monitor alarm episodes, acknowledgement (silence) and the alarm tick processor. Pure, no DOM.
// Separate from monitor.js so session.js can list the processor without an import cycle at load time.
import { simMinOf } from './session.js';
import { append } from './log.js';
import { monitorView } from './monitor.js';

const key = (alarms) => [...alarms].sort().join(',');

/**
 * Tick processor: tracks alarm episodes per patient (what the monitor would alarm on). An episode starts
 * when alarms appear and ends when none remain; changes in between continue it. Logged as monitor-alarm.
 */
export const alarmProcessor = {
  due(state, upto, { templatesById, catalogs } = {}) {
    if (!templatesById) return false;
    return Object.entries(state.patients).some(([pid, ps]) => ps.present && templatesById[pid]
      && key(monitorView(state, pid, templatesById[pid], catalogs).alarms) !== key(ps.alarm?.active || []));
  },
  apply(draft, upto, { templatesById, catalogs, now }) {
    for (const [pid, ps] of Object.entries(draft.patients)) {
      if (!ps.present || !templatesById[pid]) continue;
      const active = monitorView(draft, pid, templatesById[pid], catalogs).alarms;
      const before = ps.alarm?.active || [];
      if (key(active) === key(before)) continue;
      if (!active.length) ps.alarm = { active: [], since: null, clearedAt: upto };
      else if (!before.length) ps.alarm = { active, since: upto, ackAt: null, silencedUntil: null };
      else ps.alarm = { ...ps.alarm, active };
      append(draft, { simMin: upto, wallTime: now, userId: 'system', role: 'system', patientId: pid, action: 'monitor-alarm', details: { active, previous: before } });
    }
  },
};

/** Student acknowledges (silences) the monitor alarm: logs the response time; silences the sound for data alarmSilenceMin. */
export function acknowledgeAlarm(state, patientId, _args, { now, user, catalogs }) {
  const a = state.patients[patientId].alarm;
  if (!a?.active?.length) return state;
  const silence = catalogs?.vitals?.alarmSilenceMin;
  if (silence == null) throw new Error('Set alarmSilenceMin in data/catalogs/vitals.json');
  const draft = structuredClone(state);
  const simMin = simMinOf(state, now);
  const al = draft.patients[patientId].alarm;
  const first = al.ackAt == null;
  Object.assign(al, { ackAt: first ? simMin : al.ackAt, silencedUntil: simMin + silence });
  append(draft, { simMin, wallTime: now, ...user, patientId, action: 'alarm-acknowledged', details: { alarms: al.active, responseMin: Math.round((simMin - al.since) * 100) / 100, first } });
  return draft;
}

/** Alarm episodes from the log for a patient: [{ start, end, ack, ackBy, alarms }]. Used by the rule and the debrief. */
export function alarmEpisodes(log, pid) {
  const eps = [];
  let cur = null;
  for (const l of log) {
    if (l.patientId !== pid) continue;
    if (l.action === 'monitor-alarm') {
      if (!l.details.previous.length && l.details.active.length) { cur = { start: l.simMin, end: null, ack: null, ackBy: null, alarms: l.details.active }; eps.push(cur); }
      else if (cur && !l.details.active.length) { cur.end = l.simMin; cur = null; }
      else if (cur) cur.alarms = [...new Set([...cur.alarms, ...l.details.active])];
    } else if (l.action === 'alarm-acknowledged' && cur && cur.ack == null) { cur.ack = l.simMin; cur.ackBy = l.userId; }
  }
  return eps;
}
