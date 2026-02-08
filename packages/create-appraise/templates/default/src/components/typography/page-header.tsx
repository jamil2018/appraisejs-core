import { cn } from '@/lib/utils'

const PageHeader = ({ className, children }: { className?: string; children: React.ReactNode }) => {
  return <div className={cn('text-4xl font-bold text-primary', className)}>{children}</div>
}

export default PageHeader
