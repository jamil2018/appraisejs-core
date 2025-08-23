import { FlaskConical } from 'lucide-react'
import React from 'react'

const Logo = () => {
  return (
    <div className="m-2 flex items-center">
      <FlaskConical size={25} className="mr-2 text-primary" />
      <span className="rounded-l-lg bg-gray-800 pb-1 pl-1 text-xl tracking-widest text-white underline dark:bg-primary dark:text-gray-700">
        app
      </span>
      <span className="text-xl tracking-widest text-primary">raise</span>
    </div>
  )
}

export default Logo
