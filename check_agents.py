import os

agents = [
    ("senior-consultant", "senior-consultant.md", "金牌医美咨询师"),
    ("post-op-guardian", "postop-specialist.md", "医美术后私域管家"),
    ("aesthetic-design", "aesthetic-designer.md", "高定美学设计总监"),
    ("anatomy-architect", None, "医美解剖决策建筑师"),
    ("sparring-robot", "sparring-partner.md", "医美实战陪练机器人"),
    ("materials-mentor", None, "医美材料学硬核导师"),
    ("material-architect", "material-architect.md", "医美材料学架构师"),
    ("training-director", "sfe-director.md", "培训赋能总监"),
    ("trend-setter", "new-media-director.md", "医美爆款种草官"),
    ("visual-translator", None, "医美视觉通译官"),
    ("marketing-director", "marketing-director.md", "市场创意总监"),
    ("area-manager", "area-manager.md", "大区经理"),
    ("channel-manager", "channel-manager.md", "商务经理"),
    ("finance-bp", "finance-bp.md", "财务BP"),
    ("hrbp", "hrbp.md", "战略HRBP"),
    ("procurement-manager", "procurement-manager.md", "采购经理"),
    ("operations-director", None, "运营效能总监"),
    ("gtm-strategy", "gtm-strategist.md", "GTM战略大师"),
    ("product-expert", "product-strategist.md", "产品材料专家"),
    ("academic-liaison", "medical-liaison.md", "学术推广专家"),
    ("sales-director", "sales-director.md", "销售作战总监"),
]

print("=" * 80)
print("MedAgent Hub - 21 个 Agent 引导性问题配置状态盘点")
print("=" * 80)

has_guide = 0
no_file = 0
missing_guide = 0

for agent_id, filename, name in agents:
    if filename is None:
        status = "NO FILE"
        no_file += 1
        print(f"  [{status:>10}] {name} ({agent_id})")
    else:
        path = os.path.join("skills", filename)
        if os.path.exists(path):
            with open(path, "r") as f:
                content = f.read()
            if "引导性" in content:
                status = "OK"
                has_guide += 1
                print(f"  [{status:>10}] {name} ({agent_id}) -> {filename}")
            else:
                status = "MISSING"
                missing_guide += 1
                print(f"  [{status:>10}] {name} ({agent_id}) -> {filename}")
        else:
            status = "NOT FOUND"
            no_file += 1
            print(f"  [{status:>10}] {name} ({agent_id}) -> {filename}")

print()
print(f"总计: {len(agents)} 个 Agent")
print(f"  - 已有引导性问题: {has_guide} 个")
print(f"  - 无对应技能文件: {no_file} 个 (anatomy-architect, materials-mentor, visual-translator, operations-director)")
print(f"  - 有文件但缺失引导性问题: {missing_guide} 个")
print()

# 检查 Git 状态
print("=" * 80)
print("Git 同步状态检查")
print("=" * 80)
import subprocess
result = subprocess.run(["git", "status", "--short", "skills/"], capture_output=True, text=True)
if result.stdout.strip():
    print("以下文件有本地修改但未推送到 GitHub:")
    for line in result.stdout.strip().split("\n"):
        print(f"  {line}")
else:
    print("所有文件已同步到 GitHub")
