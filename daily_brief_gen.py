#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
MedAgent Hub 医美行业日报生成脚本
每天 7:30 自动运行：
1. 用 AI 生成今日医美行业新闻内容
2. 更新 daily-brief.json（供网页展示）
3. 生成日报海报图片
4. 推送到微信（Server酱）
"""

import os
import json
import requests
import datetime
from PIL import Image, ImageDraw, ImageFont
import textwrap

# ===== 配置 =====
SENDKEY = "SCT318800Tfern1vFw9cjqK7OPKiskenT4"
SILICONFLOW_API_KEY = os.environ.get("SILICONFLOW_API_KEY", "")
BOCHA_API_KEY = os.environ.get("BOCHA_API_KEY", "")
OUTPUT_DIR = "/home/ubuntu/medagent-hub/public/daily-brief"
BRIEF_JSON = "/home/ubuntu/medagent-hub/data/daily-brief.json"
QR_PATH = "/home/ubuntu/daily_brief_qr.png"
LOGO_PATH = "/home/ubuntu/medagent-hub/public/xuanyi-signature.png"

# 强制使用中国标准时间 CST (UTC+8)
CST = datetime.timezone(datetime.timedelta(hours=8))
_now_cst = datetime.datetime.now(CST)
TODAY = _now_cst.strftime("%Y年%m月%d日")
TODAY_FILE = _now_cst.strftime("%Y%m%d")

os.makedirs(OUTPUT_DIR, exist_ok=True)

def log(msg):
    print(f"[{datetime.datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)

# ===== 1. 搜索医美行业新闻（新浪搜索真实新闻）=====
def search_news():
    log("正在从新浪搜索获取医美行业真实新闻...")
    from bs4 import BeautifulSoup
    import urllib.parse
    import re
    import time

    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'Referer': 'https://www.sina.com.cn/',
    }

    # 医美相关关键词（用于过滤不相关内容）
    YIMEI_KW = [
        '医美', '医疗美容', '整形', '玻尿酸', '肉毒素', '胶原蛋白',
        '激光美容', '超声刀', '热玛吉', '轻医美', '抗衰老', '美容医院',
        '新氧', '华熙生物', '爱美客', '昊海生科', '锦波生物', '巨子生物',
        '光电医美', '填充剂', '整形外科', '医美行业', '医美市场',
        '医美监管', '医美融资', '医美产品', '四环医药', '半岛医疗',
    ]

    # 多维度搜索关键词，覆盖医美行业各细分领域
    queries = [
        '医美行业',
        '医疗美容 监管',
        '爱美客 华熙生物 昊海生科',
        '医美 融资 新品',
        '医美行业 趋势 2026',
    ]

    all_news = []
    seen_titles = set()

    for query in queries:
        try:
            encoded = urllib.parse.quote(query)
            url = f'https://search.sina.com.cn/?q={encoded}&range=30&c=news&sort=time'
            r = requests.get(url, headers=headers, timeout=10)
            if r.status_code != 200:
                continue
            soup = BeautifulSoup(r.text, 'html.parser')
            items = soup.select('.box-result')

            for item in items[:6]:
                title_el = item.select_one('h2 a')
                if not title_el:
                    continue
                title = title_el.get_text(strip=True)

                # 过滤非医美内容
                if not any(kw in title for kw in YIMEI_KW):
                    continue
                if title in seen_titles or len(title) < 8:
                    continue
                seen_titles.add(title)

                # 解析日期和来源
                meta_el = item.select_one('.fgray_time')
                pub_date = ''
                source = ''
                if meta_el:
                    meta_text = meta_el.get_text(' ', strip=True)
                    date_match = re.search(r'(\d{4}-\d{2}-\d{2})', meta_text)
                    if date_match:
                        pub_date = date_match.group(1)
                    source = re.sub(r'\s*\d{4}-\d{2}-\d{2}.*', '', meta_text).strip()

                # 摘要
                summary_el = item.select_one('.content')
                snippet = summary_el.get_text(strip=True)[:200] if summary_el else ''

                all_news.append({
                    'title': title,
                    'snippet': snippet,
                    'source': source,
                    'date': pub_date,
                    'url': title_el.get('href', '')
                })

            time.sleep(0.5)
        except Exception as e:
            log(f"搜索 '{query}' 失败: {e}")
            continue

    if all_news:
        # 按日期排序，最新的在前
        all_news.sort(key=lambda x: x.get('date', ''), reverse=True)
        log(f"获取到 {len(all_news)} 条医美真实新闻（来源：新浪搜索）")
        return all_news

    log("新浪搜索获取失败，使用 AI 生成行业动态摘要...")
    return None

# ===== 2. AI 生成完整日报 JSON 内容 =====
def generate_full_brief(news_items):
    log("正在用 AI 生成完整日报内容...")

    if news_items:
        # 按来源分类展示，让 AI 更好地理解新闻
        news_lines = []
        for i, n in enumerate(news_items[:15], 1):
            date_str = f"[{n['date']}]" if n.get('date') else ""
            source_str = f"（{n['source']}）" if n.get('source') else ""
            snippet = n.get('snippet', '')[:120]
            news_lines.append(f"{i}. {date_str}{n['title']}{source_str}\n   摘要：{snippet}")
        news_context = "\n\n".join(news_lines)
        news_instruction = "请基于以上真实新闻进行分析，新闻标题和摘要要忠实于原文，不要编造不存在的新闻。"
    else:
        news_context = "（暂无实时新闻数据）"
        news_instruction = "请基于医美行业最新趋势生成内容，标注为行业分析。"

    prompt = f"""你是医美行业资深分析师，为 MedAgent Hub（医美行业 AI 助手平台）的用户群体（医美机构运营者、上游厂商、投资人）撰写每日行业日报。今天是{TODAY}。

