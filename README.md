# Joker Mastra UI

一个可直接部署到 Cloudflare Workers 的 React + Vite 前端项目，用于调试 Mastra agent 的流式 SSE 调用。

## 本地启动

```bash
npm install
npm run dev
```

前端会直接请求：

`https://joker-mastra-2.jokul0518.workers.dev/api/agents/reporting-agent/stream`

## 部署到 Cloudflare Workers

1. 登录 Cloudflare：

```bash
npx wrangler login
```

2. 构建并部署：

```bash
npm run deploy
```

## 配置说明

- 前端请求地址固定为 `https://joker-mastra-2.jokul0518.workers.dev/api/agents/reporting-agent/stream`
- 当前 Worker 主要负责托管静态资源
- 静态资源目录是 `dist`
- SPA 路由回退通过 `assets.not_found_handling = "single-page-application"` 开启
