/**
 * MedAgent 医美行业专属数据库
 * 包含：价格行情库、产品合规库、项目知识库
 * 数据来源：公开行业报告、药监局公告、平台数据整理
 * 最后更新：2025年3月
 */

// ============================================================
// 一、医美产品合规数据库（注册证、成分、适应症、禁忌）
// ============================================================
const COMPLIANCE_DB = {
  // 玻尿酸（透明质酸）类产品
  hyaluronic_acid: [
    {
      name: "乔雅登丰颜",
      brand: "乔雅登 Juvederm",
      manufacturer: "艾尔建美学（Allergan）",
      reg_no: "国械注进20223130141",
      type: "进口三类医疗器械",
      ingredient: "交联透明质酸钠凝胶",
      indications: "面部软组织填充，适用于鼻唇沟、面颊填充、下颌轮廓塑形",
      contraindications: "对透明质酸或利多卡因过敏者；妊娠或哺乳期妇女；18岁以下；有自身免疫性疾病者；注射部位有炎症或感染者",
      duration: "12-24个月",
      price_range: "3000-8000元/支",
      notes: "含利多卡因，注射时疼痛感较低"
    },
    {
      name: "乔雅登极致",
      brand: "乔雅登 Juvederm",
      manufacturer: "艾尔建美学（Allergan）",
      reg_no: "国械注进20203130295",
      type: "进口三类医疗器械",
      ingredient: "交联透明质酸钠凝胶（高密度）",
      indications: "深层面部填充，适用于颧骨、下颌、鼻部等骨性支撑区域",
      contraindications: "同乔雅登丰颜",
      duration: "18-24个月",
      price_range: "4000-10000元/支",
      notes: "高密度配方，适合深层注射"
    },
    {
      name: "瑞蓝2号",
      brand: "瑞蓝 Restylane",
      manufacturer: "高德美（Galderma）",
      reg_no: "国械注进20153461332",
      type: "进口三类医疗器械",
      ingredient: "非动物来源稳定透明质酸（NASHA）",
      indications: "中度至重度面部皱纹和皱褶的填充，如鼻唇沟",
      contraindications: "对透明质酸过敏者；有出血障碍者；妊娠或哺乳期；注射区域有炎症、感染或皮肤病",
      duration: "6-12个月",
      price_range: "1500-3000元/支",
      notes: "经典款，适合初次尝试填充的消费者"
    },
    {
      name: "瑞蓝唯缇",
      brand: "瑞蓝 Restylane",
      manufacturer: "高德美（Galderma）",
      reg_no: "国械注进20203130045",
      type: "进口三类医疗器械",
      ingredient: "修饰透明质酸钠凝胶",
      indications: "面部软组织填充，适用于嘴唇、口周纹",
      contraindications: "同瑞蓝2号",
      duration: "6-12个月",
      price_range: "2000-4000元/支",
      notes: "专为唇部设计，质地较软"
    },
    {
      name: "海薇",
      brand: "海薇",
      manufacturer: "上海其胜生物制剂有限公司",
      reg_no: "国械注准20153461330",
      type: "国产三类医疗器械",
      ingredient: "交联透明质酸钠凝胶",
      indications: "面部软组织填充，适用于鼻唇沟等中度皱纹",
      contraindications: "对透明质酸过敏者；注射部位感染者；妊娠期",
      duration: "6-12个月",
      price_range: "800-1500元/支",
      notes: "国产品牌，性价比较高"
    },
    {
      name: "爱芙莱",
      brand: "爱芙莱",
      manufacturer: "山东福瑞达医疗器械有限公司",
      reg_no: "国械注准20173461332",
      type: "国产三类医疗器械",
      ingredient: "交联透明质酸钠凝胶",
      indications: "面部软组织填充",
      contraindications: "同海薇",
      duration: "6-12个月",
      price_range: "600-1200元/支",
      notes: "国产品牌，入门级选择"
    },
    {
      name: "润百颜",
      brand: "润百颜",
      manufacturer: "华熙生物科技股份有限公司",
      reg_no: "国械注准20203461338",
      type: "国产三类医疗器械",
      ingredient: "交联透明质酸钠凝胶",
      indications: "面部软组织填充，适用于鼻唇沟、泪沟等",
      contraindications: "同海薇",
      duration: "9-12个月",
      price_range: "1000-2000元/支",
      notes: "华熙生物旗下，品质稳定"
    }
  ],

  // 肉毒素类产品
  botulinum_toxin: [
    {
      name: "保妥适",
      brand: "Botox",
      manufacturer: "艾尔建（Allergan）",
      reg_no: "S20040001",
      type: "进口药品",
      ingredient: "A型肉毒毒素（OnabotulinumtoxinA）",
      indications: "改善眉间纹（川字纹）；眼睑痉挛；颈部肌张力障碍；上肢痉挛",
      contraindications: "对A型肉毒毒素过敏者；注射部位感染者；神经肌肉疾病患者（如重症肌无力）；妊娠或哺乳期；18岁以下",
      duration: "4-6个月",
      price_range: "900-2400元/50单位",
      notes: "全球最广泛使用的肉毒素品牌，临床数据最丰富"
    },
    {
      name: "衡力",
      brand: "BTXA 衡力",
      manufacturer: "兰州生物制品研究所",
      reg_no: "国药准字S10970037",
      type: "国产药品",
      ingredient: "A型肉毒毒素",
      indications: "改善眉间纹；面肌痉挛；斜视；颈部肌张力障碍",
      contraindications: "同保妥适",
      duration: "3-6个月",
      price_range: "240-750元/100单位",
      notes: "国产品牌，价格最实惠，适合预算有限的消费者"
    },
    {
      name: "乐提葆",
      brand: "Letybo",
      manufacturer: "韩国Hugel公司",
      reg_no: "S20200017",
      type: "进口药品",
      ingredient: "A型肉毒毒素（LetibotulinumtoxinA）",
      indications: "改善18-65岁成人中重度眉间纹",
      contraindications: "同保妥适",
      duration: "4-5个月",
      price_range: "750-1000元/50单位",
      notes: "韩国进口，2020年获批，性价比较高"
    },
    {
      name: "吉适",
      brand: "Dysport",
      manufacturer: "英国Ipsen公司（高德美旗下）",
      reg_no: "S20200016",
      type: "进口药品",
      ingredient: "A型肉毒毒素（AbobotulinumtoxinA）",
      indications: "改善18-65岁成人因皱眉肌和/或降眉间肌活动引起的中重度皱眉纹",
      contraindications: "同保妥适；对牛奶蛋白过敏者禁用（含乳糖）",
      duration: "4-5个月",
      price_range: "1000-2000元/500单位",
      notes: "起效较快，24小时内可见效；含乳糖，牛奶过敏者禁用"
    }
  ],

  // 再生类/胶原蛋白刺激剂
  regenerative: [
    {
      name: "童颜针（普丽妍）",
      brand: "Sculptra 普丽妍",
      manufacturer: "高德美（Galderma）",
      reg_no: "国械注进20213130063",
      type: "进口三类医疗器械",
      ingredient: "聚左旋乳酸（PLLA）微球",
      indications: "面部脂肪萎缩的矫正；面部轮廓改善；抗衰老",
      contraindications: "对聚左旋乳酸过敏者；注射部位感染者；有瘢痕疙瘩倾向者；妊娠期",
      duration: "24-36个月",
      price_range: "5000-20000元/支（2025年价格战后约5999-8000元/支）",
      notes: "效果逐渐显现，注射后需按摩；不适合用于唇部和眼周"
    },
    {
      name: "少女针（艾维岚）",
      brand: "Ellansé 艾维岚",
      manufacturer: "英国Sinclair公司",
      reg_no: "国械注进20213130004",
      type: "进口三类医疗器械",
      ingredient: "聚己内酯（PCL）微球+CMC凝胶",
      indications: "面部软组织填充；面部轮廓塑形；抗衰老",
      contraindications: "对聚己内酯过敏者；注射部位感染者；妊娠期；有自身免疫性疾病者",
      duration: "12-48个月（不同型号）",
      price_range: "3000-8000元/支",
      notes: "有S/M/L/E四种型号，维持时间不同；即时填充+长效刺激胶原"
    },
    {
      name: "嗨体",
      brand: "嗨体",
      manufacturer: "北京爱美客技术发展股份有限公司",
      reg_no: "国械注准20193461332",
      type: "国产三类医疗器械",
      ingredient: "透明质酸钠+氨基酸复合物",
      indications: "颈纹治疗；真皮层补水",
      contraindications: "对透明质酸过敏者；注射部位感染者；妊娠期",
      duration: "6-12个月",
      price_range: "1500-3000元/次",
      notes: "专为颈纹设计，不适合用于面部深层填充"
    }
  ],

  // 光电类设备（合规信息）
  energy_devices: [
    {
      name: "热玛吉FLX",
      brand: "Thermage FLX",
      manufacturer: "美国Solta Medical（索塔医疗）",
      reg_no: "国械注进20193090067",
      type: "进口二类医疗器械",
      technology: "单极射频（Monopolar RF）",
      indications: "非侵入性皮肤紧致提升；改善皱纹；面部轮廓塑形",
      contraindications: "体内有金属植入物（如起搏器）；妊娠期；注射部位有感染；近期做过激光手术",
      duration: "12-24个月",
      price_range: "8000-35000元/次（按发数）",
      notes: "300/600/900发不同套餐；正品需验证防伪码；市场上仿冒品较多"
    },
    {
      name: "超声刀（HIFU）",
      brand: "Ultherapy 超声刀",
      manufacturer: "美国Merz公司",
      reg_no: "国械注进20163090010",
      type: "进口二类医疗器械",
      technology: "高强度聚焦超声（HIFU）",
      indications: "非侵入性眉部、颈部、下颌皮肤提升",
      contraindications: "注射部位有金属植入物；开放性伤口；严重皮肤病；妊娠期",
      duration: "12-18个月",
      price_range: "3000-15000元/次（全脸）",
      notes: "正品超声刀有专属APP验证；疼痛感较强"
    },
    {
      name: "皮秒激光",
      brand: "各品牌（赛诺秀、科医人等）",
      manufacturer: "多家",
      reg_no: "各品牌不同",
      type: "二类医疗器械",
      technology: "皮秒级脉冲激光",
      indications: "色斑、色素沉着、文身去除；皮肤年轻化",
      contraindications: "光敏性皮肤；近期日晒严重；妊娠期；有活动性皮肤感染",
      duration: "效果持久，需多次治疗",
      price_range: "1200-4000元/次（全脸）",
      notes: "需多次治疗（通常3-5次为一疗程）；术后需严格防晒"
    },
    {
      name: "光子嫩肤（IPL）",
      brand: "各品牌",
      manufacturer: "多家",
      reg_no: "各品牌不同",
      type: "二类医疗器械",
      technology: "强脉冲光（IPL）",
      indications: "色斑、毛细血管扩张、皮肤粗糙；脱毛",
      contraindications: "肤色较深者慎用；妊娠期；光敏性皮肤；近期日晒严重",
      duration: "效果维持1-2个月，需定期维护",
      price_range: "600-2000元/次",
      notes: "入门级光电项目，适合皮肤基础维护"
    }
  ]
};

