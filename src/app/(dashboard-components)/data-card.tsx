'use client'
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle, CardHeader } from "@/components/ui/card";
import { ExternalLink } from "lucide-react";
import { useRouter } from "next/navigation";
export default function DataCard({ title, value, link }: { title: string, value: number, link: string }) {
    const router = useRouter()
    return (
        <Card className="h-fit border-gray-600/10 bg-gray-600/10">
            <CardHeader className="flex items-center justify-between flex-row">
                <CardTitle className={`text-normal font-normal ${value > 0 ? 'text-primary' : 'text-gray-400'}`}>{title}</CardTitle>
                <div className="flex items-center gap-2">
                    <Button variant="outline" className="text-primary hover:text-primary/80 px-2 py-1 bg-inherit border-gray-600/15 hover:bg-emerald-400/10"
                        disabled={value === 0}
                        onClick={() => router.push(link)}
                    >
                        <ExternalLink className="h-4 w-4" />
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="py-3 h-full">
                <div className={`text-6xl h-full flex items-center font-bold ${value > 0 ? 'text-primary' : 'text-gray-400'}`}>{value}</div>
            </CardContent>
        </Card>
    )
}