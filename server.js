/**
 * 暗影澄昏 Minecraft 服务器官方网站 - 后端服务
 * 提供用户认证、聊天、个人资料、站点设置等 API
 * 数据使用 JSON 文件持久化存储，重启不丢失
 */

const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ===== 路径常量 =====
const DATA_DIR = path.join(__dirname, 'data');
const USERS_DIR = path.join(DATA_DIR, 'users');
const CHAT_FILE = path.join(DATA_DIR, 'chat.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

// ===== 确保数据目录存在 =====
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(USERS_DIR)) fs.mkdirSync(USERS_DIR, { recursive: true });

// ===== 中间件 =====
app.use(express.json({ limit: '10mb' })); // 支持大头像上传
app.use(express.static(path.join(__dirname, 'public')));

// ===== 会话管理（持久化到文件，重启后保持登录） =====
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
let sessions = readJSON(SESSIONS_FILE, {});
if (typeof sessions !== 'object' || sessions === null) sessions = {};

function saveSessions() {
  writeJSON(SESSIONS_FILE, sessions);
}

// 节流保存：最多每 60 秒保存一次
let lastSaveTime = 0;
function throttledSaveSessions() {
  const now = Date.now();
  if (now - lastSaveTime > 60000) {
    saveSessions();
    lastSaveTime = now;
  }
}
// 定期保存
setInterval(() => { saveSessions(); }, 60000);

// 清理超过 30 天未活动的会话
function cleanSessions() {
  const now = Date.now();
  let changed = false;
  for (const token of Object.keys(sessions)) {
    const s = sessions[token];
    if (s.lastActive && now - s.lastActive > 30 * 24 * 60 * 60 * 1000) {
      delete sessions[token];
      changed = true;
    }
  }
  if (changed) saveSessions();
}
cleanSessions();

// ===== 管理员账号 =====
const ADMIN_ACCOUNTS = [
  { username: 'XiMangGe', password: 'wjw515wjw' },
  { username: 'Minecraft_LaLaLa', password: 'Lzx_20121225' }
];

// ===== 工具函数 =====
function generateId() {
  return crypto.randomUUID();
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  try {
    const [salt, hash] = stored.split(':');
    const verify = crypto.scryptSync(password, salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(verify, 'hex'));
  } catch {
    return false;
  }
}

// JSON 文件读写
function readJSON(filePath, defaultValue) {
  try {
    if (!fs.existsSync(filePath)) return defaultValue;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return defaultValue;
  }
}

function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

// ===== 用户文件夹存储 =====
// 每个用户一个文件夹：data/users/<userid>/profile.json
function userDir(userId) {
  return path.join(USERS_DIR, userId);
}
function userFile(userId) {
  return path.join(userDir(userId), 'profile.json');
}

// 读取单个用户
function readUser(userId) {
  const fp = userFile(userId);
  return readJSON(fp, null);
}

// 写入单个用户
function writeUser(user) {
  const dir = userDir(user.id);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  writeJSON(userFile(user.id), user);
}

// 读取所有用户（遍历文件夹）
function readAllUsers() {
  const users = [];
  if (!fs.existsSync(USERS_DIR)) return users;
  const dirs = fs.readdirSync(USERS_DIR);
  for (const d of dirs) {
    const fp = path.join(USERS_DIR, d, 'profile.json');
    if (fs.existsSync(fp)) {
      const u = readJSON(fp, null);
      if (u) users.push(u);
    }
  }
  return users;
}

// 通过用户名/QQ/邮箱查找用户
function findUserByIdentifier(identifier) {
  const users = readAllUsers();
  return users.find(u =>
    u.username.toLowerCase() === identifier.toLowerCase() ||
    (u.qq && u.qq === identifier) ||
    (u.email && u.email.toLowerCase() === identifier.toLowerCase())
  );
}

// 迁移旧数据（从 users.json 迁移到文件夹）
function migrateOldUsers() {
  const oldFile = path.join(DATA_DIR, 'users.json');
  if (!fs.existsSync(oldFile)) return;
  const oldUsers = readJSON(oldFile, []);
  if (!Array.isArray(oldUsers) || oldUsers.length === 0) return;
  for (const u of oldUsers) {
    if (!u.id) continue;
    const fp = userFile(u.id);
    if (!fs.existsSync(fp)) {
      writeUser(u);
    }
  }
  // 重命名旧文件作为备份
  fs.renameSync(oldFile, oldFile + '.bak');
  console.log(`[迁移] 已将 ${oldUsers.length} 个用户数据迁移到独立文件夹`);
}

