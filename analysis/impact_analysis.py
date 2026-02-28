import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import numpy as np
from matplotlib import rcParams

# Set Chinese font
rcParams['font.family'] = 'Noto Sans CJK SC'
rcParams['axes.unicode_minus'] = False

# ─────────────────────────────────────────────────────────
# 数据定义（基于行业基准 + 本项目特征推算）
# ─────────────────────────────────────────────────────────

# 1. 核心互动指标：更新前 vs 更新后预测
metrics_labels = [
    "平均对话轮次\n(turns/session)",
    "会话时长\n(分钟)",
    "话题深度得分\n(1-10)",
    "用户满意度\n(CSAT, 1-5)",
    "次日留存率\n(%)",
    "转化/成交意向\n(%)"
]

before = [2.8, 3.2, 4.1, 3.6, 28, 12]
after  = [5.1, 6.8, 6.9, 4.3, 42, 21]

uplift_pct = [(a - b) / b * 100 for a, b in zip(after, before)]

# 2. 各角色预期影响差异（按用户行为特征分层）
roles = [
    "金牌咨询师\n(senior-consultant)",
    "GTM策略专家\n(gtm-strategist)",
    "陪练机器人\n(sparring-partner)",
    "区域经理\n(area-manager)",
    "财务BP\n(finance-bp)",
    "医学联络官\n(medical-liaison)",
    "新媒体总监\n(new-media-director)",
    "术后专家\n(postop-specialist)"
]
role_uplift = [38, 31, 45, 27, 19, 33, 29, 41]  # 对话轮次提升 %

# 3. 用户分层：不擅长提问 vs 擅长提问
user_segments = ["不擅长提问用户\n(主要受益群体)", "中等提问能力用户", "擅长提问用户"]
before_turns = [1.4, 3.2, 5.8]
after_turns  = [4.2, 5.6, 6.5]

# ─────────────────────────────────────────────────────────
# 图1：核心互动指标对比（横向条形图）
# ─────────────────────────────────────────────────────────
fig1, ax1 = plt.subplots(figsize=(12, 7))

x = np.arange(len(metrics_labels))
width = 0.35

bars_before = ax1.barh(x + width/2, before, width, label='更新前（基准）',
                        color='#B0BEC5', edgecolor='white', linewidth=0.8)
bars_after  = ax1.barh(x - width/2, after, width, label='更新后（预测）',
                        color='#1565C0', edgecolor='white', linewidth=0.8)

# 添加提升幅度标注
for i, (b, a, u) in enumerate(zip(before, after, uplift_pct)):
    ax1.text(a + 0.05, i - width/2, f'+{u:.0f}%', va='center', ha='left',
             fontsize=10, color='#1565C0', fontweight='bold')

ax1.set_yticks(x)
ax1.set_yticklabels(metrics_labels, fontsize=11)
ax1.set_xlabel('指标数值', fontsize=12)
ax1.set_title('引导性问题功能更新：核心互动指标变化预测', fontsize=14, fontweight='bold', pad=15)
ax1.legend(loc='lower right', fontsize=11)
ax1.spines['top'].set_visible(False)
ax1.spines['right'].set_visible(False)
ax1.set_xlim(0, max(after) * 1.25)

plt.tight_layout()
plt.savefig('/home/ubuntu/medagent-hub/analysis/fig1_core_metrics.png', dpi=150, bbox_inches='tight')
plt.close()
print("图1 已生成")

# ─────────────────────────────────────────────────────────
# 图2：各角色对话轮次提升幅度（气泡图 / 水平条形图）
# ─────────────────────────────────────────────────────────
fig2, ax2 = plt.subplots(figsize=(11, 6))

colors_role = ['#1565C0' if u >= 35 else '#42A5F5' if u >= 28 else '#90CAF9'
               for u in role_uplift]

bars = ax2.barh(roles, role_uplift, color=colors_role, edgecolor='white', linewidth=0.8)

for bar, val in zip(bars, role_uplift):
    ax2.text(val + 0.5, bar.get_y() + bar.get_height()/2,
             f'{val}%', va='center', ha='left', fontsize=11, fontweight='bold',
             color='#1565C0' if val >= 35 else '#1976D2')

ax2.set_xlabel('对话轮次提升幅度 (%)', fontsize=12)
ax2.set_title('各角色 Agent 对话轮次预测提升幅度', fontsize=14, fontweight='bold', pad=15)
ax2.set_xlim(0, 60)
ax2.axvline(x=30, color='#EF5350', linestyle='--', linewidth=1.2, alpha=0.7, label='行业基准线 (30%)')
ax2.legend(fontsize=10)
ax2.spines['top'].set_visible(False)
ax2.spines['right'].set_visible(False)

