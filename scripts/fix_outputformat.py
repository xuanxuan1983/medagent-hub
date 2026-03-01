#!/usr/bin/env python3
"""
批量修复所有 skill 文件中 OutputFormat 的引导问题指令
1. 将 **模拟用户口吻，每个问题必须以"我"开头** 改为纯文字
2. 将引导问题示例中的 `xxx` 反引号去掉
3. 在引导问题指令中加入"绝对不能包含任何 Markdown 格式符号"的警告
"""
import os
import re

SKILLS_DIR = os.path.join(os.path.dirname(__file__), '..', 'skills')

# 旧的 OutputFormat 引导问题指令（多种变体）
OLD_PATTERNS = [
    # 带 ** 的版本（大多数文件）
    r'- \*\*引导性问题\*\*：每次回复的最后，都必须另起一行，以 `---` 分隔，然后提供三个引导性问题，\*\*模拟用户口吻，每个问题必须以"我"开头\*\*，简洁、开放，并以 `-` 开头。例如：',
    # 不带 ** 的版本
    r'- 引导性问题：每次回复的最后，都必须另起一行，以 `---` 分隔，然后提供三个引导性问题，模拟用户口吻，每个问题必须以"我"开头，简洁、开放，并以 `-` 开头。例如：',
]

NEW_INSTRUCTION = '- 引导性问题：每次回复的最后，都必须另起一行，以 --- 分隔，然后提供三个引导性问题，模拟用户口吻，每个问题必须以"我"开头，简洁、开放，并以 - 开头。极其重要：--- 分隔线后的三个引导问题绝对不能包含任何 Markdown 格式符号（** * # ` _ 等），必须是纯文字，因为前端会直接作为按钮文字显示。例如：'

fixed_files = []
skipped_files = []

for filename in sorted(os.listdir(SKILLS_DIR)):
    if not filename.endswith('.md'):
        continue
    filepath = os.path.join(SKILLS_DIR, filename)
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    original = content
    changed = False
    
    # 1. 替换 OutputFormat 引导问题指令
    for pattern in OLD_PATTERNS:
        new_content = re.sub(pattern, NEW_INSTRUCTION, content)
        if new_content != content:
            content = new_content
            changed = True
            break
    
    # 2. 修复引导问题示例中的反引号（在 ``` 代码块内的示例问题里）
    # 找到 --- 后面的示例问题行，去掉 `xxx` 格式
    def fix_example_questions(m):
        block = m.group(0)
        # 在示例问题行（以 - 开头）中去掉反引号
        def fix_line(lm):
            line = lm.group(0)
            # 去掉反引号包裹的内容的反引号（保留内容）
            return re.sub(r'`([^`]+)`', r'\1', line)
        return re.sub(r'^- .+$', fix_line, block, flags=re.MULTILINE)
    
    # 处理代码块中的示例
    new_content = re.sub(r'```\n---\n(?:- .+\n)+```', fix_example_questions, content)
    if new_content != content:
        content = new_content
        changed = True
    
    if changed:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        fixed_files.append(filename)
        print(f'✅ 已修复: {filename}')
    else:
        skipped_files.append(filename)
        print(f'⏭️  跳过（无需修改）: {filename}')

print(f'\n共修复 {len(fixed_files)} 个文件，跳过 {len(skipped_files)} 个文件')
print('修复的文件:', fixed_files)
