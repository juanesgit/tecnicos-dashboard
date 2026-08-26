const CACHE_NAME = 'tecnicos-v1'

// Assets del shell de la aplicación (Cache-First)
const SHELL_ASSETS = [
  '/',
  '/manifest.json',
]

// ── Install: pre-cachea el shell ────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS))
  )
  self.skipWaiting()
})

// ── Activate: limpia caches viejos ──────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// ── Fetch: estrategia por tipo de recurso ───────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Solo intercepta GET
  if (request.method !== 'GET') return

  // Network-First para /api/* (datos en tiempo real)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request))
    return
  }

  // Cache-First para assets del build (JS, CSS, images con hash en nombre)
  if (
    url.pathname.startsWith('/assets/') ||
    url.pathname.match(/\.(js|css|woff2?|png|jpg|svg|ico)$/)
  ) {
    event.respondWith(cacheFirst(request))
    return
  }

  // Network-First para navegación SPA (devuelve index.html en offline)
  event.respondWith(spaFallback(request))
})

// ── Estrategias ──────────────────────────────────────────────────────────────
async function networkFirst(request) {
  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME)
      cache.put(request, response.clone())
    }
    return response
  } catch {
    const cached = await caches.match(request)
    if (cached) return cached
    return new Response(JSON.stringify({ error: 'Sin conexión' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request)
  if (cached) return cached
  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME)
      cache.put(request, response.clone())
    }
    return response
  } catch {
    return new Response('Resource not available', { status: 503 })
  }
}

async function spaFallback(request) {
  try {
    const response = await fetch(request)
    return response
  } catch {
    const cached = await caches.match('/')
    return cached || new Response('Sin conexión', { status: 503 })
  }
}

// ── Push Notifications ───────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let payload = { title: 'Técnicos Dashboard', body: 'Nueva alerta de técnicos' }

  if (event.data) {
    try {
      payload = event.data.json()
    } catch {
      payload.body = event.data.text()
    }
  }

  const options = {
    body: payload.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: payload.tag || 'tecnicos-alert',
    renotify: true,
    vibrate: [200, 100, 200],
    data: {
      url: payload.url || '/',
    },
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, options)
  )
})

// ── Notification Click ───────────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = event.notification.data?.url || '/'

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === targetUrl && 'focus' in client) {
          return client.focus()
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl)
      }
    })
  )
})
