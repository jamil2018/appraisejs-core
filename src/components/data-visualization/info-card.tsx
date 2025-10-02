import React from 'react'
import { Card, CardContent } from '../ui/card'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip'

const InfoCard = ({
  showHighlightGroup,
  highlight,
  legend,
  defaultText,
}: {
  showHighlightGroup: boolean
  highlight: string
  legend: string
  defaultText: string
}) => {
  // Dynamic text size based on highlight text length
  const getHighlightTextSize = (text: string) => {
    const length = text.length
    if (length <= 3) return 'text-4xl'
    if (length <= 6) return 'text-3xl'
    if (length <= 10) return 'text-2xl'
    if (length <= 15) return 'text-xl'
    return 'text-sm'
  }

  return (
    <>
      <Card className="flex w-fit max-w-[20rem] items-center">
        <CardContent className="p-2">
          <div className="flex items-center">
            {showHighlightGroup ? (
              <>
                <div
                  className={`mr-2 h-full items-center font-mono text-primary ${getHighlightTextSize(highlight)} ${
                    highlight.length > 15 ? 'w-[6rem] overflow-hidden text-ellipsis whitespace-nowrap' : ''
                  }`}
                >
                  {highlight.length > 15 ? (
                    <>
                      <TooltipProvider>
                        <Tooltip delayDuration={200}>
                          <TooltipTrigger asChild>
                            <span>{highlight}</span>
                          </TooltipTrigger>
                          <TooltipContent>{highlight}</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </>
                  ) : (
                    highlight
                  )}
                </div>
                <div className="flex h-full items-center text-sm text-muted-foreground">{legend}</div>
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
