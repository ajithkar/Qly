import PropTypes from 'prop-types';
import { Bell, ListOrdered, QrCode } from 'lucide-react';

const STEPS = [
  {
    icon: QrCode,
    title: 'Scan the QR at reception',
    body: 'No sign-up, no download — just point your camera at the code.',
  },
  {
    icon: ListOrdered,
    title: 'Watch your place in line update',
    body: 'Your position and wait time update automatically as the queue moves.',
  },
  {
    icon: Bell,
    title: "Get a notification when it's your turn",
    body: 'Step away and come back — we’ll let you know when to head in.',
  },
];

function Step({ icon: Icon, title, body, index }) {
  return (
    <div className="relative flex flex-1 flex-col items-center text-center">
      <span className="relative z-10 flex h-14 w-14 items-center justify-center rounded-full bg-signal/8 text-signal">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </span>
      <p className="mt-4 font-mono text-xs tabular-nums text-muted">{`0${index + 1}`}</p>
      <p className="mt-1 text-base font-semibold text-ink">{title}</p>
      <p className="mt-1.5 max-w-[28ch] text-sm leading-[1.65] text-secondary">{body}</p>
    </div>
  );
}
Step.propTypes = {
  icon: PropTypes.elementType.isRequired,
  title: PropTypes.string.isRequired,
  body: PropTypes.string.isRequired,
  index: PropTypes.number.isRequired,
};

export function HowItWorks() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-24">
      <h2 className="text-center text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
        How it works
      </h2>
      <div className="relative mt-12 flex flex-col gap-10 sm:flex-row sm:gap-6">
        <div className="absolute left-0 right-0 top-7 hidden h-px bg-line sm:block" aria-hidden="true" />
        {STEPS.map((step, index) => (
          <Step key={step.title} {...step} index={index} />
        ))}
      </div>
    </section>
  );
}
