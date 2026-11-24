'use client'

import { Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useSyncExternalStore } from 'react'

import { Button } from '@/components/ui/button'

const appearances = [
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'light', label: 'Light', Icon: Sun },
] as const

const subscribe = () => () => undefined
const clientMounted = () => true
const serverMounted = () => false

export function AppearanceSettings() {
  const { theme, setTheme } = useTheme()
  const mounted = useSyncExternalStore(subscribe, clientMounted, serverMounted)

  return (
    <div aria-label="Theme" className="flex flex-wrap items-center gap-2" role="group">
      {appearances.map(({ value, label, Icon }) => (
        <Button
          aria-pressed={mounted && (theme ?? 'dark') === value}
          key={value}
          onClick={() => setTheme(value)}
          size="sm"
          type="button"
          variant="outline"
          className="rounded-xl aria-pressed:border-selection-border aria-pressed:bg-selection-surface aria-pressed:text-selection"
        >
          <Icon aria-hidden="true" /> {label}
        </Button>
      ))}
    </div>
  )
}
