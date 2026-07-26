import { Link } from 'react-router-dom';
import { ArrowRight, QrCode, Bell, Clock } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { CallBoard } from '@/components/CallBoard';
import { useTheme } from '@/hooks/useTheme';

/**
 * The hero leads with the product's own artifact — a live-looking call board —
 * rather than a stock illustration or a headline stat. Anyone who has waited
 * in a clinic recognises it instantly, which does the explaining for us.
 */
export default function Landing() {
  const { theme, toggle } = useTheme();

  return (
    <div className="min-h-screen bg-paper">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <span className="font-mono text-sm font-bold tracking-tight">Qly</span>
        <nav className="flex items-center gap-2">
          <button
            onClick={toggle}
            className="rounded-card px-3 py-1.5 text-sm text-muted hover:text-ink"
          >
            {theme === 'dark' ? 'Light' : 'Dark'}
          </button>
          <Link to="/login">
            <Button variant="ghost" size="sm">Vendor sign in</Button>
          </Link>
          <Link to="/find">
            <Button size="sm">Join a queue</Button>
          </Link>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-20">
        <section className="grid items-center gap-12 py-12 lg:grid-cols-2 lg:py-20">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-signal">
              Queue &amp; appointment management
            </p>
            <h1 className="mt-4 text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl">
              Stop making people
              <br />
              stand in line.
            </h1>
            <p className="mt-5 max-w-md text-base leading-relaxed text-muted">
              Customers scan a code, take a token, and watch their position from
              wherever they are. You call the next person from one screen.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/find">
                <Button size="lg">
                  Find a place near you
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              </Link>
              <Link to="/register">
                <Button variant="secondary" size="lg">List your business</Button>
              </Link>
            </div>
          </div>

          <div className="space-y-3">
            <CallBoard token={{ token_number: 'A014', customer_name: 'Now at counter 3' }} />
            <div className="grid grid-cols-3 gap-3">
              {[
                { value: 'A015', label: 'Next' },
                { value: '7', label: 'Waiting' },
                { value: '12m', label: 'Est. wait' },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-card border border-line bg-surface px-4 py-3 text-center"
                >
                  <p className="font-mono text-xl font-bold tabular">{item.value}</p>
                  <p className="mt-0.5 text-xs text-muted">{item.label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-6 border-t border-line py-14 sm:grid-cols-3">
          {[
            {
              icon: QrCode,
              title: 'Scan and join',
              body: 'A code at the door is the whole sign-up. No app to install.',
            },
            {
              icon: Clock,
              title: 'A wait time that updates',
              body: 'Estimates come from how long service is actually taking today, not a guess.',
            },
            {
              icon: Bell,
              title: 'Told when it is their turn',
              body: 'Customers get a notification instead of watching a board.',
            },
          ].map((feature) => (
            <div key={feature.title}>
              <feature.icon className="h-5 w-5 text-signal" aria-hidden="true" />
              <h2 className="mt-3 text-sm font-semibold">{feature.title}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{feature.body}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t border-line py-6">
        <p className="mx-auto max-w-6xl px-6 text-xs text-muted">
          Qly — queue and appointment management.
        </p>
      </footer>
    </div>
  );
}
