// Campo honeypot: un umano non lo vede né lo compila, un bot che riempie
// automaticamente tutti i campi del form sì.
export function isBot(body) {
  return typeof body?.sito_web === 'string' && body.sito_web.trim() !== '';
}
