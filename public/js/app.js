/**
 * 暗影澄昏网站 - 主应用逻辑
 * SPA 路由 + 页面渲染 + 认证 + 聊天 + 服务器状态
 */

// ===== 全局状态 =====
const App = {
  user: null,
  settings: null,
  currentPage: null,
  chatPollTimer: null,
  lastChatCount: 0,
  currentEdition: 'java',
  statusResult: null,
};

// ===== 工具函数 =====
function $(sel) { return document.querySelector(sel); }
function $$(sel) { return document.querySelectorAll(sel); }

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function toast(msg, type = 'info') {
  const container = $('#toastContainer');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 3000);
}

function showLoading() { $('#loadingOverlay').classList.remove('hidden'); }
function hideLoading() { $('#loadingOverlay').classList.add('hidden'); }

// ===== 侧边栏控制 =====
function toggleSidebar() {
  $('#sidebar').classList.toggle('active');
  $('#sidebarOverlay').classList.toggle('active');
  $('#hamburger').classList.toggle('active');
}

function closeSidebar() {
  $('#sidebar').classList.remove('active');
  $('#sidebarOverlay').classList.remove('active');
  $('#hamburger').classList.remove('active');
}

// ===== 主题管理 =====
function applyTheme() {
  const theme = localStorage.getItem('theme') || 'light';
  document.body.setAttribute('data-theme', theme);
  const fontSize = localStorage.getItem('fontSize') || '16px';
  document.documentElement.style.setProperty('--font-size', fontSize);
  const fontFamily = localStorage.getItem('fontFamily') || "'Noto Sans SC', sans-serif";
  document.documentElement.style.setProperty('--font-family', fontFamily);
}

function applyCustomStyles(styles) {
  if (!styles) return;
  if (styles.primaryColor) document.documentElement.style.setProperty('--primary', styles.primaryColor);
  if (styles.siteNameColor) {
    const style = document.createElement('style');
    style.id = 'custom-site-name';
    document.getElementById('custom-site-name')?.remove();
    style.textContent = `.home-title { color: ${styles.siteNameColor} !important; }`;
    document.head.appendChild(style);
  }
}

// ===== 认证管理 =====
async function checkAuth() {
  if (!API.token) {
    updateAuthUI();
    return;
  }
  try {
    const data = await API.me();
    App.user = data.user;
    updateAuthUI();
  } catch {
    API.token = '';
    localStorage.removeItem('auth_token');
    App.user = null;
    updateAuthUI();
  }
}

function updateAuthUI() {
  const loginBtn = $('#loginBtn');
  const userBadge = $('#userBadge');
  if (App.user) {
    loginBtn.classList.add('hidden');
    userBadge.classList.remove('hidden');
    $('#userBadgeName').textContent = App.user.gameName || App.user.username;
    const avatar = $('#userBadgeAvatar');
    if (App.user.avatar) {
      avatar.src = App.user.avatar;
    } else {
      avatar.src = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect width="32" height="32" rx="16" fill="#667eea"/><text x="16" y="22" text-anchor="middle" fill="white" font-size="16" font-weight="bold">${escapeHtml((App.user.gameName || App.user.username)[0])}</text></svg>`)}`;
    }
  } else {
    loginBtn.classList.remove('hidden');
    userBadge.classList.add('hidden');
  }
}

function requireAuth() {
  if (!App.user) {
    toast('请先登录', 'error');
    location.hash = '#/login';
    return false;
  }
  return true;
}

// ===== 设置加载 =====
async function loadSettings() {
  try {
    App.settings = await API.getSettings();
    if (App.settings.customStyles) applyCustomStyles(App.settings.customStyles);
    if (App.settings.backgroundSettings) {
      const bg = App.settings.backgroundSettings;
      applyBackgroundToDOM(bg.preset || 'chaotic', bg.opacity || 0.5, bg.blur || 80);
    }
    document.title = `${App.settings.siteName || '暗影澄昏'} - Minecraft服务器`;
  } catch {
    App.settings = null;
  }
}

// ===== 路由 =====
const ROUTES = {
  'home': { render: renderHome, auth: false },
  'guide': { render: renderGuide, auth: false },
  'rules': { render: renderRules, auth: false },
  'eula': { render: renderEula, auth: false },
  'status': { render: renderStatus, auth: false },
  'map': { render: renderMap, auth: false },
  'chat': { render: renderChat, auth: true },
  'profile': { render: renderProfile, auth: true },
  'profile-info': { render: renderProfile, auth: true },
  'settings': { render: renderSettings, auth: true },
  'login': { render: renderLogin, auth: false },
  'admin': { render: renderAdmin, auth: true, admin: true },
};

function handleRoute() {
  const hash = location.hash.slice(2) || 'home';
  const route = ROUTES[hash];

  // 清理聊天轮询
  if (App.chatPollTimer && hash !== 'chat') {
    clearInterval(App.chatPollTimer);
    App.chatPollTimer = null;
  }

  closeSidebar();

  if (!route) {
    location.hash = '#/home';
    return;
  }

  // 更新菜单激活状态
  $$('.menu-item').forEach(item => {
    item.classList.toggle('active', item.dataset.page === hash);
  });

  // 更新标题栏
  const titles = { home:'暗影澄昏', guide:'进服指南', rules:'服规', eula:'EULA', status:'服务器状态', map:'地图', chat:'聊天', profile:'个人空间', settings:'设置', login:'登录', admin:'管理面板' };
  $('#topbarTitle').textContent = titles[hash] || '暗影澄昏';

  // 权限检查
  if (route.auth && !App.user) {
    toast('请先登录', 'error');
    location.hash = '#/login';
    return;
  }
  if (route.admin && !App.user.isAdmin) {
    toast('需要管理员权限', 'error');
    location.hash = '#/home';
    return;
  }

  App.currentPage = hash;
  route.render();
  window.scrollTo(0, 0);
}

// ===== 页面渲染：首页 =====
function renderHome() {
  const s = App.settings || {};
  const siteName = s.siteName || '暗影澄昏';
  const siteIntro = s.siteIntro || '暗影澄昏服务器，是一项自2026年1月起运营的半公益项目。我们致力于为暗影澄昏的粉丝与朋友，提供一个免费、长期稳定运行的Minecraft生存世界。本服以原版生存体验为基石，融入轻量级RPG元素，在保留Minecraft核心魅力的同时，为冒险增添新的色彩。';

  $('#app').innerHTML = `
    <div class="page">
      <div class="home-hero">
        <h1 class="home-title">${escapeHtml(siteName)}</h1>
        <div class="home-intro">${escapeHtml(siteIntro)}</div>
        <button class="btn-join" onclick="location.hash='#/guide'">加入服务器</button>
      </div>
      <div class="features">
        <div class="feature-item">
          <div class="feature-circle" style="font-size:16px;">24H</div>
          <span class="feature-text">长期运行</span>
        </div>
        <div class="feature-item">
          <div class="feature-circle">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="5" y="7" width="14" height="12" rx="2"/>
              <circle cx="9" cy="12" r="1.5" fill="currentColor"/>
              <circle cx="15" cy="12" r="1.5" fill="currentColor"/>
              <path d="M12 3v4M9 3h6"/>
            </svg>
          </div>
          <span class="feature-text">BOT 联动</span>
        </div>
        <div class="feature-item">
          <div class="feature-circle">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
            </svg>
          </div>
          <span class="feature-text">友好社区</span>
        </div>
        <div class="feature-item">
          <div class="feature-circle" style="font-size:16px;">RPG</div>
          <span class="feature-text">轻量 RPG</span>
        </div>
        <div class="feature-item">
          <div class="feature-circle">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14.5 3.5L3 15l-1 6 6-1L19.5 8.5"/>
              <path d="M14.5 3.5l5 5"/>
              <path d="M10 7l5 5"/>
            </svg>
          </div>
          <span class="feature-text">永不换档</span>
        </div>
      </div>
    </div>
  `;
}

// ===== 页面渲染：进服指南 =====
function renderGuide() {
  const s = App.settings || {};
  const qqGroup = s.qqGroup || CONFIG.qqGroup;
  const joinNotice = (s.customTexts && s.customTexts.joinNotice) || '本服务器不是无政府、无规则的服务器。请遵守服规和EULA，文明游戏，和谐交流。任何违规行为都将受到相应处罚。';

  $('#app').innerHTML = `
    <div class="page">
      <div class="glass-card">
        <h2 class="page-title">进服须知</h2>
        <p style="color:var(--text-secondary);text-align:center;line-height:1.9;">${escapeHtml(joinNotice)}</p>
      </div>
      <div class="glass-card">
        <h2 class="page-title">进服流程</h2>
        <div class="guide-steps">
          <div class="guide-step">
            <div class="guide-step-num">1</div>
            <div class="guide-step-content">
              <p>进入 QQ 群，群号：<strong style="color:var(--primary);font-size:18px;">${escapeHtml(qqGroup)}</strong></p>
              <img class="guide-qq-img" src="${CONFIG.qqGroupImage}" alt="QQ群二维码" onerror="this.style.display='none'">
            </div>
          </div>
          <div class="guide-step">
            <div class="guide-step-num">2</div>
            <div class="guide-step-content">
              <p>找到白名单申请群公告，进入其中的链接并按照要求填写</p>
            </div>
          </div>
          <div class="guide-step">
            <div class="guide-step-num">3</div>
            <div class="guide-step-content">
              <p>审核通过之后将由审核员拉入服务器群</p>
            </div>
          </div>
          <div class="guide-step">
            <div class="guide-step-num">4</div>
            <div class="guide-step-content">
              <p>进群后找到群公告，找到服务器链接地址，进入服务器</p>
            </div>
          </div>
        </div>
      </div>
      <div class="glass-card" style="text-align:center;padding:32px;">
        <p style="color:var(--text-secondary);font-size:15px;">我们暗影澄昏团队始终期待每一位高质量的玩家加入！</p>
        <p style="margin-top:12px;">
          <a href="${s.rulesUrl || '#/rules'}" style="color:var(--primary);">服务器游戏规则</a> ｜
          <a href="${s.eulaUrl || '#/eula'}" style="color:var(--primary);">最终用户许可协议（EULA）</a>
        </p>
      </div>
    </div>
  `;
}

