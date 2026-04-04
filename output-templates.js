/**
 * MedAgent Hub — 输出模板配置
 * 
 * 预设常见医美场景的输出模板，用户选择模板后自动填充提示词
 */
'use strict';

const OUTPUT_TEMPLATES = [
  {
    id: 'competitor_analysis',
    name: '竞品分析报告',
    icon: '📊',
    category: '分析',
    description: '对比分析竞品的产品、价格、市场表现',
    prompt: '请帮我生成一份{topic}的竞品分析报告，包含以下内容：\n1. 市场概况与主要竞品列表\n2. 产品对比（成分、规格、适应症）\n3. 价格对比分析\n4. 各品牌优劣势总结\n5. 市场策略建议\n\n请用表格形式呈现对比数据，最后给出结论和建议。',
    placeholder: '输入分析主题，如：玻尿酸填充剂'
  },
  {
    id: 'market_report',
    name: '市场调研报告',
    icon: '📈',
    category: '分析',
    description: '行业趋势、市场规模、增长分析',
    prompt: '请帮我撰写一份{topic}的市场调研报告，需要包含：\n1. 行业现状与市场规模\n2. 主要参与者与市场份额\n3. 发展趋势与增长预测\n4. 政策法规环境\n5. 机会与风险分析\n6. 投资/进入建议\n\n请引用最新数据，用图表和数据支撑分析。',
    placeholder: '输入调研主题，如：中国医美注射类市场'
  },
  {
    id: 'operation_plan',
    name: '运营方案',
    icon: '📋',
    category: '方案',
    description: '机构运营策略、活动方案、获客计划',
    prompt: '请帮我制定一份{topic}的运营方案，包含：\n1. 目标设定（KPI指标）\n2. 目标客群画像\n3. 营销渠道策略\n4. 活动方案设计（至少3个）\n5. 预算分配建议\n6. 执行时间表\n7. 效果评估方法\n\n请给出可落地的具体方案。',
    placeholder: '输入运营主题，如：新开业医美机构3个月获客'
  },
  {
    id: 'training_material',
    name: '培训材料',
    icon: '📖',
    category: '内容',
    description: '产品知识、销售话术、操作规范',
    prompt: '请帮我编写一份{topic}的培训材料，需要包含：\n1. 产品/项目基础知识\n2. 适应症与禁忌症\n3. 操作流程与注意事项\n4. 常见客户问题FAQ（至少10个）\n5. 销售话术要点\n6. 考核要点总结\n\n内容要专业准确，语言通俗易懂。',
    placeholder: '输入培训主题，如：肉毒素产品知识'
  },
  {
    id: 'copywriting',
    name: '营销文案',
    icon: '✍️',
    category: '内容',
    description: '朋友圈、小红书、公众号文案',
    prompt: '请帮我撰写{topic}的营销文案，需要：\n1. 朋友圈文案 × 3（含配图建议）\n2. 小红书种草笔记 × 1（含标题、正文、标签）\n3. 公众号推文大纲 × 1\n\n要求：\n- 符合医美广告合规要求，不使用绝对化用语\n- 突出安全性和专业性\n- 适当使用情感共鸣\n- 包含行动号召（CTA）',
    placeholder: '输入文案主题，如：夏季光子嫩肤项目推广'
  },
  {
    id: 'compliance_check',
    name: '合规审查',
    icon: '⚖️',
    category: '合规',
    description: '产品合规性、广告法审查、资质核验',
    prompt: '请帮我对{topic}进行合规审查，包含：\n1. 产品注册/备案信息核查\n2. 适用法规梳理\n3. 广告宣传合规要点\n4. 常见违规风险提示\n5. 合规建议与整改方向\n\n请查询药监局数据库获取准确信息。',
    placeholder: '输入审查对象，如：某品牌玻尿酸产品'
  },
  {
    id: 'consultation_script',
    name: '咨询话术',
    icon: '💬',
    category: '销售',
    description: '客户咨询应答、异议处理、成交话术',
    prompt: '请帮我设计{topic}的咨询话术体系，包含：\n1. 开场破冰话术\n2. 需求挖掘问题清单\n3. 项目介绍话术（FAB法则）\n4. 价格异议处理（至少5种场景）\n5. 竞品对比应答\n6. 促成成交话术\n7. 售后跟进话术\n\n每个场景给出2-3种话术变体。',
    placeholder: '输入话术主题，如：热玛吉项目咨询'
  },
  {
    id: 'swot_analysis',
    name: 'SWOT 分析',
    icon: '🎯',
    category: '分析',
    description: '优势、劣势、机会、威胁分析',
    prompt: '请帮我对{topic}进行 SWOT 分析，包含：\n1. Strengths（优势）- 至少5点\n2. Weaknesses（劣势）- 至少5点\n3. Opportunities（机会）- 至少5点\n4. Threats（威胁）- 至少5点\n5. SWOT 矩阵交叉分析\n6. 战略建议（SO/WO/ST/WT策略）\n\n请用表格呈现SWOT矩阵。',
    placeholder: '输入分析对象，如：XX医美连锁机构'
  }
];

// 模板分类
const TEMPLATE_CATEGORIES = [
  { id: 'all', name: '全部' },
  { id: '分析', name: '分析' },
  { id: '方案', name: '方案' },
  { id: '内容', name: '内容' },
  { id: '合规', name: '合规' },
  { id: '销售', name: '销售' }
];

module.exports = { OUTPUT_TEMPLATES, TEMPLATE_CATEGORIES };
