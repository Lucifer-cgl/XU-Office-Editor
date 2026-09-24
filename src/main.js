const ENGINE_BASE_URL = new URL("../assets/zetaoffice/", import.meta.url).href;
const embeddedMode = new URLSearchParams(window.location.search).get("embedded") === "1";
document.documentElement.classList.toggle("embedded", embeddedMode);
const BUNDLED_FONTS = [
  { url: new URL("../assets/fonts/NotoSansSC.ttf", import.meta.url), fileName: "NotoSansSC.ttf" }
];
const BRIDGE_SOURCE = "xu-office-editor";
const SUPPORTED_EXTENSIONS = [
  ".doc", ".docx", ".odt", ".rtf", ".txt", ".html", ".htm",
  ".xls", ".xlsx", ".ods", ".csv",
  ".ppt", ".pptx", ".odp", ".pdf", ".md", ".markdown"
];
const FORMAT_LABELS = {
  doc: "DOC", docx: "DOCX", odt: "ODT", rtf: "RTF", txt: "TXT", html: "HTML", htm: "HTML",
  xls: "XLS", xlsx: "XLSX", ods: "ODS", csv: "CSV",
  ppt: "PPT", pptx: "PPTX", odp: "ODP", pdf: "PDF", md: "MD", markdown: "MD"
};

const canvas = document.querySelector("#qtcanvas");
const pdfViewer = document.querySelector("#pdf-viewer");
const markdownWorkspace = document.querySelector("#markdown-workspace");
const markdownPreview = document.querySelector("#markdown-preview");
const markdownEditor = document.querySelector("#markdown-editor");
const editorArea = document.querySelector(".editor-area");
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
const modeButtons = [...document.querySelectorAll("[data-mode]")];
const fontFamily = document.querySelector("#font-family");
const fontSize = document.querySelector("#font-size");
const fontColor = document.querySelector("#font-color");
const highlightColor = document.querySelector("#highlight-color");
const lineSpacing = document.querySelector("#line-spacing");
const insertImageButton = document.querySelector("#insert-image");
const insertTableButton = document.querySelector("#insert-table");
const imeButton = document.querySelector("#ime-focus");
const imeBridge = document.querySelector("#ime-bridge");
const imagePicker = document.querySelector("#image-picker");
const readModeNotice = document.querySelector("#read-mode-notice");
const tableDialog = document.querySelector("#table-dialog");
const tableRows = document.querySelector("#table-rows");
const tableColumns = document.querySelector("#table-columns");
const tableCancel = document.querySelector("#table-cancel");
const editingControls = [...commandButtons, fontFamily, fontSize, fontColor, highlightColor, lineSpacing, insertImageButton, insertTableButton, imeButton];

let officePort;
let fileHandle;
let fileName = "";
let currentRelativePath = "";
let folderName = "";
let folderFiles = [];
let folderDirectories = [];
let bridgeTarget = null;
let bridgeOrigin = "*";
let documentIsReady = false;
let documentMode = "read";
let imeComposing = false;
let pdfPreviewActive = false;
let pdfObjectUrl = "";
let markdownActive = false;
let engineBootPromise;
let resolveEngineBoot;
let rejectEngineBoot;

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

function renderMarkdownInline(value) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
}

