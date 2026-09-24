const ENGINE_BASE_URL = new URL("../assets/zetaoffice/", import.meta.url).href;
const BUNDLED_FONTS = [
  { url: new URL("../assets/fonts/NotoSansSC.ttf", import.meta.url), fileName: "NotoSansSC.ttf" }
];
const BRIDGE_SOURCE = "xu-office-editor";
const SUPPORTED_EXTENSIONS = [
  ".doc", ".docx", ".odt", ".rtf", ".txt", ".html", ".htm",
  ".xls", ".xlsx", ".ods", ".csv",
  ".ppt", ".pptx", ".odp"
];
const FORMAT_LABELS = {
  doc: "DOC", docx: "DOCX", odt: "ODT", rtf: "RTF", txt: "TXT", html: "HTML", htm: "HTML",
  xls: "XLS", xlsx: "XLSX", ods: "ODS", csv: "CSV",
  ppt: "PPT", pptx: "PPTX", odp: "ODP"
};

const canvas = document.querySelector("#qtcanvas");
const loading = document.querySelector("#loading");
const welcome = document.querySelector("#welcome");
const openButton = document.querySelector("#open-file");
const folderButton = document.querySelector("#open-folder");
const saveButton = document.querySelector("#save-file");
const fileNameLabel = document.querySelector("#file-name");
const filePathLabel = document.querySelector("#file-path");
const statusLabel = document.querySelector("#status");
const documentKindLabel = document.querySelector("#document-kind");
const folderSummary = document.querySelector("#folder-summary");
const fileTree = document.querySelector("#file-tree");
const folderSearch = document.querySelector("#folder-search");
const commandButtons = [...document.querySelectorAll("[data-command]")];

let officePort;
let fileHandle;
let fileName = "";
let currentRelativePath = "";
let folderName = "";
let folderFiles = [];
let bridgeTarget = null;
let bridgeOrigin = "*";

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

function setStatus(message) {
  statusLabel.textContent = message;
}

function setEngineReady(ready) {
  openButton.disabled = !ready;
  folderButton.disabled = !ready || !("showDirectoryPicker" in window);
  document.querySelector("#welcome-folder").disabled = folderButton.disabled;
  document.querySelector("#welcome-file").disabled = openButton.disabled;
}

function setDocumentReady(ready) {
  saveButton.disabled = !ready;
  commandButtons.forEach((button) => { button.disabled = !ready; });
}

