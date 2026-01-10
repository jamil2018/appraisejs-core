'use client'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formOpts } from '@/constants/form-opts/template-selection-form-opts'
import { TemplateTestCase } from '@prisma/client'
import { useForm } from '@tanstack/react-form'
import { ArrowRight } from 'lucide-react'
import { useRouter } from 'next/navigation'
import React from 'react'
import { z } from 'zod'

const TemplateSelectionForm = ({ templateTestCases }: { templateTestCases: TemplateTestCase[] }) => {
  const router = useRouter()
  const form = useForm({
    defaultValues: formOpts?.defaultValues,
    validators: formOpts?.validators,
    onSubmit: async ({ value }) => {
      router.push(`/test-cases/create-from-template/generate/${value.templateTestCaseId}`)
    },
  })
  return (
    <div>
      <form
        onSubmit={e => {
          e.preventDefault()
          e.stopPropagation()
          form.handleSubmit()
        }}
      >
        <form.Field
          name="templateTestCaseId"
          validators={{
            onChange: z.string().min(1, { message: 'Template test case is required' }),
          }}
        >
          {field => {
            return (
              <div className="mb-4 flex flex-col gap-2 lg:w-1/3">
                <Label htmlFor={field.name}>Template Test Case</Label>
                <Select onValueChange={field.handleChange} value={field.state.value}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a template test case" />
                  </SelectTrigger>
                  <SelectContent>
                    {templateTestCases.map(templateTestCase => (
                      <SelectItem key={templateTestCase.id} value={templateTestCase.id}>
                        {templateTestCase.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {field.state.meta.errors.map((error, index) => (
                  <p key={index} className="text-xs text-pink-500">
                    {typeof error === 'string' ? error : error?.message || String(error)}
                  </p>
                ))}
              </div>
            )
          }}
        </form.Field>

        <Button type="submit" className="w-fit hover:bg-emerald-500">
          <span className="font-bold">Next</span>
          <ArrowRight className="h-4 w-4" />
        </Button>
      </form>
    </div>
  )
}

export default TemplateSelectionForm
