const CACHE_NAME = "equipment-worklog-cache-v6";

const CORE_FILES = [
    "./",
    "./index.html",
    "./style.css?v=6",
    "./app.js?v=6",
    "./manifest.json",
    "./icons/icon.svg"
];

self.addEventListener("install", function (event) {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(CORE_FILES))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", function (event) {
    event.waitUntil(
        caches.keys()
            .then((cacheNames) =>
                Promise.all(
                    cacheNames
                        .filter((name) => name !== CACHE_NAME)
                        .map((name) => caches.delete(name))
                )
            )
            .then(() => self.clients.claim())
    );
});

// 更新反映を優先：オンライン時はネットワーク、オフライン時のみキャッシュ
self.addEventListener("fetch", function (event) {
    if (event.request.method !== "GET") {
        return;
    }

    const requestUrl = new URL(event.request.url);

    if (requestUrl.origin !== self.location.origin) {
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then((networkResponse) => {
                const responseClone = networkResponse.clone();

                caches.open(CACHE_NAME)
                    .then((cache) => cache.put(event.request, responseClone))
                    .catch(() => {});

                return networkResponse;
            })
            .catch(() =>
                caches.match(event.request)
                    .then((cachedResponse) => {
                        if (cachedResponse) {
                            return cachedResponse;
                        }

                        if (event.request.mode === "navigate") {
                            return caches.match("./index.html");
                        }

                        throw new Error("Offline and no cached response.");
                    })
            )
    );
});
