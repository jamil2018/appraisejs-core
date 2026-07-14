import type { ReactNode } from 'react'

import type { NavigationCommandItem, NavigationSection } from './nav-command-helpers'

export default function NavigationSections({
  sections,
  renderItem,
}: {
  sections: NavigationSection[]
  renderItem: (item: NavigationCommandItem) => ReactNode
}) {
  return (
    <div className="space-y-3.5">
      {sections.map(section => (
        <section key={section.label}>
          <h2 className="mb-1 px-2.5 text-[10px] font-medium uppercase tracking-[0.08em] text-zinc-400/80">
            {section.label}
          </h2>
          <div className="space-y-px">{section.items.map(renderItem)}</div>
        </section>
      ))}
    </div>
  )
}
