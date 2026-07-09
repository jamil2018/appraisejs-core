import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export const DataCardGrid = ({ children }: { children: React.ReactNode }) => {
  return (
    <Card className="w-full border-white/[0.07] bg-[rgba(18,37,64,0.34)]">
      <CardHeader>
        <CardTitle className="text-primary">States</CardTitle>
        <CardDescription>Overview of entity states</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-4">{children}</CardContent>
    </Card>
  )
}
