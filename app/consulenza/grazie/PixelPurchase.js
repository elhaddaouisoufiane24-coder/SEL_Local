'use client';

import Script from 'next/script';

// Banner cookie della landing + evento Purchase, inviato solo con il consenso marketing
// e una volta sola per sessione di pagamento (un ricaricamento non lo ripete).
export default function PixelPurchase({ sessionId, value }) {
  function onLoad() {
    window.AIConsent?.onMarketing(() => {
      const key = `ai_purchase_${sessionId}`;
      try {
        if (sessionStorage.getItem(key)) return;
        sessionStorage.setItem(key, '1');
      } catch {
        // sessionStorage non disponibile: si invia comunque una volta per caricamento
      }
      window.AIConsent.track('Purchase', { value, currency: 'EUR', content_name: 'Consulenza scelta auto' });
    });
  }
  return <Script src="/consent.js" strategy="afterInteractive" onLoad={onLoad} />;
}
