// AutoInspecta: banner cookie e Meta Pixel (Linee guida Garante, 10 giugno 2021).
// Il Pixel viene caricato SOLO dopo il consenso "marketing". Nessun consenso = nessuno
// script di Meta, nessun cookie _fbp/_fbc. La scelta resta in un cookie tecnico per 6 mesi.
// API: AIConsent.open() riapre le preferenze, AIConsent.track(evento, parametri) invia
// un evento standard solo se il Pixel è attivo, AIConsent.onMarketing(fn) esegue fn quando
// il Pixel si attiva.
(function(){
  "use strict";

  var PIXEL_ID = '926497990533064';
  var COOKIE = 'ai_consent';
  var VERSION = 1;                       // da incrementare se cambiano le finalità: il banner ricompare
  var MAX_AGE = 60 * 60 * 24 * 180;      // 6 mesi

  // ---- Scelta salvata ----
  function readChoice(){
    var m = document.cookie.match(new RegExp('(?:^|; )' + COOKIE + '=([^;]*)'));
    if(!m) return null;
    try {
      var c = JSON.parse(decodeURIComponent(m[1]));
      return c && c.v === VERSION ? c : null;
    } catch(e){ return null; }
  }

  function saveChoice(marketing){
    var c = { v: VERSION, marketing: !!marketing, ts: new Date().toISOString() };
    document.cookie = COOKIE + '=' + encodeURIComponent(JSON.stringify(c)) +
      '; Max-Age=' + MAX_AGE + '; Path=/; SameSite=Lax' + (location.protocol === 'https:' ? '; Secure' : '');
    return c;
  }

  // ---- Meta Pixel ----
  var pixelLoaded = false;
  var onMarketingQueue = [];

  function loadPixel(){
    if(pixelLoaded) return;
    pixelLoaded = true;
    /* eslint-disable */
    !function(f,b,e,v,n,t,s)
    {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};
    if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
    n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t,s)}(window, document,'script',
    'https://connect.facebook.net/en_US/fbevents.js');
    /* eslint-enable */
    window.fbq('init', PIXEL_ID);
    window.fbq('track', 'PageView');
    onMarketingQueue.splice(0).forEach(function(fn){ fn(); });
  }

  // Esegue fn appena il Pixel è attivo: subito se c'è già il consenso, oppure dopo l'"Accetta".
  function onMarketing(fn){
    if(pixelLoaded) fn(); else onMarketingQueue.push(fn);
  }

  // Alla revoca: si cancellano i cookie di prima parte di Meta e si ricarica la pagina,
  // così lo script già in memoria smette di girare.
  function removeMetaCookies(){
    var parts = location.hostname.split('.');
    var domains = [''];
    for(var i = 0; i < parts.length - 1; i++) domains.push('; Domain=.' + parts.slice(i).join('.'));
    ['_fbp', '_fbc'].forEach(function(name){
      domains.forEach(function(d){ document.cookie = name + '=; Max-Age=0; Path=/' + d; });
    });
  }

  function track(event, params){
    if(pixelLoaded && typeof window.fbq === 'function') window.fbq('track', event, params || {});
  }

  // ---- Banner ----
  var CSS = '' +
    '.ck-banner{position:fixed;left:16px;right:16px;bottom:16px;z-index:2147483000;max-width:640px;margin:0 auto;background:#fff;color:#1a1a1a;' +
      'border:1px solid rgba(0,0,0,0.1);border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,0.18);padding:20px 20px 16px;' +
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:14px;line-height:1.55;}' +
    '.ck-banner[hidden]{display:none;}' +
    '.ck-title{font-size:16px;font-weight:700;margin:0 32px 6px 0;}' +
    '.ck-text{margin:0 0 14px;color:#374151;}' +
    '.ck-text a{color:#2563eb;}' +
    '.ck-close{position:absolute;top:10px;right:10px;width:32px;height:32px;border:none;background:transparent;font-size:18px;color:#6b7280;cursor:pointer;border-radius:8px;}' +
    '.ck-close:hover{background:#f3f4f6;color:#1a1a1a;}' +
    '.ck-actions{display:flex;flex-wrap:wrap;gap:8px;}' +
    '.ck-btn{flex:1 1 140px;font:inherit;font-weight:600;padding:11px 16px;border-radius:999px;cursor:pointer;border:1.5px solid #2563eb;}' +
    '.ck-main{background:#2563eb;color:#fff;}' +
    '.ck-main:hover{background:#1d4ed8;border-color:#1d4ed8;}' +
    '.ck-link{flex:1 1 100%;background:transparent;border:none;color:#2563eb;padding:6px;text-decoration:underline;font-weight:500;}' +
    '.ck-prefs{margin:0 0 14px;border-top:1px solid #e5e7eb;}' +
    '.ck-prefs[hidden]{display:none;}' +
    '.ck-row{display:flex;gap:12px;align-items:flex-start;justify-content:space-between;padding:12px 0;border-bottom:1px solid #e5e7eb;}' +
    '.ck-row strong{display:block;font-size:14px;}' +
    '.ck-row span{color:#6b7280;font-size:13px;}' +
    '.ck-row input{width:20px;height:20px;margin-top:2px;flex:none;accent-color:#2563eb;}' +
    '@media(max-width:480px){.ck-banner{left:8px;right:8px;bottom:8px;padding:18px 16px 12px;}}';

  var root, prefsBox, marketingBox, saveBtn, customBtn;

  function build(){
    var style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    root = document.createElement('div');
    root.className = 'ck-banner';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-labelledby', 'ckTitle');
    root.setAttribute('aria-describedby', 'ckText');
    root.hidden = true;
    root.innerHTML =
      '<button type="button" class="ck-close" data-ck="reject" aria-label="Chiudi e rifiuta i cookie non necessari">✕</button>' +
      '<p class="ck-title" id="ckTitle">Cookie su questo sito</p>' +
      '<p class="ck-text" id="ckText">Usiamo cookie tecnici necessari al funzionamento del sito. Con il tuo consenso usiamo anche il ' +
        'Meta Pixel per misurare l\'efficacia delle nostre pubblicità su Facebook e Instagram. ' +
        'Chiudendo con la ✕ rifiuti i cookie non necessari. Puoi cambiare idea in qualsiasi momento dal link ' +
        '"Preferenze cookie" in fondo alla pagina. <a href="/cookie-policy.html">Cookie Policy</a></p>' +
      '<div class="ck-prefs" id="ckPrefs" hidden>' +
        '<label class="ck-row"><span><strong>Tecnici</strong><span>Necessari al funzionamento e a ricordare la tua scelta. Sempre attivi.</span></span>' +
          '<input type="checkbox" checked disabled></label>' +
        '<label class="ck-row" for="ckMarketing"><span><strong>Marketing (Meta Pixel)</strong><span>Misurano visite e richieste arrivate dalle inserzioni Meta.</span></span>' +
          '<input type="checkbox" id="ckMarketing"></label>' +
      '</div>' +
      '<div class="ck-actions">' +
        '<button type="button" class="ck-btn ck-main" data-ck="reject">Rifiuta</button>' +
        '<button type="button" class="ck-btn ck-main" data-ck="accept">Accetta</button>' +
        '<button type="button" class="ck-btn ck-main" data-ck="save" hidden>Salva preferenze</button>' +
        '<button type="button" class="ck-btn ck-link" data-ck="custom">Personalizza</button>' +
      '</div>';
    document.body.appendChild(root);

    prefsBox = root.querySelector('#ckPrefs');
    marketingBox = root.querySelector('#ckMarketing');
    saveBtn = root.querySelector('[data-ck="save"]');
    customBtn = root.querySelector('[data-ck="custom"]');

    root.addEventListener('click', function(e){
      var btn = e.target.closest('[data-ck]');
      if(!btn) return;
      var action = btn.getAttribute('data-ck');
      if(action === 'accept') decide(true);
      else if(action === 'reject') decide(false);
      else if(action === 'save') decide(marketingBox.checked);
      else if(action === 'custom') showPrefs();
    });
  }

  function showPrefs(){
    prefsBox.hidden = false;
    saveBtn.hidden = false;
    customBtn.hidden = true;
  }

  function open(){
    if(!root) build();
    var c = readChoice();
    marketingBox.checked = !!(c && c.marketing);
    if(c) showPrefs();
    root.hidden = false;
    root.querySelector('.ck-btn').focus();
  }

  function decide(marketing){
    var wasOn = pixelLoaded;
    saveChoice(marketing);
    root.hidden = true;
    if(marketing) loadPixel();
    else if(wasOn){ removeMetaCookies(); location.reload(); }
  }

  // ---- Avvio ----
  function init(){
    // Link "Preferenze cookie" (footer): qualsiasi elemento con data-cookie-prefs
    document.addEventListener('click', function(e){
      var t = e.target.closest('[data-cookie-prefs]');
      if(t){ e.preventDefault(); open(); }
    });

    // Evento standard Contact: click su WhatsApp, telefono o email
    document.addEventListener('click', function(e){
      var a = e.target.closest('a[href]');
      if(!a) return;
      var href = a.getAttribute('href');
      if(/^(https:\/\/wa\.me\/|tel:|mailto:)/.test(href)){
        track('Contact', { content_name: href.indexOf('wa.me') > -1 ? 'whatsapp' : href.split(':')[0] });
      }
    });

    var c = readChoice();
    if(c && c.marketing) loadPixel();
    else if(!c) open();
  }

  window.AIConsent = { open: open, track: track, onMarketing: onMarketing, hasMarketing: function(){ var c = readChoice(); return !!(c && c.marketing); } };

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
