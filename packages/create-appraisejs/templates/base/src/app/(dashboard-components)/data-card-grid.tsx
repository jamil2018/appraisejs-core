import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export const DataCardGrid = ({ children }: { children: React.ReactNode }) => {
  return (
    <Card className="w-fit border-zinc-600/10 bg-zinc-600/10">
      <CardHeader>
        <CardTitle className="text-primary">States</CardTitle>
        <CardDescription>Overview of entity states</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-4">{children}</CardContent>
    </Card>
  )
}
