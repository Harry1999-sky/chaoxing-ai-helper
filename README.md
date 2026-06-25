# 超星学习通 AI 搜题助手

> 🤖 自动识别超星学习通题目，接入 AI 大模型搜题并填写答案

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![JavaScript](https://img.shields.io/badge/language-JavaScript-yellow.svg)
![Support](https://img.shields.io/badge/support-超星学习通-brightgreen.svg)

## 📋 目录
- [功能特性](#-功能特性)
- [快速开始](#-快速开始)
- [文件结构](#-文件结构)
- [支持的 AI 接口](#-支持的-ai-接口)
- [常见问题](#-常见问题)
- [免责声明](#-免责声明)

## ✨ 功能特性

- ✅ **自动识别题目** - 支持单选、多选、判断、填空等题型
- ✅ **多 AI 接口** - DeepSeek、OpenAI、ChatAnywhere 等多个接口可选
- ✅ **自动填答** - 识别到答案后自动填写
- ✅ **浮动面板** - 轻量化控制面板，支持拖拽
- ✅ **实时诊断** - 内置诊断工具，快速排查问题
- ✅ **两种方案** - 油猴脚本（推荐）和浏览器插件双方案

## 📁 文件结构

```
chaoxing-ai-helper/
├── README.md                      ← 本文件
├── 油猴脚本/                       ← ⭐ 推荐方案
│   └── chaoxing-search.user.js        AI搜题助手脚本
├── 浏览器插件/                      ← 备用方案（Chrome/Edge Extension）
│   ├── manifest.json
│   ├── content.js                    # 核心逻辑
│   ├── popup.html & popup.js
│   ├── background.js
│   ├── styles.css
│   ├── generate-icons.html           # 图标生成工具
│   ├── icons/                        # 图标文件
│   └── README.md
└── 诊断工具/                       ← 问题排查工具
    ├── chaoxing-diagnose.user.js
    ├── chaoxing-diagnose.js
    └── diagnose-simple.js
```

## 🚀 快速开始

### 方案 1️⃣：油猴脚本（推荐）

**优势：** 轻量、无需编译、即装即用

#### 步骤 1：安装 Tampermonkey
- 在 Chrome/Edge/Firefox 应用商店搜索 **"Tampermonkey"** 并安装

#### 步骤 2：获取 AI API Key

**推荐 DeepSeek**（便宜高效，¥1/百万token）：

1. 打开 [DeepSeek Platform](https://platform.deepseek.com)
2. 注册并登录账户
3. 进入 **API Keys** 页面，创建新密钥
4. 复制 `sk-xxxxxx` 格式的密钥

**其他选择：**
- [OpenAI](https://platform.openai.com) - 功能强大但费用较高
- [ChatAnywhere](https://chatanywhere.tech) - 有免费额度试用

#### 步骤 3：安装脚本
1. 点击 Tampermonkey 图标 → **新建脚本**
2. 清空默认内容，复制粘贴 `油猴脚本/chaoxing-search.user.js` 的全部代码
3. 按 `Ctrl+S` 保存

#### 步骤 4：配置 API Key
1. 打开超星学习通的作业/考试页面
2. 点击页面右下角的 **⚙️ 设置** 按钮
3. 选择 AI 接口（默认 DeepSeek）
4. 粘贴 API Key 并保存

#### 步骤 5：开始答题
1. 点击 **🔍 扫描** - 确认识别到题目数量
2. 点击 **▶️ 开始答题** - AI 逐题分析并填写答案
3. 等待完成或手动逐题答题

---

### 方案 2️⃣：浏览器插件（备用）

详见 [`浏览器插件/README.md`](./浏览器插件/README.md)

## 🤖 支持的 AI 接口

| 平台 | 官网 | 模型 | 价格 | 推荐度 |
|------|------|------|------|--------|
| **DeepSeek** | [platform.deepseek.com](https://platform.deepseek.com) | deepseek-chat | ¥1/百万token | ⭐⭐⭐⭐⭐ |
| OpenAI | [platform.openai.com](https://platform.openai.com) | gpt-4o-mini | $0.15/百万token | ⭐⭐⭐⭐ |
| ChatAnywhere | [chatanywhere.tech](https://chatanywhere.tech) | gpt-3.5-turbo | 免费额度 | ⭐⭐⭐ |
| 自定义 | 任意 OpenAI 兼容接口 | 自定义 | - | ⭐⭐⭐ |

## 🔧 诊断工具

如遇到问题，可使用内置诊断工具快速排查：

1. **油猴诊断脚本** - 浏览器中直接运行
2. **控制台诊断** - 打开 DevTools (F12) 的 Console 标签页，粘贴 `chaoxing-diagnose.js` 代码运行

诊断工具会检查：
- ✓ 页面加载状态
- ✓ 题目识别情况
- ✓ API 连接状态
- ✓ 答案匹配度

## ❓ 常见问题

### Q: 为什么扫描不到题目？
**A:** 
- 确保页面已完全加载（等待 3-5 秒）
- 尝试刷新页面后再次扫描
- 检查是否在正确的作业/考试页面
- 某些题型可能不支持（如视频题、上传题）

### Q: 为什么搜不到答案？
**A:**
- 题目可能不在 AI 训练数据中
- 尝试切换到其他 AI 接口
- 检查 API Key 是否正确、是否有额度
- 修改题目表述重新搜索

### Q: 答案填写不正确怎么办？
**A:**
- AI 识别可能有偏差，建议手动检查答案
- 增加 AI 思考时间（调整对话参数）
- 对多选题谨慎验证

### Q: API Key 泄露了怎么办？
**A:**
- 立即前往对应 AI 平台删除该 Key
- 生成新 Key，更新脚本配置

### Q: 被检测到怎么办？
**A:**
- 使用诊断工具检查是否设置过快
- 增加题目间隔时间（在设置中调整）
- 减少频繁使用，分散答题时间
- 关闭自动提交功能，手动提交

## ⚠️ 免责声明

- 📌 **学习工具** - 本工具仅供学习参考之用，用于理解题目和知识点
- 🚫 **禁止作弊** - 严禁用于考试作弊或学术不诚实行为
- ⚖️ **法律责任** - 使用本工具产生的一切后果（包括但不限于账号被禁用、学位撤销等）由用户自行承担
- 📋 **服务条款** - 请遵守超星学习通的服务条款，违规使用造成的损失与项目开发者无关

---

## 📞 技术支持

遇到问题？

1. 查看 [常见问题](#-常见问题) 部分
2. 运行诊断工具获取详细日志
3. 提交 Issue 时包含诊断结果

## 📄 许可证

MIT License - 开源项目，可自由修改使用

---

**最后更新：** 2026年6月25日 | **开发者：** Harry1999-sky
