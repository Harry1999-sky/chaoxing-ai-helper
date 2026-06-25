# 超星学习通 AI 搜题助手

自动识别超星学习通题目，接入 AI 大模型搜题并填写答案。

## 📁 文件结构

```
chaoxing-ai-helper/
├── README.md                  ← 本文件
├── 油猴脚本/                   ← ⭐ 主要用这个
│   └── chaoxing-search.user.js    AI搜题助手 v2.0
├── 浏览器插件/                  ← 备用方案（Chrome Extension）
│   ├── manifest.json
│   ├── content.js
│   ├── popup.html
│   ├── popup.js
│   ├── background.js
│   ├── styles.css
│   └── ...
└── 诊断工具/                   ← 排查问题用
    ├── chaoxing-diagnose.user.js  油猴诊断脚本
    ├── chaoxing-diagnose.js       控制台诊断代码
    └── diagnose-simple.js         简化版诊断
```

## 🚀 快速开始（推荐油猴脚本）

### 第一步：安装 Tampermonkey
Chrome/Edge 应用商店搜索 "Tampermonkey" 并安装

### 第二步：获取 AI API Key
推荐 **DeepSeek**（便宜好用，¥1/百万token）：
1. 打开 https://platform.deepseek.com
2. 注册并登录
3. 创建 API Key，复制 `sk-xxxx`

### 第三步：安装脚本
1. 点击 Tampermonkey 图标 → 添加新脚本
2. 删掉默认内容，粘贴 `油猴脚本/chaoxing-search.user.js` 的全部内容
3. Ctrl+S 保存

### 第四步：配置 API Key
1. 打开超星学习通的作业/考试页面
2. 点击面板右下角 ⚙ 按钮
3. 选择 AI 接口（默认 DeepSeek）
4. 粘贴 API Key → 保存配置

### 第五步：开始答题
1. 点击「🔍 扫描」确认识别到题目
2. 点击「▶ 开始答题」
3. AI 逐题思考并自动填写

## 🤖 支持的 AI 接口

| 平台 | 地址 | 模型 | 价格 |
|------|------|------|------|
| DeepSeek（推荐） | platform.deepseek.com | deepseek-chat | ¥1/百万token |
| OpenAI | platform.openai.com | gpt-4o-mini | $0.15/百万token |
| ChatAnywhere | chatanywhere.tech | gpt-3.5-turbo | 有免费额度 |
| 自定义 | 任意 OpenAI 兼容接口 | 自定义 | - |

## ⚠️ 免责声明

- 本工具仅供学习参考，请勿用于作弊
- 使用本工具产生的一切后果由用户自行承担
