#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""MedAgent Hub 对话数据分析脚本"""

import pandas as pd
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.font_manager as fm
import numpy as np
import warnings
warnings.filterwarnings('ignore')
import os

# 设置中文字体
plt.rcParams['font.family'] = ['Noto Sans CJK SC', 'WenQuanYi Micro Hei', 'SimHei', 'DejaVu Sans']
plt.rcParams['axes.unicode_minus'] = False

OUTPUT_DIR = '/home/ubuntu/medagent-hub/analysis'
os.makedirs(OUTPUT_DIR, exist_ok=True)

# ========== 读取数据 ==========
xl = pd.ExcelFile('/home/ubuntu/upload/MedAgent-数据导出-2026-02-28.xlsx')
df_conv = pd.read_excel(xl, sheet_name='对话记录')
df_user = pd.read_excel(xl, sheet_name='用户列表')

# 基础清洗
df_conv['时间'] = pd.to_datetime(df_conv['时间'])
df_conv['提问长度'] = df_conv['用户提问'].fillna('').apply(len)
df_conv['回复长度'] = df_conv['Agent 回复'].fillna('').apply(len)

print("=" * 60)
print("MedAgent Hub 对话数据分析报告")
print("=" * 60)

# ========== 用户概况 ==========
print("\n【用户概况】")
print(f"注册用户总数: {len(df_user)}")
active = df_user[df_user['已使用次数'] > 0]
print(f"活跃用户数（至少使用1次）: {len(active)}")
print(f"活跃率: {len(active)/len(df_user)*100:.1f}%")
print(f"上限1次用户: {len(df_user[df_user['上限次数']==1])}")
print(f"上限10次用户: {len(df_user[df_user['上限次数']==10])}")

# 使用次数分布
usage_dist = df_user['已使用次数'].value_counts().sort_index()
print(f"\n使用次数分布:")
for k, v in usage_dist.items():
    print(f"  使用{k}次: {v}人")

# ========== 对话概况 ==========
print("\n【对话概况】")
print(f"总对话条数: {len(df_conv)}")
print(f"时间范围: {df_conv['时间'].min()} ~ {df_conv['时间'].max()}")
print(f"平均提问长度: {df_conv['提问长度'].mean():.1f} 字符")
print(f"平均回复长度: {df_conv['回复长度'].mean():.1f} 字符")

# ========== 用户分布 ==========
print("\n【对话用户分布】")
user_dist = df_conv['用户邀请码'].value_counts()
print(user_dist.to_string())

# ========== 提问主题分类 ==========
questions = df_conv['用户提问'].fillna('').tolist()

# 手动分类
categories = {
    '产品知识咨询': [],
    '话术与转化技巧': [],
    '功能探索/测试': [],
    '客户异议处理': [],
    '内容创作需求': [],
    '价格/机构咨询': [],
    '其他/打招呼': [],
}

for i, q in enumerate(questions):
    q_lower = q.lower()
    if any(k in q for k in ['胶原蛋白', '玻尿酸', '肉毒', '黄金微针', '射频', '超声', '水光', '斑', '黑眼圈', '区别', '特点', '优势', '文献', '原理', '条件']):
        categories['产品知识咨询'].append(q)
    elif any(k in q for k in ['话术', '转化', '引导', '路径', 'SOP', 'sop', '开单', '如何做好', '如何有效', 'KOL']):
        categories['话术与转化技巧'].append(q)
    elif any(k in q for k in ['你会做', '你有哪些', '功能', '你能帮', '你的对象', '你可以解决', '我应该怎么向你']):
        categories['功能探索/测试'].append(q)
    elif any(k in q for k in ['太贵', '便宜', '考虑', '商量', '没效果', '依赖', '老得更快', '怕疼', '反黑', '留疤', '馒化']):
        categories['客户异议处理'].append(q)
    elif any(k in q for k in ['写', '口播', '生成', '画']):
        categories['内容创作需求'].append(q)
    elif any(k in q for k in ['报价', '多少钱', '新闻', '中妍', '医生']):
        categories['价格/机构咨询'].append(q)
    else:
        categories['其他/打招呼'].append(q)

