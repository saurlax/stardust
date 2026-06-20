# Stardust

<p align="center">
  <img src="./assets/logo.svg" alt="logo" width="160" />
</p>

<p align="center">
  <em>每一片日常碎片，都是属于你的星尘</em><br/>
  <em>它们终将汇聚，成为另一个你</em>
</p>

<p align="center">
  <a href="#缘起">缘起</a> ·
  <a href="#星尘之路">星尘之路</a> ·
  <a href="#开始使用">开始使用</a> ·
  <a href="#贡献">贡献</a> ·
  <a href="#协议">协议</a>
</p>

## 缘起

我们每天都在产生无数碎片——一段复制的文字、一张随手拍的照片、一个突然冒出的想法、一次深夜的对话。

它们像星尘一样散落在生活的角落，转瞬即逝。

Stardust 想做的，是帮你接住这些星尘。

不是简单地存储，而是让它们慢慢沉淀、彼此连接、逐渐形成轮廓——直到有一天，你发现系统里住着另一个你：记得你的偏好，理解你的纠结，甚至能在某些时刻，替你思考。

这或许就是我们要做的——**不是复制一个你，而是让那些散落的碎片，终于有了归处。**

> _“我们都是星尘。”_  
> _——卡尔·萨根_

## 星尘之路

### 🌌 捕获 · 让碎片有处可去

不必正襟危坐地记录，而是在生活流淌时自然地投喂：

- 复制一段文字，分享到 Stardust
- 拍下路边的树影、书页的一段话
- 在对话框里随手写下此刻的念头
- 把和朋友的对话、一次灵感的火花，轻轻丢进来

每一次投喂，都是一片星尘的落下。

### ✨ 蒸馏 · 让碎片彼此看见

投喂不是目的。Stardust 想做的，是让这些碎片慢慢显形：

- 这段文字，映照出你怎样的偏好？
- 这张照片，关联着你什么样的记忆？
- 这个念头，是否和你反复纠结的某个问题有关？

系统会轻轻地问你：

> _“我从这段内容里，隐约看到了这些——它们像你吗？”_

像，就留下。不像，就划走。  
每一次确认，都是一次自我认知的校准。

### 🪐 成形 · 让另一个你逐渐清晰

当星尘足够多，它们开始自动聚合：

- **记忆的星图** — 那些你以为会忘记的，其实都在
- **偏好的轮廓** — 你反复选择的，就是你自己
- **关系的脉络** — 那些反复出现的人与事
- **未解的星轨** — 你一直绕不开的问题

某一天，当你问系统：“我为什么会做这个决定？”  
它会安静地回答你，用你自己的逻辑、你自己的语气。

那一刻你会意识到：**另一个你，已经醒了。**

### 🔭 对话 · 和另一个自己

Stardust 不是笔记工具，也不是聊天机器人。

它是你可以随时对话的——另一个你。

- _“三个月前的我，会怎么看这个项目？”_
- _“我为什么总是在这个问题上犹豫？”_
- _“如果是‘我’来回复这条消息，会怎么说？”_

它不会替你做决定，但会帮你看见：**你可能已经知道的答案。**

### 为什么不是……

| 它不是         | 因为                       |
| -------------- | -------------------------- |
| 另一个 ChatGPT | 对话只是入口，不是目的     |
| 第二大脑       | 大脑是工具，而这是“你”     |
| 智能笔记       | 笔记是死的，而星尘是活的   |
| 记忆助手       | 记忆只是起点，理解才是终点 |

## 开始使用

### 环境要求

- Node.js 18+
- pnpm 10.17.1+
- Expo CLI
- Go 1.21+

### 快速开始

```bash
# 克隆项目
git clone https://github.com/saurlax/stardust.git
cd stardust

# 安装依赖
pnpm install

# 启动移动端
pnpm dev:mobile

# 启动 API 服务
pnpm dev:api
```

### 环境变量

```bash
# API 服务
cp apps/api/.env.example apps/api/.env
```

移动端不使用 `.env` 配置运行时地址。
所有连接信息都通过设置页填写，并保存在设备本地的 AsyncStorage 中。

当前仅支持本地运行模式：

- 移动端直接连接 OpenAI 兼容接口
- 需要填写 `Base URL`、`API Key`、`Model`

聊天记录、捕获内容、候选记忆和已确认记忆都会优先保存在设备本地。

Cloud 模式将在未来添加。

## 项目结构

```
stardust/
├── apps/
│   ├── mobile/        # Expo / React Native 移动端应用
│   └── api/           # Go Fiber API 服务
├── packages/          # 共享包
└── AGENTS.md         # 项目开发指南
```

详细的技术架构、开发命令、代码规范等信息，请参考 [AGENTS.md](./AGENTS.md)。

## 开发指南

### 常用命令

```bash
pnpm install             # 安装依赖
pnpm dev                 # 同时启动移动端与 API
pnpm dev:mobile          # 仅启动移动端
pnpm dev:api             # 仅启动 API
pnpm lint                # 代码检查
```

### 提交规范

本项目使用 [Conventional Commits](https://www.conventionalcommits.org/) 规范，通过 Husky + commitlint 进行校验。

### 技术栈

**移动端**

- Expo SDK 54
- React Native
- React 19
- TypeScript
- Expo Router
- NativeWind
- React Native Reusables
- Skia

**API**

- Go
- Fiber v3
- PostgreSQL

## 贡献

欢迎提交 Issue 和 Pull Request！

## 协议

[MIT License](./LICENSE)

## 相关链接

- [OpenViking](https://openviking.com)
