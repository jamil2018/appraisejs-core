import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export const ExecutionHealthPanel = () => {
    return (
        <Card className="border-gray-600/10 bg-gray-600/10 w-full h-full">
            <CardHeader>
                <CardTitle className="text-primary">Execution Health</CardTitle>
                <CardDescription>Overview of execution health</CardDescription>
            </CardHeader>
            <CardContent>
                <div>Execution Health</div>
            </CardContent>
        </Card>
    )
}