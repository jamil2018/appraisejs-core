import prettier from 'prettier'

export async function normalizeFunctionDefinition(functionDefinition: string | null | undefined): Promise<string> {
  const source = functionDefinition?.trim()
  if (!source) return ''

  try {
    return (
      await prettier.format(source, {
        parser: 'typescript',
        semi: true,
        singleQuote: true,
        trailingComma: 'es5',
        printWidth: 80,
        tabWidth: 2,
      })
    ).trim()
  } catch {
    return source
  }
}
