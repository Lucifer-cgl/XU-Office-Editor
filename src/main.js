const ENGINE_BASE_URL = new URL("../assets/zetaoffice/", import.meta.url).href;
const BRIDGE_SOURCE = "xu-office-editor";
const SUPPORTED_EXTENSIONS = [
  ".doc", ".docx", ".odt", ".rtf", ".txt", ".html", ".htm",
  ".xls", ".xlsx", ".ods", ".csv",
  ".ppt", ".pptx", ".odp"
];

const canvas = document.querySelector("#qtcanvas");
const loading = document.querySelector("#loading");
const openButton = document.querySelector("#open-file");
const saveButton = document.querySelector("#save-file");
const fileNameLabel = document.querySelector("#file-name");
const statusLabel = document.querySelector("#status");

let officePort;
let fileHandle;
let fileName = "";
let bridgeTarget = null;
let bridgeOrigin = "*";

function setStatus(message) {
  statusLabel.textContent = message;
}

function setReady(ready) {
  openButton.disabled = !ready;
  saveButton.disabled = !ready || !fileName;
}

function extensionOf(name) {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

function isSupported(name) {
  return SUPPORTED_EXTENSIONS.includes(extensionOf(name));
}

function ensureOfficeDirectory() {
  try {
    FS.mkdir("/tmp/office");
  } catch (error) {
    if (!String(error).includes("File exists")) throw error;
  }
}

async function loadBytes(name, bytes) {
  if (!officePort) throw new Error("Office 引擎尚未就绪");
  if (!isSupported(name)) throw new Error(`暂不支持 ${extensionOf(name) || "该格式"}`);
  ensureOfficeDirectory();
  fileName = name;
  fileNameLabel.textContent = name;
  loading.hidden = false;
  canvas.hidden = true;
  FS.writeFile(`/tmp/office/${name}`, new Uint8Array(bytes));
  officePort.postMessage({ cmd: "upload", filename: name });
  setStatus(`正在打开 ${name}……`);
}

async function chooseFile() {
  try {
    if ("showOpenFilePicker" in window) {
      [fileHandle] = await window.showOpenFilePicker({
        multiple: false,
        types: [{
          description: "Office 文档",
          accept: {
            "application/octet-stream": SUPPORTED_EXTENSIONS
          }
        }]
      });
      const file = await fileHandle.getFile();
      await loadBytes(file.name, await file.arrayBuffer());
      return;
    }

    const input = document.createElement("input");
    input.type = "file";
    input.accept = SUPPORTED_EXTENSIONS.join(",");
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;
      fileHandle = null;
      await loadBytes(file.name, await file.arrayBuffer());
    }, { once: true });
    input.click();
  } catch (error) {
    if (error?.name !== "AbortError") setStatus(`打开失败：${error.message}`);
  }
}

function requestSave() {
  if (!officePort || !fileName) return;
  saveButton.disabled = true;
  setStatus(`正在保存 ${fileName}……`);
  officePort.postMessage({ cmd: "download" });
}

async function persistBytes(bytes) {
  const blob = new Blob([bytes], { type: "application/octet-stream" });
  if (fileHandle) {
    const permission = await fileHandle.requestPermission?.({ mode: "readwrite" });
    if (permission && permission !== "granted") throw new Error("没有获得原文件写入权限");
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
    setStatus(`已保存到原文件：${fileName}`);
    return;
  }

  if (bridgeTarget) {
    const transferable = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    bridgeTarget.postMessage({
      source: BRIDGE_SOURCE,
      type: "file-saved",
      name: fileName,
      bytes: transferable
    }, bridgeOrigin, [transferable]);
    setStatus(`已把修改交回 XU：${fileName}`);
    return;
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setStatus(`已下载修改后的文件：${fileName}`);
}

function receiveBridgeMessage(event) {
  const data = event.data;
  if (!data || data.source !== "xu-knowledge-base" || data.type !== "open-file") return;
  if (!(data.bytes instanceof ArrayBuffer) || typeof data.name !== "string") return;
  bridgeTarget = event.source;
  bridgeOrigin = event.origin || "*";
  fileHandle = null;
  loadBytes(data.name, data.bytes).catch((error) => setStatus(`打开失败：${error.message}`));
}

function notifyBridgeReady() {
  const target = window.opener || (window.parent !== window ? window.parent : null);
  if (!target) return;
  target.postMessage({ source: BRIDGE_SOURCE, type: "ready" }, "*");
}

openButton.addEventListener("click", chooseFile);
saveButton.addEventListener("click", requestSave);
window.addEventListener("message", receiveBridgeMessage);
window.addEventListener("beforeunload", () => {
  if (bridgeTarget) bridgeTarget.postMessage({ source: BRIDGE_SOURCE, type: "closed" }, bridgeOrigin);
});

async function bootOffice() {
  if (!("serviceWorker" in navigator)) {
    throw new Error("当前浏览器不支持运行组件的本地流式加载，请使用最新版 Chrome 或 Edge");
  }

  await navigator.serviceWorker.register(new URL("../sw.js", import.meta.url), { scope: "../" });
  await navigator.serviceWorker.ready;
  if (!navigator.serviceWorker.controller) {
    location.reload();
    return;
  }

  window.Module = {
    canvas,
    uno_scripts: [
      new URL("../assets/vendor/zetajs/zeta.js", import.meta.url).href,
      new URL("../office_thread.js", import.meta.url).href
    ],
    locateFile(path, prefix) {
      return (prefix || ENGINE_BASE_URL) + path;
    }
  };

  window.Module.mainScriptUrlOrBlob = new Blob(
    [`importScripts('${ENGINE_BASE_URL}soffice.js');`],
    { type: "text/javascript" }
  );

  const engineScript = document.createElement("script");
  engineScript.src = `${ENGINE_BASE_URL}soffice.js`;
  engineScript.addEventListener("error", () => {
    setStatus("Office 引擎加载失败，请检查仓库中的运行组件是否完整。");
  });
  engineScript.addEventListener("load", () => {
    window.Module.uno_main.then((port) => {
    officePort = port;
    officePort.onmessage = async (event) => {
      try {
        if (event.data.cmd === "thr_running") {
          loading.querySelector("h1").textContent = "Office 引擎已就绪";
          loading.querySelector("p").textContent = "选择本地 Word、Excel 或 PowerPoint 文件开始编辑。";
          setReady(true);
          setStatus("就绪");
          notifyBridgeReady();
          return;
        }
        if (event.data.cmd === "ui_ready") {
          loading.hidden = true;
          canvas.hidden = false;
          setReady(true);
          setStatus(`正在编辑：${fileName}`);
          requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
          return;
        }
        if (event.data.cmd === "download") {
          const bytes = FS.readFile(`/tmp/office/${fileName}`);
          await persistBytes(bytes);
          saveButton.disabled = false;
          return;
        }
        throw new Error(`未知的 Office 消息：${event.data.cmd}`);
      } catch (error) {
        saveButton.disabled = false;
        setStatus(`操作失败：${error.message}`);
      }
    };
    }).catch((error) => setStatus(`Office 引擎初始化失败：${error.message}`));
  });
  document.body.appendChild(engineScript);
}

bootOffice().catch((error) => setStatus(`启动失败：${error.message}`));

window.addEventListener("resize", () => {
  requestAnimationFrame(() => window.dispatchEvent(new CustomEvent("xu-office-resize")));
});
