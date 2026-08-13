import { Car } from 'lucide-react';

export function ReassuranceStrip() {
  return (
    <section className="bg-signal/5">
      <div className="grid items-center gap-8 px-4 py-14 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:py-20">
        <p className="text-xl font-semibold leading-[1.4] tracking-tight text-ink sm:text-2xl">
          Sit in your car, run an errand, or wait at home. Qly holds your place.
        </p>
        <div
          role="img"
          aria-label="Illustration: a patient waiting comfortably at home while their phone shows their queue position"
          className="flex h-48 items-center justify-center rounded-card border border-dashed border-line bg-surface/60 text-center text-sm text-muted"
        >
          <span className="flex flex-col items-center gap-2 px-6">
            <Car className="h-6 w-6" aria-hidden="true" />
            Illustration placeholder — patient waiting comfortably away from the clinic
          </span>
        </div>
      </div>
    </section>
  );
}
