'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Download, LoaderCircle } from 'lucide-react'
import { toast } from '@/hooks/use-toast'

interface DownloadLogsButtonProps {
  testRunId: string
  className?: string
}

export function DownloadLogsButton({ testRunId, className }: DownloadLogsButtonProps) {
  const [isDownloading, setIsDownloading] = useState(false)

  const handleDownload = async () => {
    setIsDownloading(true)
    try {
      const response = await fetch(`/api/test-runs/${testRunId}/download`)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(errorData.error || `Failed to download: ${response.statusText}`)
      }

      const contentDisposition = response.headers.get('Content-Disposition')
      let filename = `test-run-${testRunId}.zip`
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="?(.+?)"?$/)
        if (filenameMatch) {
          filename = filenameMatch[1]
        }
      }

      const blob = await response.blob()

      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)

      toast({
        title: 'Download started',
        description: 'Run artifacts are being downloaded',
      })
    } catch (error) {
      console.error('[DownloadLogsButton] Error downloading logs:', error)
      toast({
        title: 'Download failed',
        description: error instanceof Error ? error.message : 'Failed to download run artifacts',
        variant: 'destructive',
      })
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <Button onClick={handleDownload} disabled={isDownloading} variant="outline" size="sm" className={className}>
      <span className="flex items-center gap-2">
        {isDownloading ? (
          <>
            <LoaderCircle className="size-4 animate-spin" />
            Downloading…
          </>
        ) : (
          <>
            <Download className="size-4" />
            Download Run Artifacts
          </>
        )}
      </span>
    </Button>
  )
}
