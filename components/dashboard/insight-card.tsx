import Link from "next/link";
import { Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function InsightCard({
  summary,
  insights,
  scope,
  badge = "Insight",
  badgeTone = "secondary",
  evidenceHref,
}: {
  summary: string;
  insights: string[];
  scope: string;
  badge?: string;
  badgeTone?: "secondary" | "warning" | "success";
  evidenceHref: string;
}) {
  return (
    <Card className="border-l-4 border-l-primary">
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            AI analysis and insight
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Generated from the records visible to this role.
          </p>
        </div>
        <Badge variant={badgeTone}>{badge}</Badge>
      </CardHeader>
      <CardContent>
        <p className="text-sm leading-6">{summary}</p>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
          {insights.map((insight) => (
            <li key={insight}>{insight}</li>
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
          <span>{scope}</span>
          <Link href={evidenceHref} className="font-medium text-primary hover:underline">
            View evidence
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
