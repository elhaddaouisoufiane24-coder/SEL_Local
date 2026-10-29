# AutoInspecta

Landing statica + backend e pannello di gestione delle richieste di ispezione.

- **Landing**: `public/index.html` (servita su `/`, invariata nell'aspetto).
- **Next.js (App Router)**: API, pannello `/admin`, pagina pubblica `/prenota/<token>`.
- **Supabase**: database Postgres + login admin. **Stripe**: pagamento. **Cal.com**: calendario. **Resend**: email.

## Come funziona il flusso

1. Il cliente compila il form → `POST /api/leads` → riga in `leads` + email a te e conferma al cliente.
2. Dal pannello `/admin` (anche da telefono) apri la scheda, imposti il **rimborso km**, premi **Genera link** e lo invii via email o WhatsApp.
3. Il cliente apre `/prenota/<token>`, vede il riepilogo e paga con Stripe Checkout (l'importo lo legge sempre il server dal database).
4. Webhook Stripe → lead `pagato`. Il cliente torna sulla stessa pagina e vede il calendario Cal.com incorporato (dati già compilati).
5. Webhook Cal.com → lead `prenotato` con data e ora. Riprogrammazioni e disdette aggiornano la scheda e ti avvisano via email.

Il link vale 7 giorni per chi **non ha ancora pagato**. Dopo il pagamento resta sempre valido, così chi chiude la finestra può tornare a scegliere la data.

## Avvio in locale

Serve Node 20 o superiore.

```bash
npm install
cp .env.example .env.local     # poi compila i valori (vedi sotto)
npm run dev                    # http://localhost:3000
npm test                       # test su validazione e firme webhook
```

Webhook in locale: Stripe CLI (`stripe listen --forward-to localhost:3000/api/stripe/webhook`, copia il `whsec_...` stampato in `STRIPE_WEBHOOK_SECRET`). Per Cal.com in locale serve un tunnel (es. `cloudflared` o `ngrok`) oppure prova sul deploy di anteprima Vercel.

## Variabili d'ambiente

Tutte in `.env.example` (mai nel codice). Su Vercel: *Project → Settings → Environment Variables*.

| Variabile | Cosa è |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | URL pubblico, senza slash finale |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → API → `service_role`. **Solo server, segreta** |
| `STRIPE_SECRET_KEY` | `sk_test_...` poi `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` del webhook (uno per test, uno per live) |
| `NEXT_PUBLIC_CALCOM_LINK` | `username/slug-evento` |
| `CALCOM_WEBHOOK_SECRET` | secret che scegli tu nel webhook Cal.com |
| `RESEND_API_KEY`, `EMAIL_FROM` | Resend; mittente su dominio verificato |
| `ADMIN_NOTIFY_EMAIL` | dove ricevi le notifiche |
| `IP_HASH_SALT` | stringa casuale lunga (si salva solo l'hash dell'IP) |

## Configurazione dei servizi

### 1. Supabase
1. Crea un progetto.
2. *SQL Editor* → incolla ed esegui `supabase/migrations/001_init.sql`.
3. Autorizza la tua email (sostituisci con la tua):
   ```sql
   insert into public.admin_emails (email) values ('tua@email.it');
   ```
4. *Authentication → Providers → Email*: lascia attivo Email e **disattiva "Allow new users to sign up"** (niente registrazione pubblica).
5. *Authentication → Users → Add user*: crea il tuo utente (email + password, spunta "Auto Confirm").
6. Copia URL, anon key e service role key nelle variabili d'ambiente.

La sicurezza è a due livelli: signup disattivato **e** RLS che consente lettura/scrittura solo a chi è in `admin_emails`. Il pubblico non ha alcuna policy: i lead entrano solo da `/api/leads` (service role, lato server).

### 2. Stripe
1. Resta in **modalità test** (interruttore in alto nella dashboard).
2. *Developers → API keys*: copia la secret key `sk_test_...`.
3. *Developers → Webhooks → Add endpoint*: URL `https://<dominio>/api/stripe/webhook`, eventi:
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `charge.refunded`.
   Copia il *Signing secret* in `STRIPE_WEBHOOK_SECRET`.
4. *Settings → Payment methods*: attiva carte, Apple Pay e Google Pay (Checkout li mostra in automatico).

### 3. Cal.com
Crea un **tipo di evento dedicato** (es. `ispezione`) con queste impostazioni:
- **Pagamento Stripe: DISATTIVATO** (il cliente paga prima, su `/prenota`).
- **Richiedi conferma: DISATTIVATO** (altrimenti il cliente riceve l'email "in attesa di approvazione").
- **Nascosto** dal profilo (*Advanced → Hide from profile*). Attenzione: "nascosto" non è "protetto": chi conosce il link diretto può prenotare. Per questo il webhook non collega e ti segnala ogni prenotazione senza pagamento.
- Domanda di prenotazione **Telefono** (per il precompilamento).
- Durata e disponibilità a tua scelta.

Poi *Settings → Developer → Webhooks → New*:
- Subscriber URL: `https://<dominio>/api/calcom/webhook`
- Eventi: `BOOKING_CREATED`, `BOOKING_RESCHEDULED`, `BOOKING_CANCELLED`
- **Secret**: scegli una stringa lunga e copiala in `CALCOM_WEBHOOK_SECRET`.

`NEXT_PUBLIC_CALCOM_LINK` è `username/slug-evento` (la parte dopo `cal.com/`). Cal.com invia da solo la conferma con l'invito calendario: per questo non mandiamo una seconda email al cliente dopo la prenotazione (ricevi tu la notifica).

### 4. Resend
1. *Domains → Add domain* → `autoinspecta.it` e aggiungi al DNS i record richiesti (SPF, DKIM).
2. Attendi lo stato *Verified*.
3. *API Keys → Create* → `RESEND_API_KEY`. Imposta `EMAIL_FROM` (es. `AutoInspecta <noreply@autoinspecta.it>`).

### 5. Vercel
1. *Project → Settings → General → Framework Preset*: **Next.js** (finora era "Other").
2. Inserisci tutte le variabili d'ambiente.
3. Lavora su un branch: Vercel crea un deploy di anteprima con un URL tutto suo. Collauda lì (con chiavi di test) prima di fare merge su `main`.
4. Nota: il piano Hobby è per uso non commerciale; per un'attività con pagamenti serve Pro.

## Collaudo completo (modalità test)

1. Compila il form della landing (spunta la privacy) → ricevi la mail e vedi la lead in `/admin`.
2. Apri la scheda, imposta il rimborso, **Genera link**, apri il link.
3. **Paga e scegli la data** → carta `4242 4242 4242 4242`, scadenza futura, CVC qualsiasi.
4. Torni su `/prenota/<token>`: lead `pagato`, calendario visibile con nome/email/telefono già compilati.
5. Prenota uno slot: la lead diventa `prenotato` con data e ora, ricevi la mail.
6. Prova riprogramma e disdetta da Cal.com: la scheda si aggiorna e ricevi le mail.
7. Prova anche: link scaduto (imposta `token_scadenza` nel passato), link di una lead già prenotata, rimborso da Stripe (stato `rimborsato`).

## Passaggio da test a live

1. Stripe: disattiva la modalità test, crea un **nuovo webhook** live (stesso URL e stessi eventi) e prendi il suo `whsec_...`.
2. Su Vercel (ambiente *Production*) sostituisci `STRIPE_SECRET_KEY` con `sk_live_...` e `STRIPE_WEBHOOK_SECRET` con quello live.
3. Verifica `NEXT_PUBLIC_SITE_URL` (dominio definitivo) e il dominio Resend.
4. Rifai un pagamento reale di prova e rimborsalo da Stripe.
5. Compila i campi tra `[ ]` in `public/privacy.html` (titolare, P.IVA, conservazione) e fai rivedere il testo da un consulente.

## Struttura

```
public/            landing statica, privacy.html, asset
app/api/leads      riceve il form (validazione, honeypot, rate limit su DB)
app/api/stripe     webhook Stripe (firma verificata)
app/api/calcom     webhook Cal.com (firma HMAC verificata)
app/admin          pannello (login, lista, scheda)
app/prenota/[token] pagina pubblica di pagamento + calendario
lib/               validazione, email, stripe, prenotazioni, client Supabase
supabase/          migrazione SQL
tests/             test (npm test)
legacy/            vecchie funzioni Vercel e file non più usati (non deployati)
```
