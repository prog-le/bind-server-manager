# BIND SERVER MANAGER

BIND 9 DNS 服务器 Web 管理系统，提供 Zone 管理、DNS 记录管理、DNS 解析日志、性能监控、备份恢复、审计日志等功能。

## 功能特性

### 核心功能

- **Zone 管理** — 创建/删除 master、slave、forward 类型的 Zone
- **DNS 记录管理** — 支持 A、AAAA、CNAME、MX、NS、TXT、SRV、CAA、PTR 记录
- **泛域名解析** — 支持 `*` 和 `*.subdomain` 泛域名记录
- **RFC 合规校验** — NS 数量、CNAME 冲突、NS 目标校验等（RFC 1034/1912/2181）
- **自动 Zone 文件生成** — 从数据库自动生成 BIND zone 文件并验证语法
- **SOA 序列号管理** — 自动递增 YYYYMMDDNN 格式序列号
- **备份系统** — Zone 文件和 named.conf 自动备份，支持一键恢复

### DNS 解析日志与监控

- **实时解析日志** — 自动采集 BIND query log，支持按域名、客户端 IP、查询类型、时间范围筛选
- **响应码识别** — 从 BIND 日志标志位解析实际响应码（NOERROR / NXDOMAIN / SERVFAIL 等）
- **性能仪表盘** — 成功率趋势、延迟统计、请求量分布、失败分析图表
- **日志导出** — 支持 CSV 格式导出解析日志

### 审计与安全

- **审计日志** — 防篡改链式哈希审计日志，记录所有关键操作
- **RBAC 权限** — 三级角色：super_admin / ops_admin / readonly
- **操作日志** — 记录所有操作，支持筛选和分页
- **告警规则** — 可配置告警条件和通知渠道

### 批量操作

- **批量导入** — 支持批量导入 DNS 记录
- **子域批量创建** — 批量创建子域名记录

### 其他

- **BIND 状态监控** — 多策略检测 BIND 运行状态
- **配置校验器** — BIND 配置语法检查
- **管理员 Profile** — 修改密码、系统信息查看

## 截图
### <img width="1920" height="955" alt="ScreenShot_2026-04-29_225117_058" src="https://github.com/user-attachments/assets/2d5dad32-dfca-4aef-989c-a5ce98941a70" />
###
### <img width="1903" height="954" alt="ScreenShot_2026-04-29_225148_037" src="https://github.com/user-attachments/assets/00cf32de-cb3b-42cf-a91f-eec98a4afe10" />
###
### <img width="1904" height="951" alt="ScreenShot_2026-04-29_225202_881" src="https://github.com/user-attachments/assets/e8f6462c-f20d-4396-8778-42c6c0f410bb" />
###
### <img width="525" height="821" alt="ScreenShot_2026-04-29_225325_520" src="https://github.com/user-attachments/assets/ed2d7d1a-84ca-462a-9196-8937ffd6d28c" />

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 19 + Vite 6 + Tailwind CSS 3 |
| 后端 | Express 5 + express-validator |
| 数据库 | SQLite (sql.js WASM) |
| 认证 | JWT (jsonwebtoken + bcryptjs) |
| DNS | BIND 9 (rndc / named-checkconf / named-checkzone) |
| 图表 | Recharts |

## 项目结构

