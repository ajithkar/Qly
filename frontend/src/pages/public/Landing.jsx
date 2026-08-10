import { ClinicsSection } from '@/components/landing/ClinicsSection';
import { Footer } from '@/components/landing/Footer';
import { Header } from '@/components/landing/Header';
import { Hero } from '@/components/landing/Hero';
import { HowItWorks } from '@/components/landing/HowItWorks';
import { ReassuranceStrip } from '@/components/landing/ReassuranceStrip';
import { TrustRow } from '@/components/landing/TrustRow';

/**
 * Two audiences, patient content first: a patient/attendant looking for
 * reassurance and one obvious action, then the clinic-owner pitch below.
 * See src/components/landing/ for the section components.
 */
export default function Landing() {
  return (
    <div className="min-h-screen bg-paper">
      <Header />
      <main>
        <Hero />
        <HowItWorks />
        <ReassuranceStrip />
        <ClinicsSection />
        <TrustRow />
      </main>
      <Footer />
    </div>
  );
}
