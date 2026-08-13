import { useState } from 'react';

import { VendorSignInModal } from '@/components/auth/VendorSignInModal';
import { ClinicsSection } from '@/components/landing/ClinicsSection';
import { Footer } from '@/components/landing/Footer';
import { Header } from '@/components/landing/Header';
import { Hero } from '@/components/landing/Hero';
import { HowItWorks } from '@/components/landing/HowItWorks';
import { PricingSection } from '@/components/landing/PricingSection';
import { ReassuranceStrip } from '@/components/landing/ReassuranceStrip';
import { TrustRow } from '@/components/landing/TrustRow';

/**
 * Two audiences, patient content first: a patient/attendant looking for
 * reassurance and one obvious action, then the clinic-owner pitch below.
 * See src/components/landing/ for the section components.
 */
export default function Landing() {
  const [signInOpen, setSignInOpen] = useState(false);
  const onSignIn = () => setSignInOpen(true);

  return (
    <div className="min-h-screen bg-paper">
      <Header onSignIn={onSignIn} />
      <main>
        <Hero onSignIn={onSignIn} />
        <HowItWorks />
        <ReassuranceStrip />
        <ClinicsSection />
        <PricingSection />
        <TrustRow />
      </main>
      <Footer onSignIn={onSignIn} />
      <VendorSignInModal open={signInOpen} onClose={() => setSignInOpen(false)} />
    </div>
  );
}
