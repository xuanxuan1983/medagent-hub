/**
 * P5: 后台自主运行 - 定时自动化任务前端
 * 任务管理面板：创建/编辑/删除/手动执行/查看历史
 */

(function() {
  'use strict';

  function init() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', setup);
    } else {
      setup();
    }
  }

  function setup() {
    addAutoTaskButton();
  }

  // ===== 添加入口按钮 =====
  function addAutoTaskButton() {
    setTimeout(function() {
      var toolbars = document.querySelectorAll('.chat-toolbar, .chat-actions-bar');
      toolbars.forEach(function(toolbar) {
        if (toolbar.querySelector('.auto-task-btn')) return;
        var btn = document.createElement('button');
        btn.className = 'toolbar-btn auto-task-btn';
        btn.title = '自动化任务';
        btn.onclick = function() { showAutoTaskPanel(); };
        btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
        toolbar.appendChild(btn);
      });
    }, 1800);
  }

  // ===== 任务管理面板 =====
  window.showAutoTaskPanel = showAutoTaskPanel;
  function showAutoTaskPanel() {
    var existing = document.getElementById('autoTaskModal');
    if (existing) existing.remove();

    var modal = document.createElement('div');
    modal.id = 'autoTaskModal';
    modal.className = 'auto-task-overlay';

    modal.innerHTML = [
      '<div class="auto-task-modal">',
      '  <div class="auto-task-header">',
      '    <h3>\u2699\ufe0f \u81ea\u52a8\u5316\u4efb\u52a1</h3>',
      '    <div class="auto-task-header-actions">',
      '      <button class="auto-task-add-btn" onclick="window.showCreateAutoTask()">\u2795 \u65b0\u5efa\u4efb\u52a1</button>',
      '      <button class="auto-task-close" onclick="document.getElementById(\'autoTaskModal\').remove()">',
      '        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
      '      </button>',
      '    </div>',
      '  </div>',
      '  <div class="auto-task-body" id="autoTaskList">',
      '    <div class="auto-task-loading">\u52a0\u8f7d\u4e2d...</div>',
      '  </div>',
      '</div>'
    ].join('\n');

    document.body.appendChild(modal);
    modal.addEventListener('click', function(e) {
      if (e.target === modal) modal.remove();
    });

    loadAutoTasks();
  }

  // ===== 加载任务列表 =====
  function loadAutoTasks() {
    fetch('/api/auto-tasks')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        renderTaskList(data.tasks || []);
      })
      .catch(function() {
        var list = document.getElementById('autoTaskList');
        if (list) list.innerHTML = '<div class="auto-task-empty">\u52a0\u8f7d\u5931\u8d25</div>';
      });
  }

  function renderTaskList(tasks) {
    var list = document.getElementById('autoTaskList');
    if (!list) return;

    if (tasks.length === 0) {
      list.innerHTML = [
        '<div class="auto-task-empty">',
        '  <div class="auto-task-empty-icon">\u23f0</div>',
        '  <div class="auto-task-empty-text">\u8fd8\u6ca1\u6709\u81ea\u52a8\u5316\u4efb\u52a1</div>',
        '  <div class="auto-task-empty-hint">\u521b\u5efa\u5b9a\u65f6\u4efb\u52a1\uff0c\u8ba9 Agent \u81ea\u52a8\u5b8c\u6210\u91cd\u590d\u6027\u5de5\u4f5c</div>',
        '</div>'
      ].join('');
      return;
    }

    list.innerHTML = tasks.map(function(task) {
      var scheduleText = getScheduleText(task.schedule);
      var statusClass = task.enabled ? 'active' : 'paused';
      var statusText = task.enabled ? '\u8fd0\u884c\u4e2d' : '\u5df2\u6682\u505c';
      var lastRunText = task.lastRun ? formatTime(task.lastRun) : '\u4ece\u672a\u6267\u884c';

      return [
        '<div class="auto-task-card">',
        '  <div class="auto-task-card-header">',
        '    <div class="auto-task-card-title">' + escapeHtml(task.name) + '</div>',
        '    <div class="auto-task-status ' + statusClass + '">' + statusText + '</div>',
        '  </div>',
        task.description ? '  <div class="auto-task-card-desc">' + escapeHtml(task.description) + '</div>' : '',
        '  <div class="auto-task-card-meta">',
        '    <span>\u23f0 ' + scheduleText + '</span>',
        '    <span>\u2022 \u5df2\u6267\u884c ' + (task.runCount || 0) + ' \u6b21</span>',
        '    <span>\u2022 \u4e0a\u6b21: ' + lastRunText + '</span>',
        '  </div>',
        task.lastResult ? '  <div class="auto-task-last-result">\u6700\u8fd1\u7ed3\u679c: ' + escapeHtml(task.lastResult.substring(0, 100)) + '</div>' : '',
        '  <div class="auto-task-card-actions">',
        '    <button onclick="window.runAutoTask(\'' + task.id + '\')" class="auto-task-action-btn run">\u25b6 \u624b\u52a8\u6267\u884c</button>',
        '    <button onclick="window.toggleAutoTask(\'' + task.id + '\',' + !task.enabled + ')" class="auto-task-action-btn toggle">' + (task.enabled ? '\u23f8 \u6682\u505c' : '\u25b6 \u542f\u7528') + '</button>',
        '    <button onclick="window.editAutoTask(\'' + task.id + '\')" class="auto-task-action-btn edit">\u270f\ufe0f \u7f16\u8f91</button>',
        '    <button onclick="window.deleteAutoTask(\'' + task.id + '\')" class="auto-task-action-btn delete">\ud83d\uddd1 \u5220\u9664</button>',
        '  </div>',
        '</div>'
      ].join('\n');
    }).join('');
  }

  // ===== 创建任务 =====
  window.showCreateAutoTask = function(editTask) {
    var agents = [];
    if (typeof AGENT_GROUPS !== 'undefined') {
      AGENT_GROUPS.forEach(function(g) {
        if (g.agents) g.agents.forEach(function(a) { agents.push(a); });
      });
    }

    var agentOptions = '<option value="">\u9ed8\u8ba4\uff08\u5f53\u524d Agent\uff09</option>' +
      agents.map(function(a) {
        var selected = editTask && editTask.agentId === a.id ? ' selected' : '';
        return '<option value="' + a.id + '"' + selected + '>' + (a.icon || '') + ' ' + escapeHtml(a.name) + '</option>';
      }).join('');

    var formHtml = [
      '<div class="auto-task-form" id="autoTaskForm">',
      '  <div class="auto-task-form-group">',
      '    <label>\u4efb\u52a1\u540d\u79f0</label>',
      '    <input type="text" id="atName" placeholder="\u4f8b\u5982\uff1a\u6bcf\u65e5\u7ade\u54c1\u52a8\u6001\u76d1\u63a7" value="' + escapeAttr(editTask ? editTask.name : '') + '">',
      '  </div>',
      '  <div class="auto-task-form-group">',
      '    <label>\u4efb\u52a1\u63cf\u8ff0\uff08\u53ef\u9009\uff09</label>',
      '    <input type="text" id="atDesc" placeholder="\u7b80\u8981\u63cf\u8ff0\u4efb\u52a1\u76ee\u7684" value="' + escapeAttr(editTask ? editTask.description : '') + '">',
      '  </div>',
      '  <div class="auto-task-form-group">',
      '    <label>\u6267\u884c Agent</label>',
      '    <select id="atAgent">' + agentOptions + '</select>',
      '  </div>',
      '  <div class="auto-task-form-group">',
      '    <label>\u6267\u884c\u6307\u4ee4</label>',
      '    <textarea id="atPrompt" placeholder="\u8f93\u5165 Agent \u6bcf\u6b21\u81ea\u52a8\u6267\u884c\u65f6\u7684\u6307\u4ee4...\u4f8b\u5982\uff1a\u641c\u7d22\u6700\u8fd1\u4e00\u5468\u533b\u7f8e\u884c\u4e1a\u65b0\u95fb\uff0c\u6574\u7406\u51fa\u524d5\u6761\u91cd\u8981\u52a8\u6001">' + escapeHtml(editTask ? editTask.prompt : '') + '</textarea>',
      '  </div>',
      '  <div class="auto-task-form-group">',
      '    <label>\u6267\u884c\u9891\u7387</label>',
      '    <div class="auto-task-schedule-options">',
      '      <label><input type="radio" name="atSchedule" value="daily"' + (editTask && editTask.schedule.type === 'daily' ? ' checked' : (!editTask ? ' checked' : '')) + '> \u6bcf\u5929\u4e00\u6b21</label>',
      '      <label><input type="radio" name="atSchedule" value="weekly"' + (editTask && editTask.schedule.type === 'weekly' ? ' checked' : '') + '> \u6bcf\u5468\u4e00\u6b21</label>',
      '      <label><input type="radio" name="atSchedule" value="interval"' + (editTask && editTask.schedule.type === 'interval' ? ' checked' : '') + '> \u81ea\u5b9a\u4e49\u95f4\u9694</label>',
      '    </div>',
      '    <div class="auto-task-interval-input" id="atIntervalWrap" style="display:' + (editTask && editTask.schedule.type === 'interval' ? 'flex' : 'none') + '">',
      '      <span>\u6bcf</span>',
      '      <input type="number" id="atInterval" min="1" max="168" value="' + (editTask && editTask.schedule.value ? editTask.schedule.value : 6) + '">',
      '      <span>\u5c0f\u65f6\u6267\u884c\u4e00\u6b21</span>',
      '    </div>',
      '  </div>',
      '  <div class="auto-task-form-actions">',
      '    <button class="auto-task-cancel-btn" onclick="window.cancelAutoTaskForm()">\u53d6\u6d88</button>',
      '    <button class="auto-task-save-btn" onclick="window.saveAutoTask(\'' + (editTask ? editTask.id : '') + '\')">' + (editTask ? '\u4fdd\u5b58' : '\u521b\u5efa') + '</button>',
      '  </div>',
      '</div>'
    ].join('\n');

    var list = document.getElementById('autoTaskList');
    if (list) {
      list.innerHTML = formHtml;

      // 监听频率切换
      list.querySelectorAll('input[name="atSchedule"]').forEach(function(radio) {
        radio.addEventListener('change', function() {
          var wrap = document.getElementById('atIntervalWrap');
          if (wrap) wrap.style.display = this.value === 'interval' ? 'flex' : 'none';
        });
      });
    }
  };

  window.cancelAutoTaskForm = function() {
    loadAutoTasks();
  };

  window.saveAutoTask = function(editId) {
    var name = document.getElementById('atName').value.trim();
    var desc = document.getElementById('atDesc').value.trim();
    var agentId = document.getElementById('atAgent').value;
    var prompt = document.getElementById('atPrompt').value.trim();
    var scheduleType = document.querySelector('input[name="atSchedule"]:checked');
    scheduleType = scheduleType ? scheduleType.value : 'daily';
    var intervalVal = parseInt(document.getElementById('atInterval').value) || 6;

    if (!name) { alert('\u8bf7\u8f93\u5165\u4efb\u52a1\u540d\u79f0'); return; }
    if (!prompt) { alert('\u8bf7\u8f93\u5165\u6267\u884c\u6307\u4ee4'); return; }

    var schedule = { type: scheduleType };
    if (scheduleType === 'interval') schedule.value = intervalVal;

    var apiUrl = editId ? '/api/auto-tasks/update' : '/api/auto-tasks/create';
    var bodyData = {
      name: name,
      description: desc,
      agentId: agentId || null,
      prompt: prompt,
      schedule: schedule,
      enabled: true
    };
    if (editId) bodyData.taskId = editId;

    fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyData)
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.success) {
        if (typeof showToast === 'function') showToast(editId ? '\u4efb\u52a1\u5df2\u66f4\u65b0' : '\u4efb\u52a1\u5df2\u521b\u5efa');
        loadAutoTasks();
      } else {
        alert(data.error || '\u4fdd\u5b58\u5931\u8d25');
      }
    })
    .catch(function() { alert('\u7f51\u7edc\u9519\u8bef'); });
  };

  // ===== 操作函数 =====
  window.runAutoTask = function(taskId) {
    fetch('/api/auto-tasks/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId: taskId })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.success && data.executePrompt) {
        // 关闭面板
        var modal = document.getElementById('autoTaskModal');
        if (modal) modal.remove();

        // 如果需要切换 Agent
        if (data.executeAgent && typeof quickStart === 'function') {
          quickStart(data.executeAgent);
          setTimeout(function() {
            fillAndSend(data.executePrompt);
          }, 500);
        } else {
          fillAndSend(data.executePrompt);
        }

        if (typeof showToast === 'function') showToast('\u4efb\u52a1\u5df2\u53d1\u9001\u6267\u884c');
      }
    })
    .catch(function() { alert('\u6267\u884c\u5931\u8d25'); });
  };

  function fillAndSend(prompt) {
    var chatInput = document.getElementById('chatInput');
    if (chatInput) {
      chatInput.value = '[自动化任务执行]\n\n' + prompt;
      var sendBtn = document.querySelector('.send-btn, .chat-send-btn, button[onclick*="sendMessage"]');
      if (sendBtn) {
        sendBtn.click();
      } else if (typeof sendMessage === 'function') {
        sendMessage();
      }
    }
  }

  window.toggleAutoTask = function(taskId, enabled) {
    fetch('/api/auto-tasks/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId: taskId, enabled: enabled })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.success) {
        if (typeof showToast === 'function') showToast(enabled ? '\u4efb\u52a1\u5df2\u542f\u7528' : '\u4efb\u52a1\u5df2\u6682\u505c');
        loadAutoTasks();
      }
    });
  };

  window.editAutoTask = function(taskId) {
    fetch('/api/auto-tasks')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        var task = (data.tasks || []).find(function(t) { return t.id === taskId; });
        if (task) window.showCreateAutoTask(task);
      });
  };

  window.deleteAutoTask = function(taskId) {
    if (!confirm('\u786e\u5b9a\u5220\u9664\u8fd9\u4e2a\u81ea\u52a8\u5316\u4efb\u52a1\uff1f')) return;

    fetch('/api/auto-tasks/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId: taskId })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.success) {
        if (typeof showToast === 'function') showToast('\u4efb\u52a1\u5df2\u5220\u9664');
        loadAutoTasks();
      }
    });
  };

  // ===== 辅助函数 =====
  function getScheduleText(schedule) {
    if (!schedule) return '\u672a\u8bbe\u7f6e';
    switch (schedule.type) {
      case 'daily': return '\u6bcf\u5929\u4e00\u6b21';
      case 'weekly': return '\u6bcf\u5468\u4e00\u6b21';
      case 'interval': return '\u6bcf ' + (schedule.value || 6) + ' \u5c0f\u65f6';
      default: return schedule.type;
    }
  }

  function formatTime(isoStr) {
    try {
      var d = new Date(isoStr);
      return d.toLocaleDateString('zh-CN') + ' ' + d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    } catch(e) {
      return isoStr;
    }
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  function escapeAttr(str) {
    return (str || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  init();

})();