以下是今日医美行业真实新闻：

{news_context}

{news_instruction}

请严格按照以下 JSON 格式输出，不要有任何其他内容。要求：
1. 新闻标题必须基于真实新闻，不得编造
2. 摘要要准确反映新闻内容，100字以内
3. insight 要给出对 MedAgent Hub 用户（医美机构/厂商）的具体可操作建议
4. priorities 选取今日最重要的3条动态
5. 每个 section 放入最相关的真实新闻，没有相关新闻的分类可以减少条数

{{
  "priorities": [
    {{"level": "high", "event": "最重要事件（20字以内）", "action": "对医美从业者的具体建议（30字以内）"}},
    {{"level": "high", "event": "第二重要事件（20字以内）", "action": "对医美从业者的具体建议（30字以内）"}},
    {{"level": "medium", "event": "中等重要事件（20字以内）", "action": "对医美从业者的具体建议（30字以内）"}}
  ],
  "sections": [
    {{
      "id": "policy",
      "icon": "📋",
      "iconBg": "#FFF0EC",
      "title": "政策监管动态",
      "color": "#E8715A",
      "news": [
        {{"title": "新闻标题（25字以内）", "summary": "基于真实新闻的准确摘要（100字以内）", "insight": "MedAgent 关注：对机构/厂商的具体建议（50字以内）", "table": null}}
      ]
    }},
    {{
      "id": "capital",
      "icon": "💰",
      "iconBg": "#FFF8EC",
      "title": "资本与企业动态",
      "color": "#F59E0B",
      "news": [
        {{"title": "新闻标题（25字以内）", "summary": "基于真实新闻的准确摘要（100字以内）", "insight": "MedAgent 关注：对机构/厂商的具体建议（50字以内）", "table": null}}
      ]
    }},
    {{
      "id": "trend",
      "icon": "📈",
      "iconBg": "#F0FFF4",
      "title": "行业趋势与洞察",
      "color": "#10B981",
      "news": [
        {{"title": "新闻标题（25字以内）", "summary": "基于真实新闻的准确摘要（100字以内）", "insight": "MedAgent 关注：对机构/厂商的具体建议（50字以内）", "table": null}}
      ]
    }},
    {{
      "id": "product",
      "icon": "💊",
      "iconBg": "#F5F3FF",
      "title": "上游产品与企业",
      "color": "#8B5CF6",
      "news": [
        {{"title": "新闻标题（25字以内）", "summary": "基于真实新闻的准确摘要（100字以内）", "insight": "MedAgent 关注：对机构/厂商的具体建议（50字以内）", "table": null}}
      ]
    }},
    {{
      "id": "ai",
      "icon": "🤖",
      "iconBg": "#EFF6FF",
      "title": "AI与数字化赋能",
      "color": "#3B82F6",
      "news": [
        {{"title": "新闻标题（25字以内）", "summary": "基于真实新闻的准确摘要（100字以内）", "insight": "MedAgent 关注：对机构/厂商的具体建议（50字以内）", "table": null}}
      ]
    }},
    {{
      "id": "global",
      "icon": "🌏",
      "iconBg": "#F0FFFE",
      "title": "全球市场动态",
      "color": "#06B6D4",
      "news": [
        {{"title": "新闻标题（25字以内）", "summary": "基于真实新闻的准确摘要（100字以内）", "insight": "MedAgent 关注：对机构/厂商的具体建议（50字以内）", "table": null}}
      ]
    }}
  ]
}}"""

    try:
        headers = {"Authorization": f"Bearer {SILICONFLOW_API_KEY}", "Content-Type": "application/json"}
        payload = {
            "model": "Qwen/Qwen2.5-7B-Instruct",
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.5,
            "max_tokens": 3500
        }
        resp = requests.post("https://api.siliconflow.cn/v1/chat/completions",
                             headers=headers, json=payload, timeout=120)
        if resp.status_code == 200:
            content = resp.json()["choices"][0]["message"]["content"].strip()
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0].strip()
            elif "```" in content:
                content = content.split("```")[1].split("```")[0].strip()
            data = json.loads(content)
            log("AI 完整日报内容生成成功")
            return data
    except Exception as e:
        log(f"AI 生成失败: {e}")
    return None


# ===== 3. 生成朋友圈海报图片用的简洁摘要 =====
def generate_poster_content(full_brief):
    """从完整日报中提取海报所需的简洁内容"""
    if not full_brief:
        return {
            "headline": "医美行业持续升温",
            "subheadline": "合规化与数字化双轮驱动",
            "summary": "医美行业在政策规范与技术创新的双重驱动下持续发展，从业者需关注合规动态，把握数字化转型机遇。",
            "highlights": [
                {"index": "01", "title": "监管趋严，合规成核心竞争力", "insight": "MedAgent Hub 合规顾问可提供实时政策解读"},
                {"index": "02", "title": "轻医美需求持续增长", "insight": "话术训练 Agent 助力提升成交转化率"},
                {"index": "03", "title": "AI 赋能医美服务升级", "insight": "MedAgent Hub 20+ 专属 Agent 全面覆盖"}
            ]
        }

    priorities = full_brief.get("priorities", [])
    sections = full_brief.get("sections", [])

    # 取最高优先级事件作为标题
    headline_event = priorities[0]["event"] if priorities else "医美行业日报"
    headline = headline_event[:10] if len(headline_event) > 10 else headline_event
    subheadline = headline_event[10:] if len(headline_event) > 10 else ""

    # 生成摘要
    summary_parts = [p["event"] for p in priorities[:2]]
    summary = "，".join(summary_parts) + "，是今日医美行业的核心关注点。"
    if len(summary) > 80:
        summary = summary[:78] + "..."

    # 取前3条要点
    highlights = []
    idx = 1
    for p in priorities[:3]:
        highlights.append({
            "index": f"0{idx}",
            "title": p["event"][:20],
            "insight": p["action"][:30]
        })
        idx += 1

    return {
        "headline": headline,
        "subheadline": subheadline,
        "summary": summary,
        "highlights": highlights
    }

# ===== 4. 更新 daily-brief.json =====
def update_brief_json(full_brief):
    log("正在更新 daily-brief.json...")
    try:
        # 读取现有文件（保留 sources 等固定字段）
        existing = {}
        if os.path.exists(BRIEF_JSON):
            with open(BRIEF_JSON) as f:
                existing = json.load(f)

        # 更新动态字段
        existing["date"] = TODAY
        existing["updateTime"] = "每日 07:30"
        if full_brief:
            existing["priorities"] = full_brief.get("priorities", existing.get("priorities", []))
            existing["sections"] = full_brief.get("sections", existing.get("sections", []))

        with open(BRIEF_JSON, "w") as f:
            json.dump(existing, f, ensure_ascii=False, indent=2)
        log(f"✅ daily-brief.json 已更新（日期: {TODAY}，共 {sum(len(s.get('news',[])) for s in existing.get('sections',[]))} 条新闻）")
    except Exception as e:
        log(f"⚠️ 更新 daily-brief.json 失败: {e}")

# ===== 5. 生成日报海报图片 =====
def generate_image(content):
    log("正在生成日报海报图片...")

    W, H = 930, 1300
    BG_COLOR = (245, 240, 233)
    CORAL = (210, 90, 60)
    DARK = (40, 35, 30)
    GRAY = (140, 130, 120)
    LINE_COLOR = (210, 200, 188)
    CARD_BG = (255, 252, 248)

    img = Image.new("RGB", (W, H), BG_COLOR)
    draw = ImageDraw.Draw(img)

    def get_font(size, bold=False):
        font_paths = [
            "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc" if bold else "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
            "/usr/share/fonts/truetype/noto/NotoSansCJK-Bold.ttc" if bold else "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        ]
        for p in font_paths:
            if os.path.exists(p):
                try:
                    return ImageFont.truetype(p, size)
                except:
                    pass
        return ImageFont.load_default()

    font_tiny = get_font(20)
    font_small = get_font(24)
    font_body = get_font(28)
    font_xlarge = get_font(68, bold=True)
    font_label = get_font(22)

    # 顶部导航栏
    draw.ellipse([48, 38, 62, 52], fill=CORAL)
    draw.text((74, 32), "MEDAGENT HUB", font=font_tiny, fill=DARK)
    draw.text((W - 48 - 180, 32), TODAY, font=font_tiny, fill=GRAY, anchor="lt")

    # 副标题标签
    draw.text((W // 2, 100), "医美行业日报 · 今日速览", font=font_small, fill=GRAY, anchor="mm")

    # 主标题
    headline = content.get("headline", "医美行业日报")
    subheadline = content.get("subheadline", "")
    y_title = 145
    draw.text((W // 2, y_title), headline[:6], font=font_xlarge, fill=DARK, anchor="mm")
    draw.text((W // 2, y_title + 80), subheadline if subheadline else headline[6:], font=font_xlarge, fill=CORAL, anchor="mm")

    # 摘要
    summary = content.get("summary", "")
    y_summary = y_title + 175
    lines = textwrap.wrap(summary, width=22)
    for i, line in enumerate(lines[:4]):
        draw.text((W // 2, y_summary + i * 38), line, font=font_body, fill=GRAY, anchor="mm")

    # 分割线
    y_divider = y_summary + len(lines[:4]) * 38 + 30
    draw.line([(60, y_divider), (W - 60, y_divider)], fill=LINE_COLOR, width=1)

    # TODAY'S HIGHLIGHTS
    y_highlights = y_divider + 30
    draw.text((60, y_highlights), "TODAY'S HIGHLIGHTS", font=font_label, fill=GRAY)

    # 三条要点卡片
    highlights = content.get("highlights", [])
    y_card = y_highlights + 45
    card_h = 110
    card_gap = 18

    for i, item in enumerate(highlights[:3]):
        cy = y_card + i * (card_h + card_gap)
        draw.rounded_rectangle([48, cy, W - 48, cy + card_h], radius=12, fill=CARD_BG)
        draw.text((80, cy + 20), item.get("index", f"0{i+1}"), font=get_font(28, bold=True), fill=CORAL)
        draw.text((130, cy + 18), item.get("title", ""), font=get_font(30, bold=True), fill=DARK)
        draw.text((130, cy + 60), item.get("insight", ""), font=font_body, fill=GRAY)

    # 底部区域
    y_footer = y_card + 3 * (card_h + card_gap) + 20
    draw.line([(60, y_footer), (W - 60, y_footer)], fill=LINE_COLOR, width=1)
    y_footer_content = y_footer + 30

    # 左侧署名
    if os.path.exists(LOGO_PATH):
        try:
            logo = Image.open(LOGO_PATH).convert("RGBA")
            logo_w = 160
            logo_h = int(logo.height * logo_w / logo.width)
            logo = logo.resize((logo_w, logo_h), Image.LANCZOS)
            img.paste(logo, (60, y_footer_content), logo)
            y_sig_text = y_footer_content + logo_h + 10
        except:
            y_sig_text = y_footer_content
    else:
        draw.text((60, y_footer_content), "Xuanyi", font=get_font(44, bold=True), fill=DARK)
        y_sig_text = y_footer_content + 55

    draw.text((60, y_sig_text), "系统 × AI 智慧增长架构师  |  MedAgent Hub", font=font_small, fill=GRAY)
    draw.text((60, y_sig_text + 36), "扫码阅读今日医美行业日报 →", font=font_small, fill=CORAL)

    # 右侧二维码
    if os.path.exists(QR_PATH):
        try:
            qr = Image.open(QR_PATH).convert("RGB")
            qr_size = 160
            qr = qr.resize((qr_size, qr_size), Image.LANCZOS)
            qr_x = W - 60 - qr_size
            qr_y = y_footer_content
            img.paste(qr, (qr_x, qr_y))
            draw.text((qr_x + qr_size // 2, qr_y + qr_size + 12), "扫码查看日报",
                      font=font_label, fill=GRAY, anchor="mm")
        except Exception as e:
            log(f"二维码加载失败: {e}")

    output_path = os.path.join(OUTPUT_DIR, f"daily-brief-{TODAY_FILE}.png")
    img.save(output_path, "PNG", quality=95)
    log(f"图片已保存: {output_path}")
    return output_path

# ===== 6. 上传图片到公网 =====
def upload_image(image_path):
    filename = os.path.basename(image_path)
    local_url = f"https://medagent.filldmy.com/daily-brief/{filename}"
    # Telegraph 图床（5秒超时，服务器可能无法访问境外）
    try:
        with open(image_path, "rb") as f:
            files = {"file": ("daily-brief.png", f, "image/png")}
            resp = requests.post("https://telegra.ph/upload", files=files, timeout=5)
        if resp.status_code == 200:
            result = resp.json()
            if isinstance(result, list) and result:
                url = "https://telegra.ph" + result[0]["src"]
                log(f"图片上传成功 (Telegraph): {url}")
                return url
    except Exception as e:
        log(f"Telegraph 不可用，使用本地域名")
    log(f"使用本地域名: {local_url}")
    return local_url

# ===== 7. 推送到微信 =====
def push_to_wechat(image_path):
    log("正在推送到微信...")
    title = f"📰 {TODAY} 医美行业日报"
    desp = f"### {TODAY} 医美行业日报\n\n今日日报已生成，扫码查看完整内容：\n\nhttps://medagent.filldmy.com/daily-brief.html\n\n---\n*此消息由 MedAgent Hub 自动发送*"
    cdn_url = upload_image(image_path)
    if cdn_url:
        desp = f"![日报]({cdn_url})\n\n{desp}"
    try:
        resp = requests.post(
            f"https://sctapi.ftqq.com/{SENDKEY}.send",
            data={"title": title, "desp": desp},
            timeout=15
        )
        if resp.status_code == 200:
            log("✅ 微信推送成功")
        else:
            log(f"❌ 微信推送失败: {resp.status_code}")
    except Exception as e:
        log(f"❌ 微信推送异常: {e}")

# ===== 主流程 =====
def main():
    log(f"===== 开始生成 {TODAY} 医美行业日报 =====")

    # 读取 API Key
    env_file = "/home/ubuntu/medagent-hub/.env"
    if os.path.exists(env_file):
        with open(env_file) as f:
            for line in f:
                line = line.strip()
                if "=" in line and not line.startswith("#"):
                    k, v = line.split("=", 1)
                    os.environ[k.strip()] = v.strip().strip('"').strip("'")
        global SILICONFLOW_API_KEY, BOCHA_API_KEY
        SILICONFLOW_API_KEY = os.environ.get("SILICONFLOW_API_KEY", SILICONFLOW_API_KEY)
        BOCHA_API_KEY = os.environ.get("BOCHA_API_KEY", BOCHA_API_KEY)

    # 1. 搜索新闻
    news = search_news()

    # 2. AI 生成完整日报内容
    full_brief = generate_full_brief(news)

    # 3. 更新 daily-brief.json（供网页展示）
    update_brief_json(full_brief)

    # 4. 生成海报图片
    poster_content = generate_poster_content(full_brief)
    image_path = generate_image(poster_content)

    # 5. 推送到微信
    push_to_wechat(image_path)

    log("===== 日报生成完成 =====")

if __name__ == "__main__":
    main()
