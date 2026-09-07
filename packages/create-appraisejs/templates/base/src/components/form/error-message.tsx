import React from 'react'

const ErrorMessage = ({ id, message, visible }: { id?: string; message: string; visible: boolean }) => {
  return (
    <div
      id={id}
      aria-live="polite"
      role={visible ? 'alert' : undefined}
      className={`text-sm text-pink-400 ${visible ? 'visible' : 'invisible'}`}
    >
      {message}
    </div>
  )
}

export default ErrorMessage
