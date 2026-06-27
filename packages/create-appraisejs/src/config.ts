import { DEFAULT_TEMPLATE_ID, type TemplateId } from './template-catalog.js'

export interface Config {
  template: TemplateId
}

export function getConfig(template: TemplateId = DEFAULT_TEMPLATE_ID): Config {
  return { template }
}
