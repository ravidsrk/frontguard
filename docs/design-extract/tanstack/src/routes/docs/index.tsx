import { createFileRoute, redirect } from '@tanstack/react-router'

// /docs has no content of its own — send it to the first article.
export const Route = createFileRoute('/docs/')({
  beforeLoad: () => {
    throw redirect({ to: '/docs/$slug', params: { slug: 'intro' } })
  },
})
