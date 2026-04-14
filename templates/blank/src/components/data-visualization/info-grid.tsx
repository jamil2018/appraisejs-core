import React from 'react'
import InfoCard from './info-card'

interface InfoCards {
  showHighlightGroup: boolean
  highlight: string
  legend: string
  defaultText: string
  icon: React.ReactNode
}

const InfoGrid = ({ infoCards }: { infoCards: InfoCards[] }) => {
  return (
    <div className="my-4 flex flex-wrap gap-4">
      {infoCards.map(card => (
        <InfoCard key={card.legend} {...card} />
      ))}
    </div>
  )
}

export default InfoGrid
