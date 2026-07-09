export function getRemarkInitials(actor: string): string {
  if (actor === 'local-user') return 'LU'
  return actor
    .split(/[\s_-]+/)
    .map(part => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export function getRelativeTimeString(date: Date | string | number): string {
  const time = typeof date === 'number' ? date : new Date(date).getTime()
  const diff = Date.now() - time
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 7) return new Date(time).toLocaleDateString()
  if (days > 0) return `${days}d ago`
  if (hours > 0) return `${hours}h ago`
  if (minutes > 0) return `${minutes}m ago`
  return 'Just now'
}

export function MarkdownRemark({ content }: { content: string }) {
  if (!content) return null

  const parts = content.split(/(```[\s\S]*?```)/g)

  return (
    <div className="space-y-1.5 text-sm leading-relaxed">
      {parts.map((part, index) => {
        if (part.startsWith('```') && part.endsWith('```')) {
          const code = part.slice(3, -3).trim()
          return (
            <pre key={index} className="my-2 overflow-x-auto rounded-md border bg-muted p-2.5 font-mono text-xs">
              <code>{code}</code>
            </pre>
          )
        }

        const lines = part.split('\n')
        const elements: React.ReactNode[] = []
        let listItems: string[] = []

        const flushList = (key: number) => {
          if (listItems.length === 0) return
          elements.push(
            <ul key={`list-${key}`} className="my-1.5 list-disc space-y-0.5 pl-5">
              {listItems.map((item, itemIndex) => (
                <li key={itemIndex}>{renderInlineMarkdown(item)}</li>
              ))}
            </ul>,
          )
          listItems = []
        }

        lines.forEach((line, lineIndex) => {
          const trimmed = line.trim()
          if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
            listItems.push(trimmed.slice(2))
            return
          }

          flushList(lineIndex)
          if (trimmed) {
            elements.push(<p key={lineIndex}>{renderInlineMarkdown(line)}</p>)
          } else {
            elements.push(<div key={lineIndex} className="h-2" />)
          }
        })

        flushList(lines.length)
        return <div key={index}>{elements}</div>
      })}
    </div>
  )
}

function renderInlineMarkdown(text: string) {
  const tokens = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g)
  return tokens.map((token, index) => {
    if (token.startsWith('`') && token.endsWith('`')) {
      return (
        <code key={index} className="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs">
          {token.slice(1, -1)}
        </code>
      )
    }
    if (token.startsWith('**') && token.endsWith('**')) {
      return (
        <strong key={index} className="font-semibold">
          {token.slice(2, -2)}
        </strong>
      )
    }
    if (token.startsWith('*') && token.endsWith('*')) {
      return <em key={index}>{token.slice(1, -1)}</em>
    }
    return token
  })
}
