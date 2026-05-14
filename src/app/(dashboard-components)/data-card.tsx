'use client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardTitle, CardHeader } from '@/components/ui/card'
import { ExternalLink } from 'lucide-react'
import { useRouter } from 'next/navigation'
export default function DataCard({ title, value, link }: { title: string; value: number; link: string }) {
  const { push } = useRouter()
  return (
    <Card className="h-fit min-w-40 border-gray-600/10 bg-gray-600/10">
      <CardHeader className="flex flex-row items-center justify-between p-2">
        <CardTitle className={`text-xs font-normal ${value > 0 ? 'text-primary' : 'text-gray-400'}`}>{title}</CardTitle>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="hover:text-primary/80 border-gray-600/15 bg-inherit px-2 py-1 text-primary hover:bg-emerald-400/10"
            disabled={value === 0}
            onClick={() => push(link)}
            size="sm"
          >
            <ExternalLink className="size-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="h-full px-2 py-1">
        <div className={`flex h-full items-center text-2xl font-bold ${value > 0 ? 'text-primary' : 'text-gray-400'}`}>
          {value}
        </div>
      </CardContent>
    </Card>
  )
}
