/* Adapted from the official ZetaJS standalone and web-office examples (MIT). */
"use strict";

let zetajs;
let css;
let context;
let desktop;
let model;
let controller;

const windowStatePaths = [
  "/org.openoffice.Office.UI.WriterWindowState/UIElements/States",
  "/org.openoffice.Office.UI.CalcWindowState/UIElements/States",
  "/org.openoffice.Office.UI.ImpressWindowState/UIElements/States",
  "/org.openoffice.Office.UI.DrawWindowState/UIElements/States"
];

function hideConfiguredToolbars() {
  for (const path of windowStatePaths) {
    try {
      const config = css.configuration.ReadWriteAccess.create(context, "zh-CN");
      const elements = config.getByHierarchicalName(path);
      for (const name of elements.getElementNames()) {
        const element = elements.getByName(name);
        if (element.getByName("Visible")) element.setPropertyValue("Visible", false);
      }
      config.commitChanges();
    } catch {
      // Some document modules may not expose every configuration branch.
    }
  }
}

function transformUrl(unoUrl) {
  const parameter = { val: new css.util.URL({ Complete: unoUrl }) };
  css.util.URLTransformer.create(context).parseStrict(parameter);
  return parameter.val;
}

function queryDispatch(urlObject) {
  return controller?.queryDispatch(urlObject, "_self", 0);
}

function dispatch(command) {
  if (!controller) return;
  const urlObject = transformUrl(`.uno:${command}`);
  queryDispatch(urlObject)?.dispatch(urlObject, []);
}

function bindFormattingState(command) {
  try {
    const urlObject = transformUrl(`.uno:${command}`);
    const listener = zetajs.unoObject([css.frame.XStatusListener], {
      disposing() {},
      statusChanged(state) {
        let value = zetajs.fromAny(state.State);
        if (typeof value !== "boolean") value = false;
        zetajs.mainPort.postMessage({ cmd: "format-state", id: command, state: value });
      }
    });
    queryDispatch(urlObject)?.addStatusListener(listener, urlObject);
  } catch {
    // A command may not expose state in every document type.
  }
}

function hideNativeChrome() {
  const frame = controller.getFrame();
  const layout = frame.LayoutManager;
  frame.getContainerWindow().FullScreen = true;
  try { layout.hideElement("private:resource/menubar/menubar"); } catch {}
  try { layout.hideElement("private:resource/dockingwindow/Sidebar"); } catch {}
  try { layout.hideElement("private:resource/statusbar/statusbar"); } catch {}
  try { dispatch("Sidebar"); } catch {}
  try { dispatch("Ruler"); } catch {}
}

function loadFile(filename) {
  if (model) {
    try { model.close(true); } catch {}
  }
  model = desktop.loadComponentFromURL(`file:///tmp/office/${filename}`, "_default", 0, []);
  controller = model.getCurrentController();
  hideNativeChrome();
  ["Bold", "Italic", "Underline"].forEach(bindFormattingState);
  zetajs.mainPort.postMessage({ cmd: "ui_ready" });
}

function run() {
  context = zetajs.getUnoComponentContext();
  hideConfiguredToolbars();
  desktop = css.frame.Desktop.create(context);
  zetajs.mainPort.onmessage = (event) => {
    if (event.data.cmd === "upload") {
      loadFile(event.data.filename);
      return;
    }
    if (event.data.cmd === "download") {
      model.store();
      zetajs.mainPort.postMessage({ cmd: "download" });
      return;
    }
    if (event.data.cmd === "command") {
      dispatch(event.data.id);
      return;
    }
    throw new Error(`Unknown message command: ${event.data.cmd}`);
  };
  zetajs.mainPort.postMessage({ cmd: "thr_running" });
}

Module.zetajs.then((resolvedZetajs) => {
  zetajs = resolvedZetajs;
  css = zetajs.uno.com.sun.star;
  run();
});