// ============================================================
// 二、医美价格行情数据库
// ============================================================
const PRICE_DB = {
  // 注射类
  injection: [
    {
      category: "玻尿酸填充",
      items: [
        { name: "玻尿酸填充（进口高端，如乔雅登）", unit: "支", price_low: 3000, price_high: 8000, price_avg: 5000, tier: "高端" },
        { name: "玻尿酸填充（进口中端，如瑞蓝）", unit: "支", price_low: 1500, price_high: 3000, price_avg: 2000, tier: "中端" },
        { name: "玻尿酸填充（国产，如海薇/爱芙莱）", unit: "支", price_low: 600, price_high: 1500, price_avg: 1000, tier: "入门" },
        { name: "玻尿酸全脸填充套餐", unit: "次", price_low: 5000, price_high: 20000, price_avg: 10000, tier: "套餐" }
      ]
    },
    {
      category: "肉毒素注射",
      items: [
        { name: "肉毒素（保妥适）", unit: "50单位", price_low: 900, price_high: 2400, price_avg: 1500, tier: "高端" },
        { name: "肉毒素（吉适/乐提葆）", unit: "次", price_low: 750, price_high: 2000, price_avg: 1200, tier: "中端" },
        { name: "肉毒素（衡力，国产）", unit: "100单位", price_low: 240, price_high: 750, price_avg: 450, tier: "入门" },
        { name: "肉毒素全脸（额纹+眉间+鱼尾纹）", unit: "次", price_low: 1500, price_high: 5000, price_avg: 2500, tier: "套餐" }
      ]
    },
    {
      category: "再生类注射",
      items: [
        { name: "童颜针（普丽妍PLLA）", unit: "支", price_low: 5000, price_high: 20000, price_avg: 8000, tier: "高端" },
        { name: "少女针（艾维岚PCL）", unit: "支", price_low: 3000, price_high: 8000, price_avg: 5000, tier: "高端" },
        { name: "水光针（基础款）", unit: "次", price_low: 600, price_high: 1500, price_avg: 900, tier: "入门" },
        { name: "水光针（高端多功能）", unit: "次", price_low: 1500, price_high: 3000, price_avg: 2000, tier: "中高端" },
        { name: "嗨体（颈纹）", unit: "次", price_low: 1500, price_high: 3000, price_avg: 2000, tier: "中端" }
      ]
    }
  ],

  // 光电类
  energy_based: [
    {
      category: "射频类",
      items: [
        { name: "热玛吉FLX 300发", unit: "次", price_low: 8000, price_high: 15000, price_avg: 12000, tier: "高端" },
        { name: "热玛吉FLX 600发", unit: "次", price_low: 15000, price_high: 25000, price_avg: 20000, tier: "高端" },
        { name: "热玛吉FLX 900发", unit: "次", price_low: 20000, price_high: 35000, price_avg: 28000, tier: "高端" },
        { name: "热拉提（射频）", unit: "次", price_low: 5000, price_high: 20000, price_avg: 10000, tier: "中高端" }
      ]
    },
    {
      category: "超声类",
      items: [
        { name: "超声刀（全脸）", unit: "次", price_low: 3000, price_high: 15000, price_avg: 8000, tier: "高端" },
        { name: "超声炮（HIFU）", unit: "次", price_low: 2000, price_high: 8000, price_avg: 5000, tier: "中端" }
      ]
    },
    {
      category: "激光类",
      items: [
        { name: "皮秒激光（全脸）", unit: "次", price_low: 1200, price_high: 4000, price_avg: 2500, tier: "中端" },
        { name: "CO2点阵激光", unit: "次", price_low: 1500, price_high: 5000, price_avg: 3000, tier: "中端" },
        { name: "光子嫩肤（IPL）", unit: "次", price_low: 600, price_high: 2000, price_avg: 1200, tier: "入门" },
        { name: "调Q激光（祛斑）", unit: "次", price_low: 500, price_high: 2000, price_avg: 1000, tier: "入门" }
      ]
    }
  ],

  // 手术类
  surgical: [
    {
      category: "眼部整形",
      items: [
        { name: "双眼皮（切割法）", unit: "次", price_low: 3000, price_high: 20000, price_avg: 8000, tier: "中高端" },
        { name: "双眼皮（埋线法）", unit: "次", price_low: 1500, price_high: 8000, price_avg: 4000, tier: "中端" },
        { name: "开眼角", unit: "次", price_low: 2000, price_high: 10000, price_avg: 5000, tier: "中高端" }
      ]
    },
    {
      category: "鼻部整形",
      items: [
        { name: "鼻综合整形", unit: "次", price_low: 15000, price_high: 80000, price_avg: 35000, tier: "高端" },
        { name: "隆鼻（假体）", unit: "次", price_low: 8000, price_high: 30000, price_avg: 15000, tier: "中高端" },
        { name: "鼻尖整形", unit: "次", price_low: 5000, price_high: 20000, price_avg: 10000, tier: "中端" }
      ]
    },
    {
      category: "面部提升",
      items: [
        { name: "线雕提升（细线）", unit: "次", price_low: 5000, price_high: 30000, price_avg: 15000, tier: "高端" },
        { name: "面部脂肪填充", unit: "次", price_low: 8000, price_high: 30000, price_avg: 18000, tier: "高端" }
      ]
    }
  ],

  // 地区价格系数
  regional_multiplier: {
    "北京": 1.8,
    "上海": 1.9,
    "广州": 1.5,
    "深圳": 1.7,
    "杭州": 1.3,
    "成都": 1.2,
    "武汉": 1.1,
    "西安": 1.0,
    "二线城市": 0.9,
    "三线城市": 0.7
  }
};

