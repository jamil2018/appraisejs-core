'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import React, { useState } from 'react'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '../ui/card'
import { ChevronDown } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'

const NavMenuCardDeck = ({
  containerButtonText,
  containerButtonIcon,
  dropdownItems,
}: {
  containerButtonText: string
  containerButtonIcon: React.ReactNode
  dropdownItems: {
    text: string
    icon: React.ReactNode
    href: string
    description: string
  }[]
}) => {
  const pathname = usePathname()
  const [isHovered, setIsHovered] = useState(false)

  const checkIfTriggerActive = (href: string) => {
    return dropdownItems.some(item => item.href === href || pathname.startsWith(item.href))
  }

  const checkIfItemActive = (href: string) => {
    return href === pathname || pathname.startsWith(href)
  }

  return (
    <div className="relative" onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)}>
      <button
        type="button"
        className={cn(
          'flex items-center gap-2 rounded-md px-4 py-2 outline-none transition-colors',
          checkIfTriggerActive(pathname) && 'bg-accent text-accent-foreground',
          'hover:bg-accent hover:text-accent-foreground',
        )}
      >
        {containerButtonIcon}
        <span className="text-sm font-medium">{containerButtonText}</span>
        <motion.div animate={{ rotate: isHovered ? 180 : 0 }} transition={{ duration: 0.2, ease: 'easeInOut' }}>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </motion.div>
      </button>

      <AnimatePresence>
        {isHovered && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute left-0 top-full h-1 w-full bg-transparent"
            />
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute left-0 top-full z-50 mt-1 rounded-md border bg-popover p-1 shadow-md"
            >
              <div
                className={cn(
                  'grid gap-0.5',
                  dropdownItems.length === 1 ? 'w-[300px] grid-cols-1' : 'w-[600px] grid-cols-2',
                )}
              >
                {dropdownItems.map(item => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="transition-colors hover:cursor-pointer"
                    onClick={() => setIsHovered(false)}
                  >
                    <Card
                      className={cn(
                        'h-24 w-full border-none outline-none transition-colors hover:bg-accent hover:text-accent-foreground',
                        checkIfItemActive(item.href) && 'bg-accent text-accent-foreground',
                        'hover:cursor-pointer',
                      )}
                    >
                      <CardContent className="flex h-full w-full items-center gap-3 p-4">
                        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-md text-accent-foreground">
                          {item.icon}
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col justify-center">
                          <span className="truncate text-sm font-medium">{item.text}</span>
                          <span className="line-clamp-2 text-xs text-muted-foreground">{item.description}</span>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

export default NavMenuCardDeck
