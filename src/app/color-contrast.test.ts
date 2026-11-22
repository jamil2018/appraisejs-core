import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const stylesheet = readFileSync(new URL('./globals.css', import.meta.url), 'utf8')
const tokens = new Map(
  Array.from(stylesheet.matchAll(/--([\w-]+)-rgb: (\d+ \d+ \d+);/g), match => [
    match[1],
    match[2].split(' ').map(Number),
  ]).reverse(),
)

function color(name: string) {
  const channels = tokens.get(name)
  if (!channels) throw new Error(`Missing color token ${name}`)
  return channels
}

function luminance(rgb: number[]) {
  const [red, green, blue] = rgb.map(channel => {
    const srgb = channel / 255
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

function contrast(first: number[], second: number[]) {
  const firstLuminance = luminance(first)
  const secondLuminance = luminance(second)
  return (Math.max(firstLuminance, secondLuminance) + 0.05) / (Math.min(firstLuminance, secondLuminance) + 0.05)
}

describe('graphite palette contrast', () => {
  const neutralSurfaces = ['background', 'card', 'popover', 'field', 'secondary', 'muted', 'accent']

  it.each(neutralSurfaces)('keeps small supporting text readable on %s', surface => {
    expect(contrast(color('muted-foreground'), color(surface))).toBeGreaterThanOrEqual(4.5)
  })

  it.each(['success', 'warning', 'danger', 'info', 'selection'])(
    'keeps %s text and boundaries readable on the tinted surface',
    tone => {
      const surface = color(`${tone}-surface`)
      const border = color(`${tone}-border`)
      expect(contrast(color(tone), surface)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(border, surface)).toBeGreaterThanOrEqual(3)
      expect(contrast(border, color('popover'))).toBeGreaterThanOrEqual(3)
    },
  )

  it.each([...neutralSurfaces, 'selection-surface'])('shows the keyboard focus outline on %s', surface => {
    expect(contrast(color('ring'), color(surface))).toBeGreaterThanOrEqual(3)
  })

  it.each(['field', 'background', 'card', 'popover', 'secondary'])('shows field boundaries beside %s', surface => {
    expect(contrast(color('input'), color(surface))).toBeGreaterThanOrEqual(3)
  })

  it('keeps text legible in the primary action and in glass over a white backdrop', () => {
    const glassOpacity = Number(stylesheet.match(/background-color: rgb\(var\(--popover-rgb\) \/ ([\d.]+)\)/)?.[1])
    const glassOverWhite = color('popover').map(channel => channel * glassOpacity + 255 * (1 - glassOpacity))

    expect(contrast(color('primary-foreground'), color('primary'))).toBeGreaterThanOrEqual(4.5)
    expect(contrast(color('muted-foreground'), glassOverWhite)).toBeGreaterThanOrEqual(4.5)
  })
})
