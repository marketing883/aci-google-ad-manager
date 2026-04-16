import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface SkeletonFeedProps {
  /** Number of placeholder cards to render. Default 4. */
  count?: number;
}

/**
 * Placeholder stack for the Briefing feed. Replaces the bare
 * "Analyzing your data..." spinner with cards that visually match the
 * real FeedCard layout so there's no layout shift when data arrives.
 */
export function SkeletonFeed({ count = 4 }: SkeletonFeedProps) {
  return (
    <div className="space-y-3" aria-busy="true" aria-live="polite">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="overflow-hidden">
          <div className="flex">
            <Skeleton className="w-1 shrink-0 rounded-none" />
            <div className="flex-1 p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-4 w-4 rounded-full" />
                  <Skeleton className="h-4 w-48" />
                </div>
                <Skeleton className="h-3 w-12" />
              </div>
              <Skeleton className="ml-6 h-3 w-5/6" />
              <Skeleton className="ml-6 h-3 w-3/4" />
              <div className="ml-6 flex items-center justify-between pt-1">
                <div className="flex gap-1.5">
                  <Skeleton className="h-4 w-10 rounded-full" />
                  <Skeleton className="h-4 w-14 rounded-full" />
                </div>
                <Skeleton className="h-6 w-20 rounded-md" />
              </div>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

interface SkeletonMetricGridProps {
  count?: number;
}

/**
 * Placeholder for a row of MetricCards. Used above the feed while dashboard
 * data is loading.
 */
export function SkeletonMetricGrid({ count = 4 }: SkeletonMetricGridProps) {
  return (
    <div
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
      aria-busy="true"
      aria-live="polite"
    >
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="p-4">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-7 w-24" />
              <Skeleton className="h-3 w-28" />
            </div>
            <Skeleton className="h-8 w-8 rounded-md" />
          </div>
          <Skeleton className="mt-3 h-9 w-full" />
        </Card>
      ))}
    </div>
  );
}
