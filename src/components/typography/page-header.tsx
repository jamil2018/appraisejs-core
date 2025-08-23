import React from 'react'

const PageHeader = ({ children }: { children: React.ReactNode }) => {
  return <div className="text-4xl font-bold">{children}</div>
}

export default PageHeader