```
bind-server-manager/
├── client/                  # 前端 React SPA
│   ├── src/
│   │   ├── components/      # 布局组件 + 业务组件
│   │   │   ├── Sidebar.jsx         # 侧边栏导航
│   │   │   ├── Navbar.jsx          # 顶部导航栏
│   │   │   ├── ConfirmDialog.jsx   # 确认对话框
│   │   │   ├── BatchImportDialog.jsx   # 批量导入
│   │   │   ├── SubdomainBatchCreator.jsx # 子域批量创建
│   │   │   └── ConfigValidator.jsx     # 配置校验器
│   │   ├── pages/           # 页面
│   │   │   ├── Dashboard.jsx       # 仪表盘
│   │   │   ├── ZoneList.jsx        # Zone 列表
│   │   │   ├── ZoneDetail.jsx      # Zone 详情 + 记录管理
│   │   │   ├── DnsLogs.jsx         # DNS 解析日志
│   │   │   ├── Performance.jsx     # 性能仪表盘
│   │   │   ├── Monitor.jsx         # BIND 状态监控
│   │   │   ├── Alerts.jsx          # 告警规则
│   │   │   ├── Audit.jsx           # 审计日志
│   │   │   ├── Users.jsx           # 用户管理
│   │   │   ├── Settings.jsx        # 系统设置
│   │   │   └── Login.jsx           # 登录
│   │   ├── context/         # AuthContext (JWT 认证)
│   │   └── api.js           # Axios 实例
│   └── dist/                # 构建产物
├── server/                  # 后端 Express API
│   └── src/
│       ├── routes/          # API 路由
│       │   ├── auth.js            # 认证
│       │   ├── zones.js           # Zone 管理
│       │   ├── records.js         # 记录管理
│       │   ├── settings.js        # 系统设置
│       │   ├── backups.js         # 备份管理
│       │   ├── dns-logs.js        # DNS 解析日志
│       │   ├── monitor.js         # BIND 监控
│       │   ├── alerts.js          # 告警规则
│       │   ├── audit.js           # 审计日志
│       │   └── batch.js           # 批量操作
│       ├── services/        # 业务服务
│       │   ├── bind.js            # BIND 操作 (rndc, zone file, named.conf)
│       │   ├── user.js            # 用户管理
│       │   ├── dnsLog.js          # DNS 日志采集与解析
│       │   ├── monitor.js         # BIND 状态监控
│       │   ├── backupScheduler.js # 自动备份调度
│       │   └── alerts/            # 告警服务
│       ├── utils/           # 工具
│       │   ├── validators.js      # DNS 记录校验
│       │   ├── zonefile.js        # Zone 文件生成
│       │   ├── logger.js          # 操作日志
│       │   ├── audit.js           # 审计日志 (链式哈希)
│       │   └── config-advisor.js  # 配置建议
│       ├── middleware/       # 中间件
│       │   ├── auth.js            # JWT 认证 + RBAC
│       │   └── audit.js           # 审计中间件
│       └── db.js            # SQLite 数据库 + Schema 迁移
└── ...
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

### 认证

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/auth/register | 注册管理员（仅首次） |
| POST | /api/auth/login | 登录 |
| GET | /api/auth/me | 当前用户信息 |
| PUT | /api/auth/password | 修改密码 |

### Zone 管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/zones | Zone 列表 |
| POST | /api/zones | 创建 Zone（支持 master/slave/forward） |
| GET | /api/zones/:name | Zone 详情 |
| DELETE | /api/zones/:name | 删除 Zone |
| POST | /api/zones/:name/reload | 重载 Zone |

### 记录管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/zones/:name/records | 记录列表 |
| POST | /api/zones/:name/records | 创建记录 |
| PUT | /api/zones/:name/records/:id | 更新记录 |
| DELETE | /api/zones/:name/records/:id | 删除记录 |

### DNS 解析日志

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/dns-logs | 解析日志（分页 + 筛选） |
| GET | /api/dns-logs/stats | 24 小时统计 |
| GET | /api/dns-logs/performance | 性能分析 |
| GET | /api/dns-logs/export | CSV 导出 |

### 监控与告警

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/monitor/status | BIND 运行状态 |
| GET | /api/alerts | 告警规则列表 |
| POST | /api/alerts | 创建告警规则 |
| PUT | /api/alerts/:id | 更新告警规则 |
| DELETE | /api/alerts/:id | 删除告警规则 |
| GET | /api/alerts/history | 告警历史 |

### 审计日志

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/audit | 审计日志（分页 + 筛选） |

### 系统设置与备份

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/settings | 获取设置 |
| PUT | /api/settings | 更新设置 |
| GET | /api/settings/status | BIND 状态 |
| GET | /api/settings/detect | 自动检测路径 |
| GET | /api/backups | 备份列表 |
| GET | /api/backups/:id | 备份内容 |
| POST | /api/backups/:id/restore | 恢复备份 |
| GET | /api/logs | 操作日志 |

### 批量操作

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/batch/import | 批量导入记录 |
| POST | /api/batch/subdomains | 批量创建子域 |

---

## Bug 修复记录

### Slave Zone 缺少 masters 指令导致 BIND SERVFAIL

**问题**：创建 slave 类型的 Zone 时，`addToNamedConf()` 生成的 named.conf 配置缺少 `masters` 指令。BIND 无法在不知道主服务器地址的情况下加载 slave zone，导致查询返回 SERVFAIL，严重时引发 BIND 段错误（segfault）。

**修复**：
- `bind.js` — `addToNamedConf()` 新增 `masters` 参数，slave zone 配置现在包含 `masters { <ip>; };` 指令
- `zones.js` — 创建 slave zone 时强制要求提供 `masters` 字段，否则返回 400 错误
- `zones.js` — slave zone 不再生成默认 NS/A 记录和 zone 文件（数据通过 AXFR 从主服务器获取）
- `db.js` — zones 表新增 `masters` 列（自动迁移）

### MX/SRV/PTR 记录允许使用 IP 地址作为值

**问题**：`isValidHostname()` 的正则 `RELATIVE_NAME_REGEX` 匹配纯数字标签，导致 IP 地址（如 `1.1.1.1`）能通过主机名校验。这使得 MX、SRV、PTR 记录可以存储 IP 地址作为目标值，生成的 zone 文件中出现 `MX 1 1.1.1.1.` 等无效记录，BIND 无法正确解析。

**修复**：`validators.js` — MX、SRV、PTR 类型的 `validateRecord()` 新增 IP 地址检测，与 CNAME/NS 的校验逻辑一致。IP 地址现在会被明确拒绝并返回错误提示。

### addToNamedConf 回退逻辑覆盖整个 named.conf

**问题**：当所有配置文件目标均未通过 `named-checkconf` 验证时，`addToNamedConf()` 的回退逻辑会用仅包含单条 zone 条目的新文件覆盖整个 `named.conf`，导致所有已有 zone 配置丢失。

**修复**：`bind.js` — 移除危险的回退逻辑，改为直接抛出异常，避免意外覆盖配置文件。

### DNS 解析日志响应码始终为 NOERROR

**问题**：`dnsLog.js` 的 `parseQueryLine()` 将响应码硬编码为 `'NOERROR'`，即使 BIND 日志中包含 NXDOMAIN（`-E`）、SERVFAIL（`-S`）等实际响应码标志。

**修复**：
- 正则表达式更新，捕获 BIND 日志中的响应码标志（如 `+E(0)`、`-E(0)`、`-S(0)`）
- 新增 `rcodeFromFlags()` 函数，将标志位映射为标准响应码
- 解析日志中现在正确显示 NOERROR、NXDOMAIN、SERVFAIL 等响应码

## License

[Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0)

## 致谢

- [BIND 9](https://www.isc.org/bind/) — ISC 开源 DNS 服务器
- Xiaomi MiMo Orbit 计划 — 免费 Token 支持
- [Claude Code](https://claude.ai/code) — AI 辅助开发
