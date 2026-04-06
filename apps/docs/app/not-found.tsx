import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <p
        className="text-6xl font-bold"
        style={{ color: '#22d3ee' }}
      >
        404
      </p>
      <h1
        className="text-2xl font-semibold"
        style={{ color: '#f1f5f9' }}
      >
        Page Not Found
      </h1>
      <p
        className="max-w-md"
        style={{ color: '#94a3b8' }}
      >
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <Link
        href="/docs"
        className="mt-4 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
        style={{
          backgroundColor: '#22d3ee',
          color: '#06080c',
        }}
      >
        Back to Docs
      </Link>
    </div>
  );
}
