import { TemplateStepIcon } from '@prisma/client'
import {
  ALargeSmall,
  BugPlay,
  Database,
  Download,
  Globe,
  Keyboard,
  MousePointerClick,
  Save,
  Server,
  Upload,
  Loader,
  CheckCheck,
  LucideIcon,
} from 'lucide-react'
import { ReactElement } from 'react'

export const KeyToIconTransformer = (key: TemplateStepIcon, className?: string) => {
  switch (key) {
    case 'MOUSE':
      return <MousePointerClick className={className} />
    case 'NAVIGATION':
      return <Globe className={className} />
    case 'INPUT':
      return <Keyboard className={className} />
    case 'DOWNLOAD':
      return <Download className={className} />
    case 'API':
      return <Server className={className} />
    case 'STORE':
      return <Save className={className} />
    case 'FORMAT':
      return <ALargeSmall className={className} />
    case 'DATA':
      return <Database className={className} />
    case 'UPLOAD':
      return <Upload className={className} />
    case 'WAIT':
      return <Loader className={className} />
    case 'VALIDATION':
      return <CheckCheck className={className} />
    case 'DEBUG':
      return <BugPlay className={className} />
  }
}

// Map of component types to TemplateStepIcon values
const componentToIconMap = new Map<LucideIcon, TemplateStepIcon>([
  [MousePointerClick, 'MOUSE'],
  [Globe, 'NAVIGATION'],
  [Keyboard, 'INPUT'],
  [Download, 'DOWNLOAD'],
  [Server, 'API'],
  [Save, 'STORE'],
  [ALargeSmall, 'FORMAT'],
  [Database, 'DATA'],
  [Upload, 'UPLOAD'],
  [Loader, 'WAIT'],
  [CheckCheck, 'VALIDATION'],
  [BugPlay, 'DEBUG'],
])

// Map of string values to TemplateStepIcon values
const stringToIconMap = new Map<string, TemplateStepIcon>([
  ['MOUSE', 'MOUSE'],
  ['NAVIGATION', 'NAVIGATION'],
  ['INPUT', 'INPUT'],
  ['DOWNLOAD', 'DOWNLOAD'],
  ['API', 'API'],
  ['STORE', 'STORE'],
  ['FORMAT', 'FORMAT'],
  ['DATA', 'DATA'],
  ['UPLOAD', 'UPLOAD'],
  ['WAIT', 'WAIT'],
  ['VALIDATION', 'VALIDATION'],
  ['DEBUG', 'DEBUG'],
])

export const IconToKeyTransformer = (icon: React.ReactNode | string): TemplateStepIcon | undefined => {
  // Handle string input
  if (typeof icon === 'string') {
    return stringToIconMap.get(icon)
  }

  // Handle React component input
  if (!icon || typeof icon !== 'object') return undefined

  // Get the component type from the React element
  const componentType = (icon as ReactElement)?.type
  if (!componentType) return undefined

  // Look up the icon in our map
  return componentToIconMap.get(componentType as LucideIcon)
}
