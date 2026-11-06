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
    case 'left-unattended': return `Instructor: left unattended${d.note ? ` (${d.note})` : ''}`;
    case 'clock-skip': return `Clock skipped ${d.fromMin} → ${d.toMin} min`;
    default: return l.action.replace(/-/g, ' ') + (d.reason ? ` (${d.reason})` : '');
  }
}
