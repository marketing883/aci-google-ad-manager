import Link from 'next/link';
import { FileQuestion, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <FileQuestion className="h-5 w-5" />
          </div>
          <CardTitle>Page not found</CardTitle>
          <CardDescription>
            That route doesn&apos;t exist. Check the URL or head back to the command center.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full">
            <Link href="/briefing">
              <Home className="h-4 w-4" />
              Back to Briefing
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
