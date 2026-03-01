# iciba生词本

在iciba.com查词时自动保存生词到生词本的Chrome浏览器扩展。

## 功能特性

- 📝 **自动保存** - 在iciba.com搜索单词时自动保存到生词本
- 📚 **详细信息** - 自动获取单词的音标、释义和例句
- ☁️ **云端同步** - 使用Chrome账号自动同步到云端，跨设备访问
- 🔍 **搜索过滤** - 快速搜索已保存的单词
- 📤 **导出功能** - 支持导出为JSON格式
- 🎨 **简洁界面** - 清爽易用的中文界面

## 安装方法

### 方式一：从GitHub发布页安装

1. 访问 [Releases](https://github.com/kaige/edict_vocab/releases) 页面
2. 下载最新版本的 `iciba-vocab.zip`
3. 解压到任意文件夹
4. 打开 Chrome 浏览器，访问 `chrome://extensions/`
5. 开启右上角的「开发者模式」
6. 点击「加载已解压的扩展程序」
7. 选择解压后的文件夹

### 方式二：从源码安装

```bash
git clone https://github.com/kaige/edict_vocab.git
cd edict_vocab
```

然后在 Chrome 中加载该文件夹（同上步骤 4-7）。

## 使用说明

1. 安装扩展后，访问 [iciba.com](https://www.iciba.com)
2. 在搜索框中输入要查询的单词，按回车键
3. 单词会自动保存到生词本
4. 点击浏览器工具栏的扩展图标，查看和管理已保存的单词

## 开发说明

### 文件结构

```
iciba-vocab/
├── manifest.json      # 扩展配置文件
├── content.js         # 内容脚本，负责监听iciba.com并提取单词数据
├── popup.html         # 弹出页面HTML
├── popup.js           # 弹出页面逻辑
├── popup.css          # 弹出页面样式
├── icon.png           # 扩展图标
└── README.md          # 本文件
```

### 技术栈

- Chrome Extension Manifest V3
- Vanilla JavaScript (无框架依赖)
- Chrome Storage API (local + sync)

### 构建发布包

使用 PowerShell 创建发布包：

```powershell
Compress-Archive -Path manifest.json, content.js, popup.js, popup.html, popup.css, icon.png -DestinationPath iciba-vocab.zip -Force
```

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！