// ============================================================
// 三、查询函数
// ============================================================

/**
 * 根据关键词查询合规信息
 */
function queryCompliance(keyword) {
  const results = [];
  const kw = keyword.toLowerCase();

  // 搜索所有类别
  const allProducts = [
    ...COMPLIANCE_DB.hyaluronic_acid,
    ...COMPLIANCE_DB.botulinum_toxin,
    ...COMPLIANCE_DB.regenerative,
    ...COMPLIANCE_DB.energy_devices
  ];

  for (const product of allProducts) {
    const searchText = [
      product.name, product.brand, product.manufacturer,
      product.ingredient, product.indications, product.notes || ''
    ].join(' ').toLowerCase();

    if (searchText.includes(kw) || kw.includes(product.name.toLowerCase())) {
      results.push(product);
    }
  }

  return results;
}

/**
 * 根据关键词查询价格行情
 */
function queryPrice(keyword) {
  const results = [];
  const kw = keyword.toLowerCase();

  const allCategories = [
    ...PRICE_DB.injection,
    ...PRICE_DB.energy_based,
    ...PRICE_DB.surgical
  ];

  for (const category of allCategories) {
    for (const item of category.items) {
      if (item.name.toLowerCase().includes(kw) || kw.includes(item.name.toLowerCase().slice(0, 4))) {
        results.push({
          category: category.category,
          ...item
        });
      }
    }
  }

  return results;
}

