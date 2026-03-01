#!/usr/bin/env node
/**
 * 批量向量化文献文件脚本
 * 用法: node scripts/vectorize-docs.js
 */
'use strict';

const path = require('path');
const fs = require('fs');

// 设置环境变量（从 ecosystem.config.js 读取）
const ecosystemPath = path.join(__dirname, '..', 'ecosystem.config.js');
if (fs.existsSync(ecosystemPath)) {
  try {
    const eco = require(ecosystemPath);
    const env = eco.apps?.[0]?.env || {};
    Object.entries(env).forEach(([k, v]) => {
      if (!process.env[k]) process.env[k] = v;
    });
  } catch (e) {
    console.warn('无法读取 ecosystem.config.js:', e.message);
  }
}

const kb = require('../knowledge-base');

const UPLOAD_DIR = '/home/ubuntu/upload';
const SF_KEY = process.env.SILICONFLOW_API_KEY;

if (!SF_KEY) {
  console.error('❌ 缺少 SILICONFLOW_API_KEY，请检查环境变量');
  process.exit(1);
}

// 要处理的文件列表（全部归入全局知识库）
const FILES = [
  '面部结构知识梳理.docx',
  'BiochemistryofCollagens,LamininsandElastin.Structure,FunctionandBiomarkers(MortenKarsdal)(Z-Library).pdf',
  'BiophysicalandChemicalPropertiesofCollagenBiomedicalApplicationsinTissueEngineering(JohnA.M.Ramshaw,VeronicaGlattauer)(Z-Library).pdf',
  'CollagenPrimerinStructure,ProcessingandAssembly(JürgenBrinckmann(auth.),JürgenBrinckmannetc.)(Z-Library).pdf',
  'CollagenStructureandMechanics(PeterFratzl,PeterFratzl)(Z-Library).pdf',
  'CollagenvolI,Biochemistry(Nimni,MarcelE)(Z-Library).pdf',
  'Collagen.VolumeII,Biochemistryandbiomechanics(Nimni,MarcelE)(Z-Library).pdf',
  'LinusPaulingHeartProtocolTherapyVitaminC,Lysine,Proline-CollagenLinusPaulingUnifiedTheoryofCardiovascular...(LinusPaulingPhD,MatthiasRath,HylaCassMDetc.)(Z-Library).pdf',
  'TheCollagenDietA28-DayPlanforSustainedWeightLoss,GlowingSkin,GreatGutHealth,andaYoungerYou(Dr.JoshAxe)(Z-Library).pdf',
];

async function main() {
  console.log(`\n🚀 开始批量向量化，共 ${FILES.length} 个文件`);
  console.log(`📁 文件目录: ${UPLOAD_DIR}`);
  console.log(`🔑 API Key: ${SF_KEY.slice(0, 10)}...`);
  console.log('─'.repeat(60));

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < FILES.length; i++) {
    const fileName = FILES[i];
    const filePath = path.join(UPLOAD_DIR, fileName);

    if (!fs.existsSync(filePath)) {
      console.log(`\n[${i+1}/${FILES.length}] ⚠️  文件不存在: ${fileName}`);
      failCount++;
      continue;
    }

    const stat = fs.statSync(filePath);
    console.log(`\n[${i+1}/${FILES.length}] 📄 ${fileName}`);
    console.log(`    大小: ${(stat.size / 1024 / 1024).toFixed(1)} MB`);

    const startTime = Date.now();
    try {
      const result = await kb.addDocument(filePath, 'global', SF_KEY, (progress) => {
        if (progress.step === 'parse') {
          process.stdout.write(`    解析文档...`);
        } else if (progress.step === 'chunk') {
          process.stdout.write(` ✓ (${(progress.textLen/1000).toFixed(0)}K字)\n    分块处理...`);
        } else if (progress.step === 'embed') {
          if (progress.done !== undefined) {
            process.stdout.write(`\r    向量化: ${progress.done}/${progress.total} 块 (${progress.progress}%)`);
          } else {
            process.stdout.write(` ✓ (${progress.chunks} 块)\n    向量化中...`);
          }
        } else if (progress.step === 'done') {
          process.stdout.write(`\r    向量化完成: ${progress.chunks} 块\n`);
        }
      });

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      console.log(`    ✅ 完成！${result.chunks} 个向量块，耗时 ${elapsed}s`);
      successCount++;
    } catch (e) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      console.log(`\n    ❌ 失败: ${e.message} (${elapsed}s)`);
      failCount++;
    }
  }

  console.log('\n' + '─'.repeat(60));
  console.log(`\n📊 处理完成:`);
  console.log(`   成功: ${successCount} 个文件`);
  console.log(`   失败: ${failCount} 个文件`);

  const stats = kb.getStats();
  console.log(`\n📈 知识库统计:`);
  console.log(`   总文件数: ${stats.totalFiles}`);
  console.log(`   全局向量块: ${stats.globalChunks}`);
  console.log('\n✨ 向量化完成！Agent 现在可以检索这些文献了。\n');
}

main().catch(e => {
  console.error('脚本执行失败:', e);
  process.exit(1);
});
