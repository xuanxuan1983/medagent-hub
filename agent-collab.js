/**
 * P4: 跨 Agent 协同
 * 支持在对话中 @提及其他 Agent，自动调用其能力并合成方案
 * 支持多 Agent 串联执行
 */

(function() {
  'use strict';

  var collabState = {
    pendingMentions: [],
    collabHistory: [],
    isCollabRunning: false
  };

  function init() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', setup);
    } else {
      setup();
    }
  }

  function setup() {
    setupMentionInput();
    addCollabButton();
  }

  // ===== @ 提及功能 =====
  function setupMentionInput() {
    // 监听输入框的 @ 符号
    document.addEventListener('input', function(e) {
      var target = e.target;
      if (target.id !== 'chatInput' && !target.classList.contains('chat-input')) return;

      var value = target.value || '';
      var cursorPos = target.selectionStart || value.length;
      var textBeforeCursor = value.substring(0, cursorPos);

      // 检测 @ 触发
      var atMatch = textBeforeCursor.match(/@(\S{0,10})$/);
      if (atMatch) {
        showAgentMentionDropdown(target, atMatch[1], atMatch.index);
      } else {
        hideAgentMentionDropdown();
      }
    });

    // 键盘导航
    document.addEventListener('keydown', function(e) {
      var dropdown = document.getElementById('agentMentionDropdown');
      if (!dropdown || dropdown.style.display === 'none') return;

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        navigateMentionDropdown(e.key === 'ArrowDown' ? 1 : -1);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        var active = dropdown.querySelector('.mention-item.active');
        if (active) {
          e.preventDefault();
          active.click();
        }
      } else if (e.key === 'Escape') {
        hideAgentMentionDropdown();
      }
    });
  }

  function getAgentList() {
    var agents = [];
    if (typeof AGENT_GROUPS !== 'undefined') {
      AGENT_GROUPS.forEach(function(group) {
        if (group.agents) {
          group.agents.forEach(function(agent) {
            agents.push({
              id: agent.id,
              name: agent.name,
              desc: agent.desc || agent.description || '',
              icon: agent.icon || ''
            });
          });
        }
      });
    }
    return agents;
  }

  function showAgentMentionDropdown(inputEl, query, atIndex) {
    var agents = getAgentList();
    var filtered = agents.filter(function(a) {
      if (!query) return true;
      return a.name.toLowerCase().includes(query.toLowerCase()) ||
             a.id.toLowerCase().includes(query.toLowerCase());
    });

    if (filtered.length === 0) {
      hideAgentMentionDropdown();
      return;
    }

    var dropdown = document.getElementById('agentMentionDropdown');
    if (!dropdown) {
      dropdown = document.createElement('div');
      dropdown.id = 'agentMentionDropdown';
      dropdown.className = 'agent-mention-dropdown';
      document.body.appendChild(dropdown);
    }

    dropdown.innerHTML = '<div class="mention-header">\u9009\u62e9 Agent \u534f\u540c</div>' +
      filtered.map(function(agent, i) {
        return '<div class="mention-item' + (i === 0 ? ' active' : '') + '" data-agent-id="' + agent.id + '" data-agent-name="' + escapeAttr(agent.name) + '">' +
          '<span class="mention-icon">' + (agent.icon || '\ud83e\udd16') + '</span>' +
          '<span class="mention-name">' + escapeHtml(agent.name) + '</span>' +
          '<span class="mention-desc">' + escapeHtml(agent.desc.substring(0, 20)) + '</span>' +
        '</div>';
      }).join('');

    // 定位
    var rect = inputEl.getBoundingClientRect();
    dropdown.style.display = 'block';
    dropdown.style.left = rect.left + 'px';
    dropdown.style.bottom = (window.innerHeight - rect.top + 4) + 'px';

    // 点击选择
    dropdown.querySelectorAll('.mention-item').forEach(function(item) {
      item.onclick = function() {
        var agentName = item.dataset.agentName;
        var agentId = item.dataset.agentId;
        var value = inputEl.value;
        var before = value.substring(0, atIndex);
        var after = value.substring(inputEl.selectionStart || value.length);
        inputEl.value = before + '@' + agentName + ' ' + after;
        inputEl.focus();
        inputEl.selectionStart = inputEl.selectionEnd = (before + '@' + agentName + ' ').length;
        hideAgentMentionDropdown();

        // 记录提及
        if (!collabState.pendingMentions.find(function(m) { return m.id === agentId; })) {
          collabState.pendingMentions.push({ id: agentId, name: agentName });
        }
      };

      item.onmouseenter = function() {
        dropdown.querySelectorAll('.mention-item').forEach(function(el) { el.classList.remove('active'); });
        item.classList.add('active');
      };
    });
  }

  function hideAgentMentionDropdown() {
    var dropdown = document.getElementById('agentMentionDropdown');
    if (dropdown) dropdown.style.display = 'none';
  }

  function navigateMentionDropdown(dir) {
    var dropdown = document.getElementById('agentMentionDropdown');
    if (!dropdown) return;

    var items = dropdown.querySelectorAll('.mention-item');
    var activeIdx = -1;
    items.forEach(function(item, i) {
      if (item.classList.contains('active')) activeIdx = i;
    });

    items.forEach(function(item) { item.classList.remove('active'); });

    var newIdx = activeIdx + dir;
    if (newIdx < 0) newIdx = items.length - 1;
    if (newIdx >= items.length) newIdx = 0;
    items[newIdx].classList.add('active');
  }

  // ===== 多 Agent 协同按钮 =====
  function addCollabButton() {
    setTimeout(function() {
      // 在聊天工具栏添加协同按钮
      var toolbars = document.querySelectorAll('.chat-toolbar, .chat-actions-bar');
      toolbars.forEach(function(toolbar) {
        if (toolbar.querySelector('.collab-btn')) return;

        var btn = document.createElement('button');
        btn.className = 'toolbar-btn collab-btn';
        btn.title = '\u591a Agent \u534f\u540c';
        btn.onclick = function() { showCollabPanel(); };
        btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>';
        toolbar.appendChild(btn);
      });
    }, 1500);
  }

  // ===== 协同面板 =====
  function showCollabPanel() {
    var existing = document.getElementById('collabModal');
    if (existing) existing.remove();

    var agents = getAgentList();
    var currentAgent = typeof currentAgentId !== 'undefined' ? currentAgentId : null;

    var modal = document.createElement('div');
    modal.id = 'collabModal';
    modal.className = 'collab-modal-overlay';

    var agentCheckboxes = agents.map(function(agent) {
      var isCurrentAgent = agent.id === currentAgent;
      return '<label class="collab-agent-option' + (isCurrentAgent ? ' current' : '') + '">' +
        '<input type="checkbox" value="' + agent.id + '" data-name="' + escapeAttr(agent.name) + '"' +
        (isCurrentAgent ? ' checked disabled' : '') + '>' +
        '<span class="collab-agent-icon">' + (agent.icon || '\ud83e\udd16') + '</span>' +
        '<span class="collab-agent-info">' +
        '  <span class="collab-agent-name">' + escapeHtml(agent.name) + (isCurrentAgent ? ' (\u5f53\u524d)' : '') + '</span>' +
        '  <span class="collab-agent-desc">' + escapeHtml(agent.desc.substring(0, 30)) + '</span>' +
        '</span>' +
      '</label>';
    }).join('');

    modal.innerHTML = [
      '<div class="collab-modal">',
      '  <div class="collab-modal-header">',
      '    <h3>\u591a Agent \u534f\u540c\u6a21\u5f0f</h3>',
      '    <button class="collab-close-btn" onclick="document.getElementById(\'collabModal\').remove()">',
      '      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
      '    </button>',
      '  </div>',
      '  <div class="collab-modal-body">',
      '    <div class="collab-section">',
      '      <div class="collab-section-title">\u9009\u62e9\u53c2\u4e0e\u534f\u540c\u7684 Agent</div>',
      '      <div class="collab-section-hint">\u5f53\u524d Agent \u5c06\u4f5c\u4e3a\u4e3b\u5bfc\uff0c\u5176\u4ed6 Agent \u63d0\u4f9b\u4e13\u4e1a\u610f\u89c1</div>',
      '      <div class="collab-agents-grid">' + agentCheckboxes + '</div>',
      '    </div>',
      '    <div class="collab-section">',
      '      <div class="collab-section-title">\u534f\u540c\u6a21\u5f0f</div>',
      '      <div class="collab-modes">',
      '        <label class="collab-mode-option"><input type="radio" name="collabMode" value="consult" checked> <strong>\u54a8\u8be2\u6a21\u5f0f</strong> \u2014 \u5404 Agent \u72ec\u7acb\u7ed9\u51fa\u610f\u89c1\uff0c\u4e3b\u5bfc Agent \u6c47\u603b</label>',
      '        <label class="collab-mode-option"><input type="radio" name="collabMode" value="chain"> <strong>\u4e32\u8054\u6a21\u5f0f</strong> \u2014 Agent \u4f9d\u6b21\u5904\u7406\uff0c\u524d\u4e00\u4e2a\u7684\u8f93\u51fa\u4f5c\u4e3a\u540e\u4e00\u4e2a\u7684\u8f93\u5165</label>',
      '        <label class="collab-mode-option"><input type="radio" name="collabMode" value="debate"> <strong>\u8fa9\u8bba\u6a21\u5f0f</strong> \u2014 Agent \u4e4b\u95f4\u4ea4\u53c9\u8ba8\u8bba\uff0c\u6700\u7ec8\u8fbe\u6210\u5171\u8bc6</label>',
      '      </div>',
      '    </div>',
      '    <div class="collab-section">',
      '      <div class="collab-section-title">\u534f\u540c\u4efb\u52a1\u63cf\u8ff0</div>',
      '      <textarea class="collab-task-input" id="collabTaskInput" placeholder="\u63cf\u8ff0\u4f60\u5e0c\u671b\u591a\u4e2a Agent \u5171\u540c\u5b8c\u6210\u7684\u4efb\u52a1...\u4f8b\u5982\uff1a\u5206\u6790\u6d77\u96c5\u7f8e\u6700\u65b0\u4ea7\u54c1\uff0c\u4ece\u4ea7\u54c1\u7b56\u7565\u3001\u8bdd\u672f\u8bbe\u8ba1\u3001\u5408\u89c4\u5ba1\u67e5\u4e09\u4e2a\u89d2\u5ea6\u7ed9\u51fa\u65b9\u6848"></textarea>',
      '    </div>',
      '  </div>',
      '  <div class="collab-modal-footer">',
      '    <button class="collab-cancel-btn" onclick="document.getElementById(\'collabModal\').remove()">\u53d6\u6d88</button>',
      '    <button class="collab-start-btn" onclick="window.startAgentCollab()">\u542f\u52a8\u534f\u540c</button>',
      '  </div>',
      '</div>'
    ].join('\n');

    document.body.appendChild(modal);

    // 点击遮罩关闭
    modal.addEventListener('click', function(e) {
      if (e.target === modal) modal.remove();
    });
  }

  // ===== 启动协同 =====
  window.startAgentCollab = function() {
    var modal = document.getElementById('collabModal');
    if (!modal) return;

    var selectedAgents = [];
    modal.querySelectorAll('.collab-agents-grid input[type="checkbox"]:checked').forEach(function(cb) {
      selectedAgents.push({ id: cb.value, name: cb.dataset.name });
    });

    if (selectedAgents.length < 2) {
      if (typeof showToast === 'function') showToast('\u8bf7\u81f3\u5c11\u9009\u62e9 2 \u4e2a Agent');
      return;
    }

    var mode = modal.querySelector('input[name="collabMode"]:checked');
    var collabMode = mode ? mode.value : 'consult';

    var taskInput = document.getElementById('collabTaskInput');
    var task = taskInput ? taskInput.value.trim() : '';
    if (!task) {
      if (typeof showToast === 'function') showToast('\u8bf7\u8f93\u5165\u534f\u540c\u4efb\u52a1\u63cf\u8ff0');
      return;
    }

    modal.remove();

    // 构建协同提示词并发送到当前对话
    var collabPrompt = buildCollabPrompt(selectedAgents, collabMode, task);

    // 填入聊天输入框并发送
    var chatInput = document.getElementById('chatInput');
    if (chatInput) {
      chatInput.value = collabPrompt;
      // 触发发送
      var sendBtn = document.querySelector('.send-btn, .chat-send-btn, button[onclick*="sendMessage"]');
      if (sendBtn) {
        sendBtn.click();
      } else if (typeof sendMessage === 'function') {
        sendMessage();
      }
    }

    if (typeof showToast === 'function') {
      showToast('\u534f\u540c\u4efb\u52a1\u5df2\u53d1\u9001\uff0c' + selectedAgents.length + ' \u4e2a Agent \u53c2\u4e0e');
    }
  };

  function buildCollabPrompt(agents, mode, task) {
    var currentAgent = typeof currentAgentId !== 'undefined' ? currentAgentId : agents[0].id;
    var otherAgents = agents.filter(function(a) { return a.id !== currentAgent; });
    var currentAgentName = agents.find(function(a) { return a.id === currentAgent; });
    currentAgentName = currentAgentName ? currentAgentName.name : '\u5f53\u524d Agent';

    var prompt = '';

    if (mode === 'consult') {
      prompt = '[多Agent协同 - 咨询模式]\n\n';
      prompt += '任务：' + task + '\n\n';
      prompt += '请你（' + currentAgentName + '）作为主导，综合以下专家的视角给出方案：\n';
      otherAgents.forEach(function(a) {
        prompt += '- ' + a.name + '：请从其专业领域角度分析\n';
      });
      prompt += '\n请按以下结构输出：\n';
      prompt += '1. 各专家视角分析\n';
      prompt += '2. 综合方案建议\n';
      prompt += '3. 执行步骤\n';
    } else if (mode === 'chain') {
      prompt = '[多Agent协同 - 串联模式]\n\n';
      prompt += '任务：' + task + '\n\n';
      prompt += '请按以下顺序，模拟多位专家依次处理：\n';
      agents.forEach(function(a, i) {
        prompt += (i + 1) + '. ' + a.name + '：完成其专业环节后，将结果传递给下一位\n';
      });
      prompt += '\n请完整模拟整个流程，展示每个环节的输入和输出。\n';
    } else if (mode === 'debate') {
      prompt = '[多Agent协同 - 辩论模式]\n\n';
      prompt += '任务：' + task + '\n\n';
      prompt += '请模拟以下专家之间的讨论：\n';
      agents.forEach(function(a) {
        prompt += '- ' + a.name + '\n';
      });
      prompt += '\n请展示 2-3 轮讨论，每位专家从各自角度发表观点，最终达成共识方案。\n';
    }

    return prompt;
  }

  // ===== 辅助函数 =====
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
