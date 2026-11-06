// Human-readable text for a log entry (debrief timeline + CSV). Display only.

const VERB = { given: 'Gave', held: 'Held', 'not-given': 'Did not give' };

export function describeEntry(l, { labelOf, orderText, patientName }) {
  const d = l.details || {};
  const fields = (f) => Object.entries(f || {}).filter(([, v]) => v !== '' && v != null).map(([k, v]) => `${k} ${v}`).join(', ');
  switch (l.action) {
    case 'event-fired': return `Event: ${d.type}${d.source && d.source !== 'scheduled' ? ` (${d.source.replace(/:.*/, '')})` : ''} · ${d.eventId}`;
    case 'intervention': return `${labelOf(d.interventionId)}${d.delegatedTo ? ` → delegated to ${d.delegatedTo}` : ''}${d.orderId ? ` · for "${orderText(l.patientId, d.orderId)}"` : ''}${fields(d.fields) ? ` · ${fields(d.fields)}` : ''}`;
    case 'delegation-completed': return `${d.to} reported: ${labelOf(d.interventionId)} done${d.values ? ` · ${fields(d.values)}` : ''}`;
    case 'med': return `${VERB[d.result] || d.result} ${d.med}${d.reason ? ` (${d.reason})` : ''}${d.warnings?.length ? ` · overrode: ${d.warnings.join(', ')}` : ''}`;
    case 'reaction-fired': return `Script: ${d.label || d.reactionId || 'reaction'}${d.forced ? ' (instructor fired it)' : ''}`;
    case 'script-state': return `Patient state: ${d.from ?? '—'} → ${d.label || d.to || '?'}${d.cause?.kind ? ` (${d.cause.kind === 'timeout' ? 'nothing done in time' : d.cause.kind})` : ''}`;
    case 'script-vitals-skipped': return 'Scripted vitals skipped (instructor has control of vitals)';
    case 'script-loop-stopped': return `Script loop stopped (more than ${d.limit ?? '?'} reactions at one moment)`;
    case 'script-paused': return 'Instructor paused scripting for this patient';
    case 'script-resumed': return 'Instructor resumed scripting for this patient';
    case 'reaction-disabled': return `Instructor disabled reaction ${d.reactionId ?? ''}`.trim();
    case 'reaction-enabled': return `Instructor re-enabled reaction ${d.reactionId ?? ''}`.trim();
    case 'reaction-skipped': return `Instructor skipped countdown ${d.reactionId ?? ''}`.trim();
    case 'call-light-answered': return `Answered call light after ${d.responseMin} min`;
    case 'order-acknowledged': return `Acknowledged "${orderText(l.patientId, d.orderId)}"`;
    case 'order-done': return `Marked done: "${orderText(l.patientId, d.orderId)}"`;
    case 'handoff-opened': return 'Opened handoff report';
    case 'handoff-closed': return `Closed handoff report (${d.durationMin} min)`;
    case 'handoff-notes': return 'Saved handoff notes';
    case 'patient-opened': return `Opened chart: ${patientName(l.patientId)}`;
    case 'note': return `Note: ${d.text}`;
    case 'escalated': return 'Escalated';
    case 'flowsheet-entry': return `Flowsheet: ${fields(d.values)}`;
    case 'monitor-set': return d.intervalMin ? `Monitor cycle q${d.intervalMin} min` : 'Monitor cycle off';
    case 'nibp-now': return `Took BP now · ${fields(d.values)}`;
    case 'lab-resulted': return `Lab resulted: ${d.code}`;
    case 'lab-released': return `Instructor released lab: ${d.code}${d.value != null ? ` = ${d.value}` : ''}`;
    case 'vitals-adjusted': {
      const ch = Object.entries(d.to || {}).map(([k, v]) => `${k} ${d.from?.[k] ?? '—'} → ${v}`).join(', ');
      return `Instructor adjusted vitals: ${ch}${d.overMin ? ` (over ${d.overMin} min)` : ''}${d.presetId ? ` [${d.presetId}]` : ''}`;
    }
    case 'entered-in-error': return `Marked an entry as entered in error (${d.reason})`;
    case 'reflection-submitted': return 'Submitted reflection';
    case 'alarm-acknowledged': return `Silenced monitor alarm (${(d.alarms || []).join(', ')}) after ${d.responseMin} min`;
    case 'monitor-alarm': return d.active?.length ? `Monitor alarm: ${d.active.join(', ')}` : 'Monitor alarm cleared';
    case 'admission-assigned': return `Charge nurse assigned the admission to ${d.groupId ?? 'a group'}${d.waitMin != null ? ` (waited ${d.waitMin} min)` : ''}`;
    case 'admission-held': return `Charge nurse held the admission${d.reason ? ` (${d.reason})` : ''}`;
    case 'order-pushed': return `Provider (instructor) ordered: ${d.text ?? 'new order'}${d.tier ? ` · tier ${d.tier}` : ''}`;
    case 'code-started': return `Instructor started a code${d.rhythm ? ` (${d.rhythm})` : ''}`;
    case 'code-outcome': return `Code ended: ${d.outcome === 'rosc' ? 'ROSC' : 'no ROSC'}${d.durationMin != null ? ` after ${d.durationMin} min` : ''}`;
    case 'monitor-connected': return `Connected ${patientName(l.patientId)} to the monitor`;
    case 'priority-assigned': return `Set priority: ${d.levelId ?? ''}`;
    case 'clock-end': return d.reason === 'end-of-shift' ? 'End of shift' : 'Sim ended';
    case 'left-unattended': return `Instructor: left unattended${d.note ? ` (${d.note})` : ''}`;
    case 'clock-skip': return `Clock skipped ${d.fromMin} → ${d.toMin} min`;
    default: return l.action.replace(/-/g, ' ') + (d.reason ? ` (${d.reason})` : '');
  }
}
