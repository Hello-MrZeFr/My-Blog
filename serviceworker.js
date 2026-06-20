const CACHE_VERSION = "mrzefr-v6";

const STATIC_CACHE = `${CACHE_VERSION}-static`;

const OFFLINE_URL = "/Offline/";

const CDN_HOSTS = [
    "s4.zstatic.net",
    "kodo.mrzefr.top"
];

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(STATIC_CACHE).then((cache) => {
            return cache.addAll([
                OFFLINE_URL
            ]);
        })
    );

    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        Promise.all([
            clients.claim(),

            caches.keys().then((keys) =>
                Promise.all(
                    keys.map((key) => {
                        if (key !== STATIC_CACHE) {
                            return caches.delete(key);
                        }
                    })
                )
            )
        ])
    );
});

self.addEventListener("fetch", (event) => {
    const req = event.request;

    if (req.method !== "GET") {
        return;
    }

    event.respondWith(handle(req));
});

async function handle(req) {
    const url = new URL(req.url);

    // =====================================
    // Artalk 评论接口缓存
    // =====================================
    const isArtalk =
        url.hostname === "artalk.mrzefr.top";

    const isArtalkCacheAPI =
        isArtalk &&
        (
            url.pathname.startsWith("/api/v2/comments") ||
            url.pathname.startsWith("/api/v2/pages") ||
            url.pathname.startsWith("/api/v2/stats")
        );

    if (isArtalkCacheAPI) {
        const cache = await caches.open(STATIC_CACHE);

        const cached = await cache.match(req);

        const networkFetch = fetch(req)
            .then((response) => {
                if (response && response.ok) {
                    cache.put(req, response.clone());
                }

                return response;
            })
            .catch(() => null);

        if (cached) {
            return cached;
        }

        const response = await networkFetch;

        if (response) {
            return response;
        }

        return new Response("[]", {
            headers: {
                "Content-Type": "application/json"
            }
        });
    }

    // =====================================
    // 本站静态资源
    // =====================================
    const isStatic =
        url.pathname.startsWith("/_astro/") ||
        url.pathname.startsWith("/fonts/") ||
        url.pathname.startsWith("/images/") ||
        url.pathname.startsWith("/libs/") ||
        /\.(js|css|woff|woff2|ttf|eot|svg|png|jpg|jpeg|gif|webp|avif|ico)$/i.test(
            url.pathname
        );

    // =====================================
    // CDN资源
    // =====================================
    const isCDN =
        CDN_HOSTS.includes(url.hostname);

    if (isStatic || isCDN) {
        const cache = await caches.open(STATIC_CACHE);

        const cached = await cache.match(req);

        const networkFetch = fetch(req)
            .then((response) => {
                if (response && response.ok) {
                    cache.put(req, response.clone());
                }

                return response;
            })
            .catch(() => null);

        if (cached) {
            return cached;
        }

        const response = await networkFetch;

        if (response) {
            return response;
        }

        return new Response("Offline", {
            status: 503,
            headers: {
                "Content-Type": "text/plain;charset=utf-8"
            }
        });
    }

    // =====================================
    // HTML页面
    // =====================================
    if (
        req.headers
            .get("accept")
            ?.includes("text/html")
    ) {
        try {
            return await fetch(req);
        } catch {
            const offline =
                await caches.match(OFFLINE_URL);

            return (
                offline ||
                new Response("Offline", {
                    status: 503,
                    headers: {
                        "Content-Type":
                            "text/plain;charset=utf-8"
                    }
                })
            );
        }
    }

    // =====================================
    // 其它请求
    // =====================================
    return fetch(req);
}