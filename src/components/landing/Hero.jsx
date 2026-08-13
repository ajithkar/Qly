import { Link } from 'react-router-dom';
import PropTypes from 'prop-types';
import { ArrowRight, Lock, Smartphone, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { LiveTokenCard } from './LiveTokenCard';

const TRUST_ITEMS = [
  { icon: WifiOff, label: 'No app to install' },
  { icon: Smartphone, label: 'Works on any phone' },
  { icon: Lock, label: 'Your details stay private' },
];

export function Hero({ onSignIn }) {
  return (
    <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:grid lg:grid-cols-[55%_45%] lg:items-center lg:gap-12 lg:py-24">
      <div>
        <span className="inline-flex items-center rounded-full bg-signal/10 px-3 py-1 text-xs font-medium text-signal">
          For clinics &amp; hospitals
        </span>
        <h1 className="mt-4 max-w-[16ch] text-[32px] font-semibold leading-[1.1] tracking-tight text-ink sm:text-[34px] lg:max-w-none lg:text-[52px]">
          Wait for the doctor from anywhere, not the waiting room.
        </h1>
        <p className="mt-5 max-w-[52ch] text-base leading-[1.65] text-secondary sm:text-lg">
          Scan the QR at reception, get your token, and track your turn on
          your phone. We&apos;ll tell you when to come in.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link to="/find">
            <Button size="lg" className="min-h-11 w-full sm:w-auto">
              Find a Clinic near you
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </Link>
          <Button
            variant="secondary" size="lg" className="min-h-11 w-full sm:w-auto"
            onClick={onSignIn}
          >
            I Run a Clinic
          </Button>
        </div>

        <ul className="mt-6 flex flex-col flex-wrap gap-x-6 gap-y-2 text-sm text-muted sm:flex-row sm:items-center">
          {TRUST_ITEMS.map((item) => (
            <li key={item.label} className="flex items-center gap-2">
              <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              {item.label}
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-10 lg:mt-0">
        <LiveTokenCard />
      </div>
    </section>
  );
}

Hero.propTypes = {
  onSignIn: PropTypes.func.isRequired,
};
