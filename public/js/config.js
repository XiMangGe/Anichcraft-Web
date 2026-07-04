/**
 * 暗影澄昏网站 - 配置文件
 * 修改此文件可调整服务器地址、地图地址等配置
 * 注意：后端 /api/settings 会覆盖这些默认值（管理员可在后台修改）
 */
const CONFIG = {
  // QQ 群号
  qqGroup: '953215907',

  // QQ 群图片路径（替换为你自己的图片）
  qqGroupImage: 'assets/QQ.png',

  // BlueMap 地图地址
  mapUrl: 'http://hk1.mefrp.hoshino2.top:58972/',

  // 服务器状态查询 - 试试部分（3个Java + 3个基岩版）
  // 修改为你自己的服务器地址
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

  // API 基础路径（留空表示同源）
  apiBase: '',

  // 聊天轮询间隔（毫秒）
  chatPollInterval: 5000,

  // B站主页
  bilibiliUrl: 'https://space.bilibili.com/',

  // 文档主页
  docsUrl: 'https://docs.qq.com/aio/DS0ZDaWFWSkR6cXZj'
};
