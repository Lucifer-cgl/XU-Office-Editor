const CACHE_NAME = "xu-office-runtime-v1";
const MANIFEST_URL = new URL("./assets/zetaoffice/runtime-manifest.json", self.location.href).href;
let manifestPromise;

async function getManifest() {
  if (!manifestPromise) manifestPromise = fetch(MANIFEST_URL).then((response) => {
    if (!response.ok) throw new Error(`运行组件清单读取失败：${response.status}`);
    return response.json();
  });
  return manifestPromise;
}

function streamParts(entry) {
  return new ReadableStream({
    async start(controller) {
      try {
        for (const part of entry.parts) {
          const response = await fetch(new URL(`./assets/zetaoffice/${part}`, self.location.href));
          if (!response.ok || !response.body) throw new Error(`运行组件分片读取失败：${part}`);
          const reader = response.body.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
          }
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    }
  });
}

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (!url.pathname.endsWith("/assets/zetaoffice/soffice.wasm") && !url.pathname.endsWith("/assets/zetaoffice/soffice.data")) return;

  event.respondWith((async () => {
    const manifest = await getManifest();
    const name = url.pathname.endsWith("soffice.wasm") ? "soffice.wasm" : "soffice.data";
    const entry = manifest[name];
    if (!entry) return new Response("Missing runtime entry", { status: 404 });
    return new Response(streamParts(entry), {
      headers: {
        "Content-Type": entry.contentType,
        "Content-Length": String(entry.length),
        "Cache-Control": "public, max-age=31536000, immutable"
      }
    });
  })());
});