/**
 * 格式化合规查询结果为文本
 */
function formatComplianceResult(products) {
  if (!products || products.length === 0) {
    return null;
  }

  return products.map(p => {
    const lines = [
      `【${p.name}】`,
      `品牌：${p.brand} | 厂商：${p.manufacturer}`,
      `注册证号：${p.reg_no} | 类型：${p.type}`,
      `主要成分：${p.ingredient}`,
      `适应症：${p.indications}`,
      `禁忌症：${p.contraindications}`,
      `维持时间：${p.duration}`,
      `参考价格：${p.price_range}`,
    ];
    if (p.notes) lines.push(`注意事项：${p.notes}`);
    return lines.join('\n');
  }).join('\n\n---\n\n');
}

/**
 * 格式化价格查询结果为文本
 */
function formatPriceResult(items, city = null) {
  if (!items || items.length === 0) {
    return null;
  }

  const multiplier = city ? (PRICE_DB.regional_multiplier[city] || 1.0) : 1.0;

  return items.map(item => {
    let priceText;
    if (multiplier !== 1.0) {
      const adjLow = Math.round(item.price_low * multiplier / 100) * 100;
      const adjHigh = Math.round(item.price_high * multiplier / 100) * 100;
      priceText = `${adjLow}-${adjHigh}元/${item.unit}（${city}地区参考价，全国均价${item.price_low}-${item.price_high}元）`;
    } else {
      priceText = `${item.price_low}-${item.price_high}元/${item.unit}（全国参考均价约${item.price_avg}元）`;
    }
    return `【${item.name}】\n类别：${item.category} | 定位：${item.tier}\n参考价格：${priceText}`;
  }).join('\n\n');
}