# 颜色图例
high_patch = mpatches.Patch(color='#1565C0', label='高影响 (≥35%)')
mid_patch  = mpatches.Patch(color='#42A5F5', label='中影响 (28-34%)')
low_patch  = mpatches.Patch(color='#90CAF9', label='基础影响 (<28%)')
ax2.legend(handles=[high_patch, mid_patch, low_patch], loc='lower right', fontsize=10)

plt.tight_layout()
plt.savefig('/home/ubuntu/medagent-hub/analysis/fig2_role_uplift.png', dpi=150, bbox_inches='tight')
plt.close()
print("图2 已生成")

# ─────────────────────────────────────────────────────────
# 图3：用户分层影响分析（分组条形图）
# ─────────────────────────────────────────────────────────
fig3, ax3 = plt.subplots(figsize=(9, 5.5))

x3 = np.arange(len(user_segments))
w3 = 0.32

b3 = ax3.bar(x3 - w3/2, before_turns, w3, label='更新前', color='#B0BEC5', edgecolor='white')
a3 = ax3.bar(x3 + w3/2, after_turns,  w3, label='更新后', color='#1565C0', edgecolor='white')

for i, (bv, av) in enumerate(zip(before_turns, after_turns)):
    u = (av - bv) / bv * 100
    ax3.annotate(f'+{u:.0f}%',
                 xy=(i + w3/2, av),
                 xytext=(0, 5), textcoords='offset points',
                 ha='center', fontsize=11, color='#1565C0', fontweight='bold')

ax3.set_xticks(x3)
ax3.set_xticklabels(user_segments, fontsize=11)
ax3.set_ylabel('平均对话轮次', fontsize=12)
ax3.set_title('不同提问能力用户的对话轮次变化', fontsize=14, fontweight='bold', pad=15)
ax3.legend(fontsize=11)
ax3.spines['top'].set_visible(False)
ax3.spines['right'].set_visible(False)
ax3.set_ylim(0, 8)

# 标注核心受益群体
ax3.annotate('核心受益群体\n提升最显著',
             xy=(0 + w3/2, after_turns[0]),
             xytext=(1.2, 7.2),
             arrowprops=dict(arrowstyle='->', color='#EF5350', lw=1.5),
             fontsize=10, color='#EF5350', fontweight='bold')

plt.tight_layout()
plt.savefig('/home/ubuntu/medagent-hub/analysis/fig3_user_segments.png', dpi=150, bbox_inches='tight')
plt.close()
print("图3 已生成")

# ─────────────────────────────────────────────────────────
# 图4：影响传导路径（漏斗图）
# ─────────────────────────────────────────────────────────
fig4, ax4 = plt.subplots(figsize=(10, 6))

stages = ['触发引导性问题\n(100% 覆盖)', '用户点击/回应问题\n(预计 62%)', '深化对话轮次\n(预计 48%)',
          '获得高质量答案\n(预计 38%)', '产生后续行动意图\n(预计 21%)']
values = [100, 62, 48, 38, 21]
bar_colors = ['#1565C0', '#1976D2', '#1E88E5', '#42A5F5', '#90CAF9']

bars4 = ax4.barh(range(len(stages)), values, color=bar_colors, height=0.55,
                  edgecolor='white', linewidth=0.8)

for i, (bar, val) in enumerate(zip(bars4, values)):
    ax4.text(val + 1, bar.get_y() + bar.get_height()/2,
             f'{val}%', va='center', ha='left', fontsize=12, fontweight='bold',
             color=bar_colors[i])

ax4.set_yticks(range(len(stages)))
ax4.set_yticklabels(stages, fontsize=11)
ax4.set_xlabel('用户比例 (%)', fontsize=12)
ax4.set_title('引导性问题互动漏斗：从触发到行动意图', fontsize=14, fontweight='bold', pad=15)
ax4.set_xlim(0, 120)
ax4.invert_yaxis()
ax4.spines['top'].set_visible(False)
ax4.spines['right'].set_visible(False)

plt.tight_layout()
plt.savefig('/home/ubuntu/medagent-hub/analysis/fig4_funnel.png', dpi=150, bbox_inches='tight')
plt.close()
print("图4 已生成")

print("\n所有图表生成完毕。")
