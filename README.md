# 墟 · Office 编辑器

这是 XU 的独立、本地优先 Office 编辑器验证项目。它使用 ZetaOffice / ZetaJS 在浏览器中运行 LibreOffice WebAssembly，不需要把文档上传到服务器，也不要求用户安装 Microsoft Office、WPS 或 LibreOffice。

本仓库同时是 XU 可选择的本地文档运行组件目录。用户下载或克隆一次后，可以在 XU 的“本地文档引擎”入口选择本仓库根目录；XU 保留自己的左侧目录、公共/本地混合标签和右侧栏，只把本仓库的文档画布与编辑工具嵌入中间区域。

## 仓库与下载

- GitHub 源码仓库：[Lucifer-cgl/XU-Office-Editor](https://github.com/Lucifer-cgl/XU-Office-Editor)
- GitHub ZIP 下载：[下载最新版](https://github.com/Lucifer-cgl/XU-Office-Editor/archive/refs/heads/main.zip)
- XU 主仓库：[Lucifer-cgl/XU](https://github.com/Lucifer-cgl/XU)
- XU 在线入口：[xu.lucifer-cgl.workers.dev](https://xu.lucifer-cgl.workers.dev/)

海外用户可直接使用 GitHub；中国大陆用户后续可使用同版本 Gitee 镜像（镜像地址发布后会在这里补充）。下载后请完整解压并保留目录结构，不要删除或改名 `assets/`、`sw.js` 和字体文件。

## 当前验证目标

- 在 Chrome / Edge 中打开本地 Word、Excel、PowerPoint、OpenDocument、Markdown、TXT、HTML、CSV 和 PDF 文件。
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
- 选择文件夹时只遍历目录项并保存浏览器文件句柄，不读取任何文档内容；用户点击某个文件后才调用 `getFile()` 读取该文件。
- 目录树会保留空目录，并展示 Word、Excel、PowerPoint、PDF、Markdown 等支持的文档；Markdown 使用独立的阅读与纯文本编辑界面。

## 本地运行（零安装）

在 Windows 中双击 `start.cmd`。脚本只使用 Windows 自带的 CMD、PowerShell 和 .NET TCP 监听，不需要安装 Python、Node.js 或其他运行时；启动后会自动打开浏览器。

也可以先双击 `build-dist.cmd` 生成独立的 `dist/` 运行目录，再双击 `start-dist.cmd` 一键启动。发布给访客时可直接分发 `dist/` 目录；XU 的“我的资源”也可以直接选择这个 `dist/` 目录作为本地编辑器目录。

Office 编辑器也可以脱离 XU 单独使用：双击 `start.cmd` 后，在工作台中点击“打开文件”选择单个文档，或点击“打开文件夹”建立本地目录树。独立模式支持阅读/编辑切换、保存、文档缩放、手型拖动和全屏工作区；文件仍只在当前浏览器中处理。

从 XU 使用时，则在“我的资源”底部连接本仓库根目录，由 XU 负责文件夹导航和标签，Office 负责中间文档编辑区。两种打开方式使用同一套本地运行组件。

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

嵌入地址使用 `?embedded=1`。嵌入模式会隐藏本仓库自己的文件夹侧栏和品牌外壳，PDF 与 Markdown 可直接打开；只有 Word、Excel、PowerPoint 等 Office 格式才启动大型 WebAssembly 内核。Markdown 会通过 `outline-changed` 消息把标题目录交给 XU，XU 使用 `outline-jump` 请求工作台跳转。

本地联调时不需要发布仓库：在 XU 左侧“我的资源”底部选择当前 `XU-Office-Editor` 仓库根目录即可。XU 的 Service Worker 会把获得授权的本地运行文件映射为同源资源，并在浏览器中流式组合 WASM/Data 分片。

## 发行约定

- GitHub 仓库用于源码协作和国外下载；
- Gitee 镜像用于中国大陆下载；
- 两边必须使用相同版本号并发布相同内容；
- 发行包保持完整目录结构，不要求用户安装 WPS、Microsoft Office 或 LibreOffice；
- 用户解压后应放在固定目录，不应移动、改名或删除其中的运行组件；
- 更新包应附带版本和文件校验清单，后续支持只更新变化的分片。

## 浏览器安全要求

WebAssembly 多线程运行需要服务器返回：

```text
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

项目已配置 Cloudflare Pages `_headers`，并附带会自动添加这些响应头的 Windows 双击启动脚本。
