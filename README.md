# Joker Mastra UI

一个可直接部署到 Cloudflare Workers 的 React + Vite 前端项目，用于调试 Mastra agent 的流式 SSE 调用。

## 本地启动

```bash
npm install
npm run dev
```

本地开发时，Vite 会把 `/api/stream` 代理到：

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

- 前端调用路径固定为同源 `/api/stream`
- Worker 代理目标由 [wrangler.toml](/Users/guohaohao/Desktop/YD-35/project/joker-mastra-ui/wrangler.toml) 里的 `AGENT_STREAM_URL` 控制
- 静态资源目录是 `dist`
- SPA 路由回退通过 `assets.not_found_handling = "single-page-application"` 开启
