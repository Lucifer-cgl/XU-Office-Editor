# 墟 · Office 编辑器

这是 XU 的独立、本地优先 Office 编辑器验证项目。它使用 ZetaOffice / ZetaJS 在浏览器中运行 LibreOffice WebAssembly，不需要把文档上传到服务器，也不要求用户安装 Microsoft Office、WPS 或 LibreOffice。

## 当前验证目标

- 在 Chrome / Edge 中打开本地 Word、Excel、PowerPoint、OpenDocument、TXT、HTML、CSV 和 PDF 文件。
- 在浏览器内使用 Writer、Calc、Impress 编辑。
- 获得授权时覆盖保存原文件；无法直接写回时下载新文件。
- 通过 `postMessage` 与 XU 交换文件字节，XU 保留文件夹句柄和写入权限。
- Office 引擎与 XU 主站分离，避免大体积运行组件进入 XU 仓库或首屏资源。
- 编辑器仓库自带全部运行组件，不依赖第三方 CDN。
- 默认附带 Noto Sans SC 中文字体，用户无需另行安装字体即可正常显示中文文档。

## 新界面与本地文件夹

- 使用中文工作台替代 LibreOffice 原生菜单、工具栏、侧栏和状态栏，仅保留文档画布。
- 点击“打开文件夹”会调用浏览器的系统文件夹选择器；左侧列表展示用户实际授权的文件和目录，不再显示虚拟的 Home / Web User。
- 用户明确授权后可直接保存回原文件；单独打开且浏览器无法写回时，会下载保存后的文件。
- 文件夹权限由浏览器控制，项目不会扫描未授权目录，也不会上传文档。
- 文档默认以阅读模式打开，避免误触修改；切换到编辑模式后才启用格式工具和文字输入。
- Writer 编辑模式提供浏览器中文输入桥，可接收系统拼音输入法最终选中的汉字，并写入当前光标位置。
- 常用工具包括字体、字号、字色、高亮、粗体、斜体、下划线、删除线、段落对齐、列表、缩进、行距、图片、表格和分页。
- PDF 会出现在本地文件夹目录中，并使用浏览器内置查看器只读预览；不进入 Office 编辑内核，也不会显示保存或编辑工具。

## 本地运行（零安装）

在 Windows 中双击 `start.cmd`。脚本会启动本地页面并自动打开浏览器，不会安装任何软件。

其他系统可以用任意能添加 COOP/COEP 响应头的静态服务器运行本仓库。在线发布时可直接部署整个仓库。

仓库必须包含：

```text
assets/zetaoffice/soffice.js
assets/zetaoffice/soffice.wasm.part001 ...
assets/zetaoffice/soffice.data.part001 ...
assets/zetaoffice/soffice.data.js.metadata
assets/vendor/zetajs/zeta.js
assets/fonts/NotoSansSC.ttf
assets/fonts/OFL.txt
```

由于完整 WASM 文件超过 GitHub 的单文件限制，仓库将它拆成不超过 20 MB 的分片。`sw.js` 会在浏览器内部流式组合这些分片，不在电脑中安装 Office，也不额外生成一份永久副本。

## 与 XU 的消息协议

XU 在编辑器报告 `ready` 后发送：

```js
editorWindow.postMessage({
  source: "xu-knowledge-base",
  type: "open-file",
  name: file.name,
  bytes: await file.arrayBuffer()
}, editorOrigin, [bytes]);
```

编辑器保存后返回：

```js
{
  source: "xu-office-editor",
  type: "file-saved",
  name,
  bytes
}
```

XU 收到后使用原来的 `FileSystemFileHandle.createWritable()` 写回文件。文件内容只在两个浏览器窗口之间传递。

## 浏览器安全要求

WebAssembly 多线程运行需要服务器返回：

```text
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

项目已配置 Cloudflare Pages `_headers`，并附带会自动添加这些响应头的 Windows 双击启动脚本。
