// ecosystem.config.js 模板（含密钥，不提交到Git）
// 复制此文件为 ecosystem.config.js 并填入真实密钥
module.exports = {
  apps: [
    {
      name: 'api-server',
      script: '/home/ubuntu/medagent-hub/api-server.js',
      cwd: '/home/ubuntu/medagent-hub',
      env: {
        SKILL_KEY: 'YOUR_32_BYTE_HEX_KEY_HERE'
      }
    }
  ]
}
