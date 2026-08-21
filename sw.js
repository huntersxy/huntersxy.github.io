/*
 * In Huntersxy | Service Worker
 * - 页面导航: 网络优先, 失败回退缓存, 再失败回退离线页
 * - 静态资源 (css/js/img/font): stale-while-revalidate (先用缓存, 后台更新)
 * - 主题资源带 ?v= 版本号, 新版本 URL 天然是新缓存条目, 不存在旧缓存复用问题
 *
 * CACHE_VERSION 与主题 _config.yml 的 verison 保持同步递增即可整体作废旧缓存。
 */
'use strict';

var CACHE_VERSION = '1.8.0';
var CACHE_NAME = 'suka-bulie-' + CACHE_VERSION;
var OFFLINE_URL = '/offline.html';

self.addEventListener('install', function (event) {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(function (cache) { return cache.add(OFFLINE_URL); })
            .then(function () { return self.skipWaiting(); })
    );
});

self.addEventListener('activate', function (event) {
    event.waitUntil(
        caches.keys()
            .then(function (keys) {
                return Promise.all(keys.map(function (key) {
                    if (key !== CACHE_NAME) return caches.delete(key);
                }));
            })
            .then(function () { return self.clients.claim(); })
    );
});

var ASSET_PATTERN = /\.(css|js|png|jpe?g|webp|gif|svg|ico|woff2?|ttf|otf|map)$/i;

self.addEventListener('fetch', function (event) {
    var request = event.request;

    if (request.method !== 'GET') return;

    var url = new URL(request.url);
    if (url.origin !== self.location.origin) return;
    if (url.pathname === '/sw.js' || url.pathname === '/manifest.json') return;

    if (request.mode === 'navigate') {
        event.respondWith(networkFirstNavigation(request));
        return;
    }

    var isAsset = ASSET_PATTERN.test(url.pathname) ||
        request.destination === 'style' ||
        request.destination === 'script' ||
        request.destination === 'image' ||
        request.destination === 'font';

    if (isAsset) {
        event.respondWith(staleWhileRevalidate(request));
    }
    /* 其余请求 (如评论组件的跨域 XHR 已在上面被排除) 直接放行 */
});

function networkFirstNavigation(request) {
    return fetch(request)
        .then(function (response) {
            if (response && response.ok) {
                var copy = response.clone();
                caches.open(CACHE_NAME).then(function (cache) { cache.put(request, copy); });
            }
            return response;
        })
        .catch(function () {
            return caches.match(request).then(function (cached) {
                return cached || caches.match(OFFLINE_URL);
            });
        });
}

function staleWhileRevalidate(request) {
    return caches.match(request).then(function (cached) {
        var fetchPromise = fetch(request).then(function (response) {
            if (response && response.ok) {
                var copy = response.clone();
                caches.open(CACHE_NAME).then(function (cache) { cache.put(request, copy); });
            }
            return response;
        }).catch(function () { return cached; });
        return cached || fetchPromise;
    });
}
