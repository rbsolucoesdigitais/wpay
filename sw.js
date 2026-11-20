const CACHE_NAME = "controle-financeiro-v6";
const ARQUIVOS_ESTATICOS = [
  "./",
  "./index.html",
  "./style.css",
  "./script.js",
  "./manifest.json"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ARQUIVOS_ESTATICOS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type !== "basic") {
            return response;
          }
          const copia = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copia));
          return response;
        })
        .catch(() => cached);
    })
  );
});

self.addEventListener("push", (event) => {
    let dados = {
        titulo: "Controle Financeiro",
        corpo: "Houve uma atualização nas contas.",
        url: "./"
    };

    if (event.data) {
        try {
            const payload = event.data.json();
            dados = {
                titulo: payload.titulo || dados.titulo,
                corpo: payload.corpo || dados.corpo,
                url: payload.url || dados.url
            };
        } catch (_) {
            dados.corpo = event.data.text() || dados.corpo;
        }
    }

    event.waitUntil(
      self.registration.showNotification(dados.titulo, {
        body: dados.corpo,
        icon: "./logo-192x192.png",
        vibrate: [120, 60, 120],
        tag: "controle-financeiro-notif",
        renotify: true,
        data: { url: dados.url }
      }).catch((err) => {
        console.error("Falha ao exibir notificação push:", err);
      })
    );

    
});

self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    const destinoUrl = (event.notification.data && event.notification.data.url) || "./";

    event.waitUntil(
        clients.matchAll({ type: "window", includeUncontrolled: true }).then((listaJanelas) => {
            for (const janela of listaJanelas) {
                if ("focus" in janela) {
                    return janela.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(destinoUrl);
            }
        })
    );
});
