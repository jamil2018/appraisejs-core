'use client'

import dynamic from 'next/dynamic'
import { useEffect, useRef } from 'react'
import type { BeforeMount, OnMount } from '@monaco-editor/react'
import type * as Monaco from 'monaco-editor'

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false })
const handlerUri = 'file:///handler.ts'
const contractUri = 'file:///contract.ts'
const markerOwner = 'appraise-server'

type TypeScriptDefaults = {
  setCompilerOptions: (options: Record<string, unknown>) => void
  setDiagnosticsOptions: (options: Record<string, unknown>) => void
}

function typeScriptDefaults(monaco: typeof Monaco) {
  return (
    monaco.languages as unknown as {
      typescript: { typescriptDefaults: TypeScriptDefaults }
    }
  ).typescript.typescriptDefaults
}

function configureTypeScript(monaco: typeof Monaco) {
  const defaults = typeScriptDefaults(monaco)
  defaults.setCompilerOptions({
    allowNonTsExtensions: true,
    module: 99,
    moduleResolution: 2,
    noEmit: true,
    strict: true,
    target: 99,
  })
  defaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
  })
  monaco.editor.defineTheme('appraise-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#0b1626',
      'editorGutter.background': '#0b1626',
      'editorLineNumber.foreground': '#52657d',
      'editorLineNumber.activeForeground': '#aab9ca',
    },
  })
}

function updateContractModel(monaco: typeof Monaco, source: string) {
  const uri = monaco.Uri.parse(contractUri)
  const model = monaco.editor.getModel(uri)
  if (model) {
    if (model.getValue() !== source) model.setValue(source)
    return
  }
  monaco.editor.createModel(source, 'typescript', uri)
}

function serverMarkers(monaco: typeof Monaco, diagnostics: string[]): Monaco.editor.IMarkerData[] {
  return diagnostics.map(message => ({
    endColumn: 1,
    endLineNumber: 1,
    message,
    severity: monaco.MarkerSeverity.Error,
    source: 'Appraise compilation',
    startColumn: 1,
    startLineNumber: 1,
  }))
}

export function StepDefinitionCodeEditor({
  contractSource,
  diagnostics,
  onChange,
  value,
}: {
  contractSource: string
  diagnostics: string[]
  onChange: (value: string) => void
  value: string
}) {
  const monacoRef = useRef<typeof Monaco | null>(null)
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null)

  const beforeMount: BeforeMount = monaco => {
    monacoRef.current = monaco
    configureTypeScript(monaco)
    updateContractModel(monaco, contractSource)
  }
  const onMount: OnMount = (editor, monaco) => {
    editorRef.current = editor
    monaco.editor.setModelMarkers(editor.getModel()!, markerOwner, serverMarkers(monaco, diagnostics))
  }

  useEffect(() => {
    if (monacoRef.current) updateContractModel(monacoRef.current, contractSource)
  }, [contractSource])

  useEffect(() => {
    const monaco = monacoRef.current
    const model = editorRef.current?.getModel()
    if (monaco && model) monaco.editor.setModelMarkers(model, markerOwner, serverMarkers(monaco, diagnostics))
  }, [diagnostics])

  return (
    <div className="overflow-hidden rounded-md border border-white/[0.1] bg-[#0b1626]">
      <MonacoEditor
        beforeMount={beforeMount}
        height="24rem"
        language="typescript"
        onChange={nextValue => onChange(nextValue ?? '')}
        onMount={onMount}
        options={{
          ariaLabel: 'User-owned handler source',
          automaticLayout: true,
          bracketPairColorization: { enabled: true },
          folding: true,
          fontSize: 13,
          formatOnPaste: true,
          lineNumbersMinChars: 3,
          minimap: { enabled: false },
          padding: { top: 12, bottom: 12 },
          quickSuggestions: { comments: false, other: true, strings: true },
          scrollBeyondLastLine: false,
          tabSize: 2,
          wordWrap: 'on',
        }}
        path={handlerUri}
        theme="appraise-dark"
        value={value}
      />
    </div>
  )
}
