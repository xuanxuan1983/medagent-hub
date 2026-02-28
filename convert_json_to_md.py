import json
import os

# 引导性问题模板（各角色定制化）
GUIDE_TEMPLATES = {
    "anatomy-architect": """
---
- 您希望我重点分析面部的哪个层次结构（骨骼支撑、韧带系统还是软组织分布）？
- 您目前关注的是哪个区域的改善方案（上面部、中面部还是下面部）？
- 您对注射安全禁区和高风险解剖位置有哪些具体的疑问？
""",
    "materials-mentor": """
---
- 您想深入了解哪种材料的分子结构和交联机制（HA、PLLA、PCL还是其他）？
- 您在临床中遇到了哪些让您困惑的材料营销说法，需要我来帮您还原真相？
- 您希望我从哪个维度进行PACER拆解（产品机理、临床证据还是安全边界）？
""",
    "visual-translator": """
---
- 您需要将哪种产品的作用机理转化为视觉画面（填充类、溶脂类还是紧致提升类）？
- 您的目标受众是设计师、患者教育还是学术展示，这会影响视觉风格的选择？
- 您希望画面侧重展示"治疗前后对比"还是"分子级作用过程"？
""",
    "operations-director": """
---
- 您目前最迫切需要优化的是哪个模块（SFE效能、财务风控还是采购成本）？
- 您的销售团队规模和区域分布是怎样的，这将影响SIP激励方案的设计？
- 您希望我从数据分析角度切入，还是从制度设计角度来解决当前的运营痛点？
""",
}

# 参考现有文件的 OutputFormat 格式
OUTPUT_FORMAT_TEMPLATE = """
## OutputFormat:
- **引导性问题**：每次回复的最后，都必须另起一行，以 `---` 分隔，然后提供三个相关的、能够激发用户继续思考和提问的引导性问题。每个问题都应该简洁、开放，并以 `-` 开头。例如：
  ```
  ---
  - 您想了解这个产品的具体作用机制吗？
  - 您需要我提供相关的临床研究数据或文献支持吗？
  - 您对这个产品与其他治疗方案的联合应用感兴趣吗？
  ```
请使用 Markdown 格式输出。
"""

files = [
    ("anatomy-architect.json", "anatomy-architect.md"),
    ("materials-mentor.json", "materials-mentor.md"),
    ("visual-translator.json", "visual-translator.md"),
    ("operations-director.json", "operations-director.md"),
]

for json_file, md_file in files:
    json_path = f"/home/ubuntu/upload/{json_file}"
    md_path = f"/home/ubuntu/medagent-hub/skills/{md_file}"

    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    agent_id = data.get("id", "")
    name = data.get("name", "")
    name_en = data.get("nameEn", "")
    description = data.get("description", "")
    system_prompt = data.get("systemPrompt", "")
    prompt = data.get("prompt", "")
    capabilities = data.get("capabilities", [])
    tags = data.get("tags", [])
    version = data.get("version", "1.0.0")

    # 构建 Markdown 内容
    md_content = f"""# {name} ({name_en})

**描述**: {description}

**版本**: {version}

---

## Role:
{system_prompt}

## Background:
{prompt}

## Capabilities:
{chr(10).join(f'- {cap}' for cap in capabilities) if capabilities else '- 专业领域深度分析与建议'}

## Tags:
{chr(10).join(f'- {tag}' for tag in tags) if tags else '- 医美'}

{OUTPUT_FORMAT_TEMPLATE}
"""

    with open(md_path, "w", encoding="utf-8") as f:
        f.write(md_content)

    print(f"[OK] 已生成: {md_file}")
    # 验证
    with open(md_path, "r") as f:
        content = f.read()
    has_guide = "引导性" in content
    print(f"     引导性问题: {'已包含' if has_guide else '缺失！'}")

print("\n全部转换完成。")
