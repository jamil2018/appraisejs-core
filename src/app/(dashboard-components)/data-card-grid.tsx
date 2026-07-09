import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export const DataCardGrid = ({ children }: { children: React.ReactNode }) => {
  return (
    <Card className="relative overflow-hidden border-white/[0.08] bg-gradient-to-b from-[rgba(24,45,75,0.35)] to-[rgba(12,20,35,0.45)] shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] backdrop-blur-md">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.04] via-transparent to-transparent pointer-events-none" />
      <CardHeader className="relative pb-5">
        <CardTitle className="text-lg font-bold text-white tracking-tight">States</CardTitle>
        <CardDescription className="text-zinc-400 text-xs leading-relaxed">
          Overview of active workspace entities
        </CardDescription>
      </CardHeader>
      <CardContent className="relative grid grid-cols-2 gap-4 pt-0">
        {children}
      </CardContent>
    </Card>
  )
}
