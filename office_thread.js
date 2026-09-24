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

function dispatch(command, value) {
  if (!controller) return;
  const urlObject = transformUrl(`.uno:${command}`);
  const args = [];
  if (command === "CharFontName") {
    args.push(
      new css.beans.PropertyValue({ Name: "CharFontName.StyleName", Value: "" }),
      new css.beans.PropertyValue({ Name: "CharFontName.Pitch", Value: zetajs.Any("short", 0) }),
      new css.beans.PropertyValue({ Name: "CharFontName.CharSet", Value: zetajs.Any("short", -1) }),
      new css.beans.PropertyValue({ Name: "CharFontName.Family", Value: zetajs.Any("short", 0) }),
      new css.beans.PropertyValue({ Name: "CharFontName.FamilyName", Value: String(value) })
    );
  } else if (command === "FontHeight") {
    args.push(
      new css.beans.PropertyValue({ Name: "FontHeight.Height", Value: zetajs.Any("float", Number.parseFloat(value)) }),
      new css.beans.PropertyValue({ Name: "FontHeight.Prop", Value: zetajs.Any("short", 100) }),
      new css.beans.PropertyValue({ Name: "FontHeight.Diff", Value: zetajs.Any("float", 0) })
    );
  } else if (command === "InsertText") {
    args.push(new css.beans.PropertyValue({ Name: "Text", Value: String(value) }));
  } else if (command === "Zoom") {
    args.push(new css.beans.PropertyValue({ Name: "Zoom.Value", Value: zetajs.Any("short", Math.round(Number(value) || 100)) }));
  } else if (command === "Color" || command === "CharBackColor") {
    args.push(new css.beans.PropertyValue({ Name: `${command}.Color`, Value: zetajs.Any("long", Number(value)) }));
  }
  queryDispatch(urlObject)?.dispatch(urlObject, args);
}

function setDocumentZoom(value) {
  if (!controller) return;
  const zoom = Math.max(60, Math.min(160, Math.round(Number(value) || 100)));
  try {
    const settings = controller.getViewSettings();
    settings.setPropertyValue("ZoomValue", zetajs.Any("short", zoom));
  } catch { /* Some document modules do not expose view settings. */ }
  try { dispatch("Zoom", zoom); } catch { /* Keep the native view at its current scale. */ }
}

function insertImage(filename) {
  const urlObject = transformUrl(".uno:InsertGraphic");
  const args = [
    new css.beans.PropertyValue({ Name: "FileName", Value: `file:///tmp/office/${filename}` }),
    new css.beans.PropertyValue({ Name: "AsLink", Value: false })
  ];
  queryDispatch(urlObject)?.dispatch(urlObject, args);
}

function insertTable(rows, columns) {
  const text = model.getText();
  const viewCursor = controller.getViewCursor();
  const cursor = text.createTextCursorByRange(viewCursor);
  const table = model.createInstance("com.sun.star.text.TextTable");
  table.initialize(rows, columns);
  text.insertTextContent(cursor, table, false);
}

function bindCommandState(command) {
  try {
    const urlObject = transformUrl(`.uno:${command}`);
    const listener = zetajs.unoObject([css.frame.XStatusListener], {
      disposing() {},
      statusChanged(state) {
        let value = zetajs.fromAny(state.State);
        if (typeof value === "boolean") {
          zetajs.mainPort.postMessage({ cmd: "format-state", id: command, state: value });
          return;
        }
        if (command === "CharFontName" && value?.Name !== undefined) value = String(value.Name);
        else if (command === "FontHeight" && value?.Height !== undefined) value = String(value.Height);
        else return;
        zetajs.mainPort.postMessage({ cmd: "format-value", id: command, value });
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
  try { layout.showElement("private:resource/dockingwindow/Sidebar"); } catch {}
  try { dispatch("SidebarDeck.NavigatorDeck"); } catch {}
  try { layout.hideElement("private:resource/statusbar/statusbar"); } catch {}
  try { dispatch("Ruler"); } catch {}
}

function loadFile(filename) {
  if (model) {
    try { model.close(true); } catch {}
  }
  model = desktop.loadComponentFromURL(`file:///tmp/office/${filename}`, "_default", 0, []);
  controller = model.getCurrentController();
  hideNativeChrome();
  [
    "Bold", "Italic", "Underline", "Strikeout", "DefaultBullet", "DefaultNumbering",
    "LeftPara", "CenterPara", "RightPara", "JustifyPara", "CharFontName", "FontHeight"
  ].forEach(bindCommandState);
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
      dispatch(event.data.id, event.data.value);
      return;
    }
    if (event.data.cmd === "document-zoom") {
      setDocumentZoom(event.data.value);
      return;
    }
    if (event.data.cmd === "insert-image") {
      try {
        insertImage(event.data.filename);
        zetajs.mainPort.postMessage({ cmd: "operation-result", message: "图片已插入文档" });
      } catch (error) {
        zetajs.mainPort.postMessage({ cmd: "operation-error", message: `图片插入失败：${error.message}` });
      }
      return;
    }
    if (event.data.cmd === "insert-table") {
      try {
        insertTable(event.data.rows, event.data.columns);
        zetajs.mainPort.postMessage({ cmd: "operation-result", message: `已插入 ${event.data.rows} × ${event.data.columns} 表格` });
      } catch (error) {
        zetajs.mainPort.postMessage({ cmd: "operation-error", message: `表格插入失败：${error.message}` });
      }
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
