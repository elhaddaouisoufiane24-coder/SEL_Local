// Helper condiviso per chiamare l'API v2 di Cal.com lato server.
// La CAL_API_KEY non deve mai arrivare al browser: tutte le chiamate passano
// da qui, dentro le nostre serverless function.
export const CAL_EVENT_TYPE_ID = 6603507; // ispezione-auto-con-cliente
const CAL_API_BASE = 'https://api.cal.com/v2';

export async function calFetch(path, { method = 'GET', body, apiVersion = '2024-08-13' } = {}) {
  const response = await fetch(`${CAL_API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.CAL_API_KEY}`,
      'cal-api-version': apiVersion,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}
