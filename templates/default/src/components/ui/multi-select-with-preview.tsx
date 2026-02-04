'use client'

import * as React from 'react'
import { Check, ChevronsUpDown, X } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { TooltipProvider } from '@/components/ui/tooltip'

interface Option {
  value: string
  label: string
}

interface MultiSelectWithPreviewProps {
  id: string
  className?: string
  options: Option[]
  placeholder?: string
  emptyMessage?: string
  selectedLabel?: string
  onSelectChange: (value: string[]) => void
  defaultSelectedValues?: string[]
  searchPlaceholder?: string
}

export function MultiSelectWithPreview({
  id,
  className,
  options,
  placeholder = 'Select options...',
  emptyMessage = 'No option found.',
  selectedLabel = 'option(s) selected',
  onSelectChange,
  defaultSelectedValues = [],
  searchPlaceholder = 'Search options...',
}: MultiSelectWithPreviewProps) {
  const [open, setOpen] = React.useState(false)
  const [selectedValues, setSelectedValues] = React.useState<string[]>(defaultSelectedValues)

  const handleSelect = (value: string) => {
    const newSelectedValues = selectedValues.includes(value)
      ? selectedValues.filter(item => item !== value)
      : [...selectedValues, value]
    setSelectedValues(newSelectedValues)
    onSelectChange(newSelectedValues)
  }

  return (
    <TooltipProvider>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn('w-full justify-between text-muted-foreground', className)}
          >
            {selectedValues.length > 0 ? `${selectedValues.length} ${selectedLabel.toLowerCase()}` : placeholder}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className={cn('w-full max-w-[600px] p-0', className)} align="start">
          <Command className={cn('w-full', className)}>
            <CommandInput placeholder={searchPlaceholder ?? `Search item(s)...`} className="w-full" />
            <CommandList className={cn('w-full', className)}>
              <CommandEmpty>{emptyMessage}</CommandEmpty>
              <CommandGroup className={cn('w-full', className)}>
                {options.map(option => (
                  <CommandItem
                    key={option.value}
                    id={id}
                    onSelect={() => handleSelect(option.value)}
                    className={cn('w-full', className)}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4 flex-shrink-0',
                        selectedValues.includes(option.value) ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    <span>{option.label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {selectedValues.length > 0 && (
        <div className={cn('mt-4', className)}>
          <h3 className="mb-2 text-sm font-semibold text-muted-foreground">{selectedLabel}</h3>
          <ul className="space-y-2">
            {selectedValues.map(value => {
              const option = options.find(opt => opt.value === value)
              if (!option) return null
              return (
                <li key={value} className="flex items-center justify-between rounded-md bg-secondary p-2">
                  <span className="text-sm">{option.label}</span>
                  <Button variant="ghost" size="sm" onClick={() => handleSelect(value)} className="h-auto p-1">
                    <X className="h-4 w-4" />
                    <span className="sr-only">Remove</span>
                  </Button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </TooltipProvider>
  )
}

export default MultiSelectWithPreview
