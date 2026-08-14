/**
 * Minimal event tracking so CTA/funnel performance is measurable.
 *
 * No analytics SDK is installed or configured for this project. This pushes
 * to `window.dataLayer` (the de-facto standard queue GA4/GTM and most tag
 * managers already read) if one exists — a harmless no-op otherwise — and
 * always logs in dev, so a real destination can be wired in later without
 * touching any call site.
 */
export function trackEvent(name, props = {}) {
  const event = { event: name, ...props };

  if (typeof window !== 'undefined') {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(event);
  }

  if (import.meta.env.DEV) {
    console.debug('[track]', name, props);
  }
}