// ===== 数据初始化 =====
function initData() {
  // 迁移旧数据
  migrateOldUsers();

  // 用户数据 - 检查管理员账号是否存在
  const allUsers = readAllUsers();
  for (const admin of ADMIN_ACCOUNTS) {
    const exists = allUsers.some(u => u.username.toLowerCase() === admin.username.toLowerCase());
    if (!exists) {
      const newUser = {
        id: generateId(),
        username: admin.username,
        passwordHash: hashPassword(admin.password),
        qq: '',
        email: '',
        gameName: admin.username,
        avatar: '',
        isAdmin: true,
        createdAt: new Date().toISOString()
      };
      writeUser(newUser);
    }
  }

  // 确保旧用户有新字段
  const users = readAllUsers();
  for (const u of users) {
    let changed = false;
    if (u.isAdmin === undefined) { u.isAdmin = false; changed = true; }
    if (u.gameName === undefined) { u.gameName = u.username; changed = true; }
    if (u.avatar === undefined) { u.avatar = ''; changed = true; }
    if (changed) writeUser(u);
  }

  // 聊天数据
  if (!fs.existsSync(CHAT_FILE)) writeJSON(CHAT_FILE, []);

  // 站点设置
  let settings = readJSON(SETTINGS_FILE, null);
  if (!settings) {
    settings = getDefaultSettings();
    writeJSON(SETTINGS_FILE, settings);
  }
}

function getDefaultSettings() {
  return {
    siteName: '暗影澄昏',
    siteIntro: '暗影澄昏服务器，是一项自2026年1月起运营的半公益项目。我们致力于为暗影澄昏的粉丝与朋友，提供一个免费、长期稳定运行的Minecraft生存世界。本服以原版生存体验为基石，融入轻量级RPG元素，在保留Minecraft核心魅力的同时，为冒险增添新的色彩。我们始终期待每一位高素质玩家的到来——在这里，你不仅是玩家，更是这个世界的书写者。愿与你一同，续写属于暗影澄昏的故事。',
    qqGroup: '953215907',
    bilibiliUrl: 'https://space.bilibili.com/',
    docsUrl: 'https://docs.qq.com/aio/DS0ZDaWFWSkR6cXZj',
    // 服务器状态查询地址（可配置）
    serverAddresses: {
      java: [
        { name: '线路1', address: 'play.hypixel.net' },
        { name: '线路2', address: 'mc.hypixel.net' },
        { name: '线路3', address: 'play.mineplex.com' }
      ],
      bedrock: [
        { name: '线路1', address: 'pe.mineplex.com' },
        { name: '线路2', address: 'play.nethergames.org:19132' },
        { name: '线路3', address: 'play.cubecraft.net:19132' }
      ]
    },
    mapUrl: 'http://hk1.mefrp.hoshino2.top:58972/',
    // 管理员可编辑的自定义样式
    customStyles: {
      primaryColor: '#1a73e8',
      siteNameColor: '#ffffff',
      siteNameWeight: '900',
      bodyFontSize: '16px',
      bodyFontFamily: "'Noto Sans SC', sans-serif"
    },
    // 管理员可编辑的自定义文本
    customTexts: {
      joinNotice: '本服务器不是无政府、无规则的服务器。请遵守服规和EULA，文明游戏，和谐交流。任何违规行为都将受到相应处罚。',
      chatNotice: '本功能为实验性功能，BUG 请反馈到 QQ 群'
    },
    backgroundSettings: {
      preset: 'chaotic',
      opacity: 0.5,
      blur: 80
    }
  };
}

initData();

// ===== 用户数据脱敏（去除密码等敏感信息） =====
function sanitizeUser(user) {
  return {
    id: user.id,
    username: user.username,
    qq: user.qq || '',
    email: user.email || '',
    gameName: user.gameName || user.username,
    avatar: user.avatar || '',
    isAdmin: user.isAdmin || false,
    createdAt: user.createdAt
  };
}

// ===== 认证中间件 =====
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token || !sessions[token]) {
    return res.status(401).json({ error: '请先登录' });
  }
  const sessionData = sessions[token];
  sessionData.lastActive = Date.now();
  const userId = sessionData.userId;
  const user = readUser(userId);
  if (!user) {
    delete sessions[token];
    throttledSaveSessions();
    return res.status(401).json({ error: '用户不存在' });
  }
  req.user = user;
  req.token = token;
  next();
}

function adminMiddleware(req, res, next) {
  if (!req.user.isAdmin) {
    return res.status(403).json({ error: '需要管理员权限' });
  }
  next();
}

// ===== API 路由 =====

// --- 注册 ---
app.post('/api/register', (req, res) => {
  const { username, password, qq, email } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: '昵称和密码为必填项' });
  }
  if (username.length < 2 || username.length > 20) {
    return res.status(400).json({ error: '昵称长度需在2-20个字符之间' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: '密码长度至少6位' });
  }

  const allUsers = readAllUsers();
  // 检查用户名是否已存在
  if (allUsers.some(u => u.username.toLowerCase() === username.toLowerCase())) {
    return res.status(409).json({ error: '该昵称已被注册' });
  }
  // 检查 QQ 号是否已被使用（如果提供了）
  if (qq && allUsers.some(u => u.qq === qq)) {
    return res.status(409).json({ error: '该QQ号已注册' });
  }
  // 检查邮箱是否已被使用（如果提供了）
  if (email && allUsers.some(u => u.email === email)) {
    return res.status(409).json({ error: '该邮箱已注册' });
  }

  const newUser = {
    id: generateId(),
    username,
    passwordHash: hashPassword(password),
    qq: qq || '',
    email: email || '',
    gameName: username,
    avatar: '',
    isAdmin: false,
    createdAt: new Date().toISOString()
  };
  writeUser(newUser);

  // 自动登录
  const token = generateToken();
  sessions[token] = { userId: newUser.id, lastActive: Date.now() };
  saveSessions();

  res.json({
    token,
    user: sanitizeUser(newUser)
  });
});