/**
 * 主查询入口：根据意图和关键词返回结构化数据
 */
function queryMedAestheticsDB(query, intent = 'general') {
  const results = { compliance: [], prices: [], summary: '' };

  // 提取可能的城市信息
  const cities = Object.keys(PRICE_DB.regional_multiplier);
  const detectedCity = cities.find(c => query.includes(c));

  if (intent === 'compliance' || intent === 'general') {
    results.compliance = queryCompliance(query);
  }

  if (intent === 'price' || intent === 'general') {
    results.prices = queryPrice(query);
  }

  // 生成摘要文本
  const parts = [];

  if (results.compliance.length > 0) {
    parts.push('## 产品合规信息\n\n' + formatComplianceResult(results.compliance));
  }

  if (results.prices.length > 0) {
    parts.push('## 价格行情参考\n\n' + formatPriceResult(results.prices, detectedCity));
    if (detectedCity) {
      parts.push(`\n> 注：以上价格已根据${detectedCity}地区消费水平调整，仅供参考，实际价格以机构报价为准。`);
    } else {
      parts.push('\n> 注：以上为全国参考价格区间，实际价格因地区、机构级别、医生经验等因素差异较大，建议咨询当地正规机构获取准确报价。');
    }
  }

  results.summary = parts.join('\n\n');
  return results;
}

module.exports = {
  COMPLIANCE_DB,
  PRICE_DB,
  queryMedAestheticsDB,
  queryCompliance,
  queryPrice,
  formatComplianceResult,
  formatPriceResult
};
