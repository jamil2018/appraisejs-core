import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { getPlanReviewDetail } from '@/services/plan-review/plan-review-service'
import { ServiceError } from '@/services/shared/errors'

import { PlanReviewWorkspace } from './plan-review-workspace'

type PageProps = {
  params: Promise<{ planId: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { planId } = await params
  return { title: `Plan ${planId}` }
}

export default async function PlanReviewPage({ params }: PageProps) {
  const { planId } = await params
  let detail
  try {
    detail = await getPlanReviewDetail(planId)
  } catch (error) {
    if (error instanceof ServiceError && error.code === 'NOT_FOUND') notFound()
    throw error
  }
  return <PlanReviewWorkspace detail={detail} />
}
