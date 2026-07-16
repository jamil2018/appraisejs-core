import { toast } from '@/hooks/use-toast'

type StandardFormResultOptions = {
  status: number
  successTitle: string
  successMessage: string
  errorMessage: string
  onSuccess(): void
}

export function handleStandardFormResult(options: StandardFormResultOptions): void {
  if (options.status === 200) {
    toast({ title: options.successTitle, description: options.successMessage })
    options.onSuccess()
    return
  }
  if (options.status === 400 || options.status === 500) {
    toast({ title: 'Error', description: options.errorMessage, variant: 'destructive' })
  }
}