function renderMarkdown(value) {
  const output = [];
  let codeLines = null;
  for (const [lineIndex, line] of String(value).replace(/\r\n?/g, "\n").split("\n").entries()) {
    if (/^```/.test(line)) {
      if (codeLines) {
        output.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
        codeLines = null;
      } else {
        codeLines = [];
      }
      continue;
    }
    if (codeLines) {
      codeLines.push(line);
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      output.push(`<h${level} id="md-heading-${lineIndex + 1}">${renderMarkdownInline(heading[2])}</h${level}>`);
    } else if (/^>\s?/.test(line)) {
      output.push(`<blockquote>${renderMarkdownInline(line.replace(/^>\s?/, ""))}</blockquote>`);
    } else if (/^[-*+]\s+/.test(line)) {
      output.push(`<div class="md-list">• ${renderMarkdownInline(line.replace(/^[-*+]\s+/, ""))}</div>`);
    } else if (/^\d+\.\s+/.test(line)) {
      const item = line.match(/^(\d+)\.\s+(.+)$/);
      output.push(`<div class="md-list">${item[1]}. ${renderMarkdownInline(item[2])}</div>`);
    } else if (/^\s*(---|___|\*\*\*)\s*$/.test(line)) {
      output.push("<hr>");
    } else if (line.trim()) {
      output.push(`<p>${renderMarkdownInline(line)}</p>`);
    } else {
      output.push("<br>");
    }
  }
  if (codeLines) output.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
  return output.join("");
}

function closePdfPreview() {
  pdfPreviewActive = false;
  editorArea.classList.remove("pdf-mode");
  pdfViewer.hidden = true;
  pdfViewer.removeAttribute("src");
  if (pdfObjectUrl) {
    URL.revokeObjectURL(pdfObjectUrl);
    pdfObjectUrl = "";
  }
}

function closeMarkdownWorkspace() {
  markdownActive = false;
  editorArea.classList.remove("markdown-mode");
  markdownWorkspace.hidden = true;
}

function updateMarkdownSurface() {
  if (!markdownActive) return;
  const editing = documentMode === "edit";
  markdownEditor.hidden = !editing;
  markdownPreview.hidden = editing;
  if (!editing) markdownPreview.innerHTML = renderMarkdown(markdownEditor.value);
  if (editing) requestAnimationFrame(() => markdownEditor.focus());
}

function setStatus(message) {
  statusLabel.textContent = message;
  if (bridgeTarget) bridgeTarget.postMessage({ source: BRIDGE_SOURCE, type: "status", message }, bridgeOrigin);
}

function sendOutline(items = []) {
  if (bridgeTarget) bridgeTarget.postMessage({ source: BRIDGE_SOURCE, type: "outline-changed", items }, bridgeOrigin);
}

function markdownOutline(value) {
  return String(value).replace(/\r\n?/g, "\n").split("\n").flatMap((line, index) => {
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    return heading ? [{ id: `md-heading-${index + 1}`, title: heading[2].trim(), level: heading[1].length, kind: "heading" }] : [];
  });
}

function setEngineReady(ready) {
  openButton.disabled = !ready;
  folderButton.disabled = !ready || !("showDirectoryPicker" in window);
  document.querySelector("#welcome-folder").disabled = folderButton.disabled;
  document.querySelector("#welcome-file").disabled = openButton.disabled;
}

function setDocumentReady(ready) {
  documentIsReady = ready;
  saveButton.disabled = !ready || pdfPreviewActive;
  modeButtons.forEach((button) => { button.disabled = !ready || (pdfPreviewActive && button.dataset.mode === "edit"); });
  updateEditingControls();
}

function updateEditingControls() {
  const locked = !documentIsReady || documentMode !== "edit" || pdfPreviewActive;
  editingControls.forEach((control) => { control.disabled = locked; });
  readModeNotice.hidden = !documentIsReady || documentMode !== "read";
  canvas.setAttribute("contenteditable", documentMode === "edit" ? "true" : "false");
}

function setDocumentMode(mode, announce = true) {
  if (pdfPreviewActive && mode === "edit") {
    if (announce) setStatus("PDF 为只读预览，不能进入编辑模式");
    return;
  }
  documentMode = mode === "edit" ? "edit" : "read";
  modeButtons.forEach((button) => button.classList.toggle("active", button.dataset.mode === documentMode));
  if (documentMode === "read") {
    imeBridge.blur();
    imeButton.classList.remove("active");
  }
  updateEditingControls();
  updateMarkdownSurface();
  if (announce && documentIsReady) {
    if (markdownActive) setStatus(documentMode === "edit" ? "已进入 Markdown 编辑模式" : "已进入 Markdown 阅读模式");
    else setStatus(documentMode === "edit" ? "已进入编辑模式，可使用中文输入法" : "已进入阅读模式，编辑已锁定");
  }
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
  if (!isSupported(name)) throw new Error(`暂不支持 ${extensionOf(name) || "该格式"}`);
  fileName = name;
  currentRelativePath = relativePath;
  fileNameLabel.textContent = name;
  filePathLabel.textContent = relativePath;
  documentKindLabel.textContent = `${FORMAT_LABELS[extensionName(name)] || "文档"} · 本地编辑`;
  updateActiveTreeFile();
  welcome.hidden = true;
  const extension = extensionOf(name);
  if (extension === ".pdf") {
    closeMarkdownWorkspace();
    closePdfPreview();
    pdfPreviewActive = true;
    editorArea.classList.add("pdf-mode");
    setDocumentMode("read", false);
    loading.hidden = true;
    canvas.hidden = true;
    if (pdfObjectUrl) URL.revokeObjectURL(pdfObjectUrl);
    pdfObjectUrl = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
    pdfViewer.src = `${pdfObjectUrl}#toolbar=0&navpanes=0&view=FitH`;
    pdfViewer.hidden = false;
    documentKindLabel.textContent = "PDF · 只读预览";
    setDocumentReady(true);
    sendOutline([]);
    setStatus(`正在阅读 PDF：${relativePath}`);
    return;
  }
  if (extension === ".md" || extension === ".markdown") {
    closePdfPreview();
    closeMarkdownWorkspace();
    markdownActive = true;
    editorArea.classList.add("markdown-mode");
    markdownWorkspace.hidden = false;
    markdownEditor.value = new TextDecoder("utf-8").decode(bytes);
    loading.hidden = true;
    canvas.hidden = true;
    setDocumentMode("read", false);
    updateMarkdownSurface();
    documentKindLabel.textContent = "Markdown · 按需加载";
    setDocumentReady(true);
    sendOutline(markdownOutline(markdownEditor.value));
    setStatus(`正在阅读 Markdown：${relativePath}`);
    return;
  }
  await ensureOfficeEngine();
  closePdfPreview();
  closeMarkdownWorkspace();
  ensureOfficeDirectory();
  loading.hidden = false;
  loading.querySelector("h1").textContent = "正在打开文档";
  loading.querySelector("p").textContent = relativePath;
  canvas.hidden = true;
  setDocumentMode("read", false);
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
        types: [{ description: "支持的文档", accept: { "application/octet-stream": SUPPORTED_EXTENSIONS } }]
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

async function collectFolderIndex(directoryHandle, basePath = "") {
  const index = { files: [], directories: [] };
  for await (const [name, handle] of directoryHandle.entries()) {
    const relativePath = [basePath, name].filter(Boolean).join("/");
    if (handle.kind === "directory") {
      index.directories.push({ name, relativePath, handle });
      const nested = await collectFolderIndex(handle, relativePath);
      index.files.push(...nested.files);
      index.directories.push(...nested.directories);
    } else if (handle.kind === "file" && isSupported(name)) {
      index.files.push({ name, relativePath, handle });
    }
  }
  return index;
}

function buildFolderTree(files, directories) {
  const root = { name: folderName, path: "", children: new Map(), files: [] };
  function ensureDirectory(path) {
    let node = root;
    for (const part of path.split("/").filter(Boolean)) {
      if (!node.children.has(part)) {
        node.children.set(part, { name: part, path: [node.path, part].filter(Boolean).join("/"), children: new Map(), files: [] });
      }
      node = node.children.get(part);
    }
    return node;
  }
  directories.forEach((entry) => ensureDirectory(entry.relativePath));
  for (const entry of files) {
    const parentPath = entry.relativePath.split("/").slice(0, -1).join("/");
    ensureDirectory(parentPath).files.push(entry);
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
  const visibleFiles = query ? folderFiles.filter((entry) => entry.relativePath.toLocaleLowerCase("zh-CN").includes(query)) : folderFiles;
  const visibleDirectories = query ? folderDirectories.filter((entry) => entry.relativePath.toLocaleLowerCase("zh-CN").includes(query)) : folderDirectories;
  folderSummary.textContent = `${folderName} · ${folderDirectories.length} 个目录 · ${visibleFiles.length}${query ? ` / ${folderFiles.length}` : ""} 个文档`;
  const tree = buildFolderTree(visibleFiles, visibleDirectories);
  fileTree.innerHTML = renderTreeNode(tree, true) || `<div class="empty-tree"><strong>没有匹配的文档</strong><p>支持 Office、OpenDocument、PDF 和 Markdown 格式。</p></div>`;
}

async function chooseFolder() {
  if (!("showDirectoryPicker" in window)) {
    setStatus("当前浏览器不支持文件夹读取，请使用最新版 Chrome 或 Edge。");
    return;
  }
  try {
    const directoryHandle = await window.showDirectoryPicker({ mode: "readwrite" });
    folderName = directoryHandle.name || "本地文件夹";
    folderSummary.textContent = `正在建立 ${folderName} 的目录索引……`;
    const index = await collectFolderIndex(directoryHandle);
    folderFiles = index.files;
    folderDirectories = index.directories;
    renderFolderTree();
    setStatus(`索引完成：${folderDirectories.length} 个目录、${folderFiles.length} 个文档；内容尚未加载`);
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

async function requestSave() {
  if ((!officePort && !markdownActive) || !fileName || pdfPreviewActive) return;
  setDocumentReady(false);
  setStatus(`正在保存：${fileName}`);
  if (markdownActive) {
    try {
      await persistBytes(new TextEncoder().encode(markdownEditor.value));
      markdownPreview.innerHTML = renderMarkdown(markdownEditor.value);
    } catch (error) {
      setStatus(`保存失败：${error.message}`);
    } finally {
      setDocumentReady(true);
    }
    return;
  }
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

function sendCommand(id, value) {
  if (!officePort || !fileName || documentMode !== "edit") return;
  officePort.postMessage({ cmd: "command", id, value });
  if (document.activeElement !== imeBridge) canvas.focus();
}

function colorNumber(hex) {
  return Number.parseInt(hex.replace("#", ""), 16);
}

function isWriterDocument() {
  return ["doc", "docx", "odt", "rtf", "txt", "html", "htm"].includes(extensionName(fileName));
}

function focusImeBridge(clientX, clientY) {
  if (!documentIsReady || documentMode !== "edit" || !isWriterDocument()) return;
  if (Number.isFinite(clientX)) imeBridge.style.left = `${Math.max(8, Math.min(window.innerWidth - 20, clientX))}px`;
  if (Number.isFinite(clientY)) imeBridge.style.top = `${Math.max(8, Math.min(window.innerHeight - 30, clientY))}px`;
  imeBridge.focus({ preventScroll: true });
  imeButton.classList.add("active");
  setStatus("中文输入已激活，可直接使用系统输入法");
}

function commitImeText() {
  if (imeComposing || !imeBridge.value) return;
  const text = imeBridge.value;
  imeBridge.value = "";
  sendCommand("InsertText", text);
}

function handleImeKeydown(event) {
  if (imeComposing || event.isComposing) return;
  const shortcut = event.ctrlKey || event.metaKey;
  if (shortcut) {
    const commands = { b: "Bold", i: "Italic", u: "Underline", z: event.shiftKey ? "Redo" : "Undo", y: "Redo" };
    const command = commands[event.key.toLowerCase()];
    if (command) {
      event.preventDefault();
      sendCommand(command);
    }
    if (event.key.toLowerCase() === "s") {
      event.preventDefault();
      requestSave();
    }
    return;
  }
  const commands = {
    Backspace: "SwBackspace", Delete: "Delete", Enter: "InsertPara", Tab: "InsertTab",
    ArrowLeft: "GoLeft", ArrowRight: "GoRight", ArrowUp: "GoUp", ArrowDown: "GoDown",
    Home: "GoToStartOfLine", End: "GoToEndOfLine", PageUp: "PageUp", PageDown: "PageDown"
  };
  if (commands[event.key]) {
    event.preventDefault();
    sendCommand(commands[event.key]);
  } else if (event.key === "Escape") {
    imeBridge.blur();
    imeButton.classList.remove("active");
    canvas.focus();
  }
}

function insertImage() {
  if (!documentIsReady || documentMode !== "edit") return;
  imagePicker.value = "";
  imagePicker.click();
}

async function handleSelectedImage() {
  const image = imagePicker.files?.[0];
  if (!image) return;
  try {
    ensureOfficeDirectory();
    const safeName = `insert-${Date.now()}-${image.name.replace(/[^\p{L}\p{N}._-]/gu, "-")}`;
    FS.writeFile(`/tmp/office/${safeName}`, new Uint8Array(await image.arrayBuffer()));
    officePort.postMessage({ cmd: "insert-image", filename: safeName });
    setStatus(`正在插入图片：${image.name}`);
  } catch (error) {
    setStatus(`图片插入失败：${error.message}`);
  }
}

function insertTable() {
  if (!documentIsReady || documentMode !== "edit") return;
  tableDialog.showModal();
  tableRows.focus();
}

async function receiveBridgeMessage(event) {
  const data = event.data;
  if (!data || data.source !== "xu-knowledge-base") return;
  if (embeddedMode && event.origin !== window.location.origin) return;
  if (data.type === "outline-jump") {
    document.getElementById(String(data.id || ""))?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  if (data.type !== "open-file") return;
  if (!(data.bytes instanceof ArrayBuffer) || typeof data.name !== "string") return;
  bridgeTarget = event.source;
  bridgeOrigin = event.origin || "*";
  fileHandle = null;
  try {
    await loadBytes(data.name, data.bytes, data.relativePath || data.name);
  } catch (error) {
    setStatus(`打开失败：${error.message}`);
  }
}

function notifyBridgeReady() {
  const target = window.opener || (window.parent !== window ? window.parent : null);
  if (target) target.postMessage({ source: BRIDGE_SOURCE, type: "ready", embedded: embeddedMode }, embeddedMode ? window.location.origin : "*");
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
modeButtons.forEach((button) => button.addEventListener("click", () => setDocumentMode(button.dataset.mode)));
fontFamily.addEventListener("change", () => sendCommand("CharFontName", fontFamily.value));
fontSize.addEventListener("change", () => sendCommand("FontHeight", fontSize.value));
fontColor.addEventListener("input", () => sendCommand("Color", colorNumber(fontColor.value)));
highlightColor.addEventListener("input", () => sendCommand("CharBackColor", colorNumber(highlightColor.value)));
lineSpacing.addEventListener("change", () => sendCommand(lineSpacing.value));
insertImageButton.addEventListener("click", insertImage);
imagePicker.addEventListener("change", handleSelectedImage);
insertTableButton.addEventListener("click", insertTable);
tableCancel.addEventListener("click", () => tableDialog.close());
tableDialog.addEventListener("submit", () => {
  const rows = Math.max(1, Math.min(20, Number.parseInt(tableRows.value, 10) || 3));
  const columns = Math.max(1, Math.min(12, Number.parseInt(tableColumns.value, 10) || 3));
  officePort.postMessage({ cmd: "insert-table", rows, columns });
  setStatus(`正在插入 ${rows} × ${columns} 表格`);
});
imeButton.addEventListener("click", () => focusImeBridge(window.innerWidth / 2, window.innerHeight / 2));
canvas.addEventListener("click", (event) => setTimeout(() => focusImeBridge(event.clientX, event.clientY), 0));
imeBridge.addEventListener("compositionstart", () => { imeComposing = true; });
imeBridge.addEventListener("compositionend", () => {
  imeComposing = false;
  queueMicrotask(commitImeText);
});
imeBridge.addEventListener("input", (event) => {
  if (!event.isComposing) commitImeText();
});
imeBridge.addEventListener("keydown", handleImeKeydown);
imeBridge.addEventListener("blur", () => imeButton.classList.remove("active"));
markdownEditor.addEventListener("input", () => {
  if (markdownActive && documentMode === "edit") setStatus(`Markdown 已修改：${currentRelativePath || fileName}`);
});
markdownEditor.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    requestSave();
  }
});
document.addEventListener("keydown", (event) => {
  if (documentMode !== "read" || !documentIsReady) return;
  const navigationKeys = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"]);
  if (navigationKeys.has(event.key) && !event.ctrlKey && !event.metaKey && !event.altKey) return;
  if (event.target === canvas || event.target === imeBridge) {
    event.preventDefault();
    event.stopImmediatePropagation();
    setStatus("当前为阅读模式；切换到“编辑”后才能修改文档");
  }
}, true);
window.addEventListener("message", receiveBridgeMessage);
window.addEventListener("beforeunload", () => {
  if (pdfObjectUrl) URL.revokeObjectURL(pdfObjectUrl);
  if (bridgeTarget) bridgeTarget.postMessage({ source: BRIDGE_SOURCE, type: "closed" }, bridgeOrigin);
});
setDocumentReady(false);
setDocumentMode("read", false);

async function bootOffice() {
  if (!embeddedMode) {
    if (!("serviceWorker" in navigator)) throw new Error("请使用最新版 Chrome 或 Edge");
    await navigator.serviceWorker.register(new URL("../sw.js", import.meta.url), { scope: "../" });
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      location.reload();
      return;
    }
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
  engineScript.addEventListener("error", () => {
    const error = new Error("文档引擎加载失败，请检查仓库文件是否完整");
    rejectEngineBoot?.(error);
    setStatus(`${error.message}。`);
  });
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
            resolveEngineBoot?.();
            return;
          }
          if (event.data.cmd === "ui_ready") {
            loading.hidden = true;
            welcome.hidden = true;
            canvas.hidden = false;
            setDocumentReady(true);
            setDocumentMode("read", false);
            setStatus(`阅读中：${currentRelativePath || fileName}`);
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
          if (event.data.cmd === "format-value") {
            const select = event.data.id === "CharFontName" ? fontFamily : event.data.id === "FontHeight" ? fontSize : null;
            if (select) {
              if (![...select.options].some((option) => option.value === event.data.value)) select.add(new Option(event.data.value, event.data.value));
              select.value = event.data.value;
            }
            return;
          }
          if (event.data.cmd === "operation-result" || event.data.cmd === "operation-error") {
            setStatus(event.data.message);
            return;
          }
          throw new Error(`未知消息：${event.data.cmd}`);
        } catch (error) {
          setDocumentReady(Boolean(fileName));
          setStatus(`操作失败：${error.message}`);
        }
      };
    }).catch((error) => {
      rejectEngineBoot?.(error);
      setStatus(`文档引擎初始化失败：${error.message}`);
    });
  });
  document.body.appendChild(engineScript);
}

function ensureOfficeEngine() {
  if (officePort) return Promise.resolve();
  if (!engineBootPromise) {
    engineBootPromise = new Promise((resolve, reject) => {
      resolveEngineBoot = resolve;
      rejectEngineBoot = reject;
    });
    bootOffice().catch((error) => {
      rejectEngineBoot?.(error);
      setStatus(`启动失败：${error.message}`);
    });
  }
  return engineBootPromise;
}

if (embeddedMode) {
  loading.hidden = true;
  welcome.hidden = false;
  welcome.querySelector("h1").innerHTML = "从 XU 打开一个文档";
  welcome.querySelector("p:not(.eyebrow)").textContent = "本地运行组件已连接，文档内容只在当前浏览器中处理。";
  welcome.querySelector(".welcome-actions").hidden = true;
  notifyBridgeReady();
} else {
  ensureOfficeEngine().catch((error) => setStatus(`启动失败：${error.message}`));
}
window.addEventListener("resize", () => requestAnimationFrame(() => window.dispatchEvent(new CustomEvent("xu-office-resize"))));
