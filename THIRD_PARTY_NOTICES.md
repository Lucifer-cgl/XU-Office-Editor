# 第三方组件说明

本项目的浏览器 Office 能力建立在以下开源组件之上。

## ZetaJS 1.2.0

- 项目：https://github.com/allotropia/zetajs
- 许可证：MIT
- 本仓库使用文件：`assets/vendor/zetajs/zeta.js`

## ZetaOffice / LibreOffice WebAssembly

- 项目介绍：https://zetaoffice.net/
- 上游源码：https://git.libreoffice.org/core/+/refs/heads/distro/allotropia/zeta-24-2
- Emscripten 源码：https://github.com/allotropia/emscripten/commits/fixed-3.1.65
- LibreOffice 许可证说明：https://www.libreoffice.org/licenses/
- 本仓库使用文件：`assets/zetaoffice/` 中的浏览器运行组件及分片

LibreOffice 官方说明其发行受 Mozilla Public License 2.0 约束，并包含采用 Apache License 2.0 及其他开源许可证的组件。公开发行本仓库前，应同时保留上游版权、完整许可证文本和对应源代码获取方式。

本项目自身的界面及桥接代码不改变上述第三方组件的许可证。
