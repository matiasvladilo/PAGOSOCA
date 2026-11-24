/*
 * Service worker de PagosOca.
 *
 * Regla de oro: esto es una caja. Nada que venga de las Netlify Functions
 * (crear cobro, estado del pago, historial) se cachea ni se sirve desde caché
 * jamás — un estado de pago viejo haría entregar un producto no pagado.
 * Lo único que se guarda es el shell de la app para que abra sin conexión.
 */

const CACHE = 'pagosoca-shell-v1';
const SHELL = ['/', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/favicon-32.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/** Respuesta mínima cuando no hay red ni copia en caché. */
function offlineResponse() {
  return new Response(
    '<!doctype html><html lang="es"><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>Sin conexión — PagosOca</title>' +
      '<body style="margin:0;display:grid;place-items:center;min-height:100vh;' +
      'background:#f5f6fa;color:#111827;font-family:-apple-system,system-ui,sans-serif;text-align:center">' +
      '<div style="padding:24px"><h1 style="font-size:18px">Sin conexión</h1>' +
      '<p style="font-size:14px;color:#6b7280;margin-top:8px">' +
      'Revisa el wifi del local y volvé a intentar. No se pueden generar cobros sin internet.</p></div>',
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Todo lo que no sea un GET propio del sitio va directo a la red, sin tocar.
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Las funciones son la fuente de verdad del pago: nunca se cachean.
  if (url.pathname.startsWith('/.netlify/')) return;

  // Navegación: primero la red, así un deploy nuevo se toma al toque.
  // Sin red, cae a la copia guardada del shell.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('/', copy));
          return res;
        })
        .catch(() => caches.match('/').then((hit) => hit || offlineResponse()))
    );
    return;
  }

  // Estáticos: los assets de Vite llevan hash en el nombre, así que una copia
  // guardada nunca queda vieja — si el contenido cambia, cambia la URL.
  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ||
        fetch(request).then((res) => {
          if (res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return res;
        })
    )
  );
});