print("\n【提问主题分类】")
for cat, qs in categories.items():
    print(f"  {cat}: {len(qs)}条")
    for q in qs[:3]:
        print(f"    - {q[:60]}")

# ========== 问题质量分析 ==========
print("\n【提问质量分析】")
short_q = df_conv[df_conv['提问长度'] <= 5]
medium_q = df_conv[(df_conv['提问长度'] > 5) & (df_conv['提问长度'] <= 20)]
long_q = df_conv[df_conv['提问长度'] > 20]
print(f"极短提问（≤5字，如'你好'）: {len(short_q)}条 ({len(short_q)/len(df_conv)*100:.1f}%)")
print(f"中等提问（6-20字）: {len(medium_q)}条 ({len(medium_q)/len(df_conv)*100:.1f}%)")
print(f"详细提问（>20字）: {len(long_q)}条 ({len(long_q)/len(df_conv)*100:.1f}%)")

# 注意：Agent 列全为 NaN，说明后台未记录 Agent 信息
print(f"\n注意: Agent 列全为空值，后台未记录具体 Agent 信息")

# ========== 可视化 ==========

# 图1：用户活跃度分布
fig, axes = plt.subplots(2, 2, figsize=(14, 10))
fig.suptitle('MedAgent Hub 用户对话数据分析', fontsize=16, fontweight='bold', y=0.98)

# 子图1：使用次数分布
ax1 = axes[0, 0]
usage_data = df_user['已使用次数'].value_counts().sort_index()
colors = ['#E8715A' if k > 0 else '#E8E5E0' for k in usage_data.index]
bars = ax1.bar(usage_data.index.astype(str), usage_data.values, color=colors, edgecolor='white', linewidth=1.5)
ax1.set_title('用户使用次数分布', fontweight='bold', pad=10)
ax1.set_xlabel('已使用次数')
ax1.set_ylabel('用户人数')
for bar, val in zip(bars, usage_data.values):
    ax1.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 0.3, str(val),
             ha='center', va='bottom', fontsize=10, fontweight='bold')
ax1.set_facecolor('#FAF8F5')
ax1.spines['top'].set_visible(False)
ax1.spines['right'].set_visible(False)

# 子图2：提问主题分布
ax2 = axes[0, 1]
cat_counts = {k: len(v) for k, v in categories.items() if len(v) > 0}
cat_labels = list(cat_counts.keys())
cat_values = list(cat_counts.values())
colors_pie = ['#E8715A', '#F4A261', '#2A9D8F', '#264653', '#E9C46A', '#A8DADC', '#457B9D']
wedges, texts, autotexts = ax2.pie(cat_values, labels=cat_labels, autopct='%1.0f%%',
                                    colors=colors_pie[:len(cat_labels)],
                                    startangle=90, pctdistance=0.8)
for text in texts:
    text.set_fontsize(8)
for autotext in autotexts:
    autotext.set_fontsize(8)
    autotext.set_fontweight('bold')
ax2.set_title('用户提问主题分布', fontweight='bold', pad=10)

# 子图3：提问长度分布
ax3 = axes[1, 0]
q_lengths = df_conv['提问长度']
ax3.hist(q_lengths, bins=20, color='#2A9D8F', edgecolor='white', linewidth=1.2, alpha=0.85)
ax3.axvline(q_lengths.mean(), color='#E8715A', linestyle='--', linewidth=2, label=f'均值 {q_lengths.mean():.1f}字')
ax3.axvline(q_lengths.median(), color='#F4A261', linestyle='--', linewidth=2, label=f'中位数 {q_lengths.median():.0f}字')
ax3.set_title('用户提问长度分布', fontweight='bold', pad=10)
ax3.set_xlabel('提问字符数')
ax3.set_ylabel('频次')
ax3.legend(fontsize=9)
ax3.set_facecolor('#FAF8F5')
ax3.spines['top'].set_visible(False)
ax3.spines['right'].set_visible(False)

