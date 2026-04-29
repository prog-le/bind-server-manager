# BIND SERVER MANAGER

BIND 9 DNS 服务器 Web 管理系统，提供 Zone 管理、DNS 记录管理、备份恢复、操作日志等功能。

## 功能特性

- **Zone 管理** — 创建/删除 master、slave、forward 类型的 Zone
- **DNS 记录管理** — 支持 A、AAAA、CNAME、MX、NS、TXT、SRV、CAA、PTR 记录
- **泛域名解析** — 支持 `*` 和 `*.subdomain` 泛域名记录
- **RFC 合规校验** — NS 数量、CNAME 冲突、NS 目标校验等（RFC 1034/1912/2181）
- **自动 Zone 文件生成** — 从数据库自动生成 BIND zone 文件并验证语法
- **SOA 序列号管理** — 自动递增 YYYYMMDDNN 格式序列号
- **备份系统** — Zone 文件和 named.conf 自动备份，支持一键恢复
- **操作日志** — 记录所有操作，支持筛选和分页
- **BIND 状态监控** — 多策略检测 BIND 运行状态
- **管理员 Profile** — 修改密码、系统信息查看

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 19 + Vite 6 + Tailwind CSS 3 |
| 后端 | Express 5 + express-validator |
| 数据库 | SQLite (sql.js WASM) |
| 认证 | JWT (jsonwebtoken + bcryptjs) |
| DNS | BIND 9 (rndc / named-checkconf / named-checkzone) |

## 项目结构

```
bind-server-manager/
├── client/                  # 前端 React SPA
│   ├── src/
│   │   ├── components/      # 布局组件 (Sidebar, Navbar, Layout)
│   │   ├── pages/           # 页面 (Dashboard, ZoneList, ZoneDetail, Settings, Logs)
│   │   ├── context/         # AuthContext (JWT 认证)
│   │   └── api.js           # Axios 实例
│   └── dist/                # 构建产物
├── server/                  # 后端 Express API
│   └── src/
│       ├── routes/          # API 路由 (auth, zones, records, settings, backups, logs)
│       ├── services/        # 业务服务 (bind.js, user.js)
│       ├── utils/           # 工具 (validators.js, zonefile.js, logger.js)
│       ├── middleware/       # JWT 认证中间件
│       └── db.js            # SQLite 数据库
├── CLAUDE.md                # Claude Code 指导文件
└── AGENTS.md                # Agent 配置
```

## 快速开始

### 环境要求

- Node.js >= 18
- BIND 9 已安装且 rndc 已配置
- 系统管理员权限（zone 文件读写和 rndc 执行）

### 安装

```bash
git clone https://github.com/prog-le/bind-server-manager.git
cd bind-server-manager
npm install
```

### 开发模式

```bash
# 同时启动前端 (5173) 和后端 (3000)
npm run dev

# 仅启动后端
npm run dev:server

# 仅启动前端
npm run dev:client
```

首次访问 `http://localhost:5173` 会引导创建管理员账户。

### 生产部署

```bash
# 构建前端
npm run build:client

# 启动服务（自动托管前端静态文件）
cd server && node src/index.js
```

默认端口 3000，访问 `http://your-server:3000`。

### 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | 3000 | 服务端口 |
| `HOST` | 0.0.0.0 | 监听地址 |
| `JWT_SECRET` | (内置 fallback) | JWT 密钥，生产环境必须修改 |
| `JWT_EXPIRES_IN` | 24h | Token 过期时间 |
| `DB_PATH` | server/data/bindmgr.db | 数据库路径 |
| `CORS_ORIGINS` | http://localhost:5173,http://localhost:3000 | 允许的跨域来源 |

## BIND 路径配置

系统会自动检测 BIND 安装路径，也可在「系统设置」页面手动配置：

- **named.conf** — BIND 主配置文件路径
- **Zone 文件目录** — Zone 文件存放目录
- **rndc 路径** — rndc 可执行文件路径

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/auth/register | 注册管理员（仅首次） |
| POST | /api/auth/login | 登录 |
| GET | /api/auth/me | 当前用户信息 |
| PUT | /api/auth/password | 修改密码 |
| GET | /api/zones | Zone 列表 |
| POST | /api/zones | 创建 Zone |
| GET | /api/zones/:name | Zone 详情 |
| DELETE | /api/zones/:name | 删除 Zone |
| POST | /api/zones/:name/reload | 重载 Zone |
| GET | /api/zones/:name/records | 记录列表 |
| POST | /api/zones/:name/records | 创建记录 |
| PUT | /api/zones/:name/records/:id | 更新记录 |
| DELETE | /api/zones/:name/records/:id | 删除记录 |
| GET | /api/settings | 获取设置 |
| PUT | /api/settings | 更新设置 |
| GET | /api/settings/status | BIND 状态 |
| GET | /api/settings/detect | 自动检测路径 |
| GET | /api/backups | 备份列表 |
| GET | /api/backups/:id | 备份内容 |
| POST | /api/backups/:id/restore | 恢复备份 |
| GET | /api/logs | 操作日志 |

## License

[Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0)

## 致谢

- [BIND 9](https://www.isc.org/bind/) — ISC 开源 DNS 服务器
- Xiaomi MiMo Orbit 计划 — 免费 Token 支持
- [Claude Code](https://claude.ai/code) — AI 辅助开发
