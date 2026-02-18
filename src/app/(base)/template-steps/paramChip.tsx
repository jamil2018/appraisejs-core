'use client'

import type React from 'react'

import { useState, useEffect } from 'react'
import { PlusCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
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

// Define the item type
type Param = {
  id: string
  name: string
  type: string
  order: number
}

export default function ParamChip({
  types,
  onSubmit,
  defaultValues,
}: {
  types: string[]
  onSubmit: (value: Param[]) => void
  defaultValues?: Param[]
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [items, setItems] = useState<Param[]>(defaultValues || [])
  // Sync items when defaultValues changes (defer setState to avoid sync setState in effect)
  useEffect(() => {
    queueMicrotask(() => setItems(defaultValues || []))
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
      // Create a new item with the form values
      const newItem = {
        id: crypto.randomUUID(),
        ...formValues,
      }

      // Add the new item to the items array
      setItems([...items, newItem])

      // Reset the form
      setFormValues({
        name: '',
        type: '',
        order: 1,
      })

      // Call the onSubmit callback with the new item
      onSubmit([...items, newItem])

      // Close the modal
      setIsOpen(false)
    }
  }

  // Handle removing an item
  const removeItem = (id: string) => {
    setItems(items.filter(item => item.id !== id))
    onSubmit(items.filter(item => item.id !== id))
  }

  return (
    <div className="space-y-6">
      <Button type="button" onClick={() => setIsOpen(true)} variant="outline" size="icon">
        <PlusCircle className="h-4 w-4" />
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
