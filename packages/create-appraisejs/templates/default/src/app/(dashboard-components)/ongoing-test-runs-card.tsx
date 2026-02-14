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
  const router = useRouter()
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
    <Card className="h-fit border-gray-600/10 bg-gray-600/10 min-w-40">
      <CardHeader className="flex items-center justify-between flex-row p-2">
        <CardTitle className={`text-xs font-normal ${count > 0 ? 'text-primary' : 'text-gray-400'}`}>
          Ongoing Test Runs
        </CardTitle>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="text-primary hover:text-primary/80 px-2 py-1 bg-inherit border-gray-600/15 hover:bg-emerald-400/10"
            disabled={count === 0}
            onClick={() => router.push(link)}
            size="sm"
          >
            <ExternalLink className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="h-full px-2 py-1">
        <div className={`text-2xl h-full flex items-center font-bold ${count > 0 ? 'text-primary' : 'text-gray-400'}`}>
          {count}
        </div>
      </CardContent>
    </Card>
  )
}
