import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export const DataCardGrid = ({ children }: { children: React.ReactNode }) => {
  return (
    <Card>
      <CardHeader className="relative px-4 pb-3 pt-4">
        <CardTitle className="text-base font-semibold text-foreground">States</CardTitle>
        <CardDescription className="text-xs leading-5 text-muted-foreground">
          Overview of active workspace entities
        </CardDescription>
      </CardHeader>
      <CardContent className="relative grid grid-cols-1 gap-3 px-4 pb-4 pt-0 sm:auto-rows-[116px] sm:grid-cols-2">
        {children}
      </CardContent>
    </Card>
  )
}
