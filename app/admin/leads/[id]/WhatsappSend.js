'use client';

import { markLinkSent } from '../../actions';

// Link normale a wa.me (si apre l'app di WhatsApp); in parallelo la lead passa a "link inviato".
export default function WhatsappSend({ id, href }) {
  return (
    <a
      className="btn btn-green btn-block"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => { markLinkSent(id); }}
    >
      Invia via WhatsApp
    </a>
  );
}
