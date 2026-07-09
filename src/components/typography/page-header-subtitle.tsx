import React from 'react'

const HeaderSubtitle = ({ children }: { children: React.ReactNode }) => {
  return <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{children}</p>
}

export default HeaderSubtitle
