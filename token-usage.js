// ===== TOKEN USAGE VISUALIZATION v1.0 =====
// 显示当前用户的 Token 消耗统计

(function() {
  'use strict';

  // 显示用量面板
  window.showTokenUsage = function() {
    var overlay = document.createElement('div');
    overlay.className = 'token-usage-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:10000;display:flex;align-items:center;justify-content:center;';

    var dialog = document.createElement('div');
    dialog.className = 'token-usage-dialog';
    dialog.style.cssText = 'background:var(--bg,#fff);border-radius:12px;padding:1.5rem;width:520px;max-width:94vw;max-height:85vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.2);';

    dialog.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.25rem">' +
        '<div style="font-size:1rem;font-weight:600;color:var(--text,#191919)">用量统计</div>' +
        '<button onclick="this.closest(\'.token-usage-overlay\').remove()" style="background:none;border:none;cursor:pointer;color:var(--text-3,#767676);font-size:1.2rem;padding:4px">&times;</button>' +
      '</div>' +
      '<div id="tokenUsageContent" style="text-align:center;padding:2rem;color:var(--text-3,#767676)">加载中...</div>';

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };

    loadTokenUsage();
  };

  function loadTokenUsage() {
    fetch('/api/user/token-usage')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.error) {
          document.getElementById('tokenUsageContent').innerHTML = '<div style="color:#E8715A">' + data.error + '</div>';
          return;
        }
        renderTokenUsage(data);
      })
      .catch(function(e) {
        document.getElementById('tokenUsageContent').innerHTML = '<div style="color:#E8715A">加载失败: ' + e.message + '</div>';
      });
  }

  function renderTokenUsage(data) {
    var container = document.getElementById('tokenUsageContent');
    if (!container) return;

    var totalInput = data.totalInputTokens || 0;
    var totalOutput = data.totalOutputTokens || 0;
    var totalCost = data.totalCost || 0;
    var totalMessages = data.totalMessages || 0;
    var todayMessages = data.todayMessages || 0;
    var todayCost = data.todayCost || 0;

    // 概览卡片
    var html = '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:0.75rem;margin-bottom:1.25rem">';
    html += makeStatCard('今日消息', todayMessages, '条');
    html += makeStatCard('今日消耗', todayCost.toFixed(3), '元');
    html += makeStatCard('累计消息', totalMessages, '条');
    html += '</div>';

    html += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:0.75rem;margin-bottom:1.5rem">';
    html += makeStatCard('输入 Token', formatNumber(totalInput), '');
    html += makeStatCard('输出 Token', formatNumber(totalOutput), '');
    html += makeStatCard('累计消耗', totalCost.toFixed(3), '元');
    html += '</div>';

    // 按 Agent 统计
    if (data.byAgent && data.byAgent.length > 0) {
      html += '<div style="font-size:0.85rem;font-weight:600;color:var(--text,#191919);margin-bottom:0.5rem">按 Agent 统计</div>';
      html += '<div style="border:1px solid var(--border,#E8E5E0);border-radius:8px;overflow:hidden;margin-bottom:1.25rem">';
      html += '<table style="width:100%;border-collapse:collapse;font-size:0.8rem">';
      html += '<thead><tr style="background:var(--bg-warm,#FAF8F5)">';
      html += '<th style="padding:8px 10px;text-align:left;color:var(--text-2,#5a5a5a);font-weight:500">Agent</th>';
      html += '<th style="padding:8px 10px;text-align:right;color:var(--text-2,#5a5a5a);font-weight:500">消息数</th>';
      html += '<th style="padding:8px 10px;text-align:right;color:var(--text-2,#5a5a5a);font-weight:500">消耗</th>';
      html += '</tr></thead><tbody>';

      var maxCount = data.byAgent[0].count || 1;
      data.byAgent.forEach(function(item) {
        var pct = Math.round((item.count / maxCount) * 100);
        html += '<tr style="border-top:1px solid var(--border,#E8E5E0)">';
        html += '<td style="padding:8px 10px"><div style="font-weight:500;color:var(--text,#191919)">' + escapeH(item.agentId || '未知') + '</div>' +
          '<div style="height:3px;background:var(--border,#E8E5E0);border-radius:2px;margin-top:4px"><div style="height:100%;width:' + pct + '%;background:var(--coral,#E8715A);border-radius:2px"></div></div></td>';
        html += '<td style="padding:8px 10px;text-align:right;color:var(--text-2,#5a5a5a)">' + item.count + '</td>';
        html += '<td style="padding:8px 10px;text-align:right;color:var(--text-2,#5a5a5a)">' + (item.cost || 0).toFixed(3) + ' 元</td>';
        html += '</tr>';
      });
      html += '</tbody></table></div>';
    }

    // 最近 7 天趋势
    if (data.daily && data.daily.length > 0) {
      html += '<div style="font-size:0.85rem;font-weight:600;color:var(--text,#191919);margin-bottom:0.5rem">最近 7 天趋势</div>';
      html += renderDailyChart(data.daily);
    }

    // API 类型分布
    if (data.byType && data.byType.length > 0) {
      html += '<div style="font-size:0.85rem;font-weight:600;color:var(--text,#191919);margin-bottom:0.5rem;margin-top:1rem">调用类型分布</div>';
      html += '<div style="display:flex;flex-wrap:wrap;gap:0.5rem;margin-bottom:0.5rem">';
      var typeLabels = { chat: '对话', chat_with_search: '联网搜索', web_search: '网页搜索', image_gen: '图片生成', snapshot: '技能提炼' };
      var typeColors = { chat: '#E8715A', chat_with_search: '#4A90D9', web_search: '#22c55e', image_gen: '#A855F7', snapshot: '#F59E0B' };
      data.byType.forEach(function(item) {
        var label = typeLabels[item.apiType] || item.apiType;
        var color = typeColors[item.apiType] || '#767676';
        html += '<div style="padding:6px 12px;border-radius:6px;background:' + color + '15;border:1px solid ' + color + '30;font-size:0.75rem">' +
          '<span style="color:' + color + ';font-weight:500">' + label + '</span>' +
          '<span style="color:var(--text-2,#5a5a5a);margin-left:6px">' + item.count + ' 次</span></div>';
      });
      html += '</div>';
    }

    container.innerHTML = html;
  }

  function makeStatCard(label, value, unit) {
    return '<div style="padding:0.75rem;border-radius:8px;background:var(--bg-warm,#FAF8F5);border:1px solid var(--border,#E8E5E0);text-align:center">' +
      '<div style="font-size:1.1rem;font-weight:700;color:var(--text,#191919)">' + value + '<span style="font-size:0.7rem;font-weight:400;color:var(--text-3,#767676);margin-left:2px">' + unit + '</span></div>' +
      '<div style="font-size:0.7rem;color:var(--text-3,#767676);margin-top:2px">' + label + '</div>' +
    '</div>';
  }

  function renderDailyChart(daily) {
    var maxMsg = 1;
    daily.forEach(function(d) { if (d.messages > maxMsg) maxMsg = d.messages; });

    var html = '<div style="display:flex;align-items:flex-end;gap:4px;height:80px;padding:0 4px;margin-bottom:0.25rem">';
    daily.forEach(function(d) {
      var h = Math.max(4, Math.round((d.messages / maxMsg) * 70));
      var day = d.date.substring(5); // MM-DD
      html += '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px">' +
        '<div style="font-size:0.65rem;color:var(--text-3,#767676)">' + d.messages + '</div>' +
        '<div style="width:100%;height:' + h + 'px;background:var(--coral,#E8715A);border-radius:3px 3px 0 0;opacity:0.8"></div>' +
      '</div>';
    });
    html += '</div>';
    html += '<div style="display:flex;gap:4px;padding:0 4px">';
    daily.forEach(function(d) {
      html += '<div style="flex:1;text-align:center;font-size:0.6rem;color:var(--text-3,#767676)">' + d.date.substring(5) + '</div>';
    });
    html += '</div>';
    return '<div style="border:1px solid var(--border,#E8E5E0);border-radius:8px;padding:0.75rem;margin-bottom:1rem">' + html + '</div>';
  }

  function formatNumber(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return String(n);
  }

  function escapeH(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
})();
