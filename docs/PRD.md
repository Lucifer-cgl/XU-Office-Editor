# XU 本地 Office 编辑器 PRD

版本：0.1  
状态：技术验证中  
更新时间：2026-09-23

## 一、产品目标

在保留 XU 左侧文件夹目录、顶部多文档标签和本地隐私的前提下，让访客直接查看、编辑并保存自己电脑中的 Word、Excel、PowerPoint、Markdown、HTML、TXT 等文件。

XU 不复制、不上传、不托管访客文件。编辑器只提供浏览器内的工作窗口；用户不需要安装 Microsoft Office、WPS、LibreOffice 或其他桌面编辑器。

## 二、选型结论

第一选择是 ZetaOffice / ZetaJS。

它把 LibreOffice 编译为 WebAssembly，在访客浏览器中运行 Writer、Calc 和 Impress。官方示例已经提供本地文件选择、浏览器内编辑以及通过 File System Access API 写回原文件的完整路径。

不选择以下路线作为第一版：

- Microsoft 365 for the web：必须实现 WOPI 文件服务、令牌、锁等后端能力，而且生产接入需要加入微软的云存储合作伙伴计划。
- Collabora Online：必须部署 Collabora 服务并实现 WOPI Host，本地文件不能直接交给编辑器。
- ONLYOFFICE Docs：必须部署 Document Server、文件下载地址和保存回调服务。
- Univer：编辑界面适合深度定制，但 Office 文件高保真导入导出依赖转换后端或商业能力，不能直接解决当前的本地文件闭环。

## 三、系统边界

### XU 主站负责

- 选择并记住本地文件夹授权。
- 生成目录树和顶部标签。
- 持有 `FileSystemFileHandle`。
- 读取文件字节并交给 Office 编辑器。
- 接收编辑后的字节并写回原文件。
- MD、HTML、TXT 的轻量快速预览。

### 独立 Office 编辑器负责

- 懒加载浏览器端 LibreOffice。
- 打开 DOC/DOCX、XLS/XLSX、PPT/PPTX、ODF 等格式。
- 提供 Writer、Calc、Impress 的编辑能力。
- 保存到浏览器内虚拟文件系统。
- 把保存后的文件字节交回 XU。

### 不在第一版范围内

- 多人实时协作。
- 账号、云盘和跨设备同步。
- 版本历史和冲突合并。
- 手机端完整编辑体验。
- 与微软或 WPS 账号体系连接。

## 四、关键流程

1. 用户在 XU 的“我的资源”中选择文件夹。
2. 用户点击 Office 文件。
3. XU 打开独立编辑器窗口，并等待 `ready` 消息。
4. XU 读取文件为 `ArrayBuffer`，通过 `postMessage` 转移给编辑器。
5. 编辑器把字节写入 WebAssembly 虚拟文件系统，由 LibreOffice 打开。
6. 用户点击保存。
7. 编辑器把修改后的字节交回 XU。
8. XU 请求一次写入权限并覆盖原文件。

## 五、部署结构

```text
XU 主站（小、快、静态）
  └─ 文件目录、标签、预览、原文件句柄

XU Office Editor（独立仓库/独立部署）
  ├─ 编辑器外壳
  ├─ ZetaJS 桥接代码
  └─ ZetaOffice WASM：随独立仓库分发，不依赖第三方 CDN
```

独立部署必须返回 COOP/COEP 响应头。由于这些头会影响跨窗口引用关系，第一轮优先验证“独立页面直接打开和保存”；第二轮再验证 XU 与编辑器之间的消息通道。如果浏览器因跨源隔离切断 `window.opener`，则把桥接页放在 XU 同源下，编辑引擎仍保持独立部署。

## 六、验收标准

### 技术验证

- DOCX、XLSX、PPTX 各至少打开一个真实样例。
- 修改文字或单元格后可保存。
- 重新用桌面 Office/WPS 打开，修改仍存在且文件未损坏。
- 文件内容不产生网络上传请求。
- 首次加载失败时给出明确提示，不影响 XU 主站。

### XU 接入

- 从“我的资源”单击 Office 文件即可进入编辑器。
- 保存后写回原文件，不要求重新下载和替换。
- XU 的目录、标签和当前文件状态保持不丢失。
- 用户可以随时退回只读预览或交给本机 Office/WPS。

## 七、实施顺序

1. 完成独立编辑器 PoC：直接选择、编辑、保存本地文件。
2. 用真实 DOCX/XLSX/PPTX 做兼容性和性能测试。
3. 完成 XU ↔ 编辑器消息桥接。
4. 在 XU Office 文件卡片上增加“浏览器内编辑”。
5. 把完整浏览器引擎资源纳入独立仓库，并提供零安装启动脚本。
6. 再处理 Markdown、HTML、TXT 的轻量编辑器，不让它们承担 LibreOffice 的加载成本。
