'use client'
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Blocks, FileCheck, LayoutTemplate, ListChecks, TestTubeDiagonal, TestTubes } from "lucide-react";
import { useRouter } from "next/navigation";

export default function QuickActionsDrawer() {
    const router = useRouter()
    return (
        <Card id="container" className="w-fit border-gray-600/10 bg-gray-600/10 h-fit">
            <CardHeader id="header">
                <CardTitle className="text-primary">Quick Actions</CardTitle>
                <CardDescription className="text-xs text-muted-foreground">Quickly create new entities to get started</CardDescription>
            </CardHeader>
            <CardContent id="content">
                <div className="grid grid-cols-4 gap-4">
                    <Button variant="outline" className="flex flex-col items-center gap-2 h-fit [&_svg]:!h-6 [&_svg]:!w-6 bg-emerald-500/10 hover:bg-emerald-500/25 text-emerald-500 hover:text-emerald-400 border-none" onClick={() => router.push('/test-suites/create')}>
                        <TestTubes />
                        <span className="text-xs font-medium">Create Suite</span>
                    </Button>
                    <Button variant="outline" className="flex flex-col items-center gap-2 h-fit [&_svg]:!h-6 [&_svg]:!w-6 bg-emerald-500/10 hover:bg-emerald-500/25 text-emerald-500 hover:text-emerald-400 border-none" onClick={() => router.push('/test-cases/create')}>
                        <TestTubeDiagonal />
                        <span className="text-xs font-medium">Create Test</span>
                    </Button>
                    <Button variant="outline" className="flex flex-col items-center gap-2 h-fit [&_svg]:!h-6 [&_svg]:!w-6 bg-emerald-500/10 hover:bg-emerald-500/25 text-emerald-500 hover:text-emerald-400 border-none" onClick={() => router.push('/template-steps/create')}>
                        <LayoutTemplate />
                        <span className="text-xs font-medium">Create Step</span>
                    </Button>
                    <Button variant="outline" className="flex flex-col items-center gap-2 h-fit [&_svg]:!h-6 [&_svg]:!w-6 bg-emerald-500/10 hover:bg-emerald-500/25 text-emerald-500 hover:text-emerald-400 border-none" onClick={() => router.push('/test-runs/create')}>
                        <ListChecks />
                        <span className="text-xs font-medium">Create Run</span>
                    </Button>
                    <Button variant="outline" className="flex flex-col items-center gap-2 h-fit [&_svg]:!h-6 [&_svg]:!w-6 bg-emerald-500/10 hover:bg-emerald-500/25 text-emerald-500 hover:text-emerald-400 border-none" onClick={() => router.push('/template-test-cases/create')}>
                        <Blocks />
                        <span className="text-xs font-medium">Create Template</span>
                    </Button>
                    <Button variant="outline" className="flex flex-col items-center gap-2 h-fit [&_svg]:!h-6 [&_svg]:!w-6 bg-emerald-500/10 hover:bg-emerald-500/25 text-emerald-500 hover:text-emerald-400 border-none" onClick={() => router.push('/reports')}>
                        <FileCheck />
                        <span className="text-xs font-medium">View Reports</span>
                    </Button>
                </div>
            </CardContent>
        </Card>
    )
}