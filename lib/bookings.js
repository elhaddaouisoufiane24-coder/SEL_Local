import 'server-only';
import { adminClient } from '@/lib/supabase/admin';
import { notifyAdmin } from '@/lib/email';
import { formatDateTime } from '@/lib/format';

async function findLead(ev) {
  const db = adminClient();
  if (ev.leadId) {
    const { data, error } = await db.from('leads').select('*').eq('id', ev.leadId).maybeSingle();
    if (error) throw error;
    if (data) return data;
  }
  const uids = [ev.uid, ev.previousUid].filter(Boolean);
  if (uids.length) {
    const { data, error } = await db.from('leads').select('*').in('calcom_booking_uid', uids).limit(1);
    if (error) throw error;
    if (data?.[0]) return data[0];
  }
  if (ev.type !== 'BOOKING_CANCELLED' && ev.attendeeEmail) {
    // Ultima spiaggia: stessa email di una lead pagata e non ancora prenotata.
    const { data, error } = await db
      .from('leads')
      .select('*')
      .ilike('email', ev.attendeeEmail)
      .eq('stato', 'pagato')
      .order('pagato_at', { ascending: false })
      .limit(1);
    if (error) throw error;
    if (data?.[0]) return data[0];
  }
  return null;
}

/** Applica un evento Cal.com (gia' verificato e parsato) alla lead corrispondente. */
export async function handleCalEvent(ev) {
  // Eventi che non ci riguardano (es. PING del test webhook): niente accesso al database.
  if (!['BOOKING_CREATED', 'BOOKING_RESCHEDULED', 'BOOKING_CANCELLED'].includes(ev.type)) {
    return { handled: 'ignored' };
  }
  const db = adminClient();
  const lead = await findLead(ev);
  const quando = ev.startTime ? formatDateTime(ev.startTime) : 'n/d';

  if (ev.type === 'BOOKING_CANCELLED') {
    // Si agisce solo se e' la prenotazione attualmente collegata (la disdetta della
    // vecchia prenotazione dopo una riprogrammazione va ignorata).
    if (!lead || !ev.uid || lead.calcom_booking_uid !== ev.uid) return { handled: 'ignored' };
    const { error: cancelErr } = await db
      .from('leads')
      .update({
        stato: lead.stato === 'prenotato' ? 'pagato' : lead.stato,
        calcom_booking_uid: null,
        data_ora_appuntamento: null,
      })
      .eq('id', lead.id);
    if (cancelErr) throw cancelErr;
    await notifyAdmin({
      subject: `Appuntamento annullato: ${lead.nome} ${lead.cognome}`,
      title: 'Appuntamento annullato',
      rows: [['Cliente', `${lead.nome} ${lead.cognome}`], ['Era previsto', formatDateTime(lead.data_ora_appuntamento)], ['Motivo', ev.reason || 'non indicato']],
      leadId: lead.id,
      note: 'La lead è tornata "pagato": il cliente può scegliere una nuova data dallo stesso link.',
    });
    return { handled: 'cancelled' };
  }

  if (ev.type !== 'BOOKING_CREATED' && ev.type !== 'BOOKING_RESCHEDULED') return { handled: 'ignored' };

  if (!lead) {
    await notifyAdmin({
      subject: 'Prenotazione Cal.com non collegata a nessuna lead',
      title: 'Prenotazione non collegata',
      rows: [['Nome', ev.attendeeName || ''], ['Email', ev.attendeeEmail || ''], ['Quando', quando], ['uid', ev.uid || '']],
      note: 'Nessuna lead corrispondente: la prenotazione potrebbe essere stata fatta senza passare da /prenota. Verificala in Cal.com.',
    });
    return { handled: 'unlinked' };
  }

  if (!['pagato', 'prenotato', 'completato'].includes(lead.stato)) {
    await notifyAdmin({
      subject: `Prenotazione SENZA pagamento: ${lead.nome} ${lead.cognome}`,
      title: 'Prenotazione senza pagamento',
      rows: [['Cliente', `${lead.nome} ${lead.cognome}`], ['Stato lead', lead.stato], ['Quando', quando]],
      leadId: lead.id,
      note: 'La prenotazione NON è stata collegata alla lead perché il pagamento non risulta. Cancellala in Cal.com se non è legittima.',
    });
    return { handled: 'unpaid' };
  }

  if (lead.calcom_booking_uid === ev.uid && lead.data_ora_appuntamento && ev.startTime &&
      new Date(lead.data_ora_appuntamento).getTime() === new Date(ev.startTime).getTime()) {
    return { handled: 'duplicate' }; // retry dello stesso webhook
  }

  const { error: bookErr } = await db
    .from('leads')
    .update({
      stato: lead.stato === 'completato' ? 'completato' : 'prenotato',
      calcom_booking_uid: ev.uid,
      data_ora_appuntamento: ev.startTime,
    })
    .eq('id', lead.id);
  if (bookErr) throw bookErr;

  const riprogrammato = ev.type === 'BOOKING_RESCHEDULED';
  await notifyAdmin({
    subject: `${riprogrammato ? 'Appuntamento spostato' : 'Nuovo appuntamento'}: ${lead.nome} ${lead.cognome}`,
    title: riprogrammato ? 'Appuntamento riprogrammato' : 'Nuovo appuntamento prenotato',
    rows: [['Cliente', `${lead.nome} ${lead.cognome}`], ['Auto', `${lead.marca} ${lead.modello} ${lead.anno}`], ['Comune', lead.comune_auto], ['Quando', quando]],
    leadId: lead.id,
  });
  return { handled: riprogrammato ? 'rescheduled' : 'created' };
}
