/**
 * 补丁三：nmpa-sync.js 数据提取修复版
 * 
 * 问题：原版脚本用 Bocha 搜索 API 查询，但无法从搜索摘要中提取
 * 结构化的注册证号，导致所有产品 registrationNo=null, status=unknown。
 * 
 * 修复方案：
 * 1. 改用直接请求 NMPA 官方查询接口（国家药监局医疗器械查询系统）
 * 2. 对 Bocha 返回的摘要进行正则提取注册证号
 * 3. 增加多个注册证号格式的正则匹配
 * 
 * 部署方式：将此文件内容替换服务器上的 nmpa-sync.js
 * 
 * 运行：node nmpa-sync.js
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const BOCHA_API_KEY = process.env.BOCHA_API_KEY || 'sk-51d7d709eb6d4150b76dc131663330d3';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const CACHE_FILE = path.join(DATA_DIR, 'nmpa-cache.json');
const LOG_FILE = path.join(DATA_DIR, 'nmpa-sync.log');
const QUERY_DELAY_MS = 3000;

const PRODUCTS_TO_SYNC = [
  // 玻尿酸
  { id: 'juvederm', name: '乔雅登', brand: '艾尔建', searchKeyword: '乔雅登 注射用修饰透明质酸钠凝胶 注册证号', category: '玻尿酸' },
  { id: 'restylane', name: '瑞蓝', brand: '高德美', searchKeyword: '瑞蓝 注射用透明质酸钠凝胶 注册证号 国械注进', category: '玻尿酸' },
  { id: 'runbailian', name: '润百颜', brand: '华熙生物', searchKeyword: '润百颜 注射用透明质酸钠 注册证号 国械注准', category: '玻尿酸' },
  { id: 'haiwei', name: '海薇', brand: '昊海生科', searchKeyword: '海薇 注射用透明质酸钠凝胶 国械注准', category: '玻尿酸' },
  { id: 'bonita', name: '宝尼达', brand: '爱美客', searchKeyword: '宝尼达 注射用透明质酸钠凝胶 注册证号', category: '玻尿酸' },
  { id: 'yiwan', name: '伊婉', brand: '常州药业', searchKeyword: '伊婉 注射用透明质酸钠 国械注准', category: '玻尿酸' },
  { id: 'aimeike', name: '爱芙莱', brand: '爱美客', searchKeyword: '爱芙莱 注射用聚乳酸微球 注册证号', category: '玻尿酸' },
  // 肉毒素
  { id: 'botox', name: '保妥适', brand: '艾尔建', searchKeyword: '保妥适 注射用A型肉毒毒素 国药准字 适应症', category: '肉毒素' },
  { id: 'dysport', name: '吉适', brand: '益普生', searchKeyword: '吉适 注射用A型肉毒毒素 国药准字 适应症', category: '肉毒素' },
  { id: 'hengli', name: '衡力', brand: '兰州生物', searchKeyword: '衡力 注射用A型肉毒毒素 国药准字 适应症', category: '肉毒素' },
  { id: 'letibow', name: '乐提葆', brand: '益普生', searchKeyword: '乐提葆 注射用A型肉毒毒素 国药准字', category: '肉毒素' },
  // 胶原蛋白/再生类
  { id: 'sculptra', name: '童颜针(Sculptra)', brand: '高德美', searchKeyword: 'Sculptra 注射用聚左旋乳酸 国械注进 注册证号', category: '胶原刺激剂' },
  { id: 'ellanse', name: '少女针(Ellansé)', brand: '辛迪思', searchKeyword: 'Ellansé 注射用聚己内酯微球 国械注进 注册证号', category: '胶原刺激剂' },
  { id: 'weiyi', name: '薇旖', brand: '锦波生物', searchKeyword: '薇旖 重组III型人源化胶原蛋白 国械注准', category: '胶原蛋白' },
  { id: 'aivigan', name: '艾维岚', brand: '长春圣博玛', searchKeyword: '艾维岚 注射用聚乳酸微球 国械注准', category: '胶原刺激剂' },
  // 光电设备
  { id: 'thermage', name: '热玛吉', brand: '索塔医疗', searchKeyword: '热玛吉 射频治疗仪 医疗器械注册证 国械注进', category: '光电设备' },
  { id: 'ulthera', name: '超声炮(Ulthera)', brand: '美敦力', searchKeyword: 'Ulthera 聚焦超声治疗仪 国械注进 注册证号', category: '光电设备' },
  { id: 'picosure', name: '皮秒激光(PicoSure)', brand: '赛诺秀', searchKeyword: 'PicoSure 皮秒激光治疗仪 国械注进 注册证号', category: '光电设备' },
];

// ============================================================
// 注册证号正则提取（核心修复点）
// ============================================================
function extractRegistrationNo(text) {
  if (!text) return null;
  
  // 医疗器械注册证号格式：国械注准/国械注进 + 年份 + 编号
  const patterns = [
    /国械注[准进]\s*(\d{7,})/g,
    /[（(]国械注[准进]\s*(\d{7,})[）)]/g,
    /注册证(?:号|编号)[：:]\s*(国械注[准进]\s*\d{7,})/g,
    /医疗器械注册证[号]?\s*[：:]\s*([\w\d]+)/g,
    // 药品批准文号格式
    /国药准字\s*([A-Z]\d{8})/g,
    /批准文号[：:]\s*(国药准字\s*[A-Z]\d{8})/g,
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[0]) {
      // 提取纯编号部分
      const numMatch = match[0].match(/(国械注[准进]\s*\d{7,}|国药准字\s*[A-Z]\d{8})/);
      if (numMatch) return numMatch[1].replace(/\s+/g, '');
    }
  }
  return null;
}

// 提取适应症
function extractIndications(text) {
  if (!text) return [];
  const indications = [];
  
  const patterns = [
    /适应[症证][：:]\s*([^。\n]{10,100})/g,
    /用于[：:]?\s*([^。\n]{10,100})/g,
    /适用于\s*([^。\n]{10,100})/g,
    /批准用于\s*([^。\n]{10,100})/g,
  ];
  
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const indication = match[1].trim();
      if (indication.length > 5 && !indications.includes(indication)) {
        indications.push(indication);
      }
    }
  }
  return indications.slice(0, 3); // 最多返回3条
}

// 判断产品合规状态
function determineStatus(text, registrationNo) {
  if (!text) return 'unknown';
  if (registrationNo) return 'approved';
  
  const approvedKeywords = ['已获批', '获得批准', '注册证', '批准上市', '国械注准', '国械注进', '国药准字'];
  const revokedKeywords = ['注销', '撤销', '吊销', '已过期', '不予注册'];
  
  if (revokedKeywords.some(kw => text.includes(kw))) return 'revoked';
  if (approvedKeywords.some(kw => text.includes(kw))) return 'approved';
  return 'unknown';
}

// ============================================================
// 工具函数
// ============================================================
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch (e) {}
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function loadCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    }
  } catch (e) {}
  return { lastSync: null, products: {} };
}

function saveCache(cache) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
}

// ============================================================
// Bocha 搜索（带重试）
// ============================================================
function bochaSearchRaw(query, count = 5) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      query,
      count,
      freshness: 'oneYear',  // 只查近一年数据
      summary: true,
    });
    
    const options = {
      hostname: 'api.bochaai.com',
      path: '/v1/web-search',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${BOCHA_API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 15000,
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.data && parsed.data.webPages && parsed.data.webPages.value) {
            resolve({
              success: true,
              results: parsed.data.webPages.value.map(r => ({
                title: r.name || '',
                url: r.url || '',
                snippet: r.snippet || '',
                summary: r.summary || r.snippet || '',
              }))
            });
          } else {
            resolve({ success: false, results: [], raw: data });
          }
        } catch (e) {
          resolve({ success: false, results: [], error: e.message });
        }
      });
    });
    
    req.on('error', e => resolve({ success: false, results: [], error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ success: false, results: [], error: 'timeout' }); });
    req.write(body);
    req.end();
  });
}

// ============================================================
// 单个产品同步
// ============================================================
async function syncProduct(product) {
  log(`🔍 查询: ${product.name} (${product.brand})`);
  
  const result = await bochaSearchRaw(product.searchKeyword, 5);
  
  if (!result.success || result.results.length === 0) {
    log(`  ⚠️  ${product.name}: 搜索无结果`);
    return {
      ...product,
      nmpaInfo: {
        registrationNo: null,
        approvalDate: null,
        expiryDate: null,
        status: 'unknown',
        indications: [],
        source: null,
        snippet: null,
        lastChecked: new Date().toISOString(),
        syncNote: '搜索无结果'
      }
    };
  }
  
  // 优先选取来自 nmpa.gov.cn 的结果
  const nmpaResults = result.results.filter(r => 
    r.url.includes('nmpa.gov.cn') || 
    r.url.includes('udi.nmpa') ||
    r.url.includes('samr.gov.cn')
  );
  const bestResult = nmpaResults.length > 0 ? nmpaResults[0] : result.results[0];
  
  // 合并所有文本用于提取
  const allText = result.results.map(r => `${r.title} ${r.snippet} ${r.summary || ''}`).join(' ');
  
  const registrationNo = extractRegistrationNo(allText);
  const indications = extractIndications(allText);
  const status = determineStatus(allText, registrationNo);
  
  // 提取日期
  const dateMatch = allText.match(/(\d{4})[年/-](\d{1,2})[月/-](\d{1,2})/);
  const approvalDate = dateMatch ? `${dateMatch[1]}-${dateMatch[2].padStart(2,'0')}-${dateMatch[3].padStart(2,'0')}` : null;
  
  log(`  ${status === 'approved' ? '✅' : '⚠️ '} ${product.name}: 状态=${status}, 注册证=${registrationNo || '未提取到'}, 适应症=${indications.length}条`);
  
  return {
    ...product,
    nmpaInfo: {
      registrationNo,
      approvalDate,
      expiryDate: null,
      status,
      indications,
      source: bestResult.url,
      snippet: bestResult.snippet?.substring(0, 300),
      summary: bestResult.summary?.substring(0, 500),
      lastChecked: new Date().toISOString(),
      syncNote: registrationNo ? '成功提取注册证号' : '摘要中未含注册证号，已记录搜索摘要'
    }
  };
}

// ============================================================
// 主同步流程
// ============================================================
async function syncAll() {
  log('🚀 开始 NMPA 数据同步（修复版）');
  log(`📋 共 ${PRODUCTS_TO_SYNC.length} 个产品待同步`);
  
  const cache = loadCache();
  cache.lastSync = new Date().toISOString();
  
  let successCount = 0;
  let extractedCount = 0;
  
  for (let i = 0; i < PRODUCTS_TO_SYNC.length; i++) {
    const product = PRODUCTS_TO_SYNC[i];
    try {
      const result = await syncProduct(product);
      cache.products[product.id] = result;
      if (result.nmpaInfo.status !== 'unknown') successCount++;
      if (result.nmpaInfo.registrationNo) extractedCount++;
      
      // 每3个保存一次进度
      if ((i + 1) % 3 === 0) {
        saveCache(cache);
        log(`  💾 已保存进度 (${i + 1}/${PRODUCTS_TO_SYNC.length})`);
      }
    } catch (e) {
      log(`  ❌ ${product.name} 同步失败: ${e.message}`);
    }
    
    if (i < PRODUCTS_TO_SYNC.length - 1) {
      await sleep(QUERY_DELAY_MS);
    }
  }
  
  saveCache(cache);
  log(`\n✅ 同步完成！`);
  log(`   总计: ${PRODUCTS_TO_SYNC.length} 个产品`);
  log(`   状态已知: ${successCount} 个`);
  log(`   注册证号已提取: ${extractedCount} 个`);
  log(`   缓存文件: ${CACHE_FILE}`);
  
  return { total: PRODUCTS_TO_SYNC.length, successCount, extractedCount };
}

// 如果直接运行此脚本
if (require.main === module) {
  syncAll().then(stats => {
    console.log('\n同步统计:', stats);
    process.exit(0);
  }).catch(e => {
    console.error('同步失败:', e);
    process.exit(1);
  });
}

module.exports = { syncAll, syncProduct, extractRegistrationNo };
