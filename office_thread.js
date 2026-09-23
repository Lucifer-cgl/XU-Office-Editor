/* Adapted from the official ZetaJS web-office example (MIT). */
"use strict";

let zetajs;
let css;
let desktop;
let model;

function loadFile(filename) {
  if (model) {
    try { model.close(true); } catch {}
  }
  model = desktop.loadComponentFromURL(`file:///tmp/office/${filename}`, "_default", 0, []);
  const controller = model.getCurrentController();
  controller.getFrame().getContainerWindow().FullScreen = true;
  zetajs.mainPort.postMessage({ cmd: "ui_ready" });
}

function run() {
  const context = zetajs.getUnoComponentContext();
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
    throw new Error(`Unknown message command: ${event.data.cmd}`);
  };
  zetajs.mainPort.postMessage({ cmd: "thr_running" });
}

Module.zetajs.then((resolvedZetajs) => {
  zetajs = resolvedZetajs;
  css = zetajs.uno.com.sun.star;
  run();
});
