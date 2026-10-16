const team = [
  {
    name: 'Alex Chen',
    role: 'CEO & Co-Founder',
    bio: 'Previously engineering lead at Vercel. Passionate about developer tools.',
    avatar:
      "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 80'><rect width='80' height='80' rx='40' fill='%231f1c19'/><circle cx='40' cy='30' r='14' fill='%23e8862e'/><path d='M16 70c4-14 14-22 24-22s20 8 24 22' fill='%23e8862e'/></svg>",
  },
  {
    name: 'Sarah Miller',
    role: 'CTO & Co-Founder',
    bio: 'Ex-Google Chrome team. Built browser testing infrastructure at scale.',
    avatar:
      "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 80'><rect width='80' height='80' rx='40' fill='%231f1c19'/><circle cx='40' cy='30' r='14' fill='%23f59b45'/><path d='M16 70c4-14 14-22 24-22s20 8 24 22' fill='%23f59b45'/></svg>",
  },
  {
    name: 'James Park',
    role: 'Head of AI',
    bio: 'PhD in computer vision. Led visual search at Pinterest.',
    avatar:
      "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 80'><rect width='80' height='80' rx='40' fill='%231f1c19'/><circle cx='40' cy='30' r='14' fill='%234fb477'/><path d='M16 70c4-14 14-22 24-22s20 8 24 22' fill='%234fb477'/></svg>",
  },
  {
    name: 'Maria Rodriguez',
    role: 'Head of Design',
    bio: 'Design systems expert. Previously at Figma and Stripe.',
    avatar:
      "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 80'><rect width='80' height='80' rx='40' fill='%231f1c19'/><circle cx='40' cy='30' r='14' fill='%23f5f1ea'/><path d='M16 70c4-14 14-22 24-22s20 8 24 22' fill='%23f5f1ea'/></svg>",
  },
];

export default function About() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-24">
      {/* Mission */}
      <div className="mb-20 text-center">
        <h1 className="mb-4 text-4xl font-extrabold tracking-tight sm:text-5xl">
          About Acme Inc
        </h1>
        <p className="mx-auto max-w-2xl text-lg text-stone-400">
          We believe every frontend deploy should be visually verified. Our mission
          is to eliminate visual regressions from shipping to production — forever.
        </p>
      </div>

      {/* Stats */}
      <div className="mb-20 grid gap-6 sm:grid-cols-4 text-center">
        {[
          { stat: '10K+', label: 'Repos Protected' },
          { stat: '2M+', label: 'Screenshots Taken' },
          { stat: '50K+', label: 'Bugs Caught' },
          { stat: '99.9%', label: 'Uptime' },
        ].map(({ stat, label }) => (
          <div key={label} className="rounded-xl border border-stone-800 bg-stone-900 p-6">
            <div className="text-3xl font-extrabold text-amber-400">{stat}</div>
            <div className="mt-1 text-sm text-stone-500">{label}</div>
          </div>
        ))}
      </div>

      {/* Team */}
      <div className="mb-8 text-center">
        <h2 className="text-2xl font-bold text-white">Meet the Team</h2>
        <p className="mt-2 text-stone-400">
          The people building the future of visual testing.
        </p>
      </div>
      <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
        {team.map((person) => (
          <div
            key={person.name}
            className="rounded-xl border border-stone-800 bg-stone-900 p-6 text-center"
          >
            <img
              src={person.avatar}
              alt={person.name}
              className="mx-auto mb-4 h-20 w-20 rounded-full bg-stone-800"
            />
            <h3 className="font-semibold text-white">{person.name}</h3>
            <p className="text-sm text-amber-400">{person.role}</p>
            <p className="mt-2 text-xs text-stone-500">{person.bio}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
