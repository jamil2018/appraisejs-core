/** Presentation-only observations from durable Appraise records. */
export const journeyRuntimeStatusCopy = {
  QUEUED: 'Queued · Appraise is waiting for a confirmed start.',
  RUNNING: 'Running · Appraise observed a runtime acknowledgement.',
  WAITING: 'Waiting · Review the current task for required input or a decision.',
  BLOCKED: 'Blocked · Appraise cannot continue this work. Check what needs attention.',
  RECOVERY: 'Recovery required · Review the journey controls and recorded blockers before continuing.',
  UNOBSERVED: 'Runtime activity has not been observed for this task.',
} as const

export type JourneyRuntimeStatus = keyof typeof journeyRuntimeStatusCopy
