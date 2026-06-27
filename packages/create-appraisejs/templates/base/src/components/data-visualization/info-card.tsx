import React from 'react'
import { Card, CardContent } from '../ui/card'

const InfoCard = ({
  showHighlightGroup,
  highlight,
  legend,
  defaultText,
  icon,
}: {
  showHighlightGroup: boolean
  highlight: string
  legend: string
  defaultText: string
  icon: React.ReactNode
}) => {
  // Dynamic text size based on highlight text length
  const getHighlightTextSize = (text: string) => {
    const length = text.length
    if (length <= 3) return 'text-2xl'
    if (length <= 6) return 'text-xl'
    if (length <= 10) return 'text-lg'
    if (length <= 15) return 'text-base'
    return 'text-sm'
  }

  return (
    <>
      <Card className="flex min-w-40 max-w-80 items-center bg-inherit">
        <CardContent className="min-w-0 p-2">
          <div className="flex min-w-0 items-center gap-4 text-primary">
            {showHighlightGroup ? (
              <>
                <div className="shrink-0">{icon}</div>
                <div className="flex h-full min-w-0 flex-col">
                  <div className="flex h-full items-center text-xs text-muted-foreground">{legend}</div>
                  <div
                    className={`h-full min-w-0 items-center break-words font-mono text-primary ${getHighlightTextSize(
                      highlight,
                    )}`}
                  >
                    {highlight}
                  </div>
                </div>
              </>
            ) : (
              <div className="flex items-center text-xs text-muted-foreground">{defaultText}</div>
            )}
          </div>
        </CardContent>
      </Card>
    </>
  )
}

export default InfoCard
