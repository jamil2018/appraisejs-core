'use client'

import { useEffect, useRef, useState } from 'react'
import CodeMirror, { EditorView } from '@uiw/react-codemirror'
import { langs } from '@uiw/codemirror-extensions-langs'
import { githubDark } from '@uiw/codemirror-theme-github'
import { Eye, EyeOff } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

type TestScenarioPreviewProps = {
  title: string
  description?: string
  scenario: string
}

export function TestScenarioPreview({ title, description, scenario }: TestScenarioPreviewProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const onPointerDown = (e: PointerEvent) => {
      const el = containerRef.current
      if (el && !el.contains(e.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  return (
    <div ref={containerRef} className="relative min-h-0 xl:min-h-[1px]">
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              className={cn('fixed bottom-6 right-6 z-50 size-12 rounded-full shadow-lg')}
              type="button"
              variant="default"
              size="icon"
              aria-expanded={open}
              aria-label={open ? 'Hide test scenario preview' : 'Show test scenario preview'}
              onClick={() => setOpen(v => !v)}
            >
              {open ? <EyeOff /> : <Eye />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={8}>
            {open ? 'Close Scenario Preview' : 'Open Scenario Preview'}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {open ? (
        <Card
          className={cn(
            'fixed bottom-20 right-6 z-50 max-h-[min(420px,70vh)] w-[min(28rem,calc(100vw-3rem))]',
            'border-border/60 bg-background/70 shadow-xl shadow-black/25',
            'backdrop-blur-3xl backdrop-saturate-150',
            'flex min-h-0 flex-col overflow-hidden',
          )}
        >
          <CardHeader className="shrink-0">
            <CardTitle className="text-xl font-bold text-primary">{title}</CardTitle>
            {description ? <CardDescription>{description}</CardDescription> : null}
          </CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-auto">
            <CodeMirror
              editable={false}
              value={scenario}
              onChange={() => {}}
              height="200px"
              extensions={[langs.feature(), EditorView.lineWrapping]}
              theme={githubDark}
            />
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
