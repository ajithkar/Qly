import { Lock, ShieldCheck, UserCog } from 'lucide-react';

const CLAIMS = [
  { icon: Lock, label: 'Patient data encrypted in transit' },
  { icon: ShieldCheck, label: 'No medical records stored' },
  { icon: UserCog, label: 'Role-based staff access' },
];

export function TrustRow() {
  return (
    <section className="border-t border-line py-8">
      <ul className="flex flex-col flex-wrap items-center justify-center gap-x-8 gap-y-2 px-4 text-center text-sm text-muted sm:flex-row sm:px-6">
        {CLAIMS.map((claim) => (
          <li key={claim.label} className="flex items-center gap-2">
            <claim.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            {claim.label}
          </li>
        ))}
      </ul>
    </section>
  );
}
