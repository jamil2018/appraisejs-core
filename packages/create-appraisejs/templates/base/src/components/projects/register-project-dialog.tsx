'use client'

import { Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { registerTargetProjectAction } from '@/actions/target-project/target-project-actions'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/hooks/use-toast'

export default function RegisterProjectDialog() {
  const { refresh } = useRouter()
  const [open, setOpen] = useState(false)
  const [projectPath, setProjectPath] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [description, setDescription] = useState('')
  const [initializeGit, setInitializeGit] = useState(false)
  const [isPending, startTransition] = useTransition()

  function register() {
    startTransition(async () => {
      const response = await registerTargetProjectAction({ projectPath, displayName, description, initializeGit })
      if (!response.success) {
        toast({ title: 'Project registration failed', description: response.message, variant: 'destructive' })
        return
      }
      setProjectPath('')
      setDisplayName('')
      setDescription('')
      setInitializeGit(false)
      setOpen(false)
      toast({ title: 'Project registered' })
      refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button onClick={() => setOpen(true)}>
        <Plus aria-hidden="true" data-icon="inline-start" />
        Register project
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Register workspace</DialogTitle>
          <DialogDescription>
            Registration uses the same canonical inspection and marker flow as agent project setup.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="project-path">Absolute workspace path</Label>
            <Input
              id="project-path"
              value={projectPath}
              onChange={event => setProjectPath(event.target.value)}
              placeholder="/absolute/path/to/workspace"
            />
          </div>
          <div className="flex items-start gap-2">
            <Checkbox
              id="project-initialize-git"
              checked={initializeGit}
              onCheckedChange={checked => setInitializeGit(checked === true)}
            />
            <div className="grid gap-1">
              <Label htmlFor="project-initialize-git">Initialize Git for an empty workspace</Label>
              <p className="text-sm text-muted-foreground">
                Creates a main-branch repository so implementation checkpoints can record commit evidence.
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="project-display-name">Display name</Label>
            <Input
              id="project-display-name"
              value={displayName}
              onChange={event => setDisplayName(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="project-description">Description (optional)</Label>
            <Textarea
              id="project-description"
              value={description}
              onChange={event => setDescription(event.target.value)}
              placeholder="What is this workspace used for?"
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={isPending} onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button disabled={isPending || !projectPath.trim() || !displayName.trim()} onClick={register}>
            {isPending ? 'Registering...' : 'Register project'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
