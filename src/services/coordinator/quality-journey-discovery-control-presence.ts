import { z } from 'zod'

const presenceSchema = z
  .object({ emailInput: z.boolean(), passwordInput: z.boolean(), submitControl: z.boolean(), heading: z.boolean() })
  .strict()
export type DiscoveryControlPresence = z.infer<typeof presenceSchema>
export type DiscoveryControlPresenceSnapshot = Readonly<{
  documentIdentity: string
  presence: DiscoveryControlPresence
}>

/** Static isolated-world program. It returns only four booleans, scans at most 512 elements, and never reads
 * values, names, labels, titles, text, markup, locations, storage or credentials. No caller supplies code/selectors.
 */
export const discoveryControlPresenceExpression = `(() => {
  const presence = { emailInput: false, passwordInput: false, submitControl: false, heading: false };
  if (!document.documentElement) return presence;
  const walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_ELEMENT);
  let element = walker.currentNode;
  for (let visited = 0; element && visited < 512; visited++, element = walker.nextNode()) {
    if (!element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true, contentVisibilityAuto: true })) continue;
    if (element.matches('input[type="email"]')) presence.emailInput = true;
    if (element.matches('input[type="password"]')) presence.passwordInput = true;
    if (element.matches('button:not([type]),button[type="submit"],input[type="submit"]')) presence.submitControl = true;
    if (element.matches('h1,h2,h3,h4,h5,h6')) presence.heading = true;
  }
  return presence;
})()`

export function parseDiscoveryControlPresence(value: unknown): DiscoveryControlPresence {
  return presenceSchema.parse(value)
}

export function discoveryControlPresenceFacts(presence: DiscoveryControlPresence): string[] {
  const parsed = presenceSchema.parse(presence)
  return [
    ...(parsed.emailInput ? ['Appraise observed a visible email input in the captured target document.'] : []),
    ...(parsed.passwordInput ? ['Appraise observed a visible password input in the captured target document.'] : []),
    ...(parsed.submitControl ? ['Appraise observed a visible submit control in the captured target document.'] : []),
    ...(parsed.heading ? ['Appraise observed a visible heading in the captured target document.'] : []),
  ]
}
