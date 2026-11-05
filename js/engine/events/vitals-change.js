// vitals-change: applies the keyframe whose eventId === payload.keyframe to the patient's current vitals.

export default {
  type: 'vitals-change',
  apply(draft, event, { patientId, template }) {
    const kf = template.vitals.keyframes?.find((k) => k.eventId === event.payload.keyframe);
    if (!kf) {
      console.warn(`vitals-change ${event.id}: no keyframe "${event.payload.keyframe}"`);
      return;
    }
    Object.assign(draft.patients[patientId].vitals, kf.values);
  },
  describe: (event) => `Vitals change (${event.payload.keyframe})`,
};