# 子图4：活跃用户对话量
ax4 = axes[1, 1]
user_conv = df_conv['用户邀请码'].value_counts().head(8)
bars4 = ax4.barh(user_conv.index[::-1], user_conv.values[::-1],
                  color=['#E8715A' if i == 0 else '#2A9D8F' for i in range(len(user_conv))],
                  edgecolor='white', linewidth=1.2)
ax4.set_title('各用户对话条数 Top 8', fontweight='bold', pad=10)
ax4.set_xlabel('对话条数')
for bar, val in zip(bars4, user_conv.values[::-1]):
    ax4.text(bar.get_width() + 0.3, bar.get_y() + bar.get_height()/2,
             str(val), ha='left', va='center', fontsize=10, fontweight='bold')
ax4.set_facecolor('#FAF8F5')
ax4.spines['top'].set_visible(False)
ax4.spines['right'].set_visible(False)

plt.tight_layout()
out_path = os.path.join(OUTPUT_DIR, 'conv_analysis_overview.png')
plt.savefig(out_path, dpi=150, bbox_inches='tight', facecolor='white')
plt.close()
print(f"\n图表已保存: {out_path}")

# ========== 图2：提问质量与 Agent 优化建议 ==========
fig2, axes2 = plt.subplots(1, 2, figsize=(14, 6))
fig2.suptitle('提问质量分析与优化建议', fontsize=14, fontweight='bold')

# 提问质量饼图
ax_q = axes2[0]
q_quality = {'极短提问\n(≤5字)': len(short_q), '中等提问\n(6-20字)': len(medium_q), '详细提问\n(>20字)': len(long_q)}
colors_q = ['#E8715A', '#F4A261', '#2A9D8F']
wedges, texts, autotexts = ax_q.pie(list(q_quality.values()), labels=list(q_quality.keys()),
                                     autopct='%1.1f%%', colors=colors_q, startangle=90,
                                     pctdistance=0.75, wedgeprops={'edgecolor': 'white', 'linewidth': 2})
for autotext in autotexts:
    autotext.set_fontweight('bold')
ax_q.set_title('提问质量分布', fontweight='bold', pad=10)

# 高频关键词分析
ax_kw = axes2[1]
all_text = ' '.join(df_conv['用户提问'].fillna('').tolist())
keywords = {
    '胶原蛋白': all_text.count('胶原蛋白'),
    '黄金微针': all_text.count('黄金微针'),
    '玻尿酸': all_text.count('玻尿酸'),
    '话术': all_text.count('话术'),
    '功能': all_text.count('功能'),
    '肉毒': all_text.count('肉毒'),
    '射频': all_text.count('射频'),
    '价格': all_text.count('价格') + all_text.count('多少钱') + all_text.count('报价'),
    '转化': all_text.count('转化'),
    '斑': all_text.count('斑'),
}
keywords = {k: v for k, v in sorted(keywords.items(), key=lambda x: x[1], reverse=True) if v > 0}
kw_colors = ['#E8715A' if i < 3 else '#2A9D8F' for i in range(len(keywords))]
bars_kw = ax_kw.barh(list(keywords.keys())[::-1], list(keywords.values())[::-1],
                      color=kw_colors[::-1], edgecolor='white', linewidth=1.2)
ax_kw.set_title('用户提问高频关键词', fontweight='bold', pad=10)
ax_kw.set_xlabel('出现次数')
for bar, val in zip(bars_kw, list(keywords.values())[::-1]):
    ax_kw.text(bar.get_width() + 0.1, bar.get_y() + bar.get_height()/2,
               str(val), ha='left', va='center', fontsize=10, fontweight='bold')
ax_kw.set_facecolor('#FAF8F5')
ax_kw.spines['top'].set_visible(False)
ax_kw.spines['right'].set_visible(False)

plt.tight_layout()
out_path2 = os.path.join(OUTPUT_DIR, 'conv_analysis_quality.png')
plt.savefig(out_path2, dpi=150, bbox_inches='tight', facecolor='white')
plt.close()
print(f"图表已保存: {out_path2}")

print("\n分析完成！")