function extensionOf(name) {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

function extensionName(name) {
  return extensionOf(name).slice(1);
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

function updateActiveTreeFile() {
  document.querySelectorAll(".tree-file").forEach((button) => {
    button.classList.toggle("active", button.dataset.path === currentRelativePath);
  });
}

async function loadBytes(name, bytes, relativePath = name) {
  if (!officePort) throw new Error("文档引擎尚未就绪");
  if (!isSupported(name)) throw new Error(`暂不支持 ${extensionOf(name) || "该格式"}`);
  ensureOfficeDirectory();
  fileName = name;
  currentRelativePath = relativePath;
  fileNameLabel.textContent = name;
  filePathLabel.textContent = relativePath;
  documentKindLabel.textContent = `${FORMAT_LABELS[extensionName(name)] || "文档"} · 本地编辑`;
  updateActiveTreeFile();
  welcome.hidden = true;
  loading.hidden = false;
  loading.querySelector("h1").textContent = "正在打开文档";
  loading.querySelector("p").textContent = relativePath;
  canvas.hidden = true;
  setDocumentReady(false);
  FS.writeFile(`/tmp/office/${name}`, new Uint8Array(bytes));
  officePort.postMessage({ cmd: "upload", filename: name });
  setStatus(`正在打开：${name}`);
}

async function openFileHandle(handle, relativePath = "") {
  const file = await handle.getFile();
  fileHandle = handle;
  await loadBytes(file.name, await file.arrayBuffer(), relativePath || file.name);
}

async function chooseFile() {
  try {
    if ("showOpenFilePicker" in window) {
      const handles = await window.showOpenFilePicker({
        multiple: false,
        types: [{ description: "可编辑文档", accept: { "application/octet-stream": SUPPORTED_EXTENSIONS } }]
      });
      await openFileHandle(handles[0]);
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

async function collectFolderFiles(directoryHandle, basePath = "") {
  const output = [];
  for await (const [name, handle] of directoryHandle.entries()) {
    const relativePath = [basePath, name].filter(Boolean).join("/");
    if (handle.kind === "directory") {
      output.push(...await collectFolderFiles(handle, relativePath));
    } else if (handle.kind === "file" && isSupported(name)) {
      output.push({ name, relativePath, handle });
    }
  }
  return output;
}

function buildFolderTree(entries) {
  const root = { name: folderName, path: "", children: new Map(), files: [] };
  for (const entry of entries) {
    const parts = entry.relativePath.split("/");
    parts.pop();
    let node = root;
    for (const part of parts) {
      if (!node.children.has(part)) {
        node.children.set(part, { name: part, path: [node.path, part].filter(Boolean).join("/"), children: new Map(), files: [] });
      }
      node = node.children.get(part);
    }
    node.files.push(entry);
  }
  return root;
}

function renderTreeNode(node, isRoot = false) {
  const files = node.files
    .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"))
    .map((entry) => `<button type="button" class="tree-file ${entry.relativePath === currentRelativePath ? "active" : ""}" data-path="${escapeHtml(entry.relativePath)}" title="${escapeHtml(entry.relativePath)}"><span class="file-badge">${escapeHtml(FORMAT_LABELS[extensionName(entry.name)] || "FILE")}</span><span class="file-label">${escapeHtml(entry.name)}</span></button>`)
    .join("");
  const children = [...node.children.values()]
    .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"))
    .map((child) => renderTreeNode(child))
    .join("");
  const content = `${files}${children}`;
  if (isRoot) return content;
  return `<details class="tree-folder" open><summary>${escapeHtml(node.name)}</summary><div class="tree-children">${content}</div></details>`;
}

function renderFolderTree() {
  const query = folderSearch.value.trim().toLocaleLowerCase("zh-CN");
  const visible = query ? folderFiles.filter((entry) => entry.relativePath.toLocaleLowerCase("zh-CN").includes(query)) : folderFiles;
  folderSummary.textContent = `${folderName} · ${visible.length}${query ? ` / ${folderFiles.length}` : ""} 个可编辑文件`;
  const tree = buildFolderTree(visible);
  fileTree.innerHTML = renderTreeNode(tree, true) || `<div class="empty-tree"><strong>没有匹配的文档</strong><p>支持 Word、Excel、PowerPoint 和 OpenDocument 格式。</p></div>`;
}

async function chooseFolder() {
  if (!("showDirectoryPicker" in window)) {
    setStatus("当前浏览器不支持文件夹读取，请使用最新版 Chrome 或 Edge。");
    return;
  }
  try {
    const directoryHandle = await window.showDirectoryPicker({ mode: "readwrite" });
    folderName = directoryHandle.name || "本地文件夹";
    folderSummary.textContent = `正在读取 ${folderName}……`;
    folderFiles = await collectFolderFiles(directoryHandle);
    renderFolderTree();
    setStatus(`已连接本地文件夹：${folderName}`);
  } catch (error) {
    if (error?.name !== "AbortError") setStatus(`文件夹读取失败：${error.message}`);
  }
}

async function openTreeFile(relativePath) {
  const entry = folderFiles.find((item) => item.relativePath === relativePath);
  if (!entry) return;
  try {
    await openFileHandle(entry.handle, entry.relativePath);
  } catch (error) {
    setStatus(`打开失败：${error.message}`);
  }
}

function requestSave() {
  if (!officePort || !fileName) return;
  setDocumentReady(false);
  setStatus(`正在保存：${fileName}`);
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
    setStatus(`已保存：${currentRelativePath || fileName}`);
    return;
  }
  if (bridgeTarget) {
    const transferable = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    bridgeTarget.postMessage({ source: BRIDGE_SOURCE, type: "file-saved", name: fileName, bytes: transferable }, bridgeOrigin, [transferable]);
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

function sendCommand(id) {
  if (!officePort || !fileName) return;
  officePort.postMessage({ cmd: "command", id });
  canvas.focus();
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
  if (target) target.postMessage({ source: BRIDGE_SOURCE, type: "ready" }, "*");
}

openButton.addEventListener("click", chooseFile);
folderButton.addEventListener("click", chooseFolder);
saveButton.addEventListener("click", requestSave);
document.querySelector("#welcome-file").addEventListener("click", chooseFile);
document.querySelector("#welcome-folder").addEventListener("click", chooseFolder);
folderSearch.addEventListener("input", renderFolderTree);
fileTree.addEventListener("click", (event) => {
  const button = event.target.closest(".tree-file");
  if (button) openTreeFile(button.dataset.path);
});
commandButtons.forEach((button) => button.addEventListener("click", () => sendCommand(button.dataset.command)));
window.addEventListener("message", receiveBridgeMessage);
window.addEventListener("beforeunload", () => {
  if (bridgeTarget) bridgeTarget.postMessage({ source: BRIDGE_SOURCE, type: "closed" }, bridgeOrigin);
});
setDocumentReady(false);

async function bootOffice() {
  if (!("serviceWorker" in navigator)) throw new Error("请使用最新版 Chrome 或 Edge");
  await navigator.serviceWorker.register(new URL("../sw.js", import.meta.url), { scope: "../" });
  await navigator.serviceWorker.ready;
  if (!navigator.serviceWorker.controller) {
    location.reload();
    return;
  }
  setStatus("正在加载中文字体…");
  const bundledFonts = await Promise.all(BUNDLED_FONTS.map(async (font) => {
    const response = await fetch(font.url);
    if (!response.ok) throw new Error(`中文字体加载失败（${response.status}）`);
    return { fileName: font.fileName, bytes: new Uint8Array(await response.arrayBuffer()) };
  }));
  window.Module = {
    canvas,
    uno_scripts: [new URL("../assets/vendor/zetajs/zeta.js", import.meta.url).href, new URL("../office_thread.js", import.meta.url).href],
    locateFile(path, prefix) { return (prefix || ENGINE_BASE_URL) + path; },
    preRun: [() => {
      for (const font of bundledFonts) {
        try {
          FS.mkdirTree("/instdir/share/fonts/truetype");
          FS.writeFile(`/instdir/share/fonts/truetype/${font.fileName}`, font.bytes);
        } catch (error) {
          console.error(`内置字体注入失败：${font.fileName}`, error);
        }
      }
    }]
  };
  window.Module.mainScriptUrlOrBlob = new Blob([`importScripts('${ENGINE_BASE_URL}soffice.js');`], { type: "text/javascript" });
  const engineScript = document.createElement("script");
  engineScript.src = `${ENGINE_BASE_URL}soffice.js`;
  engineScript.addEventListener("error", () => setStatus("文档引擎加载失败，请检查仓库文件是否完整。"));
  engineScript.addEventListener("load", () => {
    window.Module.uno_main.then((port) => {
      officePort = port;
      officePort.onmessage = async (event) => {
        try {
          if (event.data.cmd === "thr_running") {
            loading.hidden = true;
            welcome.hidden = false;
            setEngineReady(true);
            setStatus("文档引擎已就绪");
            notifyBridgeReady();
            return;
          }
          if (event.data.cmd === "ui_ready") {
            loading.hidden = true;
            welcome.hidden = true;
            canvas.hidden = false;
            setDocumentReady(true);
            setStatus(`正在编辑：${currentRelativePath || fileName}`);
            requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
            return;
          }
          if (event.data.cmd === "download") {
            const bytes = FS.readFile(`/tmp/office/${fileName}`);
            await persistBytes(bytes);
            setDocumentReady(true);
            return;
          }
          if (event.data.cmd === "format-state") {
            document.querySelector(`[data-command="${event.data.id}"]`)?.classList.toggle("active", Boolean(event.data.state));
            return;
          }
          throw new Error(`未知消息：${event.data.cmd}`);
        } catch (error) {
          setDocumentReady(Boolean(fileName));
          setStatus(`操作失败：${error.message}`);
        }
      };
    }).catch((error) => setStatus(`文档引擎初始化失败：${error.message}`));
  });
  document.body.appendChild(engineScript);
}

bootOffice().catch((error) => setStatus(`启动失败：${error.message}`));
window.addEventListener("resize", () => requestAnimationFrame(() => window.dispatchEvent(new CustomEvent("xu-office-resize"))));
