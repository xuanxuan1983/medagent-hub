#!/usr/bin/env python3
"""
MedAgent Hub 每日行业日报生成脚本
由 Manus 定时任务调用，自动搜集医美行业资讯并推送到服务器

使用方式：
  python3 generate-daily-brief.py

环境变量：
  OPENAI_API_KEY      - OpenAI 兼容 API Key（已预配置）
  BRIEF_PUSH_KEY      - 推送到服务器的密钥
  BRIEF_SERVER_URL    - 服务器地址（默认 https://medagent.filldmy.com）
"""

import os
import json
import datetime
import requests
from openai import OpenAI

# ── 配置 ──
BRIEF_PUSH_KEY = os.environ.get('BRIEF_PUSH_KEY', '1b93765196bf145c607244194f424197c224eff79fb1a493')
BRIEF_SERVER_URL = os.environ.get('BRIEF_SERVER_URL', 'https://medagent.filldmy.com')
BOCHA_API_KEY = os.environ.get('BOCHA_API_KEY', 'sk-51d7d709eb6d4150b76dc131663330d3')

# OpenAI 客户端（使用 Manus 预配置的 API Key）
client = OpenAI()

# 使用 UTC+8 北京时间，避免沙盒时区与服务器不一致
today = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).date()
today_str = f"{today.year}年{today.month}月{today.day}日"

# ── 数据来源标签 ──
SOURCES = [
    "21世纪经济报道", "医美部落", "每日经济新闻",
    "东方财富", "万联证券", "丁香园", "健康界", "华熙生物", "锦波生物"
]

# ── 搜索关键词列表 ──
# 改进搜索关键词，增加深度分析和具体公司
SEARCH_QUERIES = [
    "医美行业 政策监管 2026 最新 深度",
    "医美市场 消费趋势 深度分析 报告",
    "医美上游 华熙生物 锦波生物 融资 注册证 获批 深度",
    "AI 医美 数字化 运营 华美浩联 深度",
    "医美 国际市场 品牌 深度",
]


def bocha_search(query: str, count: int = 5) -> list:
    """使用博查搜索引擎搜索最新资讯"""
    try:
        resp = requests.post(
            'https://api.bochaai.com/v1/web-search',
            headers={
                'Authorization': f'Bearer {BOCHA_API_KEY}',
                'Content-Type': 'application/json'
            },
            json={
                'query': query,
                'count': count,
                'freshness': 'oneWeek',
                'summary': True,
                'answer': False
            },
            timeout=15
        )
        data = resp.json()
        results = data.get('data', {}).get('webPages', {}).get('value', [])
        return [
            {
                'title': r.get('name', ''),
                'url': r.get('url', ''),
                'snippet': r.get('snippet', '') or r.get('summary', '')
            }
            for r in results[:count]
        ]
    except Exception as e:
        print(f"[搜索失败] {query}: {e}")
        return []


