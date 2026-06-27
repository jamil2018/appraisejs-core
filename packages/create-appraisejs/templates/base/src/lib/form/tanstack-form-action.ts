type TanStackFormSubmitHandler = () => unknown | Promise<unknown>

export function getTanStackFormAction(handleSubmit: TanStackFormSubmitHandler) {
  return () => {
    void handleSubmit()
  }
}
