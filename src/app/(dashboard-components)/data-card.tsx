'use client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardTitle, CardHeader } from '@/components/ui/card'
import { ExternalLink } from 'lucide-react'
import { useRouter } from 'next/navigation'
export default function DataCard({ title, value, link }: { title: string; value: number; link: string }) {
  const { push } = useRouter()
  return (
    <Card className="min-w-0 border-white/[0.07] bg-white/[0.025] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <CardHeader className="flex flex-row items-center justify-between gap-3 p-3 pb-2">
        <CardTitle className={`text-xs font-medium ${value > 0 ? 'text-foreground' : 'text-zinc-400'}`}>
          {title}
        </CardTitle>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="hover:bg-primary/10 border-white/[0.08] bg-white/[0.035] text-primary hover:text-primary"
            disabled={value === 0}
            aria-label={`Open ${title}`}
            onClick={() => push(link)}
            size="icon"
          >
            <ExternalLink className="size-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="px-3 pb-3 pt-0">
        <div className={`text-3xl font-semibold tracking-tight ${value > 0 ? 'text-primary' : 'text-zinc-400'}`}>
          {value}
        </div>
      </CardContent>
    </Card>
  )
}
