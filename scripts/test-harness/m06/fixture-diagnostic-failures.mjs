// Secondary diagnostics only: the caller retains its first cause and original resources separately.
export function retainDiagnosticFailure(errors, error, existingLimit) {
  try {
    if (errors.length < existingLimit) errors.push(error)
  } catch {}
}
