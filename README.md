# DeltaForce Cheat API

三角洲行动© 挂狗地图 API，提供挂房数据获取功能。

## 📋 目录

- [项目简介](#项目简介)
- [核心功能](#核心功能)
- [技术栈](#技术栈)
- [系统架构](#系统架构)
- [快速开始](#快速开始)
- [环境配置](#环境配置)
- [API文档](#api文档)
- [命令行工具](#命令行工具)
- [开发指南](#开发指南)
- [部署说明](#部署说明)

## 🎯 项目简介

三角洲行动© 挂狗地图 API 是一个基于 NestJS 构建的高性能后端服务，专门用于：

- **服务器探测**：自动扫描和监控游戏服务器的在线状态
- **实时数据采集**：通过 WebSocket 连接获取实时游戏数据（玩家位置、装备、血量等）
- **多数据库支持**：兼容 MySQL、PostgreSQL 和 MongoDB
- **数据缓存**：使用 Redis 缓存探测结果，提高响应速度
- **RESTful API**：提供标准化的 HTTP 接口供前端调用

## ✨ 核心功能

### 1. 服务器管理
- 添加/查询游戏服务器信息
- 支持多种版本协议（当前支持 Ray 版本）
- 服务器状态实时监控

### 2. 智能探测系统
- **HTTP 探测**：通过Http协议探测外挂雷达网页标识
- **WebSocket 探测**：建立 WebSocket 连接获取实时数据
- **自动重试机制**：支持带密码认证的 WebSocket 连接
- **数据解压缩**：自动处理 zlib/gzip 压缩数据
- **多格式解析**：支持 JSON 和 MessagePack 格式

### 3. 数据处理与转换
- **Ray 数据转换器**：将原始游戏数据转换为结构化格式
- **玩家信息映射**：包含角色名称、装备、血量、护甲等详细信息
- **AI/Bot 识别**：区分真实玩家和 AI 机器人
- **Boss 标记**：特殊标记 Boss 级敌人
- **队伍分组**：按队伍 ID 组织玩家信息

### 4. 数据缓存
- Redis 缓存探测结果
- 自动清理旧缓存
- 提高 API 响应速度

## 🛠️ 技术栈

### 后端框架
- **NestJS 11.x** - 企业级 Node.js 框架
- **TypeScript 5.7+** - 类型安全的 JavaScript

### 数据库
- **MySQL** (mysql2) - 关系型数据库
- **PostgreSQL** (pg) - 高级关系型数据库
- **MongoDB** (mongodb) - NoSQL 文档数据库
- **Redis** (ioredis) - 内存缓存数据库

### 通信协议
- **WebSocket** (ws) - 实时双向通信
- **MessagePack** (@msgpack/msgpack) - 高效的二进制序列化

### 开发工具
- **Prettier** - 代码格式化
- **ESLint** - 代码质量检查
- **Jest** - 单元测试框架

## 🏗️ 系统架构

```
┌─────────────┐
│   Client    │ (Frontend / Mobile App)
└──────┬──────┘
       │ HTTP/REST
       ▼
┌─────────────────────────────────┐
│      NestJS Application         │
│                                 │
│  ┌──────────┐  ┌─────────────┐ │
│  │Controller│→ │  Service    │ │
│  └──────────┘  └──────┬──────┘ │
│                       │         │
│              ┌────────▼──────┐  │
│              │ ScannerRegistry│  │
│              │  - RayScanner │  │
│              └────────┬──────┘  │
└───────────────────────┼─────────┘
                        │
        ┌───────────────┼───────────────┐
        ▼               ▼               ▼
   ┌──────────┐   ┌──────────┐   ┌──────────┐
   │ Database │   │  Redis   │   │Game Server│
   │(MySQL/   │   │ (Cache)  │   │(WebSocket)│
   │ PG/Mongo)│   │          │   │           │
   └──────────┘   └──────────┘   └──────────┘
```

### 核心模块

1. **ProbesModule** - 探测服务模块
   - `ProbesController` - REST API 控制器
   - `ProbesService` - 核心业务逻辑
   - `ServerScannerRegistry` - 扫描器注册中心
   - `RayServerScanner` - Ray 版本专用扫描器

2. **DatabaseModule** - 数据库模块
   - 支持多适配器模式（MySQL/PostgreSQL/MongoDB）
   - `RedisService` - Redis 缓存服务

3. **Converters** - 数据转换器
   - `RayDataConverter` - Ray 数据格式转换

## 🚀 快速开始

### 前置要求

- Node.js 18+ 
- pnpm 包管理器
- 至少一种数据库（MySQL/PostgreSQL/MongoDB）
- Redis 服务器

### 安装步骤

```bash
# 1. 克隆项目
git clone <repository-url>
cd deltaforce_cheat_api

# 2. 安装依赖
pnpm install

# 3. 配置环境变量
cp .env.example .env
# 编辑 .env 文件，填写数据库配置

# 4. 初始化数据库
pnpm run install:db

# 5. 启动开发服务器
pnpm run start:dev
```

### 验证安装

```bash
# 扫描所有服务器
pnpm run scan
```

## ⚙️ 环境配置

创建 `.env` 文件并配置以下变量：

```env
# 数据库配置（三选一）
DB_DRIVER=mysql                    # mysql | postgres | mongodb
DB_HOST=localhost
DB_PORT=3306
DB_NAME=deltaforce
DB_USER=root
DB_PASSWORD=your_password

# 应用密钥（用于服务器添加认证）
APP_KEY=your-secret-key-here

# 服务器端口
PORT=3000

# 探测超时设置（毫秒）
PROBE_TIMEOUT_MS=5000

# 自动探测间隔（0 表示禁用，单位：毫秒）
PROBE_INTERVAL_MS=0

# Redis 配置
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password
REDIS_DB=0
```

## 📖 API 文档

### 服务器管理

#### 列出所有服务器
```http
GET /servers
```

**响应示例：**
```json
{
  "code": 0,
  "msg": "success",
  "data": [
    {
      "id": 1,
      "address": "example.com:8080",
      "version": "ray",
      "token": null,
      "alive": 1,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z",
      "detail": {
        "map": {"name": "bks"},
        "players": [...],
        "items": [...],
        "boxes": [...]
      }
    }
  ]
}
```

#### 获取单个服务器
```http
GET /servers/:id
```

#### 添加服务器
```http
POST /servers
Authorization: Bearer YOUR_APP_KEY
Content-Type: application/json

{
  "address": "game-server.example.com:8080",
  "version": "ray",
  "token": "optional-token"
}
```

**请求参数：**
- `address` (必填): 服务器地址（URL 或主机名）
- `version` (必填): 服务器版本，目前仅支持 `"ray"`
- `token` (可选): 服务器访问令牌

**注意：** 需要有效的 `APP_KEY` 进行身份验证

### 探测功能

探测仅通过 CLI 或自动定时任务执行，不提供 HTTP 触发接口。

#### 获取探测结果
```http
GET /servers/:id/probe
```

从 Redis 缓存中获取最新的探测结果。

**响应示例：**
```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "map": {"name": "bks"},
    "players": [
      {
        "name": "Player1",
        "isBot": false,
        "isBoss": false,
        "isCheater": true,
        "role": 2100654105,
        "roleName": "wl",
        "roleAlias": "威风的龙",
        "weapon": "AKM",
        "health": 100,
        "helmet": 3,
        "helmetDurability": 80,
        "armor": 4,
        "armorDurability": 90,
        "teamId": 1,
        "position": {
          "x": 123.45,
          "y": 67.89,
          "z": 0,
          "angle": 180
        }
      }
    ],
    "items": [
      {
        "id": "item_001",
        "name": "Medical Kit",
        "price": 5000,
        "grade": 3,
        "position": {
          "x": 100.5,
          "y": 200.3
        }
      }
    ],
    "boxes": [
      {
        "isBot": false,
        "position": {
          "x": 150.0,
          "y": 250.0,
          "z": 0
        }
      }
    ]
  }
}
```

## 💻 命令行工具

### 扫描服务器

```bash
# 扫描所有活跃服务器
pnpm run scan

# 扫描指定服务器（通过 ID）
pnpm run scan -- --id 1
# 或简写
pnpm run scan -- 1

# 以 JSON 格式输出
pnpm run scan -- --json

# 查看帮助
pnpm run scan -- --help
```

**JSON 输出示例：**
```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "summary": {
      "total": 5,
      "alive": 4,
      "failed": 1
    },
    "results": [
      {
        "id": 1,
        "address": "http://server1.example.com",
        "alive": 1,
        "scanMode": "ray:http+websocket",
        "latencyMs": 150,
        "statusCode": 200,
        "version": "ray",
        "httpMatched": true,
        "websocketMatched": true,
        "websocketData": {...},
        "error": null,
        "checkedAt": "2024-01-01T00:00:00.000Z"
      }
    ]
  }
}
```

### 初始化数据库

```bash
pnpm run install:db
```

自动创建所需的数据库表和索引。

## 🔧 开发指南

### 项目结构

```
src/
├── common/                  # 通用模块
│   ├── api-exception.filter.ts    # 全局异常过滤器
│   └── api-response.interceptor.ts # 统一响应拦截器
├── converters/              # 数据转换器
│   ├── index.ts
│   └── ray.converter.ts     # Ray 数据转换逻辑
├── database/                # 数据库层
│   ├── adapters/            # 数据库适配器
│   │   ├── mysql.adapter.ts
│   │   ├── postgres.adapter.ts
│   │   └── mongodb.adapter.ts
│   ├── redis/               # Redis 服务
│   │   ├── redis.module.ts
│   │   └── redis.service.ts
│   ├── database.config.ts   # 数据库配置
│   ├── database.module.ts
│   ├── database.service.ts
│   └── database.types.ts    # 类型定义
├── interface/               # 接口定义
│   ├── GameData.ts          # 游戏数据结构
│   ├── index.ts
│   ├── ray.ts               # Ray 原始数据类型
│   └── websocket.types.ts   # WebSocket 相关类型
├── probes/                  # 探测模块
│   ├── probe.types.ts       # 探测结果类型
│   ├── probes.controller.ts # REST 控制器
│   ├── probes.module.ts     # 模块定义
│   ├── probes.service.ts    # 核心服务
│   ├── server-scanners.ts   # 服务器扫描器
│   └── server.dto.ts        # 数据传输对象
├── app.controller.ts        # 应用控制器
├── app.module.ts            # 根模块
├── app.service.ts           # 应用服务
├── configure-app.ts         # 应用配置
├── install.ts               # 数据库初始化脚本
├── main.ts                  # 入口文件
└── scan.ts                  # 命令行扫描工具
```

### 添加新的服务器版本支持

1. 在 `src/probes/server-scanners.ts` 中创建新的扫描器类：

```typescript
class NewVersionScanner implements ServerScanner {
  readonly version = 'new-version';
  
  async scan(server: DfServer, context: ScannerContext): Promise<ScannerProbeResult> {
    // 实现扫描逻辑
  }
}
```

2. 在 `ServerScannerRegistry` 构造函数中注册：

```typescript
constructor() {
  this.register(new RayServerScanner());
  this.register(new NewVersionScanner()); // 添加新扫描器
}
```

### 自定义数据转换

修改 `src/converters/ray.converter.ts` 中的映射表：

- `ROLE_NAME_MAP_OFFICIAL` - 角色 ID 到名称的映射
- `ROLE_ALIAS_MAP` - 角色别名（中文显示名）
- `MAP_NAME` - 地图 ID 到名称的映射

### 运行测试

```bash
# 单元测试
pnpm run test

# 监听模式
pnpm run test:watch

# 测试覆盖率
pnpm run test:cov

# E2E 测试
pnpm run test:e2e
```

### 代码规范

```bash
# 格式化代码
pnpm run format

# ESLint 检查并修复
pnpm run lint
```

## 📦 部署说明

### 生产环境构建

```bash
# 编译 TypeScript
pnpm run build

# 启动生产服务器
pnpm run start:prod
```

### Docker 部署（示例）

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install --prod

COPY dist/ ./dist/
COPY .env ./

EXPOSE 3000

CMD ["node", "dist/main"]
```

### PM2 进程管理

```bash
# 安装 PM2
npm install -g pm2

# 启动应用
pm2 start dist/main.js --name deltaforce-api

# 开机自启
pm2 startup
pm2 save
```

### 定时探测任务

如需启用自动探测，设置环境变量：

```env
PROBE_INTERVAL_MS=60000  # 每 60 秒探测一次
```

或使用 cron 任务：

```bash
# 每 5 分钟执行一次扫描
*/5 * * * * cd /path/to/project && pnpm run scan > /var/log/deltaforce-scan.log 2>&1
```

## 🔐 安全注意事项

1. **APP_KEY 保护**：确保 `APP_KEY` 环境变量设置为强随机字符串，不要泄露
2. **CORS 配置**：根据实际需求修改 `configure-app.ts` 中的跨域设置
3. **数据库安全**：使用强密码，限制数据库访问 IP
4. **Redis 认证**：启用 Redis 密码认证
5. **HTTPS**：生产环境建议使用反向代理（如 Nginx）启用 HTTPS

## 📊 性能优化建议

1. **Redis 缓存**：合理设置缓存过期时间，平衡实时性和性能
2. **探测超时**：根据网络状况调整 `PROBE_TIMEOUT_MS`
3. **并发控制**：大量服务器时使用队列限制并发探测数
4. **数据库索引**：确保常用查询字段已建立索引
5. **连接池**：配置适当的数据库连接池大小

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 📄 许可证

本项目采用 [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) 许可协议。

**您可以：**
- **共享** — 在任何媒介以任何形式复制、发行本作品
- **演绎** — 修改、转换或以本作品为基础进行创作

**惟须遵守下列条件：**
- **署名** — 您必须给出适当的署名，提供指向本许可协议的链接，同时标明是否（对原始作品）作了修改。
- **非商业性使用** — 您不得将本作品用于商业目的。
- **相同方式共享** — 如果您再混合、转换或者基于本作品进行创作，您必须基于与原先许可协议相同的许可协议分发您贡献的作品。

## 📞 联系方式

如有问题或建议，请提交 Issue 或通过以下方式联系。

QQ群：[酷曦科技](https://qm.qq.com/q/NVuKWIUKsY)

Telegram群：[酷曦科技](https://t.me/coolxitech)

---

**注意**：本项目仅供学习和研究使用，请遵守相关法律法规和游戏用户协议。
