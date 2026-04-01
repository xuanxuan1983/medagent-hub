#!/usr/bin/env python3
import os

BOTOX_TABLE = """
## 内置权威数据：国内已获批注射用A型肉毒毒素（8款，截至2026年3月）

当用户询问肉毒素/肉毒毒素获批产品、品牌清单、有多少款等问题时，**必须直接引用以下速查表**，确保8款全部列出，不得遗漏或自行编造：

| 序号 | 商品名 | 英文名 | 注册证号 | 生产企业 | 来源 | 中国经销/持有 | 获批时间 | 核心特点 |
|---|---|---|---|---|---|---|---|---|
| 1 | 衡力 | BTXA | 国药准字S10970037 | 兰州生物制品研究所 | 国产 | 兰州生物技术开发有限公司 | 1997年 | 国产首款，性价比高，弥散半径1.8-2.0mm |
| 2 | 保妥适 | BOTOX | 国药准字SJ20171003/04/05 | Allergan/AbbVie（美国艾尔建） | 进口 | 国药控股分销中心 | 2009年 | 高端标杆，弥散半径1.0-1.2mm，精准度高 |
| 3 | 吉适 | Dysport | 国药准字S20200016 | Ipsen Biopharm Limited（英国益普生） | 进口 | 高德美（中国） | 2020年6月 | 弥散半径2.0-2.5mm，适合大面积肌肉 |
| 4 | 乐提葆 | Letybo | 国药准字SJ20200024(100U)/SJ20210004(50U) | Hugel Inc.（韩国休杰） | 进口 | 四环医药独家代理 | 2020年10月 | 韩国市占率第一，弥散半径1.5mm |
| 5 | 思奥美 | Xeomin | 国药准字SJ20240010/11 | Merz Pharmaceuticals GmbH（德国麦施美学） | 进口 | 麦施美学（中国） | 2024年2月 | 去复杂蛋白技术，99%纯度，极低免疫原性 |
| 6 | 达希斐 | DAXXIFY | 国药准字SJ20240041 | Revance Therapeutics, Inc.（美国） | 进口 | 复星医药/复锐医疗科技 | 2024年9月 | 全球首款肽类长效肉毒素，效果持续6-9个月 |
| 7 | 解素橙(橙毒) | HUTOX | 国药准字SJ20260001 | Huons BioPharma Co., Ltd.（韩国） | 进口 | 爱美客独家（中国含港澳） | 2026年1月 | 国内第七款获批肉毒素 |
| 8 | 芮妥欣 | Retoxin | 国药准字S20260019 | 重庆誉颜制药有限公司 | 国产 | 华东医药独家经销（医美） | 2026年3月 | 全球首款重组A型肉毒毒素，基因重组技术 |

分类统计：国产2款（衡力、芮妥欣）、进口6款（美国2款、韩国2款、英国1款、德国1款）。传统肉毒杆菌发酵产品7款，重组肉毒毒素1款（芮妥欣）。长效型1款（达希斐，6-9个月），其余常规型（3-6个月）。
"""

SKILL_FILES = ["product-strategist.md","senior-consultant.md","materials-mentor.md","material-architect.md","medical-liaison.md","sparring-partner.md"]
SKILLS_DIR = "/home/ubuntu/medagent-hub/skills"
MARKER = "## 内置权威数据：国内已获批注射用A型肉毒毒素"

for fn in SKILL_FILES:
    fp = os.path.join(SKILLS_DIR, fn)
    with open(fp, 'r') as f: c = f.read()
    if MARKER in c:
        print(f"[跳过] {fn} - 已存在"); continue
    lines = c.split('\n')
    idx = None
    for i, l in enumerate(lines):
        if "分类统计：国产" in l and "进口" in l and ("冻干粉" in l or "凝胶" in l or "微球" in l):
            idx = i + 1; break
    if idx is None:
        for i, l in enumerate(lines):
            if "技术路线分类：猪源" in l: idx = i + 1; break
    if idx is None:
        for m in ["## 输出格式规范","## 引导性问题格式","## 核心能力模块"]:
            for i, l in enumerate(lines):
                if l.strip().startswith(m): idx = i; break
            if idx: break
    if idx:
        lines.insert(idx, BOTOX_TABLE)
        with open(fp, 'w') as f: f.write('\n'.join(lines))
        print(f"[成功] {fn}")
    else:
        with open(fp, 'a') as f: f.write(BOTOX_TABLE)
        print(f"[成功] {fn} (末尾)")
