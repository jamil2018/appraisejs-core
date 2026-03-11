// Modify review page temporarily commented out - will be reworked later
import React from 'react'
import { Metadata } from 'next'

/*
Modify review functionality temporarily disabled
Will be re-implemented without user dependencies
*/

export const metadata: Metadata = {
  title: 'Appraise | Modify Review',
  description: 'Review modification will be implemented later',
}

const ModifyReview = () => {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold">Modify Review</h1>
      <p className="mt-4 text-muted-foreground">
        Review modification will be implemented later without user authentication dependencies.
      </p>
    </div>
  )
}

export default ModifyReview
