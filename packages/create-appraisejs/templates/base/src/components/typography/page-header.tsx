import { cn } from '@/lib/utils'

const PageHeader = ({ className, children }: { className?: string; children: React.ReactNode }) => {
  return (
    <h1 className={cn('text-2xl font-semibold tracking-tight text-foreground sm:text-3xl', className)}>{children}</h1>
  )
}

export default PageHeader
