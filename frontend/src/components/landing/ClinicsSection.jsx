import { Link } from 'react-router-dom';
import PropTypes from 'prop-types';
import {
  BarChart3, CalendarCheck2, MonitorPlay, Users,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';

const BENEFITS = [
  {
    icon: Users,
    title: 'Fewer people crowding reception',
    body: 'Patients wait wherever they like instead of standing at the counter.',
  },
  {
    icon: MonitorPlay,
    title: 'Call the next patient from one screen',
    body: 'The front desk runs the whole queue without touching a spreadsheet.',
  },
  {
    icon: CalendarCheck2,
    title: 'Appointments and walk-ins in the same queue',
    body: 'Booked slots and walk-ins share one schedule, so nothing double-books.',
  },
  {
    icon: BarChart3,
    title: 'See average wait and no-show rates',
    body: 'Know where time gets lost, by provider and by day.',
  },
];

function Benefit({ icon: Icon, title, body }) {
  return (
    <div className="rounded-card border border-line bg-surface p-6 shadow-card">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-signal/8 text-signal">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <p className="mt-4 text-base font-semibold text-ink">{title}</p>
      <p className="mt-1.5 text-sm leading-[1.65] text-secondary">{body}</p>
    </div>
  );
}
Benefit.propTypes = {
  icon: PropTypes.elementType.isRequired,
  title: PropTypes.string.isRequired,
  body: PropTypes.string.isRequired,
};

export function ClinicsSection() {
  return (
    <section id="for-clinics" className="bg-paper py-20 lg:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            For clinics and hospitals
          </h2>
          <p className="mt-3 text-base leading-[1.65] text-secondary">
            One queue, run from a front desk instead of a waiting room.
          </p>
        </div>

        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {BENEFITS.map((benefit) => (
            <Benefit key={benefit.title} {...benefit} />
          ))}
        </div>

        <div className="mt-10 text-center">
          <Link to="/demo">
            <Button variant="secondary" size="lg" className="min-h-11">See a demo</Button>
          </Link>
        </div>
      </div>
    </section>
  );
}
