'use client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Blocks, FileCheck, LayoutTemplate, ListChecks, TestTubeDiagonal, TestTubes } from 'lucide-react'
import { useRouter } from 'next/navigation'

const quickActions = [
  { label: 'Create Suite', href: '/test-suites/create', icon: TestTubes },
  { label: 'Create Test', href: '/test-cases/create', icon: TestTubeDiagonal },
  { label: 'Create Step', href: '/template-steps/create', icon: LayoutTemplate },
  { label: 'Create Run', href: '/test-runs/create', icon: ListChecks },
  { label: 'Create Template', href: '/template-test-cases/create', icon: Blocks },
  { label: 'View Reports', href: '/reports', icon: FileCheck },
]

export default function QuickActionsDrawer() {
  const { push } = useRouter()
  return (
    <Card id="container" className="h-fit w-full border-white/[0.07] bg-[rgba(18,37,64,0.34)]">
      <CardHeader id="header">
        <CardTitle className="text-primary">Quick Actions</CardTitle>
        <CardDescription>Quickly create new entities to get started</CardDescription>
      </CardHeader>
      <CardContent id="content">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {quickActions.map(({ label, href, icon: Icon }) => (
            <Button
              key={href}
              variant="outline"
              className="hover:bg-primary/10 flex h-20 min-w-0 flex-col items-center gap-2 border-white/[0.08] bg-white/[0.035] px-2 text-primary hover:text-primary [&_svg]:!h-5 [&_svg]:!w-5"
              onClick={() => push(href)}
            >
              <Icon />
              <span className="max-w-full text-center text-xs font-medium leading-4">{label}</span>
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