// ===== 页面渲染：服规 =====
function renderRules() {
  $('#app').innerHTML = `
    <div class="page">
      <div class="glass-card">
        <h2 class="page-title">暗影澄昏服务器游戏规则</h2>
        <div class="doc-meta">
          <p>服规最新编辑日期：2026年5月4日</p>
          <p>服规启用及生效日期：2026年5月5日</p>
        </div>
        <p style="color:var(--text-secondary);margin-bottom:16px;">本服务器规定（以下简称"服规"）适用于所有访问和使用暗影澄昏服务器的用户。请您在进入本服务器前，仔细阅读本规则议的全部内容。您一旦访问或在服务器游戏，即表示您已接受本规定的所有规定。</p>

        <h3>服规原则</h3>
        <p>暗影澄昏主张打造一个B站、服务器、交流平台三方面构成的和谐交流社区，让玩家在服务器中不仅仅体验游戏的欢乐，还能有一个自我表现与和不同人群交流的机会。。我们始终期待每一位高素质玩家的到来，愿与你携手，共书暗影澄昏的故事。</p>

        <h3>社区礼仪</h3>
        <ul>
          <li><strong>三思而后行：</strong> 发言或行动前，请考虑后果及对他人的影响。</li>
          <li><strong>学会倾听、保持谦逊、冷静：</strong> 遇到冲突保持冷静，学会倾听与礼貌提问。</li>
          <li><strong>遇事须第一时间向管理员报告。</strong> 若事件情况复杂、事实不清或涉及多方，应主动交由管理员介入调查并裁定。任何私下处理容易引发误解或发生其他违规行为（如恶意PVP、私自"执法"破坏对方建筑），造成严重不良影响者，玩家将承担相应责任，并依据相关违规条例受到处罚。</li>
        </ul>

        <h3>服规正文</h3>
        <h4>游戏行为规范</h4>

        <p><strong>1. 禁止私自拿取他人物品及恶意圈地</strong></p>
        <p>未经他人允许，擅自拿取他人物品的，或未经他人允许随意翻动他人物资的（不论是否盗取物品），或使用圈地插件恶意圈地或圈不被允许地的，均属违规。</p>
        <div class="tip">
          <strong>小贴士：</strong><br>
          · 公共设施中的箱子会用告示牌标注 "公共设施" 等字样进行告知，公共设施里的物资可以自行适量拿取（禁止一次性拿走过多，违者将受到处罚）。<br>
          · 没有告知"公共设施"的设施，均为私人设施，擅自使用、拿取将按规定进行处罚。<br>
          · 没有明确告知公用的建筑或箱子，均为私人建筑和物品，严禁破坏或翻取，否则同样将受到处罚。
        </div>
        <div class="penalty"><strong>处罚：</strong> 根据情况归还被拿走的物资（如果真拿了），处以最低警告、最高永久封禁的处罚。</div>

        <p><strong>2. 禁止恶意 PVP ，破坏建筑与设施</strong></p>
        <p>进行未经双方同意的或明显带有恶意和针对性的 PVP，或恶意破坏他人建筑的，或故意破坏公共设施的，或非故意破坏公共设施且不上报的，均属违规。</p>
        <div class="tip">
          <strong>小贴士：</strong><br>
          · 公共设施会用告示牌标注设施的使用方法，请在使用前仔细阅读，如果无法理解使用教程，请咨询服内玩家，切勿盲目上手，以免损坏。<br>
          · 公共设施在盲目操作或错误操作下极易损坏，如在操作过程中损坏，请及时在服务器聊天内上报情况方便维修。
        </div>
        <div class="penalty"><strong>处罚：</strong> 根据情况，处以最低3天、最高永久封禁的处罚。</div>

        <p><strong>3. 禁止恶意言论</strong></p>
        <p>在群内、频道或服务器中文字、语音发言违反《暗影澄昏群规》的，或对服务器玩家和相关群玩家发起恶意言语的，均属违规。</p>
        <div class="tip">
          <strong>社区礼仪提醒：</strong><br>
          · Minecraft 是一个多元化的社区，包含不同年龄、不同性格、不同游戏水平的人，服务器里也相同。<br>
          · 遇到问题，请在服内聊天虚心且礼貌地请教，其他玩家也应理解他人，礼貌教导。<br>
          · 任何的恶言相对，既是矛盾的导火索，也是对他人自尊的极大打击。<br>
          · 此类情况只要发生，我们将严肃处理，并根据事情严重程度进行处罚。
        </div>
        <div class="penalty"><strong>处罚：</strong> 视情况而定，处以最低警告、最高永久封禁的处罚。</div>

        <p><strong>4. 禁止使用如何作弊手段</strong></p>
        <p>使用具有破坏游戏平衡性的外挂软件、材质包、行为包的（包括但不限于：透视材质、矿物透视、实体透视、自动攻击、自动钓鱼、加速移动、飞行（未经批准的合规飞行除外）、物品复制、长臂挖掘、脚本挂机等），均属违规。</p>
        <p>使用作弊手段进行违规行为（包括但不限于作弊飞行、刷物品）的，同样按本条处理。</p>
        <div class="penalty"><strong>处罚：</strong> 根据情况，处以最低14天、最高永久封禁的处罚。</div>

        <p><strong>5. 禁止过量获取公共资源</strong></p>
        <p>擅自大量拿走服务器公共设施产品的，属违规行为。公共设施的资源旨在帮助新人与临时周转，所有玩家应按需适量取用。</p>
        <div class="penalty"><strong>处罚：</strong> 第一次警告并没收超额获取的物品。情节严重者可追加禁封处罚。</div>

        <p><strong>6. 禁止扰乱服务器运行</strong></p>
        <p>禁止实施任何可能导致服务器卡顿、延迟升高或异常的行为。</p>
        <p>包括但不限于：</p>
        <ul>
          <li>建造运行巨型高频红石电路或永动红石装置且未采取有效控制措施；</li>
          <li>人为大量生成或聚集实体（如生物、矿车、掉落物等）；</li>
          <li>建造专门以卡服为目的的设施；</li>
          <li>恶意超限跑图加载大量区块。</li>
        </ul>
        <div class="penalty"><strong>处罚：</strong> 最低21天禁封，情节严重（如造成服务器崩溃或持续严重卡顿）最高可至永久封禁。</div>

        <p><strong>7. 交易与欺诈</strong></p>
        <p>禁止欺诈交易（如用劣质物品冒充稀有物品、虚假宣传、付款后不交付物品等）。禁止强制要求他人"送礼"、"帮忙建造"。交易价格由双方商定，但不得利用信息不对称对新玩家进行明显不合理的压价或抬价。</p>
        <div class="penalty"><strong>处罚：</strong> 欺诈交易禁封3-7天并退还物品；强迫他人禁封1-3天。</div>

        <p><strong>8. 领地管理</strong></p>
        <p>玩家需通过菜单圈定领地。未圈领地默认可被临时借用但不得占为己有。禁止恶意圈地堵塞公共道路（如在必经之路圈地不让通行，比如地铁周围）。</p>
        <div class="penalty"><strong>处罚：</strong> 恶意圈地禁封7天并强制解除领地。</div>

        <p><strong>9. 资源采集与环境保护</strong></p>
        <p>禁止无意义破坏自然环境（如挖空整片森林、填平大型湖泊），资源采集需在指定资源区或自圈领地内进行。禁止在主城周边及他人建筑视野范围内大规模开挖。</p>
        <div class="penalty"><strong>处罚：</strong> 首次警告并限期恢复；拒不执行禁封7天；破坏严重者禁封35天。</div>

        <p><strong>10. 传播虚假信息</strong></p>
        <p>不得在聊天中传播"服务器要关闭"、"某玩家是外挂"等无证据信息。禁止伪造管理通知（如冒充腐竹发"送钻石"公告）。禁止以任何方式恶意贬低服务器（如在群内或其他平台造谣"服务器卡顿"、"管理乱封号"等不实信息）。</p>
        <div class="penalty"><strong>处罚：</strong> 传播虚假信息禁封1-3（群内禁言）天；伪造通知禁封3-7天（服务器禁封+群内禁言）；恶意贬低服务器最低3天、最高永久禁封。</div>

        <h3>违规处理与处罚阶梯</h3>
        <h4>处罚方式</h4>
        <p>管理组可采取的处罚方式由轻至重依次为：</p>
        <ul>
          <li><strong>口头提醒：</strong>针对轻微违规或初次偶发行为。</li>
          <li><strong>警告：</strong>正式记录违规行为。</li>
          <li><strong>永久禁封：</strong>永久禁止登录服务器，并同步移出官方群。</li>
        </ul>

        <h4>减轻与加重情节</h4>
        <ul>
          <li>可酌情减轻处罚：主动自首并已采取补救措施；积极赔偿、修复损失并取得受影响方明确谅解；初犯且情节轻微。</li>
          <li>将从重或顶格处罚：态度恶劣、拒不配合；威胁或报复举报人；短期内多次违规；造成严重后果或广泛不良影响。</li>
        </ul>

        <h3>举报与申诉</h3>
        <ul>
          <li>举报他人违规行为，应提供截图、录屏等有效证据提交给管理组。</li>
          <li>无证据或恶意编造的举报，经查证后不予受理；恶意举报者视情节可受到禁封1-3天的处罚。</li>
          <li>被处罚的玩家如对处罚结果有异议，可在24小时内向管理组提交书面申诉，说明理由并提供相关证据。</li>
          <li>虚假申诉或申诉过程中存在恶意行为的，可追加禁封3-7天处罚。</li>
        </ul>

        <h3>附则</h3>
        <ul>
          <li>所有"禁封"均同步限制服务器登录（特殊标注除外）。</li>
          <li>主动弥补过错（如修复建筑、退还物品、公开道歉）可减轻30%-50%的处罚，由管理组集体判定。</li>
          <li>规则更新将提前至少3天在服务器公告栏及官方群公示，新增规则生效后按新规执行。</li>
          <li>玩家及管理人员的所有行为不得违反中华人民共和国法律法规。若涉嫌违法，服务器将配合有关部门调查，必要时提供相关数据及证据。</li>
          <li>服务器违规情况将在指定表格或频道中公开记录，以供全体玩家监督。</li>
          <li>本服规最终解释权归暗影澄昏服务器管理组所有。</li>
        </ul>

        <div class="doc-meta" style="margin-top:24px;">
          <p>暗影澄昏服务器管理组</p>
          <p>2026年5月3日</p>
        </div>
      </div>
    </div>
  `;
}

