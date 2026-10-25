<div align="center">
  <img src="./src/assets/icon.svg" width="120" height="120" alt="LocalSqueeze Logo" />

<h1 align="center">LocalSqueeze</h1>

​			  ![macOS](https://img.shields.io/badge/macOS-000000?style=for-the-badge&logo=apple&logoColor=white) ![Windows](https://img.shields.io/badge/Windows-0078D4?style=for-the-badge&logo=windows&logoColor=white) ![Linux](https://img.shields.io/badge/Linux-FCC624?style=for-the-badge&logo=linux&logoColor=black) ![License](https://img.shields.io/badge/license-MIT-green?style=for-the-badge) ![Version](https://img.shields.io/badge/version-v1.0.3-blue?style=for-the-badge) ![Stars](https://img.shields.io/github/stars/freeany/LocalSqueeze?style=for-the-badge&logo=github)

<div align="center">简体中文 | <a href="./README.en-US.md">English</a></div>
<h5 align="center">一款功能丰富、高效灵活的跨平台桌面图片压缩应用</h5>

</div>

## 📸 项目截图

<img width="1320" height="800" alt="735shots_so" src="https://github.com/user-attachments/assets/f571baa2-4340-4b64-b208-19e2494e1bd4" />



## ✨ 特性
- **🔐 安全至上**：所有操作均在本地完成，零数据泄露风险
- **🔍 高质量压缩** - 智能压缩策略，在保持图片质量的同时最大程度减小文件大小
- **🚀 批量处理** - 同时处理多张图片，提高工作效率
- **📋 粘贴压缩** - 在首页或图片处理页按 Ctrl+V（Windows/Linux）或 ⌘V（macOS）粘贴图片或截图，按当前设置自动压缩；连续粘贴可排队处理
- **🎯 目标体积（可选）** - 在压缩设置中开启“每张图片小于 200 KB”等自定义目标，自动调整质量、颜色，必要时按允许的规则缩小尺寸；未达到目标会明确提示
- **🎨 PNG 压缩方式** - 默认推荐“减色压缩”，通常更明显地减小体积；可选“保色优化”，不主动减少颜色，保留渐变层次与平滑过渡，体积降幅通常较少。保色选择也会在目标体积模式下生效
- **🎨 体验优先**：直观的界面设计，流畅的操作体验
- **🔧 灵活配置**：丰富的压缩参数，满足专业用户需求
- **🌍 跨平台**：支持 Windows、macOS 主流平台
- **👁️ 效果对比** - 直观对比压缩前后的效果，确保图片质量
- **🌓 深色模式** - 支持深色/浅色主题切换

## 🏆 产品优势

### 🆚 与同类产品对比


#### 相比 TinyPNG

- 🔒 **隐私安全保障** - 100% 本地处理，图片数据不会上传到任何服务器，完全保护用户隐私
- 💪 **更优压缩效果** - 实测同一张图片，LocalSqueeze 压缩至 104KB，TinyPNG 压缩至 175KB，质量无差异
- 🚀 **无网络依赖** - 离线即可使用，不受网络环境限制
- 💰 **完全免费** - 无 API 调用限制，无需付费订阅
- 🔧 **高度可定制** - 支持压缩级别、格式转换等多种参数调整

#### 相比 Picdiet

- 🎯 **支持的图片格式更多** - Picdiet 仅支持 JPG
- 🎨 **更佳的交互体验** - 精心设计的用户界面，操作流程更加直观友好
- ⚙️ **更丰富的配置选项** - 提供更多自定义压缩参数，满足不同场景需求


## 🛠️ 技术栈

```mermaid
graph TD
    subgraph "桌面应用 (Electron)"
        A[用户界面] --> B[Electron主进程]
        A --> C[Electron渲染进程]
        B <--> C
        C --> D[React前端]
        B --> E[Node.js后端]
        D <--> E
        E --> F[图片处理服务]
    end
```

- ⚡ **Electron** - 跨平台桌面应用框架
- ⚛️ **React** - 用户界面构建
- 📘 **TypeScript** - 类型安全的 JavaScript 超集
- 🎨 **Tailwind CSS** - 实用优先的 CSS 框架
- 🔪 **Sharp** - 高性能 Node.js 图片处理库
- 🔨 **Electron Forge** - 应用打包与发布工具

## 🚀 快速开始

### 克隆项目

```bash
git clone https://github.com/freeany/LocalSqueeze.git
cd LocalSqueeze
```

### 安装依赖

```bash
npm install
```

### 启动开发环境

```bash
npm run start
```

## 📦 构建打包

```bash
# 构建当前平台的安装包
npm run make

# 构建Windows平台安装包
npm run make:win

# 构建macOS平台安装包
npm run make:mac
```

## 🚢 发布

```bash
# 发布当前平台的安装包到GitHub Release
npm run publish
```

### 自动化构建和发布

项目配置了GitHub Actions工作流，当推送带有标签的提交时（如`v1.0.1`），会自动触发构建并发布到GitHub Release。

```bash
git add .
git commit -m "release: v1.0.1"
git tag v1.0.1
git push && git push --tags
```

## 🗂️ 项目架构

```
src/
├── main.ts           # Electron主进程入口
├── preload.ts        # 预加载脚本
├── renderer.ts       # 渲染进程入口
├── app.tsx           # React应用入口
├── components/       # React组件
├── views/            # 页面视图
└── server/           # 服务端逻辑
    ├── compression/  # 图片压缩核心逻辑
    ├── ipc/          # 进程间通信
    ├── storage/      # 存储管理
    └── workers/      # 工作线程
```

## 📝 开源协议

本项目采用 [MIT](./LICENSE) 协议开源

## 📞 联系方式

- **作者**：lhr
- **邮箱**：lhr_freeany@163.com
- **项目主页**：[https://github.com/freeany/LocalSqueeze](https://github.com/freeany/LocalSqueeze)

## 🌟 支持项目

如果这个项目对你有帮助，欢迎点个 star ⭐️


## 图片尺寸处理（v1.1.0）

侧边栏按工具分组：“图片压缩”保留原有压缩设置、导入和导出；“图片尺寸处理”提供独立的尺寸与裁剪工作台、导出列表。

- 支持多图选择、拖放、Ctrl+V / ⌘V 粘贴和文件夹导入。
- 选择一寸、二寸、护照数字／纸质参考、国考源照片、美国签证参考，或自定义像素（如 150×200）。
- 拖动裁剪框移动选区，拖动边角缩放，方向键微调；每张图保留各自选区，可逐张或批量生成。
- 支持等比裁剪、等比留白、拉伸，以及 JPEG、PNG、WebP 和打印 DPI。PNG 默认不减色；尺寸输出允许放大，会提示细节不会随放大增加。
- 从原图生成精确像素，不使用屏幕预览图作为输出源；自动处理 EXIF 方向。设置与压缩模块独立，切换页面保留当前工作台。
- 两个工具复用导入、文件保存和批量导出通道，按操作类型区分历史；未标记的旧历史仍属于图片压缩。尺寸处理不计入压缩节省空间统计。
- 导出默认不覆盖同名文件，自动添加序号。生成结果保存在应用数据目录的 `resized-images/` 下，原图不被覆盖。

证件照预设仅提供尺寸和构图参考，不自动换背景或审核人像。数字照和纸质照片的比例可能不同；国考照片仍需通过当年官方照片处理工具。各预设在界面内附用途说明和适用来源，查阅日期为 2026-10-26。

规格参考：[一寸及考试照片](https://rsj.beijing.gov.cn/ywsite/bjpta/fwzn/cjwt/bm/cz/qgpt/202108/t20210821_2473438.html)、[2027 国考指南](https://shanghai.chinatax.gov.cn/xxgk/rsxx/202610/t481764.html)、[护照纸质照片](https://pg.china-embassy.gov.cn/lsyw/lszj/hzlxz/hzlzyq/202401/t20240103_11216467.html)、[护照数字照片](https://dj.china-embassy.gov.cn/lsfw/linshizhengjian/huzhaolvxingzheng/202311/P020231126826793735884.pdf)、[美国签证数字照片](https://travel.state.gov/content/travel/en/us-visas/visa-information-resources/photos.html)。

裁剪交互使用 [React Image Crop 11.1.2](https://www.npmjs.com/package/react-image-crop)，ISC 许可，声明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。像素输出复用项目现有 Sharp 依赖。
