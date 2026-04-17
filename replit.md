# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.
This project includes a Discord Bot built with discord.js.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Discord Bot**: discord.js v14

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server + Discord bot locally

## Discord Bot Features

### 审核系统
- `/setup_review_panel` — 在频道发送审核交互面板
- `/set_admin_role` — 设置拥有审核权限的身分组
- 用户点击"提交审核材料"按钮 → 弹出表单 → 创建私密子区 → 管理员审核 → 通过/拒绝后自动私信通知

### 作品系统
- `/setup_artwork_panel` — 在频道发送作品面板说明
- `/upload_artwork` — 上传作品（标题、文件、密码、备注）
- 观看者点击"获取作品"→ 输入密码 → 需先对首楼做出反应 → 收到仅自己可见的原文件
- `/set_log_channel` — 设置获取记录发送的私密频道（每次有人获取作品都会记录）

## Bot File Structure

- `artifacts/api-server/src/bot/client.ts` — Bot 主入口，处理所有 Interaction
- `artifacts/api-server/src/bot/commands.ts` — Slash Command 定义
- `artifacts/api-server/src/bot/config.ts` — 每服务器配置存储（内存）
- `artifacts/api-server/src/bot/handlers/reviewHandler.ts` — 审核系统处理逻辑
- `artifacts/api-server/src/bot/handlers/artworkHandler.ts` — 作品系统处理逻辑
- `lib/db/src/schema/index.ts` — 数据库表：artworks, artwork_access_logs, review_threads

## Required Bot Permissions
- Manage Threads, Send Messages, Read Message History
- Add Reactions, Manage Roles (optional, for role grants)

## Required Privileged Intents
- Server Members Intent
- Message Content Intent

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
