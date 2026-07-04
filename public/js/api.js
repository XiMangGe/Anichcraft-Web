/**
 * 暗影澄昏网站 - API 封装
 * 所有后端 API 调用都通过此模块
 */
const API = {
  token: localStorage.getItem('auth_token') || '',
  settings: null,

  // 获取请求头
  headers() {
    const h = { 'Content-Type': 'application/json' };
    if (this.token) h['Authorization'] = `Bearer ${this.token}`;
    return h;
  },

  // 通用请求
  async request(method, path, body) {
    const opts = { method, headers: this.headers() };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`${CONFIG.apiBase}${path}`, opts);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '请求失败');
    return data;
  },

  // 注册
  async register(username, password, qq, email) {
    const data = await this.request('POST', '/api/register', { username, password, qq, email });
    this.token = data.token;
    localStorage.setItem('auth_token', this.token);
    return data;
  },

  // 登录
  async login(identifier, password) {
    const data = await this.request('POST', '/api/login', { identifier, password });
    this.token = data.token;
    localStorage.setItem('auth_token', this.token);
    return data;
  },

  // 登出
  async logout() {
    try { await this.request('POST', '/api/logout'); } catch {}
    this.token = '';
    localStorage.removeItem('auth_token');
  },

  // 获取当前用户
  async me() {
    return await this.request('GET', '/api/me');
  },

  // 更新个人资料
  async updateProfile(data) {
    return await this.request('PUT', '/api/profile', data);
  },

  // 获取聊天消息
  async getChat() {
    return await this.request('GET', '/api/chat');
  },

  // 发送聊天消息
  async sendChat(content) {
    return await this.request('POST', '/api/chat', { content });
  },

  // 获取设置
  async getSettings() {
    if (!this.settings) {
      this.settings = await this.request('GET', '/api/settings');
    }
    return this.settings.settings;
  },

  // 更新设置（管理员）
  async updateSettings(data) {
    const result = await this.request('PUT', '/api/settings', data);
    this.settings = result;
    return result.settings;
  },

  // 获取所有用户（管理员）
  async getUsers() {
    return await this.request('GET', '/api/admin/users');
  }
};
