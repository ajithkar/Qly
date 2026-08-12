import { Link } from 'react-router-dom';
import PropTypes from 'prop-types';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';

const PLANS = [
  {
    code: 'free',
    name: 'Free',
    price: '$0',
    period: '/mo',
    features: ['1 branch', '2 providers', '2 staff accounts', '200 tokens / mo'],
    cta: { label: 'Get started', to: '/demo' },
  },
  {
    code: 'starter',
    name: 'Starter',
    price: '$9',
    period: '/mo',
    features: ['2 branches', '10 providers', '10 staff accounts', '5,000 tokens / mo', 'Reports & export'],
    cta: { label: 'Get started', to: '/demo' },
  },
  {
    code: 'business',
    name: 'Business',
    price: '$30',
    period: '/mo',
    features: ['10 branches', '50 providers', '50 staff accounts', '50,000 tokens / mo', 'Reports & export', 'API access'],
    cta: { label: 'Get started', to: '/demo' },
    highlighted: true,
  },
  {
    code: 'enterprise',
    name: 'Enterprise',
    price: 'Custom',
    features: ['Unlimited branches', 'Unlimited providers & staff', 'Unlimited tokens', 'Reports & export', 'API access', 'SSO'],
    cta: { label: 'Contact us', to: '/demo' },
  },
];

function PlanCard({ name, price, period, features, cta, highlighted }) {
  return (
    <div
      className={cn(
        'flex flex-col rounded-card border p-6 shadow-card',
        highlighted ? 'border-signal bg-surface ring-1 ring-signal' : 'border-line bg-surface',
      )}
    >
      <p className="text-sm font-semibold text-ink">{name}</p>
      <p className="mt-3 flex items-baseline gap-1">
        <span className="font-mono text-3xl font-bold tabular text-ink">{price}</span>
        {period && <span className="text-sm text-muted">{period}</span>}
      </p>
      <ul className="mt-6 flex-1 space-y-2.5">
        {features.map((feature) => (
          <li key={feature} className="flex items-start gap-2 text-sm text-secondary">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-jade" aria-hidden="true" />
            {feature}
          </li>
        ))}
      </ul>
      <Link to={cta.to} className="mt-6">
        <Button variant={highlighted ? 'primary' : 'secondary'} size="md" className="w-full">
          {cta.label}
        </Button>
      </Link>
    </div>
  );
}
PlanCard.propTypes = {
  name: PropTypes.string.isRequired,
  price: PropTypes.string.isRequired,
  period: PropTypes.string,
  features: PropTypes.arrayOf(PropTypes.string).isRequired,
  cta: PropTypes.shape({ label: PropTypes.string.isRequired, to: PropTypes.string.isRequired }).isRequired,
  highlighted: PropTypes.bool,
};

export function PricingSection() {
  return (
    <section className="bg-paper py-20 lg:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            Plans that grow with your clinic
          </h2>
          <p className="mt-3 text-base leading-[1.65] text-secondary">
            Start free, upgrade when you need more branches, staff, or reporting.
          </p>
        </div>

        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {PLANS.map((plan) => (
            <PlanCard key={plan.code} {...plan} />
          ))}
        </div>
      </div>
    </section>
  );
}
