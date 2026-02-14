'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Download, LoaderCircle } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
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

      // Get the filename from Content-Disposition header or use a default
      const contentDisposition = response.headers.get('Content-Disposition')
      let filename = `test-run-${testRunId}.zip`
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="?(.+?)"?$/)
        if (filenameMatch) {
          filename = filenameMatch[1]
        }
      }

      // Create a blob from the response
      const blob = await response.blob()
      
      // Create a download link and trigger it
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
        description: 'Logs and traces are being downloaded',
      })
    } catch (error) {
      console.error('[DownloadLogsButton] Error downloading logs:', error)
      toast({
        title: 'Download failed',
        description: error instanceof Error ? error.message : 'Failed to download logs and traces',
        variant: 'destructive',
      })
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <Button
      onClick={handleDownload}
      disabled={isDownloading}
      variant="outline"
      size="sm"
      className={className}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={isDownloading ? 'downloading' : 'idle'}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.15 }}
          className="flex items-center gap-2"
        >
          {isDownloading ? (
            <>
              <LoaderCircle className="h-4 w-4 animate-spin" />
              Downloading...
            </>
          ) : (
            <>
              <Download className="h-4 w-4" />
              Download Logs & Traces
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </Button>
  )
}

