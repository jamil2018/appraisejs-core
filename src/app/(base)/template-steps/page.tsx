import { permanentRedirect } from 'next/navigation'

export default function LegacyTemplateStepsPage() {
  permanentRedirect('/step-definitions')
}
