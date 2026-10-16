# 一页阅读 1.0.0

一个完全离线、中文界面的安卓小说阅读器。支持 Android 8.0 及以上，包名 `com.adfree.reader`。无需登录、没有广告，没有申请网络或广泛存储权限。界面通过手机系统 Android WebView 渲染，请保持 Android System WebView 更新。

## 安装与开始

1. 从 [Releases](https://github.com/Ad-free-is-important/offline-novel-reader/releases/latest) 下载并打开 APK。
2. 手机如提示，允许用于打开安装包的应用“安装未知应用”，继续安装。
3. 打开“一页阅读”，可先用内置八章原创短篇《雨停之后》体验。
4. 点“导入小说”→“选择本地文件”，从系统文件选择器导入 TXT 或未加密 EPUB。可多选，单次最多 20 本，单本文件最多 30 MB。

## 功能

- **本地书架**：搜索、按最近阅读／导入／书名排序，编辑书名、作者与封面颜色，确认后移除、重置进度。
- **TXT 自动分章**：识别“第一章”“第 1 章”、卷／回／节、Chapter、Part、数字标题和常见序章／尾声。没有标题时按正文分段；超过约 1.6 万字符的章节会分为续节，限制单章排版开销。
- **常见文本编码**：自动识别 UTF-8、带 BOM 的 UTF-16，UTF-8 失败时尝试 GB18030（兼容常见 GBK）。可手选 UTF-8、GB18030、Big5、UTF-16 LE／BE。乱码时移除书籍，切换编码重新导入。
- **EPUB**：按原书 spine 顺序读取文字，读取书名和作者，优先使用正文标题，其次 EPUB2 NCX／EPUB3 导航标题。转换成统一的纯文字排版。
- **阅读位置保存**：按章节和文字位置保存，滚动、翻页、切换章节、离开页面时自动保存。下次点“继续阅读”；调整字体或阅读方式后，定位到包含原位置的页面／段落。
- **两种阅读方式**：在阅读菜单第一行直接选“滚动”或“翻页”，也可在页面设置中切换。上下滚动、左右分页；仿真翻页可跟手拖动、暂停与回弹。分页时可用上一页／下一页按钮、点左右两侧或横滑翻页，点中间显示／收起菜单。滚动模式从菜单切换前后章节。
- **目录与书签**：搜索章节或序号，目录连续滚动，无分页和人为章节数上限，支持定位当前章、开头和末尾；添加、跳转、编辑备注、删除书签。每本书最多 1000 个书签。
- **全文搜索**：输入至少 2 个字符，搜索整本小说；显示前 80 处匹配，点击跳转并标记相关段落。
- **全书进度跳转**：点阅读页右下角的百分比，用滑条跳转。
- **页面定制**：素纸、暖纸、麦黄、青竹、夜读、自定义背景与文字颜色；独立仿纸纹理开关及强度；系统衬线／无衬线／等宽字体；字号 14–36 px、行距、字距、段距、左右／上下页边距、两端对齐。字体实际效果取决于手机字体。
- **屏幕设置**：常亮、全屏、跟随系统亮度／独立阅读亮度。书架另有深色模式。
- **完整备份**：应用设置中导出 ZIP，包含全部小说、阅读进度、书签和设置。恢复前确认替换，先在暂存目录校验，成功后替换数据；校验失败保留原数据。备份恢复展开上限 250 MB，最多约 1000 本。

## 本地数据与格式边界

导入后复制为应用私有数据，原文件移动后仍可阅读。卸载或清除应用数据会删除全部本地内容，请先导出完整备份。备份包含小说正文，分享前请确认其内容。

EPUB 以文字小说为目标，图片、音频、复杂 CSS、固定版式和 DRM 不支持；保留文字和章节顺序，不复刻原书视觉样式。单个 EPUB 内容文件解压后最多 5 MB，正文总计最多 30 MB。TXT 分章是规则识别，特殊标题可能无法识别；正文仍会按分段形式保留。没有在线书城或爬取功能。

## 源码结构

- `assets/index.html`、`style.css`：书架、阅读页和设置界面。
- `assets/model.js`：阅读位置、段落映射、预览分章和原创示例。
- `assets/reader-controls.js`：相对拖动滑条、RGB／HSV 颜色转换。
- `assets/page-curl.js`：纸张弯曲、纸背、阴影、跟手帧和松手完成／回弹动画。
- `assets/pagination.js`：原生换行测量、文字位置映射与普通满页底部对齐。
- `assets/app.js`：书架、阅读、分页、书签、搜索、主题、Android 桥接；网页运行时用 IndexedDB 保存小说。
- `src/com/adfree/reader/MainActivity.java`：受限本地 HTTPS 资源、系统文件选择器、原子保存、备份恢复、系统栏和屏幕控制。
- `ReaderParser.java`：安卓实际使用的 TXT 编码与章节识别。
- `EpubReader.java`：EPUB 包结构、阅读顺序、目录和资源约束。
- `VolumeKeyController.java`：音量键按下／松开配对、长按节流和放行策略；Activity 负责真实系统按键派发。
- `assets/paper-grain.svg`：内置程序纹理，配合 CSS 生成仿纸背景。
- `tests/`：模型、纯 Java TXT／EPUB、浏览器交互和安卓桥接模拟检查。
- `signing/`：仅供本地保存签名材料，不包含在此仓库中。后续覆盖安装需继续使用原有签名和包名，并提高 `versionCode`。

## 重新构建

需要 Java 17、Python 3、Android SDK Platform 35、Build Tools 35.0.0、Eclipse ECJ 3.38.0。不依赖 Gradle 或远程 UI 库。

```bash
export ANDROID_SDK_ROOT=/path/to/android-sdk
export ECJ_JAR=/path/to/ecj.jar
# 若使用独立 D8/R8 JAR：
export D8_JAR=/path/to/r8.jar
bash build.sh
```

构建输出 `dist/YeReader-v1.0.0.apk`。脚本自动检查 APK v2／v3 签名和包信息。

## 仓库中的签名材料

本仓库排除了原始签名私钥及密码。直接运行构建脚本会在本机生成新签名，生成的 APK 无法覆盖当前已发布签名的安装。要保留覆盖升级能力，请在本地恢复原有 `signing/`，不要提交它。原有 APK 保持原始签名。

## 下载与校验

- [下载 一页阅读 1.0.0 APK](https://github.com/Ad-free-is-important/offline-novel-reader/releases/download/v1.0.0/YeReader-v1.0.0.apk)
- [SHA-256 校验值](https://github.com/Ad-free-is-important/offline-novel-reader/releases/download/v1.0.0/SHA256SUMS)

## 授权

此仓库未附加新的开源许可证，授权方式由项目所有者另行决定。
