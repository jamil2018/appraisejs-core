import dynamic from 'next/dynamic'

function ChartPlaceholder() {
  return <div className="mx-auto aspect-square max-h-[250px] animate-pulse rounded-lg bg-muted" />
}

export const OverviewChart = dynamic(() => import('./overview-chart'), {
  loading: () => <ChartPlaceholder />,
})

export const FeatureChart = dynamic(() => import('./feature-chart'), {
  loading: () => <ChartPlaceholder />,
})

export const DurationChart = dynamic(() => import('./duration-chart'), {
  loading: () => <ChartPlaceholder />,
})
