import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartConfig } from '@/components/ui/chart'
import FeatureChart from '../(base)/reports/feature-chart'
import { TestSuiteExecutionData } from '@/actions/dashboard/dashboard-actions'

const colorMap = {
    passed: 'oklch(59.6% 0.145 163.225)',
    failed: 'oklch(59.2% 0.249 0.584)',
    cancelled: 'oklch(55.4% 0.046 257.417)',
    unknown: 'oklch(79.5% 0.184 86.047)',
}

const resultByTestSuiteBarChartConfig = {
    feature: {
        label: 'Test Suite',
    },
    passed: {
        label: 'Passed',
        color: colorMap.passed,
    },
    failed: {
        label: 'Failed',
        color: colorMap.failed,
    },
    cancelled: {
        label: 'Cancelled',
        color: colorMap.cancelled,
    },
    unknown: {
        label: 'Unknown',
        color: colorMap.unknown,
    },
} satisfies ChartConfig

interface ExecutionHealthPanelProps {
    featureData: TestSuiteExecutionData
}

export const ExecutionHealthPanel = ({ featureData }: ExecutionHealthPanelProps) => {
    return (
        <Card className="border-gray-600/10 bg-gray-600/10 w-full h-full">
            <CardHeader>
                <CardTitle className="text-primary">Execution Health</CardTitle>
                <CardDescription>Pass/fail rates by test suite across last 10 test runs</CardDescription>
            </CardHeader>
            <CardContent>
                {featureData.length === 0 ? (
                    <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
                        No execution data available. Run some test suites to see execution health metrics.
                    </div>
                ) : (
                    <FeatureChart config={resultByTestSuiteBarChartConfig} data={featureData} />
                )}
            </CardContent>
        </Card>
    )
}