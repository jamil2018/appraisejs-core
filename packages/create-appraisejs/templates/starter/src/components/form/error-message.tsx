import React from 'react'

const ErrorMessage = ({ message, visible }: { message: string; visible: boolean }) => {
  return <div className={`text-sm text-pink-600 ${visible ? 'visible' : 'invisible'}`}>{message}</div>
}

export default ErrorMessage
