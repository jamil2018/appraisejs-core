'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardTitle, CardHeader } from '@/components/ui/card'
import { ExternalLink } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useRef } from 'react'
import { getRunningTestRunsCountAction } from '@/actions/dashboard/dashboard-actions'

interface OngoingTestRunsCardProps {
  initialCount: number
  link: string
}

export default function OngoingTestRunsCard({ initialCount, link }: OngoingTestRunsCardProps) {
  const { push } = useRouter()
  const [count, setCount] = useState(initialCount)
  const pollingRef = useRef<NodeJS.Timeout | null>(null)

  // Poll for count updates while there are ongoing test runs
  useEffect(() => {
    // Clear any existing polling interval
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }

    // If no ongoing test runs, don't poll
    if (count === 0) {
      return
    }

    pollingRef.current = setInterval(async () => {
      try {
        const { data, error } = await getRunningTestRunsCountAction()
        if (error) {
          console.error('Error polling running test runs count:', error)
          return
        }

        const newCount = data as number
        setCount(newCount)

        // If count reaches 0, stop polling
        if (newCount === 0 && pollingRef.current) {
          clearInterval(pollingRef.current)
          pollingRef.current = null
        }
      } catch (error) {
        console.error('Error polling running test runs count:', error)
      }
    }, 2000) // Poll every 2 seconds

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
        pollingRef.current = null
      }
    }
  }, [count])

  return (
    <Card className="h-fit min-w-40 border-zinc-600/10 bg-zinc-600/10">
      <CardHeader className="flex flex-row items-center justify-between p-2">
        <CardTitle className={`text-xs font-normal ${count > 0 ? 'text-primary' : 'text-zinc-400'}`}>
          Ongoing Test Runs
        </CardTitle>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="hover:text-primary/80 border-zinc-600/15 bg-inherit px-2 py-1 text-primary hover:bg-emerald-400/10"
            disabled={count === 0}
            onClick={() => push(link)}
            size="sm"
          >
            <ExternalLink className="size-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="h-full px-2 py-1">
        <div className={`flex h-full items-center text-2xl font-bold ${count > 0 ? 'text-primary' : 'text-zinc-400'}`}>
          {count}
        </div>
      </CardContent>
    </Card>
  )
}
