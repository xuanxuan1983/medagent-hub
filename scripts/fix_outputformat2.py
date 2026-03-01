#!/usr/bin/env python3
"""
第二轮批量修复：处理 comic-creator, cover-image-creator, ppt-creator,
social-media-creator, wechat-content-creator, article-illustrator 等文件
这些文件的 OutputFormat 格式略有不同（没有 - 引导性问题: 前缀）
"""
import os
import re

SKILLS_DIR = os.path.join(os.path.dirname(__file__), '..', 'skills')

# 匹配这类格式：
# 每次回复结束后，必须另起一行，以 `---` 分隔，然后提供三个引导性问题，**模拟用户口吻，每个问题必须以"我"开头**，简洁、开放，并以 `-` 开头。例如：
OLD_PATTERN = r'每次回复结束后，必须另起一行，以 `---` 分隔，然后提供三个引导性问题，\*\*模拟用户口吻，每个问题必须以"我"开头\*\*，简洁、开放，并以 `-` 开头。例如：'

NEW_TEXT = '每次回复结束后，必须另起一行，以 --- 分隔，然后提供三个引导性问题，模拟用户口吻，每个问题必须以"我"开头，简洁、开放，并以 - 开头。极其重要：--- 分隔线后的三个引导问题绝对不能包含任何 Markdown 格式符号（** * # ` _ 等），必须是纯文字，因为前端会直接作为按钮文字显示。例如：'

fixed_files = []

for filename in sorted(os.listdir(SKILLS_DIR)):
    if not filename.endswith('.md'):
        continue
    filepath = os.path.join(SKILLS_DIR, filename)
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    new_content = re.sub(OLD_PATTERN, NEW_TEXT, content)
    if new_content != content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        fixed_files.append(filename)
        print(f'✅ 已修复: {filename}')

if not fixed_files:
    print('✅ 所有文件已是最新，无需修改')
else:
    print(f'\n共修复 {len(fixed_files)} 个文件: {fixed_files}')