def generate_brief_with_ai(search_results: dict) -> dict:
    """使用 AI 将搜索结果整理成结构化日报 JSON"""

    # 构建搜索结果文本
    search_text = ""
    for category, results in search_results.items():
        search_text += f"\n\n=== {category} ===\n"
        for r in results:
            search_text += f"- 标题：{r['title']}\n"
            search_text += f"  摘要：{r['snippet'][:500]}\n" # 增加摘要长度，提供更多上下文

    # 改进 prompt，强调深度分析和具体案例
    prompt = f"""你是医美行业资深分析师，今天是{today_str}。

根据以下搜索到的最新行业资讯，生成一份结构化的每日行业摘要，严格按照 JSON 格式输出。

搜索结果：
{search_text}

请生成如下 JSON 结构（直接输出 JSON，不要有任何其他文字）：

{{
  "date": "{today_str}",
  "sources": ["21世纪经济报道", "医美部落", "每日经济新闻", "东方财富", "万联证券"],
  "priorities": [
    {{
      "level": "high|medium|low",
      "event": "事项简述（15字以内）",
      "action": "建议行动（30字以内）"
    }}
  ],
  "sections": [
    {{
      "id": "policy",
      "icon": "⚖️",
      "iconBg": "#FFF0EC",
      "title": "政策监管动态",
      "color": "#E8715A",
      "news": [
        {{
          "title": "新闻标题（15-30字完整新闻句）",
          "summary": "详细的深度分析摘要（300-500字），包括事件背景、核心内容、影响分析。必须客观陈述事实，深入剖析，切忌泛泛而谈。如果是公司动态（如华熙生物、锦波生物等），需详细说明其财务表现、产品进展或战略布局。",
          "insight": "MedAgent 关注：对医美机构或上游厂商的具体影响和落地建议（必须具体、有针对性，可为null）",
          "table": null
        }}
      ]
    }},
    {{
      "id": "market",
      "icon": "📈",
      "iconBg": "#F0FDF4",
      "title": "市场规模与消费趋势",
      "color": "#22C55E",
      "news": []
    }},
    {{
      "id": "product",
      "icon": "💊",
      "iconBg": "#EFF6FF",
      "title": "上游产品与企业动态",
      "color": "#3B82F6",
      "news": []
    }},
    {{
      "id": "ai",
      "icon": "🤖",
      "iconBg": "#F5F3FF",
      "title": "AI与数字化赋能趋势",
      "color": "#8B5CF6",
      "news": []
    }},
    {{
      "id": "global",
      "icon": "🌏",
      "iconBg": "#FFFBEB",
      "title": "国际市场动态",
      "color": "#F59E0B",
      "news": []
    }}
  ]
}}

要求：
1. priorities 提供 3-5 条，按重要性排序，level 只能是 high/medium/low。重点关注融资、新产品获批、重大政策等。
2. 每个 section 至少包含 1 条新闻，如果没有相关资讯则写"今日暂无相关动态"。
3. summary 字段：**这是最关键的要求**！必须是深度分析，而不是简单的网页标题堆砌。需要结合上下文，提炼出核心数据（如融资金额、增长率等）、关键人物观点、技术突破点等。字数在300-500字之间，体现专业分析师的水准。
4. insight 字段：如果该新闻对 MedAgent Hub 平台或其用户有直接影响，填写具体建议；否则填 null。
5. 所有内容必须基于搜索结果，不要编造数据。
6. 直接输出 JSON，不要有 ```json 标记。
7. 新闻标题必须是简洁的新闻摘要句，严禁包含网站名、来源名、下划线分隔的网站后缀（如"_中研普华_中研网"、"_东方财富"、"_新浪财经"、"- 搜狐"、"_腾讯新闻"等），标题应为15-30字的完整新闻句，且不带任何多余的后缀。
8. priorities 中的 event 字段同样不得包含任何网站名或来源后缀。
9. 如果搜索结果中包含特定公司（如华熙生物、锦波生物、华美浩联等）的深度信息，请务必在对应的 section 中进行详细的拆解分析。"""

    response = client.chat.completions.create(
        model="gemini-2.5-flash",
        messages=[
            {"role": "system", "content": "你是一个严谨、专业的医美行业分析师，擅长从碎片化信息中提取深度洞察，拒绝空洞的套话，只提供有价值的数据和分析。"},
            {"role": "user", "content": prompt}
        ],
        temperature=0.3,
        max_tokens=8000
    )

    raw = response.choices[0].message.content.strip()

    # 清理可能的 markdown 代码块标记
    if raw.startswith('```'):
        raw = raw.split('\n', 1)[1] if '\n' in raw else raw[3:]
    if raw.endswith('```'):
        raw = raw.rsplit('```', 1)[0]
    raw = raw.strip()

    return json.loads(raw)


def push_to_server(brief_data: dict) -> bool:
    """将日报数据推送到服务器"""
    try:
        resp = requests.post(
            f"{BRIEF_SERVER_URL}/api/daily-brief",
            headers={
                'Content-Type': 'application/json',
                'X-Brief-Key': BRIEF_PUSH_KEY
            },
            json=brief_data,
            timeout=30
        )
        if resp.status_code == 200:
            result = resp.json()
            print(f"✅ 日报推送成功: {result.get('message', 'OK')}")
            return True
        else:
            print(f"❌ 推送失败 HTTP {resp.status_code}: {resp.text[:200]}")
            return False
    except Exception as e:
        print(f"❌ 推送异常: {e}")
        return False


def main():
    print(f"🗞️  开始生成 {today_str} 医美行业日报...")

    # 1. 搜集各类资讯
    print("📡 搜集行业资讯...")
    search_results = {}
    category_map = {
        "政策监管": SEARCH_QUERIES[0],
        "市场趋势": SEARCH_QUERIES[1],
        "产品动态": SEARCH_QUERIES[2],
        "AI赋能":   SEARCH_QUERIES[3],
        "国际市场": SEARCH_QUERIES[4],
    }
    for category, query in category_map.items():
        print(f"  搜索: {query}")
        results = bocha_search(query, count=6) # 增加搜索结果数量，提供更多素材
        search_results[category] = results
        print(f"  获取 {len(results)} 条结果")

    # 2. AI 生成结构化摘要
    print("🤖 AI 生成结构化摘要...")
    brief_data = generate_brief_with_ai(search_results)
    print(f"  生成完成，共 {sum(len(s.get('news', [])) for s in brief_data.get('sections', []))} 条新闻")

    # 3. 推送到服务器
    print("📤 推送到服务器...")
    success = push_to_server(brief_data)

    if success:
        print(f"\n✨ 完成！{today_str} 行业日报已更新到 {BRIEF_SERVER_URL}/daily-brief.html")
    else:
        # 推送失败时保存到本地
        local_path = f"/tmp/daily-brief-{today.isoformat()}.json"
        with open(local_path, 'w', encoding='utf-8') as f:
            json.dump(brief_data, f, ensure_ascii=False, indent=2)
        print(f"\n⚠️  推送失败，日报已保存到本地: {local_path}")

    return 0 if success else 1


if __name__ == '__main__':
    exit(main())
