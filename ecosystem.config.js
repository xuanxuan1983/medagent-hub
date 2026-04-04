module.exports = {
  apps: [{
    name: 'api-server',
    script: 'api-server.js',
    env: {
      AI_PROVIDER: 'deepseek',
      DEEPSEEK_API_KEY: 'sk-acefd31feeab4dc5ac2a81d20fbfdd5e',
      DEEPSEEK_BASE_URL: 'https://api.deepseek.com/v1',
      DEEPSEEK_MODEL: 'deepseek-chat',
      SILICONFLOW_API_KEY: 'sk-ofsefwdlyhehonvqdeyupmctskzurehbfasdiflhapyvguem',
      OPENROUTER_API_KEY: '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',
      ADMIN_CODE: 'admin2026',
      MAX_USES_PER_CODE: '10',
      BOCHA_API_KEY: '',
      WECHAT_APP_ID: 'wx10951656e9a582db',
      WECHAT_MCH_ID: '1684977594',
      WECHAT_API_V3_KEY: '1275734831Chenxuanyiwoyeaiwoziji',
      WECHAT_SERIAL_NO: '533210899CACFD42880A21CB9358BDCF3EE3785B',
      WECHAT_NOTIFY_URL: 'https://medagent.filldmy.com/api/payment/notify',
      GEMINI_API_KEY: '',
      NOTION_API_KEY: '',
      NOTION_DATABASE_IDS: ''
    }
  }]
}
