import { cn } from '@/lib/utils'

const PageHeader = ({ className, children }: { className?: string; children: React.ReactNode }) => {
  return <h1 className={cn('text-3xl font-semibold text-foreground sm:text-4xl', className)}>{children}</h1>
}

export default PageHeader
