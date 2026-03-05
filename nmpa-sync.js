/**
 * MedAgent 药监局数据定期同步脚本
 * 
 * 功能：
 * 1. 通过 Bocha 搜索 API 定向查询药监局官网，获取医美产品最新注册证信息
 * 2. 将查询结果更新到本地缓存文件（nmpa-cache.json）
 * 3. 记录同步日志，供管理员查看
 * 
 * 运行方式：
 * - 手动：node nmpa-sync.js
 * - 定时：通过 api-server.js 中的 cron 任务每月1日凌晨2点自动执行
 * 
 * 数据来源：国家药监局官网 nmpa.gov.cn（通过 Bocha 搜索引擎代理）
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// ============================================================
// 配置
// ============================================================
const BOCHA_API_KEY = process.env.BOCHA_API_KEY || 'sk-51d7d709eb6d4150b76dc131663330d3';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const CACHE_FILE = path.join(DATA_DIR, 'nmpa-cache.json');
const LOG_FILE = path.join(DATA_DIR, 'nmpa-sync.log');

// 每次查询之间的延迟（毫秒），避免 API 限流
const QUERY_DELAY_MS = 2000;

// ============================================================
// 需要同步的医美产品列表
// 格式：{ id, name, brand, searchKeyword, category }
// ============================================================
const PRODUCTS_TO_SYNC = [
  // 玻尿酸
  { id: 'juvederm', name: '乔雅登', brand: '艾尔建', searchKeyword: '乔雅登 玻尿酸 注册证', category: '玻尿酸' },
  { id: 'restylane', name: '瑞蓝', brand: '高德美', searchKeyword: '瑞蓝 玻尿酸 注册证', category: '玻尿酸' },
  { id: 'runbailian', name: '润百颜', brand: '华熙生物', searchKeyword: '润百颜 玻尿酸 注册证', category: '玻尿酸' },
  { id: 'haiwei', name: '海薇', brand: '昊海生科', searchKeyword: '海薇 玻尿酸 注册证', category: '玻尿酸' },
  { id: 'bonita', name: '宝尼达', brand: '爱美客', searchKeyword: '宝尼达 玻尿酸 注册证', category: '玻尿酸' },
  { id: 'yiwan', name: '伊婉', brand: '常州药业', searchKeyword: '伊婉 玻尿酸 注册证', category: '玻尿酸' },
  { id: 'aimeike', name: '爱芙莱', brand: '爱美客', searchKeyword: '爱芙莱 玻尿酸 注册证', category: '玻尿酸' },

  // 肉毒素
  { id: 'botox', name: '保妥适', brand: '艾尔建', searchKeyword: '保妥适 肉毒素 注册证 适应症', category: '肉毒素' },
  { id: 'dysport', name: '吉适', brand: '益普生', searchKeyword: '吉适 肉毒素 注册证 适应症', category: '肉毒素' },
  { id: 'hengli', name: '衡力', brand: '兰州生物', searchKeyword: '衡力 肉毒素 注册证 适应症', category: '肉毒素' },
  { id: 'letibow', name: '乐提葆', brand: '益普生', searchKeyword: '乐提葆 肉毒素 注册证', category: '肉毒素' },

  // 胶原蛋白/再生类
  { id: 'sculptra', name: '童颜针', brand: '高德美', searchKeyword: '童颜针 Sculptra PLLA 注册证', category: '胶原刺激剂' },
  { id: 'ellanse', name: '少女针', brand: '辛迪思', searchKeyword: '少女针 Ellansé PCL 注册证', category: '胶原刺激剂' },
  { id: 'weiyi', name: '薇旖', brand: '锦波生物', searchKeyword: '薇旖 重组胶原蛋白 注册证', category: '胶原蛋白' },
  { id: 'juzibio', name: '巨子生物', brand: '巨子生物', searchKeyword: '巨子生物 胶原蛋白 注册证', category: '胶原蛋白' },

  // 光电设备
  { id: 'thermage', name: '热玛吉', brand: '索塔医疗', searchKeyword: '热玛吉 射频 医疗器械注册证', category: '光电设备' },
  { id: 'ulthera', name: '超声炮', brand: '美敦力', searchKeyword: '超声炮 HIFU 医疗器械注册证', category: '光电设备' },
  { id: 'picosure', name: '皮秒激光', brand: '赛诺秀', searchKeyword: '皮秒激光 医疗器械注册证', category: '光电设备' },
];

// ============================================================
// 工具函数
// ============================================================

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try {
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch (e) {}
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
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
}

// ============================================================
// Bocha 搜索（复用 api-server.js 中的逻辑）
// ============================================================
function bochaSearch(query, count = 5) {
  return new Promise((resolve) => {
    const body = JSON.stringify({
      query,
      count,
      freshness: 'noLimit',
      summary: true,
      answer: false
    });
    const options = {
      hostname: 'api.bochaai.com',
      path: '/v1/web-search',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${BOCHA_API_KEY}`,
        'Content-Length': Buffer.byteLength(body)
      }
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const results = json.data?.webPages?.value || [];
          resolve({ success: true, results: results.slice(0, count) });
        } catch (e) {
          resolve({ success: false, results: [], error: e.message });
        }
      });
    });
    req.on('error', (e) => resolve({ success: false, results: [], error: e.message }));
    req.write(body);
    req.end();
  });
}

// ============================================================
// 从搜索结果中提取注册证信息
// ============================================================
function extractRegistrationInfo(results, productName) {
  const info = {
    registrationNo: null,
    approvalDate: null,
    expiryDate: null,
    status: 'unknown',
    indications: [],
    source: null,
    snippet: null,
    lastChecked: new Date().toISOString()
  };

  for (const r of results) {
    const text = (r.name || '') + ' ' + (r.snippet || '') + ' ' + (r.summary || '');

    // 提取注册证号（国产：国械注准/国械注进，进口：国械注进）
    const regNoMatch = text.match(/国械注[准进]\s*\d{4}\s*\d{7}/g) ||
                       text.match(/[（(]国械注[准进]\d{4}\d{7}[）)]/g) ||
                       text.match(/注册证号[：:]\s*([^\s，,。]+)/);
    if (regNoMatch && !info.registrationNo) {
      info.registrationNo = regNoMatch[0].replace(/[（()）\s]/g, '');
    }

    // 判断注册状态（有效/注销/过期）
    if (text.includes('注销') || text.includes('撤销')) {
      info.status = 'revoked';
    } else if (text.includes('有效期') || text.includes('注册证')) {
      info.status = 'valid';
    }

    // 提取适应症关键词
    const indicationKeywords = ['除皱', '填充', '美容', '皮肤', '面部', '注射', '适应症'];
    for (const kw of indicationKeywords) {
      if (text.includes(kw) && !info.indications.includes(kw)) {
        info.indications.push(kw);
      }
    }

    // 记录来源
    if (!info.source && r.url && r.url.includes('nmpa.gov.cn')) {
      info.source = r.url;
      info.snippet = (r.snippet || r.summary || '').substring(0, 300);
    }
  }

  // 如果有来自药监局的结果，标记为已验证
  const hasNmpaSource = results.some(r => r.url && r.url.includes('nmpa.gov.cn'));
  if (hasNmpaSource && info.status === 'unknown') {
    info.status = 'valid';
  }

  return info;
}

// ============================================================
// 同步单个产品
// ============================================================
async function syncProduct(product) {
  log(`🔍 查询: ${product.name} (${product.brand})`);

  try {
    // 第一次搜索：定向药监局
    const nmpaQuery = `site:nmpa.gov.cn ${product.searchKeyword}`;
    const nmpaResult = await bochaSearch(nmpaQuery, 5);

    // 第二次搜索：更广泛的注册证信息
    const broadQuery = `${product.searchKeyword} 国家药监局 注册证号`;
    const broadResult = await bochaSearch(broadQuery, 5);

    const allResults = [
      ...(nmpaResult.results || []),
      ...(broadResult.results || [])
    ];

    const info = extractRegistrationInfo(allResults, product.name);

    log(`  ✅ ${product.name}: 状态=${info.status}, 注册证=${info.registrationNo || '未提取到'}, 来源=${info.source ? '药监局' : '其他'}`);

    return {
      ...product,
      nmpaInfo: info
    };
  } catch (e) {
    log(`  ❌ ${product.name} 查询失败: ${e.message}`);
    return {
      ...product,
      nmpaInfo: {
        status: 'error',
        error: e.message,
        lastChecked: new Date().toISOString()
      }
    };
  }
}

// ============================================================
// 主同步函数
// ============================================================
async function runSync(options = {}) {
  const { forceAll = false, productIds = null } = options;

  log('🚀 开始药监局数据同步...');
  const startTime = Date.now();

  // 加载现有缓存
  const cache = loadCache();
  const results = { success: 0, failed: 0, skipped: 0, updated: [] };

  // 确定需要同步的产品
  let productsToProcess = PRODUCTS_TO_SYNC;
  if (productIds && productIds.length > 0) {
    productsToProcess = PRODUCTS_TO_SYNC.filter(p => productIds.includes(p.id));
  }

  log(`📋 共 ${productsToProcess.length} 个产品需要同步`);

  for (let i = 0; i < productsToProcess.length; i++) {
    const product = productsToProcess[i];

    // 检查是否需要跳过（7天内已同步过，非强制模式）
    const cached = cache.products[product.id];
    if (!forceAll && cached?.nmpaInfo?.lastChecked) {
      const lastCheck = new Date(cached.nmpaInfo.lastChecked);
      const daysSince = (Date.now() - lastCheck) / (1000 * 60 * 60 * 24);
      if (daysSince < 7) {
        log(`  ⏭️  ${product.name} 跳过（${Math.floor(daysSince)}天前已同步）`);
        results.skipped++;
        continue;
      }
    }

    // 执行同步
    const synced = await syncProduct(product);

    if (synced.nmpaInfo.status !== 'error') {
      results.success++;
      results.updated.push(product.name);
    } else {
      results.failed++;
    }

    // 更新缓存
    cache.products[product.id] = synced;

    // 每3个产品保存一次（防止中途失败丢失数据）
    if ((i + 1) % 3 === 0) {
      cache.lastSync = new Date().toISOString();
      saveCache(cache);
      log(`  💾 已保存进度 (${i + 1}/${productsToProcess.length})`);
    }

    // 延迟，避免 API 限流
    if (i < productsToProcess.length - 1) {
      await sleep(QUERY_DELAY_MS);
    }
  }

  // 最终保存
  cache.lastSync = new Date().toISOString();
  cache.lastSyncStats = results;
  saveCache(cache);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  log(`✅ 同步完成！成功: ${results.success}, 失败: ${results.failed}, 跳过: ${results.skipped}, 耗时: ${elapsed}s`);

  return {
    success: true,
    stats: results,
    elapsed,
    lastSync: cache.lastSync
  };
}

// ============================================================
// 获取缓存摘要（供 API 接口调用）
// ============================================================
function getCacheSummary() {
  const cache = loadCache();
  const products = Object.values(cache.products || {});
  return {
    lastSync: cache.lastSync,
    lastSyncStats: cache.lastSyncStats,
    totalProducts: products.length,
    validCount: products.filter(p => p.nmpaInfo?.status === 'valid').length,
    revokedCount: products.filter(p => p.nmpaInfo?.status === 'revoked').length,
    unknownCount: products.filter(p => p.nmpaInfo?.status === 'unknown').length,
    products: products.map(p => ({
      id: p.id,
      name: p.name,
      brand: p.brand,
      category: p.category,
      status: p.nmpaInfo?.status || 'unknown',
      registrationNo: p.nmpaInfo?.registrationNo || null,
      source: p.nmpaInfo?.source || null,
      snippet: p.nmpaInfo?.snippet || null,
      lastChecked: p.nmpaInfo?.lastChecked || null
    }))
  };
}

// ============================================================
// 查询单个产品的缓存信息（供聊天接口调用）
// ============================================================
function queryProductCache(productName) {
  const cache = loadCache();
  const products = Object.values(cache.products || {});

  // 模糊匹配
  const matched = products.filter(p =>
    p.name.includes(productName) ||
    productName.includes(p.name) ||
    (p.brand && productName.includes(p.brand))
  );

  if (matched.length === 0) return null;

  return matched.map(p => ({
    name: p.name,
    brand: p.brand,
    category: p.category,
    status: p.nmpaInfo?.status,
    registrationNo: p.nmpaInfo?.registrationNo,
    indications: p.nmpaInfo?.indications || [],
    source: p.nmpaInfo?.source,
    snippet: p.nmpaInfo?.snippet,
    lastChecked: p.nmpaInfo?.lastChecked
  }));
}

// ============================================================
// 导出
// ============================================================
module.exports = {
  runSync,
  getCacheSummary,
  queryProductCache,
  PRODUCTS_TO_SYNC
};

// ============================================================
// 直接运行（node nmpa-sync.js）
// ============================================================
if (require.main === module) {
  const args = process.argv.slice(2);
  const forceAll = args.includes('--force');
  const productIds = args.filter(a => !a.startsWith('--'));

  runSync({ forceAll, productIds: productIds.length > 0 ? productIds : null })
    .then(result => {
      console.log('\n📊 同步结果:', JSON.stringify(result, null, 2));
      process.exit(0);
    })
    .catch(e => {
      console.error('同步失败:', e);
      process.exit(1);
    });
}
