import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="text-6xl font-bold text-fd-muted-foreground">404</p>
      <h1 className="text-2xl font-semibold">Page Not Found</h1>
      <p className="text-fd-muted-foreground max-w-md">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <Link
        href="/docs"
        className="mt-4 rounded-lg bg-fd-primary px-4 py-2 text-sm font-medium text-fd-primary-foreground transition-colors hover:bg-fd-primary/90"
      >
        Back to Docs
      </Link>
    </div>
  );
}
