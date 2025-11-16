// Create review page temporarily commented out - will be reworked later
import React from 'react'
import { Metadata } from 'next'

/*
Create review functionality temporarily disabled
Will be re-implemented without user dependencies
*/

export const metadata: Metadata = {
  title: 'Appraise | Create Review',
  description: 'Review creation will be implemented later',
}

const CreateReview = () => {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold">Create Review</h1>
      <p className="mt-4 text-muted-foreground">
        Review creation will be implemented later without user authentication dependencies.
      </p>
    </div>
  )
}

export default CreateReview
