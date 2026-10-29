'use client';

import Cal from '@calcom/embed-react';

// Calendario Cal.com inline. Nome, email e telefono sono precompilati; lead_id viaggia
// come metadata e torna nel webhook BOOKING_CREATED.
export default function CalEmbed({ calLink, leadId, name, email, phone }) {
  return (
    <div className="cal-frame">
      <Cal
        calLink={calLink}
        style={{ width: '100%', height: '100%', minHeight: 540, overflow: 'auto' }}
        config={{
          layout: 'month_view',
          theme: 'light',
          name,
          email,
          attendeePhoneNumber: phone,
          'metadata[lead_id]': leadId,
        }}
      />
    </div>
  );
}
