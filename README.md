# 暗影澄昏 Minecraft 服务器网站

## 版本说明

本项目提供两个版本：

### 1. 单文件版 (`index.html`)
- 所有代码集中在一个 HTML 文件中
- 数据存储在浏览器 `localStorage` 中
- **限制**：聊天和用户数据仅保存在当前浏览器中，不同设备之间不共享
- 适合快速预览和简单使用

### 2. 多文件版（含后端服务）
- 前端（HTML/CSS/JS）+ 后端（Node.js/Express）
- 数据持久化存储在服务器 JSON 文件中
- **支持跨设备登录、公共聊天、数据持久化**
- 适合正式部署使用

## 多文件版使用方法

### 环境要求
- Node.js 18+ 
- npm

### 安装和启动
```bash
cd 暗影澄昏网站-多文件版
npm install
npm start
```

访问 `http://localhost:3000` 即可。

### 管理员账号
| 用户名 | 密码 |
|--------|------|
| XiMangGe | wjw515wjw |
| Minecraft_LaLaLa | Lzx_20121225 |

### 数据存储位置
- `data/users.json` - 用户数据
- `data/chat.json` - 聊天记录
- `data/settings.json` - 站点设置
- `data/sessions.json` - 登录会话

重启服务器后数据不会丢失，用户登录状态也会保持。

## 功能列表

| 页面 | 登录要求 | 说明 |
|------|----------|------|
| 首页 | 否 | 服务器介绍、特色图标、加入按钮 |
| 进服指南 | 否 | 进服须知和流程 |
| 服规 | 否 | 服务器游戏规则全文 |
| EULA | 否 | 最终用户许可协议全文 |
| 服务器状态 | 否 | Java/基岩版各3条线路查询 |
| 地图 | 否 | BlueMap 嵌入 |
| 聊天 | **需要登录** | 公共聊天大厅，QQ风格气泡 |
| 个人空间 | **需要登录** | 头像、资料管理 |
| 设置 | **需要登录** | 字体、白天/夜晚模式 |
| 管理面板 | **管理员** | 编辑网站文字、颜色、服务器地址等 |

## 可配置项

### 修改地图地址
- 多文件版：`public/js/config.js` 中的 `mapUrl`，或在管理面板修改
- 单文件版：文件顶部 `CONFIG.mapUrl`

### 修改服务器状态查询地址
- 多文件版：`public/js/config.js` 中的 `serverAddresses`，或在管理面板修改
- 单文件版：文件顶部 `CONFIG.serverAddresses`

### 替换 QQ 群二维码
- 多文件版：替换 `public/assets/QQ.png` 文件
- 单文件版：在进服指南页面会显示提示文字

## 技术栈
- 前端：HTML5 + CSS3 + 原生 JavaScript (SPA)
- 后端：Node.js + Express
- 存储：JSON 文件（多文件版）/ localStorage（单文件版）
- 服务器状态API：mcstatus.io
- 地图：BlueMap

## 注册说明
- 昵称（必填，2-20字符）
- 密码（必填，至少6位）
- QQ号（选填）
- 邮箱（选填）
- 支持用昵称/QQ号/邮箱登录
