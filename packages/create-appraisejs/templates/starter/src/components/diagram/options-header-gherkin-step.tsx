'use client'

import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { StepParameterType } from '@prisma/client'

type OptionsHeaderGherkinParameter = {
  name: string
  value: string
  type?: StepParameterType
  order: number
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function OptionsHeaderGherkinStep({
  gherkinStep,
  parameters,
}: {
  gherkinStep: string
  parameters: OptionsHeaderGherkinParameter[]
}) {
  const sortedParameters = parameters.toSorted((left, right) => left.order - right.order)
  const nonEmptyParameters = sortedParameters.filter(parameter => parameter.value.trim().length > 0)

  if (!nonEmptyParameters.length) {
    return <>{gherkinStep}</>
  }

  const allTokens = nonEmptyParameters
    .map(parameter => parameter.value)
    .sort((left, right) => right.length - left.length)
    .map(escapeRegExp)

  const tokenRegex = new RegExp(`(${allTokens.join('|')})`, 'g')
  const stepParts = gherkinStep.split(tokenRegex)

  return (
    <>
      {stepParts.map(part => {
        const matchingParameter = nonEmptyParameters.find(parameter => parameter.value === part)
        if (!matchingParameter) {
          return (
            <span key={`text-${part || 'empty'}`} className="whitespace-pre-wrap">
              {part}
            </span>
          )
        }

        return (
          <TooltipProvider key={`chip-${matchingParameter.name}-${matchingParameter.value}`} delayDuration={40}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge
                  variant="outline"
                  className="border-primary/30 bg-primary/10 mx-0.5 inline-flex cursor-help px-1.5 py-0 align-baseline text-[11px] font-medium text-primary"
                >
                  {matchingParameter.value}
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="top" className="font-mono text-[10px] font-medium">
                {matchingParameter.name}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )
      })}
    </>
  )
}