// ===== 页面渲染：EULA =====
function renderEula() {
  $('#app').innerHTML = `
    <div class="page">
      <div class="glass-card">
        <h2 class="page-title">暗影澄昏Minecraft服务器最终用户许可协议（EULA）</h2>
        <div class="doc-meta"><p>生效日期：2026年5月3日</p></div>
        <p style="color:var(--text-secondary);margin-bottom:16px;">本最终用户许可协议（以下简称"EULA"）适用于所有访问本服务器及在服务器内进行游戏的用户。请您在加入游戏前，仔细阅读并同意本协议的全部内容。您一旦访问或在服务器进行游戏，即表示您已接受本协议的所有条款及条件。</p>

        <h3>1.许可与使用限制</h3>
        <h4>1.1 许可授予</h4>
        <p>本服务器为 Minecraft_LaLala 与 XiMangGe 共同开发的Minecraft服务器，与 Mojang/Microsoft 无直接关联。您被授予在服务器内进行游戏娱乐、交流互动的非独占、不可转让、可撤销的许可。</p>
        <p>该许可仅限于个人非商业用途，您不得利用服务器进行任何形式的商业牟利行为，例如售卖游戏内资源、提供有偿代建、传播作弊插件或软件等。</p>

        <h4>1.2 禁止行为</h4>
        <p>为维护服务器的正常运营秩序、社区环境及暗影澄昏相关权益，用户在服务器内及相关社区（包括但不限于游戏内聊天、官方群聊、关联平台）不得实施或尝试实施以下行为。若有以下任一情形，服务器有权根据情节轻重，采取警告、限制功能、临时封禁或永久终止访问权限等措施：</p>
        <ul>
          <li>使用任何形式的外挂、作弊程序、脚本、宏、自动化工具，或利用游戏漏洞以获取不公平优势、破坏游戏平衡；</li>
          <li>对服务器进行攻击、压力测试、恶意连接、刷流量、恶意占用资源，或以任何方式干扰、破坏服务器的正常运行与稳定性；</li>
          <li>明知或应当知道自己的行为可能对服务器运营、社区秩序或其他玩家体验造成不良影响，仍然实施该行为；</li>
          <li>以诋毁、歪曲事实、恶意抹黑等方式损害"暗影澄昏"及其相关项目、活动、内容或运营团队的声誉，或组织、引导他人实施上述行为；</li>
          <li>以明显目的或持续性行为，在服务器内或相关社区中恶意引导玩家前往其他服务器、平台或项目，且该行为已对服务器正常运营或社区环境构成不良影响；</li>
          <li>公然或持续发表反对、抵制暗影澄昏正常运营活动、官方项目或社区共识的言论，并已对服务器秩序或社区环境构成干扰；</li>
          <li>实施或尝试实施破坏暗影澄昏服务器及其社区整体环境的行为，包括但不限于恶意带节奏、组织对抗、制造恐慌、传播不实信息；</li>
          <li>盗取、冒用他人账号，或未经许可破坏、侵占、拆除他人建筑、财产或公共设施；</li>
          <li>尝试或已实施对他人隐私信息进行收集、传播、泄露、威胁等行为，包括但不限于"开盒"、人肉搜索或类似行为；</li>
          <li>发布、传播任何违反法律法规或社会公序良俗的内容，包括但不限于暴力、色情、恐怖、歧视、仇恨、政治敏感等不当言论；</li>
          <li>利用服务器或相关社区实施诈骗、赌博、洗钱、非法交易或其他违法活动；</li>
          <li>未经授权复制、传播、倒卖服务器内的建筑、地图、插件、数据或其他受保护内容；</li>
          <li>其他违反本协议、暗影澄昏粉丝服务器规则、暗影澄昏粉丝群群规，或经服务器管理团队认定对服务器运营、社区秩序造成不良影响的行为。</li>
        </ul>

        <h3>2.建筑版权与内容创作</h3>
        <h4>2.1 建筑的所有权</h4>
        <p>玩家在服务器内建造的建筑及原创内容归玩家所有，但玩家同意服务器可以在宣传、推广、活动等场合中使用其建筑截图、录像等内容，无需额外通知或支付报酬。</p>

        <h3>3.违法违规行为处理</h3>
        <h4>3.1 违法行为的禁止</h4>
        <p>服务器严格禁止任何形式的违法行为，包括但不限于：</p>
        <ul>
          <li>发布违法信息（如诈骗、非法交易、黑客攻击相关内容）；</li>
          <li>利用服务器进行犯罪活动（如网络诈骗、非法交易、性骚扰等）；</li>
          <li>上传或传播违法内容（如侵犯版权的文件、暴力或色情内容）。</li>
        </ul>
        <p>服务器有权永久封禁涉及违法行为的玩家，并向执法机关举报，提交相关证据。</p>

        <h4>3.2 违规行为的处理</h4>
        <ul>
          <li><strong>警告：</strong>针对轻微违规行为，管理员将进行提醒或警告。</li>
          <li><strong>临时封禁：</strong>短期禁止玩家进入服务器（如1至30天封禁）。</li>
          <li><strong>永久封禁：</strong>对严重违规或多次违规的玩家进行永久封禁。</li>
          <li><strong>删除或回收资源：</strong>若玩家违规获取资源（包括但不限于作弊刷取物品、盗窃他人财产、使用不公平手段获取资源、盗用公共建设资产），服务器有权直接收回。</li>
        </ul>

        <h3>4.信息收集与隐私保护</h3>
        <h4>4.1 收集的信息</h4>
        <p>为了确保服务器的安全与正常运营，服务器可能会收集以下信息：</p>
        <ul>
          <li>游戏账号数据（用户名、UUID、IP地址、设备信息等）；</li>
          <li>游戏行为数据（登录时间、建筑记录、交易记录、聊天记录等）；</li>
          <li>违规行为记录（如封禁、举报、惩罚信息等）。</li>
        </ul>

        <h4>4.2 信息的使用</h4>
        <ul>
          <li>服务器不会向任何第三方出售或泄露您的个人信息，除非获得您的明确授权，或依法配合执法机关的调查。</li>
          <li>服务器使用您的数据仅限于维护游戏秩序、优化服务器体验及处理违规行为。</li>
          <li>若玩家希望删除自己的部分信息，可向服务器管理团队提出申请，但违规人员的身份信息、已有的封禁记录、违规记录等不予删除。</li>
        </ul>

        <h4>4.3 数据安全</h4>
        <ul>
          <li>服务器将采取合理的安全措施保护玩家数据，但无法保证绝对安全。若因黑客攻击、不可抗力等因素导致数据泄露，服务器不承担责任。</li>
          <li>若玩家故意攻击服务器、窃取数据或进行其他恶意行为，服务器将保留追究其法律责任的权利。</li>
        </ul>

        <h3>5.终止与变更</h3>
        <h4>5.1 服务器的权利</h4>
        <ul>
          <li>服务器管理团队有权随时变更本协议。</li>
          <li>若玩家不同意新的协议内容，应立即停止使用服务器。若玩家在协议更新后继续游玩，即视为接受更新后的协议。</li>
        </ul>

        <h4>5.2 账号封禁与终止</h4>
        <ul>
          <li>若玩家违反本协议，服务器有权随时封禁或删除其账号，且不另行赔偿。</li>
          <li>在停服、技术调整或不可抗力等情况下，服务器有权终止本协议，服务器不承担因终止服务导致的任何责任。</li>
        </ul>

        <h3>6.免责声明</h3>
        <h4>6.1 非官方性质</h4>
        <ul>
          <li>本服务器与 Mojang/Microsoft 无直接关系，不对玩家的游戏行为、聊天内容、交易行为等承担法律责任。</li>
        </ul>

        <h4>6.2 服务器运行与数据丢失</h4>
        <ul>
          <li>服务器可能因维护、技术故障、黑客攻击或不可抗力等原因导致服务中断或数据丢失，服务器对此不承担赔偿责任。</li>
          <li>服务器管理团队有权随时调整服务器规则、功能、数据平衡等内容，玩家需自行留意相关更新公告。</li>
        </ul>

        <h4>6.3 玩家责任</h4>
        <ul>
          <li>玩家应自行承担因使用本服务器所产生的一切后果，包括但不限于因违规行为导致的封禁、数据丢失、法律责任等。</li>
          <li>若因玩家行为给服务器或其他玩家造成损害，服务器有权追究其责任，包括但不限于要求赔偿损失、提起法律诉讼等。</li>
        </ul>

        <div class="doc-meta" style="margin-top:24px;">
          <p>暗影澄昏对外管理委员会</p>
        </div>
      </div>
    </div>
  `;
}

// ===== 页面渲染：服务器状态 =====
function renderStatus() {
  const s = App.settings || {};
  const javaAddrs = (s.serverAddresses && s.serverAddresses.java) || CONFIG.serverAddresses.java;
  const bedrockAddrs = (s.serverAddresses && s.serverAddresses.bedrock) || CONFIG.serverAddresses.bedrock;

  const edition = App.currentEdition || 'java';
  const addrs = edition === 'java' ? javaAddrs : bedrockAddrs;

  $('#app').innerHTML = `
    <div class="page">
      <div class="glass-card">
        <h2 class="page-title">服务器状态查询</h2>
        <p style="text-align:center;color:var(--text-secondary);margin-bottom:20px;">支持 Java 版 / 基岩版 · 实时查询服务器状态</p>

        <div class="status-edition-toggle">
          <button class="${edition==='java'?'active':''}" onclick="switchStatusEdition('java')">Java 版</button>
          <button class="${edition==='bedrock'?'active':''}" onclick="switchStatusEdition('bedrock')">基岩版</button>
        </div>

        <div class="status-input-row">
          <input type="text" class="status-input" id="statusInput" placeholder="输入服务器地址" onkeydown="if(event.key==='Enter')doStatusQuery()">
          <button class="status-btn" id="statusQueryBtn" onclick="doStatusQuery()">查 询</button>
        </div>

        <div class="status-chips" id="statusChips">
          ${addrs.map((a,i) => `<span class="status-chip" onclick="quickStatusQuery('${escapeHtml(a.address)}')">${escapeHtml(a.name)}: ${escapeHtml(a.address)}</span>`).join('')}
        </div>
      </div>

      <div id="statusResult">
        <div class="glass-card" style="text-align:center;color:var(--text-muted);">
          <p style="font-size:48px;margin-bottom:12px;">🎮</p>
          <p>输入服务器地址或点击上方线路开始查询</p>
        </div>
      </div>
    </div>
  `;
}

function switchStatusEdition(edition) {
  App.currentEdition = edition;
  renderStatus();
}

function quickStatusQuery(address) {
  $('#statusInput').value = address;
  doStatusQuery();
}

