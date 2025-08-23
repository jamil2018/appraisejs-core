import React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { cn } from '@/lib/utils'

const InfoCard = ({
  title,
  description,
  value,
  icon,
  textAlign = 'left',
  className,
}: {
  title: string
  description: string
  value: string
  icon: React.ReactNode
  textAlign?: 'left' | 'right' | 'center'
  className?: React.ComponentProps<'div'>['className']
}) => {
  return (
    <Card className={cn(className)}>
      <CardHeader>
        <CardTitle>
          <span
            className={cn(
              'flex items-center gap-2',
              textAlign === 'left' && 'justify-start',
              textAlign === 'right' && 'justify-end',
              textAlign === 'center' && 'justify-center',
            )}
          >
            {icon}
            {title}
          </span>
        </CardTitle>
        <CardDescription
          className={cn(
            'text-sm',
            textAlign === 'left' && 'text-left',
            textAlign === 'right' && 'text-right',
            textAlign === 'center' && 'text-center',
          )}
        >
          {description}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p
          className={cn(
            'text-2xl font-bold',
            textAlign === 'left' && 'text-left',
            textAlign === 'right' && 'text-right',
            textAlign === 'center' && 'text-center',
          )}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  )
}

export default InfoCard
