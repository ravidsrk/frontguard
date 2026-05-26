const plans = [
  {
    name: 'Starter',
    price: '$0',
    period: '/mo',
    description: 'For side projects and small teams',
    features: ['3 routes', '1 viewport', 'Chromium only', 'Community support'],
    cta: 'Start Free',
    highlighted: false,
  },
  {
    name: 'Pro',
    price: '$29',
    period: '/mo',
    description: 'For growing teams shipping daily',
    features: [
      'Unlimited routes',
      '5 viewports',
      'All browsers',
      'AI analysis',
      'Priority support',
    ],
    cta: 'Start Trial',
    highlighted: true,
  },
  {
    name: 'Enterprise',
    price: '$99',
    period: '/mo',
    description: 'For large orgs with custom needs',
    features: [
      'Unlimited everything',
      'Custom viewports',
      'Self-hosted option',
      'SLA & dedicated support',
      'SSO & audit logs',
    ],
    cta: 'Contact Sales',
    highlighted: false,
  },
];

export default function Pricing() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-24">
      <div className="mb-16 text-center">
        <h1 className="mb-4 text-4xl font-extrabold tracking-tight sm:text-5xl">
          Simple, transparent pricing
        </h1>
        <p className="text-lg text-gray-400">
          Start free. Upgrade when you need more power.
        </p>
      </div>

      <div className="grid gap-8 sm:grid-cols-3">
        {plans.map((plan) => (
          <div
            key={plan.name}
            className={`rounded-2xl border p-8 ${
              plan.highlighted
                ? 'border-indigo-500 bg-indigo-500/5 ring-1 ring-indigo-500'
                : 'border-gray-800 bg-gray-900'
            }`}
          >
            {plan.highlighted && (
              <div className="mb-4 inline-block rounded-full bg-indigo-600 px-3 py-0.5 text-xs font-semibold text-white">
                Most Popular
              </div>
            )}
            <h2 className="text-xl font-bold text-white">{plan.name}</h2>
            <p className="mt-1 text-sm text-gray-400">{plan.description}</p>
            <div className="mt-6 flex items-baseline gap-1">
              <span className="text-4xl font-extrabold text-white">{plan.price}</span>
              <span className="text-gray-500">{plan.period}</span>
            </div>
            <ul className="mt-8 space-y-3">
              {plan.features.map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm text-gray-300">
                  <span className="text-indigo-400">✓</span> {f}
                </li>
              ))}
            </ul>
            <a
              href="#"
              className={`mt-8 block rounded-lg py-2.5 text-center font-semibold transition ${
                plan.highlighted
                  ? 'bg-indigo-600 text-white hover:bg-indigo-500'
                  : 'border border-gray-700 text-gray-300 hover:border-gray-500'
              }`}
            >
              {plan.cta}
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
