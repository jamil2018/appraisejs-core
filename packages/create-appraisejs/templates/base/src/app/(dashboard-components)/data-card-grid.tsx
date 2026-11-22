import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const DataCardGrid = ({ children }: { children: React.ReactNode }) => {
  return (
    <Card>
      <CardHeader className="relative px-4 pb-3 pt-4">
        <CardTitle className="text-base font-semibold text-foreground">Workspace inventory</CardTitle>
      </CardHeader>
      <CardContent className="relative grid grid-cols-2 items-stretch gap-2 px-4 pb-4 pt-0">{children}</CardContent>
    </Card>
  )
}
