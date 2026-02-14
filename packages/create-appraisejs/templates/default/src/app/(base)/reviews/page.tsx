// Reviews page temporarily commented out - will be reworked later
import React from 'react'
import { Metadata } from 'next'

/*
Reviews functionality temporarily disabled
Will be re-implemented without user dependencies
*/

export const metadata: Metadata = {
  title: 'Appraise | Reviews',
  description: 'Review functionality will be implemented later',
}

const Reviews = () => {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold">Reviews</h1>
      <p className="mt-4 text-muted-foreground">
        Review functionality will be implemented later without user authentication dependencies.
      </p>
    </div>
  )
}

export default Reviews
