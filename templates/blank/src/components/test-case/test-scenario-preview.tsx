'use client'

import CodeMirror, { EditorView } from '@uiw/react-codemirror'
import { langs } from '@uiw/codemirror-extensions-langs'
import { githubDark } from '@uiw/codemirror-theme-github'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

type TestScenarioPreviewProps = {
  title: string
  description?: string
  scenario: string
}

export function TestScenarioPreview({ title, description, scenario }: TestScenarioPreviewProps) {
  return (
    <Card className="border-gray-700 bg-gray-500/10">
      <CardHeader>
        <CardTitle className="text-xl font-bold text-primary">{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>
        <CodeMirror
          editable={false}
          value={scenario}
          onChange={() => {}}
          height="200px"
          extensions={[langs.feature(), EditorView.lineWrapping]}
          theme={githubDark}
        />
      </CardContent>
    </Card>
  )
}
