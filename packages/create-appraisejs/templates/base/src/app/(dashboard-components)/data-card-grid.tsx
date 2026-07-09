import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export const DataCardGrid = ({ children }: { children: React.ReactNode }) => {
  return (
    <Card className="relative overflow-hidden border-white/[0.08] bg-[rgba(18,37,64,0.42)] shadow-none">
      <CardHeader className="relative px-4 pb-3 pt-4">
        <CardTitle className="text-base font-semibold text-white">States</CardTitle>
        <CardDescription className="text-xs leading-5 text-zinc-400">
          Overview of active workspace entities
        </CardDescription>
      </CardHeader>
      <CardContent className="relative grid grid-cols-1 gap-3 px-4 pb-4 pt-0 sm:auto-rows-[116px] sm:grid-cols-2">
        {children}
      </CardContent>
    </Card>
  )
}
