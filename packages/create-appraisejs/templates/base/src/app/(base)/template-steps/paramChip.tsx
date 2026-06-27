'use client'

import type React from 'react'

import { useState, useEffect } from 'react'
import { PlusCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { z } from 'zod'

// Define the form schema
const formSchema = z.object({
  name: z.string().min(2, { message: 'Name must be at least 2 characters' }),
  type: z.string().min(1, { message: 'Please select a type' }),
  order: z.coerce.number().int().positive(),
})

type FormValues = z.infer<typeof formSchema>

export type ParamChipValue = {
  name: string
  type: string
  order: number
}

type ParamItem = ParamChipValue & {
  id: string
}

export default function ParamChip({
  types,
  onSubmit,
  defaultValues,
}: {
  types: string[]
  onSubmit: (value: ParamChipValue[]) => void
  defaultValues?: ParamChipValue[]
}) {
  const stripItemId = (item: ParamItem): ParamChipValue => ({
    name: item.name,
    type: item.type,
    order: item.order,
  })
  const [isOpen, setIsOpen] = useState(false)
  const [items, setItems] = useState<ParamItem[]>(() =>
    (defaultValues || []).map(item => ({
      id: crypto.randomUUID(),
      ...item,
    })),
  )
  // Sync items when defaultValues changes (defer setState to avoid sync setState in effect)
  useEffect(() => {
    queueMicrotask(() =>
      setItems(
        (defaultValues || []).map(item => ({
          id: crypto.randomUUID(),
          ...item,
        })),
      ),
    )
  }, [defaultValues])

  // Form state
  const [formValues, setFormValues] = useState<FormValues>({
    name: '',
    type: '',
    order: 1,
  })

  // Form errors
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Handle input change
  const handleChange = (field: keyof FormValues, value: string) => {
    setFormValues(prev => ({
      ...prev,
      [field]: field === 'order' ? Number(value) : value,
    }))

    // Clear error for this field when user types
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev }
        delete newErrors[field]
        return newErrors
      })
    }
  }

  // Validate form
  const validateForm = (): boolean => {
    try {
      formSchema.parse(formValues)
      setErrors({})
      return true
    } catch (error) {
      if (error instanceof z.ZodError) {
        const newErrors: Record<string, string> = {}
        error.errors.forEach(err => {
          if (err.path[0]) {
            newErrors[err.path[0] as string] = err.message
          }
        })
        setErrors(newErrors)
      }
      return false
    }
  }

  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (validateForm()) {
      const newItem = {
        id: crypto.randomUUID(),
        ...formValues,
      }

      const nextItems = [...items, newItem]
      setItems(nextItems)
      onSubmit(nextItems.map(stripItemId))

      setFormValues({
        name: '',
        type: '',
        order: 1,
      })

      setIsOpen(false)
    }
  }

  // Handle removing an item
  const removeItem = (id: string) => {
    const nextItems = items.filter(item => item.id !== id)
    setItems(nextItems)
    onSubmit(nextItems.map(stripItemId))
  }

  return (
    <div className="space-y-6">
      <Button type="button" onClick={() => setIsOpen(true)} variant="outline" size="icon">
        <PlusCircle className="size-4" />
      </Button>

      {/* Display the added items as chips */}
      <div className="flex flex-wrap gap-2">
        {items.map(item => (
          <Badge key={item.id} variant="secondary" className="px-3 py-1 text-sm">
            {item.name}
            <button
              type="button"
              className="ml-2 text-muted-foreground hover:text-foreground"
              onClick={() => removeItem(item.id)}
            >
              ×
            </button>
          </Badge>
        ))}
        {items.length === 0 && <p className="text-sm text-muted-foreground">No items added yet.</p>}
      </div>

      {/* Modal with form */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Add New Item</DialogTitle>
            <DialogDescription>Add a parameter name, type, and display order.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={formValues.name}
                onChange={e => handleChange('name', e.target.value)}
                placeholder="Enter name"
              />
              {errors.name && <p className="text-sm font-medium text-destructive">{errors.name}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="type">Type</Label>
              <Select value={formValues.type} onValueChange={value => handleChange('type', value)}>
                <SelectTrigger id="type">
                  <SelectValue placeholder="Select a type" />
                </SelectTrigger>
                <SelectContent isEmpty={types.length === 0}>
                  {types.map(type => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.type && <p className="text-sm font-medium text-destructive">{errors.type}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="order">Order</Label>
              <Input
                id="order"
                type="number"
                min="1"
                value={formValues.order}
                onChange={e => handleChange('order', e.target.value)}
              />
              {errors.order && <p className="text-sm font-medium text-destructive">{errors.order}</p>}
            </div>

            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={handleSubmit}>
                Save
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