// --- 登录 ---
app.post('/api/login', (req, res) => {
  const { identifier, password } = req.body;
  if (!identifier || !password) {
    return res.status(400).json({ error: '请输入账号和密码' });
  }

  const user = findUserByIdentifier(identifier);

  if (!user || !verifyPassword(password, user.passwordHash)) {
    return res.status(401).json({ error: '账号或密码错误' });
  }

  const token = generateToken();
  sessions[token] = { userId: user.id, lastActive: Date.now() };
  saveSessions();

  res.json({
    token,
    user: sanitizeUser(user)
  });
});

// --- 登出 ---
app.post('/api/logout', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) {
    delete sessions[token];
    saveSessions();
  }
  res.json({ success: true });
});

// --- 获取当前用户 ---
app.get('/api/me', authMiddleware, (req, res) => {
  res.json({ user: sanitizeUser(req.user) });
});

// --- 更新个人资料 ---
app.put('/api/profile', authMiddleware, (req, res) => {
  const { gameName, qq, email, avatar, username } = req.body;
  const user = readUser(req.user.id);
  if (!user) return res.status(404).json({ error: '用户不存在' });

  if (gameName !== undefined) user.gameName = gameName;
  if (qq !== undefined) user.qq = qq;
  if (email !== undefined) user.email = email;
  if (avatar !== undefined) user.avatar = avatar;
  if (username !== undefined && username !== user.username) {
    const allUsers = readAllUsers();
    if (allUsers.some(u => u.id !== user.id && u.username.toLowerCase() === username.toLowerCase())) {
      return res.status(409).json({ error: '该昵称已被使用' });
    }
    user.username = username;
  }

  writeUser(user);
  res.json({ user: sanitizeUser(user) });
});

// --- 获取聊天消息（最近50条） ---
app.get('/api/chat', (req, res) => {
  const messages = readJSON(CHAT_FILE, []);
  res.json({ messages: messages.slice(-50) });
});

// --- 发送聊天消息（需登录） ---
app.post('/api/chat', authMiddleware, (req, res) => {
  const { content } = req.body;
  if (!content || !content.trim()) {
    return res.status(400).json({ error: '消息不能为空' });
  }
  if (content.length > 500) {
    return res.status(400).json({ error: '消息不能超过500字' });
  }

  const messages = readJSON(CHAT_FILE, []);
  const msg = {
    id: generateId(),
    userId: req.user.id,
    username: req.user.gameName || req.user.username,
    avatar: req.user.avatar || '',
    content: content.trim(),
    timestamp: new Date().toISOString()
  };
  messages.push(msg);
  // 只保留最近 200 条
  if (messages.length > 200) messages.splice(0, messages.length - 200);
  writeJSON(CHAT_FILE, messages);

  res.json({ message: msg });
});

// --- 获取站点设置 ---
app.get('/api/settings', (req, res) => {
  const settings = readJSON(SETTINGS_FILE, getDefaultSettings());
  res.json({ settings });
});

// --- 更新站点设置（仅管理员） ---
app.put('/api/settings', authMiddleware, adminMiddleware, (req, res) => {
  const settings = readJSON(SETTINGS_FILE, getDefaultSettings());
  const updates = req.body;

  // 合并更新
  for (const key of Object.keys(updates)) {
    if (typeof updates[key] === 'object' && updates[key] !== null && !Array.isArray(updates[key])) {
      settings[key] = { ...settings[key], ...updates[key] };
    } else {
      settings[key] = updates[key];
    }
  }

  writeJSON(SETTINGS_FILE, settings);
  res.json({ settings });
});

// --- 获取所有用户（仅管理员） ---
app.get('/api/admin/users', authMiddleware, adminMiddleware, (req, res) => {
  const users = readAllUsers();
  res.json({ users: users.map(sanitizeUser) });
});

// --- SPA 回退：所有非 API 路由返回 index.html ---
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: '接口不存在' });
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ===== 启动服务器 =====
app.listen(PORT, () => {
  console.log(`\n  暗影澄昏网站服务已启动`);
  console.log(`  访问地址: http://localhost:${PORT}`);
  console.log(`  管理员账号: XiMangGe / Minecraft_LaLaLa\n`);
});

// 清理函数 - 将会话持久化（可选，重启后需重新登录）
// 如果需要重启后保持登录，可以将会话存到文件