async function doStatusQuery() {
  const input = $('#statusInput');
  let address = input.value.trim();
  if (!address) { input.focus(); toast('请输入服务器地址', 'error'); return; }
  address = address.replace(/^https?:\/\//, '').replace(/\/.*$/, '').trim();

  const btn = $('#statusQueryBtn');
  btn.disabled = true;
  btn.textContent = '查询中...';
  $('#statusResult').innerHTML = `<div class="glass-card"><div class="loader-wrap"><div class="loader"></div><p>正在查询服务器状态…</p></div></div>`;

  const edition = App.currentEdition || 'java';
  const endpoint = `https://api.mcstatus.io/v2/status/${edition}/${encodeURIComponent(address)}`;

  try {
    const res = await fetch(endpoint);
    if (!res.ok) { const t = await res.text().catch(()=>''); throw new Error(t || `请求失败 (${res.status})`); }
    const data = await res.json();
    renderStatusResult(data, address);
  } catch (err) {
    $('#statusResult').innerHTML = `<div class="glass-card" style="text-align:center;color:var(--danger);"><p style="font-size:48px;margin-bottom:12px;">⚠️</p><p style="font-weight:700;">查询出错</p><p style="color:var(--text-muted);margin-top:8px;">${escapeHtml(err.message)}</p></div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = '查 询';
  }
}

function renderStatusResult(data, address) {
  if (!data.online) {
    $('#statusResult').innerHTML = `
      <div class="glass-card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:10px;">
          <span style="font-family:monospace;color:#f9a825;">🖥️ ${escapeHtml(data.host || address)}${data.port?':'+data.port:''}</span>
          <span class="status-badge offline"><span class="status-dot"></span>离线</span>
        </div>
        <div style="text-align:center;padding:20px;">
          <p style="font-size:48px;margin-bottom:12px;">💀</p>
          <p style="font-weight:700;color:var(--danger);">服务器离线</p>
          <p style="color:var(--text-muted);margin-top:8px;">该服务器当前无法连接。可能原因：服务器未启动、地址错误、端口被占用或网络不通。</p>
        </div>
      </div>`;
    return;
  }

  let html = `<div class="glass-card">`;
  html += `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:10px;">
    <span style="font-family:monospace;color:#f9a825;">🖥️ ${escapeHtml(data.host || address)}${data.port?':'+data.port:''}</span>
    <span class="status-badge online"><span class="status-dot"></span>在线</span>
  </div>`;

  // 图标和MOTD
  html += `<div style="display:flex;gap:20px;flex-wrap:wrap;margin-bottom:16px;">`;
  if (data.icon) {
    html += `<img src="${data.icon}" alt="服务器图标" style="width:80px;height:80px;image-rendering:pixelated;border-radius:8px;border:2px solid var(--border-color);">`;
  }
  html += `<div style="flex:1;min-width:200px;">`;
  if (data.motd) {
    const motdHtml = (data.motd.html || escapeHtml(data.motd.clean || '无 MOTD')).replace(/\n/g, '<br>');
    html += `<div style="background:var(--bg-input);border:1px solid var(--border-color);border-radius:8px;padding:12px;font-family:'Courier New',monospace;font-size:14px;margin-bottom:8px;">${motdHtml}</div>`;
  }
  if (data.version) {
    const ver = data.version.name_clean || data.version.name_raw || data.version.name || '未知';
    html += `<div style="font-size:13px;color:var(--text-muted);">版本：<span style="color:#f9a825;font-weight:700;">${escapeHtml(ver)}</span>`;
    if (data.version.protocol !== undefined) html += ` <span style="color:var(--text-muted);">(协议 ${data.version.protocol})</span>`;
    html += `</div>`;
  }
  html += `</div></div>`;

  // 信息网格
  html += `<div class="status-info-grid">`;
  if (data.players) html += `<div class="status-info-item"><div class="status-info-label">👥 在线玩家</div><div class="status-info-value green">${data.players.online} / ${data.players.max}</div></div>`;
  if (data.ip_address) html += `<div class="status-info-item"><div class="status-info-label">🌐 IP 地址</div><div class="status-info-value">${escapeHtml(data.ip_address)}</div></div>`;
  html += `<div class="status-info-item"><div class="status-info-label">🔌 端口</div><div class="status-info-value">${data.port || '-'}</div></div>`;
  if (data.software) html += `<div class="status-info-item"><div class="status-info-label">⚙️ 服务端</div><div class="status-info-value gold">${escapeHtml(data.software)}</div></div>`;
  if (data.gamemode) html += `<div class="status-info-item"><div class="status-info-label">🎮 游戏模式</div><div class="status-info-value gold">${escapeHtml(data.gamemode)}</div></div>`;
  html += `</div>`;

  // 玩家进度条
  if (data.players) {
    const pct = data.players.max > 0 ? Math.min(100, (data.players.online / data.players.max) * 100) : 0;
    html += `<div class="player-bar-wrap"><div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:13px;"><span>服务器容量</span><span><strong style="color:var(--success);">${data.players.online}</strong> / ${data.players.max}</span></div><div class="player-bar"><div class="player-bar-fill" style="width:${pct}%"></div></div></div>`;
  }

  // 玩家列表
  if (data.players && data.players.list && data.players.list.length > 0) {
    html += `<div style="font-size:13px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;margin:16px 0 10px;">在线玩家（采样 ${data.players.list.length} 人）</div><div class="player-list">`;
    for (const p of data.players.list) {
      const name = p.name_clean || p.name_raw || 'Unknown';
      const uuid = p.uuid || '';
      const headUrl = uuid ? `https://mc-heads.net/avatar/${uuid}/28` : `https://mc-heads.net/avatar/${encodeURIComponent(name)}/28`;
      html += `<div class="player-card"><img class="player-head" src="${headUrl}" alt="" onerror="this.style.display='none'"><span style="font-size:13px;font-weight:600;">${escapeHtml(name)}</span></div>`;
    }
    html += `</div>`;
  }

  if (data.retrieved_at) {
    const time = new Date(data.retrieved_at);
    html += `<div style="margin-top:16px;font-size:12px;color:var(--text-muted);text-align:right;">数据获取时间：${time.toLocaleString('zh-CN')}</div>`;
  }

  html += `</div>`;
  $('#statusResult').innerHTML = html;
}

// ===== 页面渲染：地图 =====
function renderMap() {
  const s = App.settings || {};
  const mapUrl = s.mapUrl || CONFIG.mapUrl;
  $('#app').innerHTML = `
    <div class="page page-wide">
      <div class="glass-card" style="padding:0;overflow:hidden;">
        <div class="map-container" style="height:calc(100vh - 100px);">
          <iframe src="${mapUrl}" allowfullscreen></iframe>
        </div>
      </div>
      <p style="text-align:center;color:#fff;text-shadow:0 2px 4px rgba(0,0,0,0.3);margin-top:12px;font-size:13px;">地图由 BlueMap 提供 · 如无法加载请检查网络连接</p>
    </div>
  `;
}

// ===== 页面渲染：聊天 =====
function renderChat() {
  const s = App.settings || {};
  const qqGroup = s.qqGroup || CONFIG.qqGroup;
  const chatNotice = (s.customTexts && s.customTexts.chatNotice) || '本功能为实验性功能，BUG 请反馈到 QQ 群';

  $('#app').innerHTML = `
    <div class="page">
      <div class="glass-card" style="height:calc(100vh - 100px);display:flex;flex-direction:column;padding:24px;">
        <div class="chat-header">
          <h2 class="chat-title">聊天大厅</h2>
          <p class="chat-notice">${escapeHtml(chatNotice)}（群号：${escapeHtml(qqGroup)}）</p>
        </div>
        <div class="chat-messages" id="chatMessages">
          <div style="text-align:center;color:var(--text-muted);padding:40px;">加载中...</div>
        </div>
        <div class="chat-input-row">
          <input type="text" class="chat-input" id="chatInput" placeholder="输入消息..." maxlength="500" onkeydown="if(event.key==='Enter')sendChatMessage()">
          <button class="chat-send-btn" id="chatSendBtn" onclick="sendChatMessage()">发送</button>
        </div>
      </div>
    </div>
  `;

  loadChatMessages();
  // 开始轮询
  App.chatPollTimer = setInterval(loadChatMessages, CONFIG.chatPollInterval);
}

async function loadChatMessages() {
  try {
    const data = await API.getChat();
    const messages = data.messages || [];
    const container = $('#chatMessages');
    if (!container) return;

    // 只在消息数量变化时重新渲染
    if (messages.length === App.lastChatCount && App.lastChatCount > 0) return;
    App.lastChatCount = messages.length;

    if (messages.length === 0) {
      container.innerHTML = `<div style="text-align:center;color:var(--text-muted);padding:40px;">暂无消息，来发送第一条吧！</div>`;
      return;
    }

    container.innerHTML = messages.map(msg => {
      const isSelf = App.user && msg.userId === App.user.id;
      const avatar = msg.avatar
        ? msg.avatar
        : `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20"><rect width="20" height="20" rx="10" fill="#667eea"/><text x="10" y="14" text-anchor="middle" fill="white" font-size="10" font-weight="bold">${escapeHtml((msg.username||'?')[0])}</text></svg>`)}`;
      return `
        <div class="chat-bubble ${isSelf?'self':''}">
          <div class="chat-bubble-header">
            <img class="chat-bubble-avatar" src="${avatar}" alt="">
            <span class="chat-bubble-name">${escapeHtml(msg.username)}</span>
            <span class="chat-bubble-time">${formatTime(msg.timestamp)}</span>
          </div>
          <div class="chat-bubble-content">${escapeHtml(msg.content)}</div>
        </div>`;
    }).join('');

    container.scrollTop = container.scrollHeight;
  } catch (e) {
    // 静默失败
  }
}

async function sendChatMessage() {
  const input = $('#chatInput');
  const content = input.value.trim();
  if (!content) return;

  const btn = $('#chatSendBtn');
  btn.disabled = true;
  try {
    await API.sendChat(content);
    input.value = '';
    App.lastChatCount = 0; // 强制刷新
    await loadChatMessages();
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

// ===== 页面渲染：个人空间 =====
function renderProfile() {
  const u = App.user;
  const avatar = u.avatar
    ? u.avatar
    : `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect width="120" height="120" rx="60" fill="#667eea"/><text x="60" y="80" text-anchor="middle" fill="white" font-size="48" font-weight="bold">${escapeHtml((u.gameName||u.username)[0])}</text></svg>`)}`;

  // 截图数据
  const screenshots = JSON.parse(localStorage.getItem('user_screenshots_' + u.id) || '[]');
  const regDate = u.createdAt ? new Date(u.createdAt).toLocaleDateString('zh-CN') : '-';

  $('#app').innerHTML = `
    <div class="page">
      <div class="glass-card">
        <div class="profile-header">
          <div class="profile-avatar-wrapper">
            <img class="profile-avatar" id="profileAvatar" src="${avatar}" alt="头像">
            <label class="profile-avatar-edit" title="更换头像">
              📷
              <input type="file" accept="image/*" style="display:none;" onchange="handleAvatarUpload(event)">
            </label>
          </div>
          <div class="profile-username">
            ${escapeHtml(u.gameName || u.username)}
            <button class="profile-username-edit" onclick="openProfileModal()">编辑</button>
          </div>
          ${u.isAdmin ? '<span style="display:inline-block;margin-top:8px;padding:4px 12px;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;border-radius:12px;font-size:13px;font-weight:600;">管理员</span>' : ''}
          
          <div class="profile-stats">
            <div class="profile-stat"><div class="profile-stat-num">${screenshots.length}</div><div class="profile-stat-label">截图</div></div>
            <div class="profile-stat"><div class="profile-stat-num">${regDate}</div><div class="profile-stat-label">注册日期</div></div>
            <div class="profile-stat"><div class="profile-stat-num">${escapeHtml(u.gameName||u.username).length}</div><div class="profile-stat-label">名字长度</div></div>
          </div>
        </div>

        <div class="profile-sections">
          <div class="profile-section" onclick="openProfileModal()">
            <div class="profile-section-icon">📋</div>
            <div class="profile-section-title">个人资料</div>
            <div class="profile-section-desc">头像、昵称、游戏名、QQ号等</div>
          </div>
          <div class="profile-section" onclick="location.hash='#/settings'">
            <div class="profile-section-icon">⚙️</div>
            <div class="profile-section-title">设置</div>
            <div class="profile-section-desc">字体、白天/夜晚模式</div>
          </div>
          <div class="profile-section" onclick="renderScreenshotSection()">
            <div class="profile-section-icon">📸</div>
            <div class="profile-section-title">游戏截图</div>
            <div class="profile-section-desc">上传和分享你的游戏截图</div>
          </div>
        </div>

        <div id="profileExtraArea"></div>

        ${u.isAdmin ? `
          <div class="admin-link">
            <button class="btn-admin" onclick="location.hash='#/admin'">网站 ADMIN 管理面板</button>
          </div>
        ` : ''}

        <div style="margin-top:24px;text-align:center;">
          <button class="btn btn-danger" onclick="handleLogout()">退出登录</button>
        </div>
      </div>
    </div>
  `;
}

// 个人资料编辑模态框
function openProfileModal() {
  const u = App.user;
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'profileModal';
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <div class="modal-title">编辑个人资料</div>
        <button class="modal-close" onclick="closeProfileModal()">×</button>
      </div>
      <div class="modal-body">
        <div class="modal-field">
          <label class="modal-field-label">昵称</label>
          <input type="text" class="modal-field-input" id="modalUsername" value="${escapeHtml(u.username)}" placeholder="2-20个字符">
        </div>
        <div class="modal-field">
          <label class="modal-field-label">游戏名（聊天大厅显示）</label>
          <input type="text" class="modal-field-input" id="modalGameName" value="${escapeHtml(u.gameName||'')}" placeholder="游戏内名称">
        </div>
        <div class="modal-field">
          <label class="modal-field-label">QQ 号</label>
          <input type="text" class="modal-field-input" id="modalQQ" value="${escapeHtml(u.qq||'')}" placeholder="选填">
        </div>
        <div class="modal-field">
          <label class="modal-field-label">邮箱</label>
          <input type="email" class="modal-field-input" id="modalEmail" value="${escapeHtml(u.email||'')}" placeholder="选填">
        </div>
        <div class="modal-field">
          <label class="modal-field-label">个性签名</label>
          <textarea class="modal-field-input" id="modalBio" rows="3" placeholder="介绍一下自己..." style="resize:vertical;font-family:inherit;">${escapeHtml(localStorage.getItem('user_bio_'+u.id)||'')}</textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeProfileModal()">取消</button>
        <button class="btn btn-primary" onclick="saveProfileModal()">保存</button>
      </div>
    </div>
  `;
  modal.addEventListener('click', (e) => { if (e.target === modal) closeProfileModal(); });
  document.body.appendChild(modal);
}

function closeProfileModal() {
  const m = $('#profileModal');
  if (m) m.remove();
}

async function saveProfileModal() {
  const updates = {
    username: $('#modalUsername').value.trim(),
    gameName: $('#modalGameName').value.trim(),
    qq: $('#modalQQ').value.trim(),
    email: $('#modalEmail').value.trim()
  };
  const bio = $('#modalBio').value;
  if (!updates.username) { toast('昵称不能为空', 'error'); return; }
  try {
    const data = await API.updateProfile(updates);
    App.user = data.user;
    localStorage.setItem('user_bio_' + App.user.id, bio);
    updateAuthUI();
    closeProfileModal();
    renderProfile();
    toast('个人资料保存成功', 'success');
  } catch (e) {
    toast(e.message, 'error');
  }
}

// 截图管理
function renderScreenshotSection() {
  const uid = App.user.id;
  const screenshots = JSON.parse(localStorage.getItem('user_screenshots_' + uid) || '[]');
  const area = $('#profileExtraArea');
  if (!area) return;
  area.innerHTML = `
    <div class="glass-card" style="margin-top:20px;">
      <h3 class="section-title">游戏截图</h3>
      <div class="screenshot-upload-zone" onclick="document.getElementById('screenshotFileInput').click()">
        <div class="screenshot-upload-icon">📸</div>
        <div style="font-weight:600;">点击上传游戏截图</div>
        <div style="font-size:12px;margin-top:4px;">支持 JPG/PNG，单张不超过5MB</div>
        <input type="file" id="screenshotFileInput" accept="image/*" multiple style="display:none;" onchange="handleScreenshotUpload(event)">
      </div>
      ${screenshots.length > 0 ? `
        <div class="screenshot-gallery">
          ${screenshots.map((s, i) => `
            <div class="screenshot-item" onclick="previewScreenshot(${i})">
              <img src="${s.data}" alt="截图${i+1}">
              <button class="screenshot-delete" onclick="event.stopPropagation();deleteScreenshot(${i})">×</button>
            </div>
          `).join('')}
        </div>
      ` : '<p style="text-align:center;color:var(--text-muted);padding:20px;">还没有上传截图，快来分享你的游戏瞬间吧！</p>'}
    </div>
  `;
}

function handleScreenshotUpload(event) {
  const files = Array.from(event.target.files);
  if (!files.length) return;
  const uid = App.user.id;
  const screenshots = JSON.parse(localStorage.getItem('user_screenshots_' + uid) || '[]');
  let loaded = 0;
  files.forEach(file => {
    if (file.size > 5 * 1024 * 1024) { toast(`${file.name} 超过5MB，已跳过`, 'error'); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      // 压缩图片
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxSize = 1280;
        let { width, height } = img;
        if (width > maxSize || height > maxSize) {
          if (width > height) { height = height * maxSize / width; width = maxSize; }
          else { width = width * maxSize / height; height = maxSize; }
        }
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        screenshots.push({ data: canvas.toDataURL('image/jpeg', 0.85), name: file.name, time: new Date().toISOString() });
        loaded++;
        if (loaded === files.length || loaded === files.filter(f => f.size <= 5*1024*1024).length) {
          localStorage.setItem('user_screenshots_' + uid, JSON.stringify(screenshots));
          renderScreenshotSection();
          // 更新统计
          const stats = document.querySelectorAll('.profile-stat-num');
          if (stats[0]) stats[0].textContent = screenshots.length;
          toast(`成功上传 ${loaded} 张截图`, 'success');
        }
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
  event.target.value = '';
}

function deleteScreenshot(index) {
  const uid = App.user.id;
  const screenshots = JSON.parse(localStorage.getItem('user_screenshots_' + uid) || '[]');
  screenshots.splice(index, 1);
  localStorage.setItem('user_screenshots_' + uid, JSON.stringify(screenshots));
  renderScreenshotSection();
  const stats = document.querySelectorAll('.profile-stat-num');
  if (stats[0]) stats[0].textContent = screenshots.length;
  toast('截图已删除', 'info');
}

function previewScreenshot(index) {
  const uid = App.user.id;
  const screenshots = JSON.parse(localStorage.getItem('user_screenshots_' + uid) || '[]');
  if (!screenshots[index]) return;
  const modal = document.createElement('div');
  modal.className = 'image-preview-modal';
  modal.innerHTML = `<img src="${screenshots[index].data}" alt="预览">`;
  modal.addEventListener('click', () => modal.remove());
  document.body.appendChild(modal);
}

async function editProfileFieldModal(field, label) {
  const newValue = prompt(`请输入新的${label}：`, App.user[field] || '');
  if (newValue === null) return;
  try {
    const data = await API.updateProfile({ [field]: newValue });
    App.user = data.user;
    updateAuthUI();
    renderProfile();
    toast(`${label}修改成功`, 'success');
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function handleAvatarUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { toast('图片不能超过5MB', 'error'); return; }

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = await API.updateProfile({ avatar: e.target.result });
      App.user = data.user;
      updateAuthUI();
      renderProfile();
      toast('头像更新成功', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  };
  reader.readAsDataURL(file);
}

async function handleLogout() {
  await API.logout();
  App.user = null;
  updateAuthUI();
  toast('已退出登录', 'info');
  location.hash = '#/home';
}

// ===== 页面渲染：设置 =====
function renderSettings() {
  const theme = localStorage.getItem('theme') || 'light';
  const fontSize = localStorage.getItem('fontSize') || '16px';
  const fontFamily = localStorage.getItem('fontFamily') || "'Noto Sans SC', sans-serif";

  $('#app').innerHTML = `
    <div class="page">
      <div class="glass-card">
        <h2 class="page-title">设置</h2>

        <div class="settings-group">
          <div class="settings-group-title">显示模式</div>
          <div class="theme-toggle">
            <div class="theme-option ${theme==='light'?'active':''}" onclick="setTheme('light')">
              <div class="theme-option-icon">☀️</div>
              <div class="theme-option-label">白天模式</div>
            </div>
            <div class="theme-option ${theme==='dark'?'active':''}" onclick="setTheme('dark')">
              <div class="theme-option-icon">🌙</div>
              <div class="theme-option-label">夜晚模式</div>
            </div>
          </div>
        </div>

        <div class="settings-group">
          <div class="settings-group-title">字体大小：<span id="fontSizeLabel">${fontSize}</span></div>
          <input type="range" class="font-size-slider" min="12" max="22" value="${parseInt(fontSize)}" oninput="setFontSize(this.value)">
        </div>

        <div class="settings-group">
          <div class="settings-group-title">字体</div>
          <select class="font-select" onchange="setFontFamily(this.value)">
            <option value="'Noto Sans SC', sans-serif" ${fontFamily.includes('Noto Sans SC')?'selected':''}>思源黑体（推荐）</option>
            <option value="'Noto Serif SC', serif" ${fontFamily.includes('Noto Serif')?'selected':''}>思源宋体</option>
            <option value="'ZCOOL KuaiLe', sans-serif" ${fontFamily.includes('ZCOOL KuaiLe')?'selected':''}>站酷快乐体</option>
            <option value="'ZCOOL XiaoWei', serif" ${fontFamily.includes('XiaoWei')?'selected':''}>站酷小薇</option>
            <option value="'ZCOOL QingKe HuangYou', sans-serif" ${fontFamily.includes('QingKe')?'selected':''}>站酷庆科黄油体</option>
            <option value="'Ma Shan Zheng', cursive" ${fontFamily.includes('Ma Shan')?'selected':''}>马善政书法</option>
            <option value="'Long Cang', cursive" ${fontFamily.includes('Long Cang')?'selected':''}>龙藏体</option>
            <option value="'Liu Jian Mao Cao', cursive" ${fontFamily.includes('Liu Jian')?'selected':''}>刘建毛草</option>
            <option value="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" ${fontFamily.includes('apple-system')?'selected':''}>系统默认</option>
            <option value="'Courier New', monospace" ${fontFamily.includes('Courier')?'selected':''}>等宽字体</option>
            <option value="Georgia, 'Times New Roman', serif" ${fontFamily.includes('Georgia')?'selected':''}>英文衬线体</option>
          </select>
          <div style="margin-top:12px;padding:16px;background:var(--bg-input);border-radius:var(--radius-sm);border:1px solid var(--border-color);">
            <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;">字体预览：</div>
            <div style="font-size:18px;font-weight:700;color:var(--text-primary);">暗影澄昏 Minecraft 服务器</div>
            <div style="font-size:14px;color:var(--text-secondary);margin-top:4px;">The quick brown fox jumps over the lazy dog.</div>
            <div style="font-size:13px;color:var(--text-muted);margin-top:4px;">1234567890 ABCDEFGHIJKLMN</div>
          </div>
        </div>

        <div class="settings-group">
          <div class="settings-group-title">预览</div>
          <div style="padding:16px;background:var(--bg-input);border-radius:var(--radius-sm);border:1px solid var(--border-color);">
            <p style="color:var(--text-primary);">这是一段预览文字，用于测试字体设置效果。你可以在这里看到当前字体和字号的实际显示效果。</p>
          </div>
        </div>
      </div>
    </div>
  `;
}

function setTheme(theme) {
  localStorage.setItem('theme', theme);
  applyTheme();
  renderSettings();
}

function setFontSize(size) {
  const val = size + 'px';
  localStorage.setItem('fontSize', val);
  $('#fontSizeLabel').textContent = val;
  applyTheme();
}

function setFontFamily(family) {
  localStorage.setItem('fontFamily', family);
  applyTheme();
}

// ===== 页面渲染：登录/注册 =====
function renderLogin() {
  $('#app').innerHTML = `
    <div class="page">
      <div class="glass-card auth-card">
        <div class="auth-tabs">
          <div class="auth-tab active" data-tab="login" onclick="switchAuthTab('login')">登录</div>
          <div class="auth-tab" data-tab="register" onclick="switchAuthTab('register')">注册</div>
        </div>

        <div id="authForm">
          <div id="authError"></div>
          <div class="form-group">
            <label class="form-label">账号（昵称 / QQ号 / 邮箱）</label>
            <input type="text" class="form-input" id="loginIdentifier" placeholder="输入昵称、QQ号或邮箱">
          </div>
          <div class="form-group">
            <label class="form-label">密码</label>
            <input type="password" class="form-input" id="loginPassword" placeholder="输入密码" onkeydown="if(event.key==='Enter')doLogin()">
          </div>
          <button class="btn-submit" onclick="doLogin()">登 录</button>
        </div>
      </div>
    </div>
  `;
}

function switchAuthTab(tab) {
  $$('.auth-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  const form = $('#authForm');
  $('#authError').innerHTML = '';

  if (tab === 'login') {
    form.innerHTML = `
      <div id="authError"></div>
      <div class="form-group">
        <label class="form-label">账号（昵称 / QQ号 / 邮箱）</label>
        <input type="text" class="form-input" id="loginIdentifier" placeholder="输入昵称、QQ号或邮箱">
      </div>
      <div class="form-group">
        <label class="form-label">密码</label>
        <input type="password" class="form-input" id="loginPassword" placeholder="输入密码" onkeydown="if(event.key==='Enter')doLogin()">
      </div>
      <button class="btn-submit" onclick="doLogin()">登 录</button>
    `;
  } else {
    form.innerHTML = `
      <div id="authError"></div>
      <div class="form-group">
        <label class="form-label">昵称 *</label>
        <input type="text" class="form-input" id="regUsername" placeholder="2-20个字符">
      </div>
      <div class="form-group">
        <label class="form-label">密码 *</label>
        <input type="password" class="form-input" id="regPassword" placeholder="至少6位">
      </div>
      <div class="form-group">
        <label class="form-label">QQ 号（选填）</label>
        <input type="text" class="form-input" id="regQQ" placeholder="选填">
      </div>
      <div class="form-group">
        <label class="form-label">邮箱（选填）</label>
        <input type="email" class="form-input" id="regEmail" placeholder="选填">
      </div>
      <button class="btn-submit" onclick="doRegister()">注 册</button>
    `;
  }
}

function showAuthError(msg) {
  $('#authError').innerHTML = `<div class="form-error">${escapeHtml(msg)}</div>`;
}

async function doLogin() {
  const identifier = $('#loginIdentifier').value.trim();
  const password = $('#loginPassword').value;
  if (!identifier || !password) { showAuthError('请输入账号和密码'); return; }

  const btn = $('.btn-submit');
  btn.disabled = true; btn.textContent = '登录中...';
  try {
    const data = await API.login(identifier, password);
    App.user = data.user;
    updateAuthUI();
    toast('登录成功', 'success');
    location.hash = '#/home';
  } catch (e) {
    showAuthError(e.message);
  } finally {
    btn.disabled = false; btn.textContent = '登 录';
  }
}

async function doRegister() {
  const username = $('#regUsername').value.trim();
  const password = $('#regPassword').value;
  const qq = $('#regQQ').value.trim();
  const email = $('#regEmail').value.trim();
  if (!username || !password) { showAuthError('昵称和密码为必填项'); return; }

  const btn = $('.btn-submit');
  btn.disabled = true; btn.textContent = '注册中...';
  try {
    const data = await API.register(username, password, qq, email);
    App.user = data.user;
    updateAuthUI();
    toast('注册成功', 'success');
    location.hash = '#/home';
  } catch (e) {
    showAuthError(e.message);
  } finally {
    btn.disabled = false; btn.textContent = '注 册';
  }
}

// ===== 页面渲染：Admin 管理面板 =====

// Admin 状态
let AdminState = {
  currentPage: 'home',
  mode: 'edit',
  previewUrl: '#/home',
  previewDevice: 'full',
  blocks: {},    // 每页的可编辑块数据
  blockOrder: {} // 每页的块顺序
};

// 页面定义
const ADMIN_PAGES = [
  { id: 'home', name: '首页', icon: '🏠' },
  { id: 'guide', name: '进服指南', icon: '📖' },
  { id: 'status', name: '服务器状态', icon: '📊' },
  { id: 'map', name: '地图', icon: '🗺️' },
  { id: 'chat', name: '聊天', icon: '💬' },
  { id: 'styles', name: '样式与颜色', icon: '🎨' },
  { id: 'background', name: '背景设置', icon: '🌈' },
  { id: 'users', name: '用户管理', icon: '👥' },
];

// 字体选项
const ADMIN_FONTS = [
  { value: "'Noto Sans SC', sans-serif", label: '思源黑体' },
  { value: "'Noto Serif SC', serif", label: '思源宋体' },
  { value: "'ZCOOL KuaiLe', sans-serif", label: '站酷快乐体' },
  { value: "'ZCOOL XiaoWei', serif", label: '站酷小薇' },
  { value: "'ZCOOL QingKe HuangYou', sans-serif", label: '站酷庆科黄油体' },
  { value: "'Ma Shan Zheng', cursive", label: '马善政书法' },
  { value: "'Long Cang', cursive", label: '龙藏体' },
  { value: "'Liu Jian Mao Cao', cursive", label: '刘建毛草' },
  { value: "-apple-system, BlinkMacSystemFont, sans-serif", label: '系统默认' },
  { value: "'Courier New', monospace", label: '等宽字体' },
  { value: "Georgia, 'Times New Roman', serif", label: '英文衬线体' },
];

// 粗细选项
const ADMIN_WEIGHTS = [
  { value: '100', label: '100 - 极细' },
  { value: '300', label: '300 - 细体' },
  { value: '400', label: '400 - 常规' },
  { value: '500', label: '500 - 中等' },
  { value: '700', label: '700 - 粗体' },
  { value: '900', label: '900 - 特粗' },
];

// 获取页面可编辑块定义
function getAdminPageBlocks(pageId, settings) {
  const s = settings || {};
  const ct = s.customTexts || {};
  const cs = s.customStyles || {};
  const bs = s.blockStyles || {};

  const pageBlocks = {
    home: [
      { key: 'siteName', label: '网站名称', type: 'text', value: s.siteName || '', defaultStyle: { fontFamily: "'Noto Serif SC', serif", fontWeight: '900', fontSize: '80px', color: '#ffffff' } },
      { key: 'siteIntro', label: '网站简介', type: 'textarea', value: s.siteIntro || '', defaultStyle: { fontFamily: "'Noto Sans SC', sans-serif", fontWeight: '400', fontSize: '16px', color: '#e0e0e0' } },
    ],
    guide: [
      { key: 'qqGroup', label: 'QQ 群号', type: 'text', value: s.qqGroup || '', defaultStyle: { fontFamily: "'Noto Sans SC', sans-serif", fontWeight: '700', fontSize: '18px', color: 'var(--primary)' } },
      { key: 'joinNotice', label: '进服须知文本', type: 'textarea', value: ct.joinNotice || '', defaultStyle: { fontFamily: "'Noto Sans SC', sans-serif", fontWeight: '400', fontSize: '15px', color: 'var(--text-secondary)' } },
    ],
    map: [
      { key: 'mapUrl', label: 'BlueMap 地图地址', type: 'text', value: s.mapUrl || '', defaultStyle: { fontFamily: "'Noto Sans SC', sans-serif", fontWeight: '400', fontSize: '14px', color: 'var(--text-primary)' } },
    ],
    chat: [
      { key: 'chatNotice', label: '聊天提示文本', type: 'textarea', value: ct.chatNotice || '', defaultStyle: { fontFamily: "'Noto Sans SC', sans-serif", fontWeight: '400', fontSize: '13px', color: 'var(--danger)' } },
    ],
  };

  if (!pageBlocks[pageId]) return null;

  // 合并存储的样式
  return pageBlocks[pageId].map(b => {
    const storedStyle = bs[pageId + '_' + b.key] || {};
    return {
      ...b,
      style: { ...b.defaultStyle, ...storedStyle },
    };
  });
}

// 渲染 Admin 面板
function renderAdmin() {
  // 初始化块顺序
  ADMIN_PAGES.forEach(p => {
    if (!AdminState.blockOrder[p.id]) {
      const blocks = getAdminPageBlocks(p.id, App.settings);
      if (blocks) {
        AdminState.blockOrder[p.id] = blocks.map((_, i) => i);
      }
    }
  });

  $('#app').innerHTML = `
    <div class="page">
      <div class="glass-card admin-panel">
        <div class="admin-header">
          <h2 class="page-title" style="margin-bottom:0;">网站 ADMIN 管理面板</h2>
        </div>

        <div class="admin-drag-hint">
          💡 提示：点击文字块展开编辑选项（字体、粗细、大小、颜色等）；长按拖拽 ≡ 图标可重新排序
        </div>
        <div class="admin-page-nav" id="adminPageNav">
          ${ADMIN_PAGES.map((p, i) => `
            <div class="admin-page-tab ${AdminState.currentPage===p.id?'active':''}" data-page="${p.id}" onclick="switchAdminPage('${p.id}')">
              <span class="admin-page-tab-icon">${p.icon}</span> ${p.name}
            </div>
          `).join('')}
        </div>
        <div id="adminContent"></div>
      </div>
    </div>
  `;
  switchAdminPage(AdminState.currentPage);
}

function switchAdminPage(pageId) {
  AdminState.currentPage = pageId;
  $$('.admin-page-tab').forEach(t => t.classList.toggle('active', t.dataset.page === pageId));
  const content = $('#adminContent');
  if (!content) return;
  const s = App.settings || {};

  if (pageId === 'status') {
    renderAdminServers(content, s);
  } else if (pageId === 'styles') {
    renderAdminStyles(content, s);
  } else if (pageId === 'background') {
    renderAdminBackground(content, s);
  } else if (pageId === 'users') {
    content.innerHTML = '<div id="userListArea"><p style="color:var(--text-muted);text-align:center;padding:20px;">加载中...</p></div>';
    loadAdminUsers();
  } else {
    renderAdminBlocks(content, pageId, s);
  }
}

// 渲染可编辑文字块
function renderAdminBlocks(container, pageId, settings) {
  const blocks = getAdminPageBlocks(pageId, settings);
  if (!blocks || blocks.length === 0) {
    container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:40px;">此页面暂无可编辑内容</p>';
    return;
  }

  const order = AdminState.blockOrder[pageId] || blocks.map((_, i) => i);
  const orderedBlocks = order.map(i => blocks[i]).filter(Boolean);

  container.innerHTML = `
    <div class="admin-block-list" id="blockList_${pageId}">
      ${orderedBlocks.map((block, displayIndex) => {
        const originalIndex = order[displayIndex];
        const style = block.style || block.defaultStyle;
        return `
        <div class="admin-block" id="block_${pageId}_${displayIndex}" data-page="${pageId}" data-index="${displayIndex}">
          <div class="admin-block-header" onclick="toggleBlock('${pageId}', ${displayIndex})">
            <div class="admin-block-drag-handle" title="长按拖拽排序">≡</div>
            <div class="admin-block-info">
              <div class="admin-block-label">${escapeHtml(block.label)}</div>
              <div class="admin-block-preview-text">${escapeHtml(block.value.substring(0, 80))}${block.value.length > 80 ? '...' : ''}</div>
            </div>
            <div class="admin-block-expand-icon">▼</div>
          </div>
          <div class="admin-block-editor">
            <div class="admin-block-field">
              <label class="admin-block-field-label">📝 文字内容</label>
              ${block.type === 'textarea' ?
                `<textarea class="admin-block-input admin-block-textarea" id="block_text_${pageId}_${displayIndex}" placeholder="${escapeHtml(block.label)}">${escapeHtml(block.value)}</textarea>` :
                `<input type="text" class="admin-block-input" id="block_text_${pageId}_${displayIndex}" value="${escapeHtml(block.value)}" placeholder="${escapeHtml(block.label)}">`
              }
            </div>
            <div class="admin-block-field-row">
              <div class="admin-block-field" style="margin-top:14px;">
                <label class="admin-block-field-label">🔤 字体</label>
                <select class="admin-block-select" id="block_font_${pageId}_${displayIndex}">
                  ${ADMIN_FONTS.map(f => `<option value="${escapeHtml(f.value)}" ${(style.fontFamily||'').includes(f.value.split(',')[0].replace(/['"]/g,'').trim())?'selected':''}>${escapeHtml(f.label)}</option>`).join('')}
                </select>
              </div>
              <div class="admin-block-field" style="margin-top:14px;">
                <label class="admin-block-field-label">💪 粗细</label>
                <select class="admin-block-select" id="block_weight_${pageId}_${displayIndex}">
                  ${ADMIN_WEIGHTS.map(w => `<option value="${w.value}" ${style.fontWeight===w.value?'selected':''}>${escapeHtml(w.label)}</option>`).join('')}
                </select>
              </div>
            </div>
            <div class="admin-block-field-row">
              <div class="admin-block-field" style="margin-top:14px;">
                <label class="admin-block-field-label">📏 字号</label>
                <input type="text" class="admin-block-input" id="block_size_${pageId}_${displayIndex}" value="${escapeHtml(style.fontSize||'16px')}" placeholder="如 16px">
              </div>
              <div class="admin-block-field" style="margin-top:14px;">
                <label class="admin-block-field-label">🎨 颜色</label>
                <div class="admin-block-color-row">
                  <input type="color" class="admin-block-color" id="block_color_${pageId}_${displayIndex}" value="${normalizeColor(style.color||'#ffffff')}">
                  <input type="text" class="admin-block-color-text" id="block_colorText_${pageId}_${displayIndex}" value="${escapeHtml(style.color||'#ffffff')}" oninput="document.getElementById('block_color_${pageId}_${displayIndex}').value=this.value">
                </div>
              </div>
            </div>
            <div class="admin-block-actions">
              <button class="admin-action-btn" onclick="event.stopPropagation();moveBlock('${pageId}', ${displayIndex}, 'up')">⬆ 上移</button>
              <button class="admin-action-btn" onclick="event.stopPropagation();moveBlock('${pageId}', ${displayIndex}, 'down')">⬇ 下移</button>
              <button class="admin-action-btn" onclick="event.stopPropagation();resetBlockStyle('${pageId}', ${displayIndex})">↺ 重置样式</button>
            </div>
          </div>
        </div>
        `;
      }).join('')}
    </div>
    <div class="admin-save-bar">
      <button class="btn btn-primary" onclick="saveAdminBlocks('${pageId}')">💾 保存设置</button>
      <span style="font-size:13px;color:var(--text-muted);">修改后点击保存即时生效</span>
    </div>
  `;

  // 初始化拖拽
  initBlockDrag(pageId);
}

// 颜色值规范化（var(--xxx) -> #ffffff 用于 color input）
function normalizeColor(c) {
  if (!c || c.startsWith('var(') || c.startsWith('rgb(')) return '#ffffff';
  if (!c.startsWith('#')) return '#ffffff';
  return c;
}

// 展开/折叠块
function toggleBlock(pageId, index) {
  const block = $(`#block_${pageId}_${index}`);
  if (block) block.classList.toggle('expanded');
}

// 移动块
function moveBlock(pageId, index, direction) {
  const order = AdminState.blockOrder[pageId];
  if (!order) return;
  const newIdx = direction === 'up' ? index - 1 : index + 1;
  if (newIdx < 0 || newIdx >= order.length) return;
  // 交换
  [order[index], order[newIdx]] = [order[newIdx], order[index]];
  // 重新渲染
  renderAdminBlocks($('#adminContent'), pageId, App.settings);
}

// 重置块样式
function resetBlockStyle(pageId, index) {
  const blocks = getAdminPageBlocks(pageId, App.settings);
  const order = AdminState.blockOrder[pageId];
  if (!blocks || !order) return;
  const originalIndex = order[index];
  const block = blocks[originalIndex];
  if (!block) return;
  // 清除存储的样式
  const bs = App.settings.blockStyles || {};
  delete bs[pageId + '_' + block.key];
  saveBlockStyles(bs).then(() => {
    renderAdminBlocks($('#adminContent'), pageId, App.settings);
    toast('样式已重置', 'success');
  });
}

// 初始化长按拖拽
function initBlockDrag(pageId) {
  const blocks = $$(`#blockList_${pageId} .admin-block`);
  let dragSrc = null;
  let dragSrcIndex = -1;
  let longPressTimer = null;
  let isDragging = false;

  blocks.forEach((block, index) => {
    const handle = block.querySelector('.admin-block-drag-handle');
    if (!handle) return;

    const startDrag = (e) => {
      e.preventDefault();
      e.stopPropagation();
      longPressTimer = setTimeout(() => {
        isDragging = true;
        dragSrc = block;
        dragSrcIndex = index;
        block.classList.add('dragging');
        document.body.style.cursor = 'grabbing';
      }, 400);
    };

    const cancelDrag = () => {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
      if (!isDragging) return;
      isDragging = false;
      document.body.style.cursor = '';
      if (dragSrc) dragSrc.classList.remove('dragging');
      blocks.forEach(b => b.classList.remove('drag-over-top', 'drag-over-bottom'));
      dragSrc = null;
      dragSrcIndex = -1;
    };

    // 鼠标事件
    handle.addEventListener('mousedown', startDrag);
    handle.addEventListener('mouseup', cancelDrag);
    handle.addEventListener('mouseleave', cancelDrag);

    // 触摸事件
    handle.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const touch = e.touches[0];
      startDrag(e);
    }, { passive: false });

    handle.addEventListener('touchend', cancelDrag);

    // 拖拽经过其他块
    block.addEventListener('dragover', (e) => {
      if (!isDragging || !dragSrc || block === dragSrc) return;
      e.preventDefault();
      const rect = block.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      blocks.forEach(b => b.classList.remove('drag-over-top', 'drag-over-bottom'));
      if (e.clientY < midY) {
        block.classList.add('drag-over-top');
      } else {
        block.classList.add('drag-over-bottom');
      }
    });

    block.addEventListener('drop', (e) => {
      if (!isDragging || !dragSrc || block === dragSrc) return;
      e.preventDefault();
      const rect = block.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      let targetIndex = index;
      if (e.clientY >= midY) targetIndex++;

      // 重新排序
      const order = AdminState.blockOrder[pageId];
      const movedItem = order.splice(dragSrcIndex, 1)[0];
      if (targetIndex > dragSrcIndex) targetIndex--;
      order.splice(targetIndex, 0, movedItem);

      cancelDrag();
      renderAdminBlocks($('#adminContent'), pageId, App.settings);
      toast('已重新排序', 'success');
    });

    // HTML5 拖拽支持
    handle.setAttribute('draggable', 'true');
    handle.addEventListener('dragstart', (e) => {
      dragSrc = block;
      dragSrcIndex = index;
      block.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    handle.addEventListener('dragend', () => {
      if (dragSrc) dragSrc.classList.remove('dragging');
      blocks.forEach(b => b.classList.remove('drag-over-top', 'drag-over-bottom'));
      dragSrc = null;
      dragSrcIndex = -1;
    });
  });
}

// 保存块数据和样式
async function saveAdminBlocks(pageId) {
  try {
    const blocks = getAdminPageBlocks(pageId, App.settings);
    const order = AdminState.blockOrder[pageId];
    if (!blocks || !order) return;

    let updates = {};
    let blockStyles = { ...(App.settings.blockStyles || {}) };

    order.forEach((originalIdx, displayIdx) => {
      const block = blocks[originalIdx];
      if (!block) return;

      // 获取文本值
      const textEl = $(`#block_text_${pageId}_${displayIdx}`);
      if (textEl) {
        const value = textEl.value;
        if (block.key === 'siteName') updates.siteName = value;
        else if (block.key === 'siteIntro') updates.siteIntro = value;
        else if (block.key === 'qqGroup') updates.qqGroup = value;
        else if (block.key === 'mapUrl') updates.mapUrl = value;
        else if (block.key === 'joinNotice' || block.key === 'chatNotice') {
          if (!updates.customTexts) updates.customTexts = { ...(App.settings.customTexts||{}) };
          updates.customTexts[block.key] = value;
        }
      }

      // 获取样式值
      const fontEl = $(`#block_font_${pageId}_${displayIdx}`);
      const weightEl = $(`#block_weight_${pageId}_${displayIdx}`);
      const sizeEl = $(`#block_size_${pageId}_${displayIdx}`);
      const colorEl = $(`#block_color_${pageId}_${displayIdx}`);
      const colorTextEl = $(`#block_colorText_${pageId}_${displayIdx}`);

      if (fontEl || weightEl || sizeEl || colorEl) {
        const styleKey = pageId + '_' + block.key;
        blockStyles[styleKey] = {
          fontFamily: fontEl ? fontEl.value : (block.style.fontFamily || ''),
          fontWeight: weightEl ? weightEl.value : (block.style.fontWeight || '400'),
          fontSize: sizeEl ? sizeEl.value : (block.style.fontSize || '16px'),
          color: colorTextEl ? colorTextEl.value : (block.style.color || '#ffffff'),
        };
      }
    });

    updates.blockStyles = blockStyles;

    App.settings = await API.updateSettings(updates);
    applyCustomStyles(App.settings.customStyles);
    applyBlockStyles(App.settings.blockStyles);
    toast('保存成功', 'success');
  } catch (e) {
    toast(e.message, 'error');
  }
}

// 应用块样式到页面
function applyBlockStyles(blockStyles) {
  if (!blockStyles) return;
  let styleEl = document.getElementById('dynamic-block-styles');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'dynamic-block-styles';
    document.head.appendChild(styleEl);
  }
  let css = '';
  // 首页
  if (blockStyles.home_siteName) {
    const s = blockStyles.home_siteName;
    css += `.home-title{font-family:${s.fontFamily}!important;font-weight:${s.fontWeight}!important;`;
    if (s.fontSize) css += `font-size:${s.fontSize}!important;`;
    css += `color:${s.color}!important;}`;
  }
  if (blockStyles.home_siteIntro) {
    const s = blockStyles.home_siteIntro;
    css += `.home-intro{font-family:${s.fontFamily}!important;font-weight:${s.fontWeight}!important;font-size:${s.fontSize}!important;color:${s.color}!important;}`;
  }
  // 进服指南
  if (blockStyles.guide_qqGroup) {
    const s = blockStyles.guide_qqGroup;
    css += `.guide-qq-num{font-family:${s.fontFamily}!important;font-weight:${s.fontWeight}!important;font-size:${s.fontSize}!important;color:${s.color}!important;}`;
  }
  if (blockStyles.guide_joinNotice) {
    const s = blockStyles.guide_joinNotice;
    css += `.guide-notice-text{font-family:${s.fontFamily}!important;font-weight:${s.fontWeight}!important;font-size:${s.fontSize}!important;color:${s.color}!important;}`;
  }
  // 聊天
  if (blockStyles.chat_chatNotice) {
    const s = blockStyles.chat_chatNotice;
    css += `.chat-notice{font-family:${s.fontFamily}!important;font-weight:${s.fontWeight}!important;font-size:${s.fontSize}!important;color:${s.color}!important;}`;
  }
  styleEl.textContent = css;
}

// 渲染服务器地址编辑
function renderAdminServers(container, s) {
  const java = (s.serverAddresses && s.serverAddresses.java) || [];
  const bedrock = (s.serverAddresses && s.serverAddresses.bedrock) || [];
  container.innerHTML = `
    <div class="admin-server-section">
      <h4>Java 版线路（3条）</h4>
      ${[0,1,2].map(i => `
        <div class="admin-server-row">
          <input type="text" class="admin-setting-input" id="javaName${i}" value="${escapeHtml(java[i]?.name||'线路'+(i+1))}" placeholder="线路名称">
          <input type="text" class="admin-setting-input" id="javaAddr${i}" value="${escapeHtml(java[i]?.address||'')}" placeholder="服务器地址">
        </div>
      `).join('')}
    </div>
    <div class="admin-server-section">
      <h4>基岩版线路（3条）</h4>
      ${[0,1,2].map(i => `
        <div class="admin-server-row">
          <input type="text" class="admin-setting-input" id="bedrockName${i}" value="${escapeHtml(bedrock[i]?.name||'线路'+(i+1))}" placeholder="线路名称">
          <input type="text" class="admin-setting-input" id="bedrockAddr${i}" value="${escapeHtml(bedrock[i]?.address||'')}" placeholder="服务器地址">
        </div>
      `).join('')}
    </div>
    <div class="admin-save-bar">
      <button class="btn btn-primary" onclick="saveAdminServers()">💾 保存线路设置</button>
    </div>
  `;
}

// 渲染样式与颜色
function renderAdminStyles(container, s) {
  const cs = s.customStyles || {};
  container.innerHTML = `
    <div class="admin-block-list">
      <div class="admin-block expanded">
        <div class="admin-block-header">
          <div class="admin-block-info">
            <div class="admin-block-label">主色调</div>
            <div class="admin-block-preview-text">${escapeHtml(cs.primaryColor||'#1a73e8')}</div>
          </div>
        </div>
        <div class="admin-block-editor">
          <div class="admin-block-color-row">
            <input type="color" class="admin-block-color" id="stylePrimary" value="${escapeHtml(cs.primaryColor||'#1a73e8')}">
            <input type="text" class="admin-block-color-text" id="stylePrimaryText" value="${escapeHtml(cs.primaryColor||'#1a73e8')}" oninput="document.getElementById('stylePrimary').value=this.value">
          </div>
        </div>
      </div>
      <div class="admin-block expanded">
        <div class="admin-block-header">
          <div class="admin-block-info">
            <div class="admin-block-label">网站名称颜色</div>
            <div class="admin-block-preview-text">${escapeHtml(cs.siteNameColor||'#ffffff')}</div>
          </div>
        </div>
        <div class="admin-block-editor">
          <div class="admin-block-color-row">
            <input type="color" class="admin-block-color" id="styleNameColor" value="${escapeHtml(cs.siteNameColor||'#ffffff')}">
            <input type="text" class="admin-block-color-text" id="styleNameColorText" value="${escapeHtml(cs.siteNameColor||'#ffffff')}" oninput="document.getElementById('styleNameColor').value=this.value">
          </div>
        </div>
      </div>
      <div class="admin-block expanded">
        <div class="admin-block-header">
          <div class="admin-block-info">
            <div class="admin-block-label">网站名称粗细（100-900）</div>
            <div class="admin-block-preview-text">${escapeHtml(cs.siteNameWeight||'900')}</div>
          </div>
        </div>
        <div class="admin-block-editor">
          <input type="range" min="100" max="900" step="100" value="${escapeHtml(cs.siteNameWeight||'900')}" id="styleNameWeight" style="width:100%;" oninput="document.getElementById('weightLabel').textContent=this.value">
          <span id="weightLabel" style="font-weight:700;color:var(--primary);font-size:16px;">${escapeHtml(cs.siteNameWeight||'900')}</span>
        </div>
      </div>
      <div class="admin-block expanded">
        <div class="admin-block-header">
          <div class="admin-block-info">
            <div class="admin-block-label">网站名称字体</div>
            <div class="admin-block-preview-text">${escapeHtml(cs.siteNameFont||'Noto Serif SC')}</div>
          </div>
        </div>
        <div class="admin-block-editor">
          <select class="admin-block-select" id="styleNameFont">
            ${ADMIN_FONTS.map(f => `<option value="${escapeHtml(f.value)}" ${(cs.siteNameFont||'').includes(f.value.split(',')[0].replace(/['"]/g,'').trim())?'selected':''}>${escapeHtml(f.label)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="admin-block expanded">
        <div class="admin-block-header">
          <div class="admin-block-info">
            <div class="admin-block-label">正文字体大小</div>
            <div class="admin-block-preview-text">${escapeHtml(cs.bodyFontSize||'16px')}</div>
          </div>
        </div>
        <div class="admin-block-editor">
          <input type="text" class="admin-block-input" id="styleFontSize" value="${escapeHtml(cs.bodyFontSize||'16px')}">
        </div>
      </div>
    </div>
    <div class="admin-save-bar">
      <button class="btn btn-primary" onclick="saveAdminStyles()">💾 保存样式设置</button>
    </div>
  `;
}

async function saveAdminServers() {
  try {
    const updates = {
      serverAddresses: {
        java: [0,1,2].map(i => ({ name: $(`#javaName${i}`).value, address: $(`#javaAddr${i}`).value })),
        bedrock: [0,1,2].map(i => ({ name: $(`#bedrockName${i}`).value, address: $(`#bedrockAddr${i}`).value }))
      }
    };
    App.settings = await API.updateSettings(updates);
    toast('保存成功', 'success');
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function saveAdminStyles() {
  try {
    const updates = {
      customStyles: {
        primaryColor: $('#stylePrimaryText').value,
        siteNameColor: $('#styleNameColorText').value,
        siteNameWeight: $('#styleNameWeight').value,
        siteNameFont: $('#styleNameFont').value,
        bodyFontSize: $('#styleFontSize').value
      }
    };
    App.settings = await API.updateSettings(updates);
    applyCustomStyles(App.settings.customStyles);
    if (App.settings.customStyles.siteNameFont) {
      let st = document.getElementById('cs-name-font');
      if (!st) { st = document.createElement('style'); st.id = 'cs-name-font'; document.head.appendChild(st); }
      st.textContent = `.home-title{font-family:${App.settings.customStyles.siteNameFont}!important;}`;
    }
    toast('保存成功', 'success');
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function saveBlockStyles(blockStyles) {
  try {
    App.settings = await API.updateSettings({ blockStyles });
    applyBlockStyles(App.settings.blockStyles);
  } catch (e) {
    toast(e.message, 'error');
  }
}

// 背景预设
const BG_PRESETS = [
  { id: 'chaotic', name: '杂乱彩色（默认）', blobs: [
    { color: '#ff006e', size: 500 }, { color: '#8338ec', size: 600 },
    { color: '#3a86ff', size: 400 }, { color: '#ffbe0b', size: 350 },
    { color: '#06ffa5', size: 450 }, { color: '#fb5607', size: 300 },
    { color: '#9d4edd', size: 380 }, { color: '#00f5d4', size: 420 },
  ]},
  { id: 'ocean', name: '深海蓝绿', blobs: [
    { color: '#0077b6', size: 500 }, { color: '#00b4d8', size: 600 },
    { color: '#90e0ef', size: 400 }, { color: '#48cae4', size: 350 },
    { color: '#023e8a', size: 450 }, { color: '#0096c7', size: 300 },
    { color: '#caf0f8', size: 380 }, { color: '#03045e', size: 420 },
  ]},
  { id: 'sunset', name: '日落橙红', blobs: [
    { color: '#ff6b6b', size: 500 }, { color: '#ee5a52', size: 600 },
    { color: '#f0932b', size: 400 }, { color: '#ffbe76', size: 350 },
    { color: '#ff7979', size: 450 }, { color: '#fab1a0', size: 300 },
    { color: '#e17055', size: 380 }, { color: '#fdcb6e', size: 420 },
  ]},
  { id: 'forest', name: '森林绿意', blobs: [
    { color: '#2d6a4f', size: 500 }, { color: '#52b788', size: 600 },
    { color: '#74c69d', size: 400 }, { color: '#95d5b2', size: 350 },
    { color: '#b7e4c7', size: 450 }, { color: '#40916c', size: 300 },
    { color: '#1b4332', size: 380 }, { color: '#d8f3dc', size: 420 },
  ]},
  { id: 'purple', name: '梦幻紫粉', blobs: [
    { color: '#7209b7', size: 500 }, { color: '#b5179e', size: 600 },
    { color: '#f72585', size: 400 }, { color: '#560bad', size: 350 },
    { color: '#480ca8', size: 450 }, { color: '#3a0ca3', size: 300 },
    { color: '#4361ee', size: 380 }, { color: '#4cc9f0', size: 420 },
  ]},
  { id: 'dark', name: '纯净深色', blobs: [
    { color: '#1a1a2e', size: 500 }, { color: '#16213e', size: 600 },
    { color: '#0f3460', size: 400 }, { color: '#2c5364', size: 350 },
    { color: '#1a1a40', size: 450 }, { color: '#24243e', size: 300 },
    { color: '#0f0c29', size: 380 }, { color: '#302b63', size: 420 },
  ]},
];

function renderAdminBackground(container, s) {
  const bgSettings = s.backgroundSettings || { preset: 'chaotic', opacity: 0.5, blur: 80 };
  container.innerHTML = `
    <div class="admin-block-list">
      <div class="admin-block expanded">
        <div class="admin-block-header">
          <div class="admin-block-info">
            <div class="admin-block-label">背景预设</div>
            <div class="admin-block-preview-text">${escapeHtml(BG_PRESETS.find(p=>p.id===bgSettings.preset)?.name||'杂乱彩色')}</div>
          </div>
        </div>
        <div class="admin-block-editor">
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px;margin-top:14px;">
            ${BG_PRESETS.map(p => `
              <div style="cursor:pointer;padding:12px;border:2px solid ${bgSettings.preset===p.id?'var(--primary)':'var(--border-color)'};border-radius:12px;text-align:center;transition:all 0.2s;" onclick="selectBgPreset('${p.id}')">
                <div style="height:40px;border-radius:8px;margin-bottom:8px;overflow:hidden;position:relative;background:#0a0a1a;">
                  ${p.blobs.slice(0,4).map((b,i) => `<div style="position:absolute;width:30px;height:30px;border-radius:50%;background:${b.color};filter:blur(8px);opacity:0.7;top:${20+i*5}%;left:${10+i*20}%;"></div>`).join('')}
                </div>
                <div style="font-size:12px;font-weight:600;color:var(--text-primary);">${escapeHtml(p.name)}</div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
      <div class="admin-block expanded">
        <div class="admin-block-header">
          <div class="admin-block-info">
            <div class="admin-block-label">透明度</div>
            <div class="admin-block-preview-text">${bgSettings.opacity||0.5}</div>
          </div>
        </div>
        <div class="admin-block-editor">
          <input type="range" min="0.1" max="1" step="0.1" value="${bgSettings.opacity||0.5}" id="bgOpacity" style="width:100%;" oninput="document.getElementById('bgOpacityLabel').textContent=this.value">
          <span id="bgOpacityLabel" style="font-weight:700;color:var(--primary);">${bgSettings.opacity||0.5}</span>
        </div>
      </div>
      <div class="admin-block expanded">
        <div class="admin-block-header">
          <div class="admin-block-info">
            <div class="admin-block-label">模糊度（px）</div>
            <div class="admin-block-preview-text">${bgSettings.blur||80}px</div>
          </div>
        </div>
        <div class="admin-block-editor">
          <input type="range" min="20" max="150" step="10" value="${bgSettings.blur||80}" id="bgBlur" style="width:100%;" oninput="document.getElementById('bgBlurLabel').textContent=this.value+'px'">
          <span id="bgBlurLabel" style="font-weight:700;color:var(--primary);">${bgSettings.blur||80}px</span>
        </div>
      </div>
    </div>
    <div class="admin-save-bar">
      <button class="btn btn-primary" onclick="saveAdminBackground()">💾 保存背景设置</button>
      <button class="btn btn-secondary" onclick="applyBackgroundPreview()">👁️ 实时预览</button>
    </div>
  `;
}

function selectBgPreset(presetId) {
  // 更新选中状态
  $$('.admin-block-editor [onclick^="selectBgPreset"]').forEach(el => {
    const id = el.getAttribute('onclick').match(/'([^']+)'/)[1];
    el.style.borderColor = id === presetId ? 'var(--primary)' : 'var(--border-color)';
  });
  // 临时存储
  AdminState._bgPreset = presetId;
}

function applyBackgroundPreview() {
  const preset = AdminState._bgPreset || (App.settings.backgroundSettings||{}).preset || 'chaotic';
  const opacity = $('#bgOpacity') ? $('#bgOpacity').value : 0.5;
  const blur = $('#bgBlur') ? $('#bgBlur').value : 80;
  applyBackgroundToDOM(preset, parseFloat(opacity), parseInt(blur));
  toast('已预览背景效果', 'success');
}

async function saveAdminBackground() {
  try {
    const preset = AdminState._bgPreset || (App.settings.backgroundSettings||{}).preset || 'chaotic';
    const opacity = $('#bgOpacity') ? parseFloat($('#bgOpacity').value) : 0.5;
    const blur = $('#bgBlur') ? parseInt($('#bgBlur').value) : 80;
    const updates = { backgroundSettings: { preset, opacity, blur } };
    App.settings = await API.updateSettings(updates);
    applyBackgroundToDOM(preset, opacity, blur);
    toast('保存成功', 'success');
  } catch(e) { toast(e.message, 'error'); }
}

function applyBackgroundToDOM(preset, opacity, blur) {
  const presetData = BG_PRESETS.find(p => p.id === preset) || BG_PRESETS[0];
  const bgEl = document.querySelector('.animated-bg');
  if (!bgEl) return;
  // 清空并重建 blob
  bgEl.innerHTML = '';
  presetData.blobs.forEach((b, i) => {
    const blob = document.createElement('div');
    blob.className = 'blob';
    blob.style.cssText = `width:${b.size}px;height:${b.size}px;background:radial-gradient(circle, ${b.color}, transparent 70%);opacity:${opacity};filter:blur(${blur}px);`;
    // 随机位置
    const positions = [
      { top: '-10%', left: '-5%' }, { top: '30%', right: '-10%' },
      { bottom: '-10%', left: '20%' }, { top: '50%', left: '50%' },
      { top: '10%', right: '30%' }, { bottom: '20%', right: '10%' },
      { top: '60%', left: '-5%' }, { top: '-5%', right: '45%' },
    ];
    Object.assign(blob.style, positions[i] || positions[0]);
    blob.style.animation = `blobMove${(i%8)+1} ${16+i*2}s ease-in-out infinite`;
    bgEl.appendChild(blob);
  });
}

async function loadAdminUsers() {
  try {
    const data = await API.getUsers();
    const users = data.users || [];
    $('#userListArea').innerHTML = `
      <table class="admin-user-table">
        <thead><tr><th>昵称</th><th>游戏名</th><th>QQ</th><th>邮箱</th><th>管理员</th><th>注册时间</th></tr></thead>
        <tbody>
          ${users.map(u => `<tr>
            <td>${escapeHtml(u.username)}</td>
            <td>${escapeHtml(u.gameName||'-')}</td>
            <td>${escapeHtml(u.qq||'-')}</td>
            <td>${escapeHtml(u.email||'-')}</td>
            <td>${u.isAdmin?'✓':'-'}</td>
            <td>${u.createdAt?new Date(u.createdAt).toLocaleDateString('zh-CN'):'-'}</td>
          </tr>`).join('')}
        </tbody>
      </table>
      <p style="margin-top:12px;color:var(--text-muted);font-size:13px;">共 ${users.length} 位用户</p>
    `;
  } catch (e) {
    $('#userListArea').innerHTML = `<p style="color:var(--danger);">${escapeHtml(e.message)}</p>`;
  }
}

// ===== 初始化 =====
async function init() {
  applyTheme();

  // 事件监听
  $('#hamburger').addEventListener('click', toggleSidebar);
  $('#sidebarOverlay').addEventListener('click', closeSidebar);

  // 加载设置和认证
  await loadSettings();
  await checkAuth();

  // 路由
  window.addEventListener('hashchange', handleRoute);
  handleRoute();
}

// 启动
init();
