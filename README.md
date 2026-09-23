# 墟 · Office 编辑器

这是 XU 的独立、本地优先 Office 编辑器验证项目。它使用 ZetaOffice / ZetaJS 在浏览器中运行 LibreOffice WebAssembly，不需要把文档上传到服务器，也不要求用户安装 Microsoft Office、WPS 或 LibreOffice。

## 当前验证目标

- 在 Chrome / Edge 中打开本地 Word、Excel、PowerPoint、OpenDocument、TXT、HTML 和 CSV 文件。
- 在浏览器内使用 Writer、Calc、Impress 编辑。
- 获得授权时覆盖保存原文件；无法直接写回时下载新文件。
- 通过 `postMessage` 与 XU 交换文件字节，XU 保留文件夹句柄和写入权限。
- Office 引擎与 XU 主站分离，避免大体积运行组件进入 XU 仓库或首屏资源。
- 编辑器仓库自带全部运行组件，不依赖第三方 CDN。

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
