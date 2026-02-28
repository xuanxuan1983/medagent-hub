#!/usr/bin/env python3
"""
MedAgent Hub 每周部署状态自动检查脚本
检查 GitHub 远程仓库与腾讯云服务器的同步状态，并通过 Gmail 发送报告。
"""

import subprocess
import requests
import json
import os
import sys
from datetime import datetime

# ─── 配置 ────────────────────────────────────────────────────────────────────
REPO_DIR = "/home/ubuntu/medagent-hub"
SITE_URL = "https://medagent.filldmy.com"
HEALTH_URL = f"{SITE_URL}/health"
SKILLS_DIR = os.path.join(REPO_DIR, "skills")
REPORT_PATH = "/home/ubuntu/medagent-hub/analysis/weekly_deploy_report.md"

# ─── 工具函数 ─────────────────────────────────────────────────────────────────
def run(cmd, cwd=None):
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True, cwd=cwd)
    return result.stdout.strip(), result.stderr.strip(), result.returncode

def check_icon(ok):
    return "✅" if ok else "❌"

# ─── 检查项 ───────────────────────────────────────────────────────────────────
report = []
issues = []
now = datetime.now().strftime("%Y-%m-%d %H:%M")

report.append(f"# MedAgent Hub 每周部署状态检查报告")
report.append(f"\n**检查时间：** {now}\n")

# 1. GitHub 远程仓库最新提交
report.append("## 1. GitHub 远程仓库状态")
stdout, _, rc = run("git fetch origin && git log --oneline origin/master -3", cwd=REPO_DIR)
if rc == 0:
    report.append(f"\n{check_icon(True)} 远程仓库连接正常，最新提交记录：\n```\n{stdout}\n```")
    github_head = stdout.split("\n")[0].split(" ")[0] if stdout else "unknown"
else:
    report.append(f"\n{check_icon(False)} 无法连接 GitHub 远程仓库")
    issues.append("GitHub 远程仓库连接失败")
    github_head = "unknown"

# 2. 本地与远程是否同步
report.append("\n## 2. 本地与 GitHub 同步状态")
stdout, _, rc = run("git log --oneline master -1", cwd=REPO_DIR)
local_head = stdout.split(" ")[0] if stdout else "unknown"
if local_head == github_head:
    report.append(f"\n{check_icon(True)} 本地与 GitHub 完全同步（HEAD: `{local_head}`）")
else:
    report.append(f"\n{check_icon(False)} 本地与 GitHub 不同步\n  - 本地 HEAD: `{local_head}`\n  - 远程 HEAD: `{github_head}`")
    issues.append(f"本地与 GitHub 不同步（本地: {local_head}，远程: {github_head}）")

# 3. 技能文件引导性问题覆盖率
report.append("\n## 3. 技能文件引导性问题覆盖率")
skill_files = [f for f in os.listdir(SKILLS_DIR) if f.endswith(".md") and f not in ["README.md", "medaesthetic-hub.md"]]
total = len(skill_files)
ok_count = 0
missing = []
for f in sorted(skill_files):
    path = os.path.join(SKILLS_DIR, f)
    with open(path, "r", encoding="utf-8") as fp:
        content = fp.read()
    if "引导性" in content:
        ok_count += 1
    else:
        missing.append(f)

coverage = ok_count / total * 100 if total > 0 else 0
report.append(f"\n{check_icon(len(missing) == 0)} 覆盖率：{ok_count}/{total}（{coverage:.0f}%）")
if missing:
    report.append(f"\n  缺失引导性问题的文件：")
    for f in missing:
        report.append(f"  - `{f}`")
    issues.append(f"以下技能文件缺失引导性问题：{', '.join(missing)}")

# 4. 腾讯云服务器在线状态
report.append("\n## 4. 腾讯云服务器在线状态")
try:
    resp = requests.get(HEALTH_URL, timeout=10)
    if resp.status_code == 200:
        data = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
        report.append(f"\n{check_icon(True)} 服务器在线，HTTP {resp.status_code}")
        if data:
            report.append(f"  响应：`{json.dumps(data, ensure_ascii=False)}`")
    else:
        report.append(f"\n{check_icon(False)} 服务器返回异常状态码：HTTP {resp.status_code}")
        issues.append(f"服务器 /health 返回 HTTP {resp.status_code}")
except Exception as e:
    # 尝试访问主页
    try:
        resp2 = requests.get(SITE_URL, timeout=10)
        if resp2.status_code == 200:
            report.append(f"\n{check_icon(True)} 服务器在线（主页可访问，HTTP {resp2.status_code}）")
        else:
            report.append(f"\n{check_icon(False)} 服务器异常：HTTP {resp2.status_code}")
            issues.append(f"服务器主页返回 HTTP {resp2.status_code}")
    except Exception as e2:
        report.append(f"\n{check_icon(False)} 服务器无法访问：{str(e2)}")
        issues.append(f"服务器无法访问：{str(e2)}")

# 5. 未提交的本地修改
report.append("\n## 5. 未提交的本地修改")
stdout, _, _ = run("git status --short skills/", cwd=REPO_DIR)
if not stdout:
    report.append(f"\n{check_icon(True)} 技能文件目录无未提交修改，与 GitHub 完全一致")
else:
    report.append(f"\n{check_icon(False)} 发现未提交的修改：\n```\n{stdout}\n```")
    issues.append("技能文件目录存在未提交的本地修改")

# ─── 总结 ─────────────────────────────────────────────────────────────────────
report.append("\n## 总结")
if not issues:
    report.append(f"\n{check_icon(True)} **全部检查通过，GitHub 与腾讯云服务器部署状态完全一致，无任何异常。**")
    status_line = "✅ 全部正常"
else:
    report.append(f"\n{check_icon(False)} **发现 {len(issues)} 个问题，需要关注：**")
    for i, issue in enumerate(issues, 1):
        report.append(f"\n{i}. {issue}")
    status_line = f"⚠️ 发现 {len(issues)} 个问题"

report.append(f"\n\n---\n*本报告由 MedAgent Hub 自动检查脚本生成，检查时间：{now}*")

# ─── 保存报告 ─────────────────────────────────────────────────────────────────
report_content = "\n".join(report)
os.makedirs(os.path.dirname(REPORT_PATH), exist_ok=True)
with open(REPORT_PATH, "w", encoding="utf-8") as f:
    f.write(report_content)

print(report_content)
print(f"\n报告已保存至：{REPORT_PATH}")
print(f"状态：{status_line}")
print(f"ISSUES_COUNT:{len(issues)}")
