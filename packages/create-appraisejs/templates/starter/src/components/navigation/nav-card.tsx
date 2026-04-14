import React from 'react'
import { Card, CardContent } from '../ui/card'
import Link from 'next/link'

const NavCard = ({
  data,
  href,
  icon,
}: {
  data: { title: string; description: string }
  href: string
  icon: React.ReactNode
}) => {
  return (
    <Link href={href} className="w-full">
      <Card className="h-24 w-full border-none outline-none transition-colors hover:bg-accent hover:text-accent-foreground">
        <CardContent className="flex h-full w-full items-center gap-3 p-4">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-md text-accent-foreground">
            {icon}
          </div>
          <div className="flex min-w-0 flex-1 flex-col justify-center">
            <span className="truncate text-sm font-medium">{data.title}</span>
            <span className="line-clamp-2 text-xs text-muted-foreground">{data.description}</span>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}

export default NavCard
