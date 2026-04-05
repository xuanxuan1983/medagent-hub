// ===== COMBO SKILLS BUILDER (自定义工作流构建器) =====

// --- State ---
var userCombos = [];
var editingComboId = null;

// --- Load user combos from server ---
async function loadUserCombos() {
  try {
    var resp = await fetch('/api/combos', { credentials: 'include' });
    var data = await resp.json();
    if (data.success) {
      userCombos = data.combos || [];
    }
  } catch (e) {
    console.error('[Combo] Load error:', e);
  }
  renderUserCombos();
  renderUserCombosOnHome();
}

// --- Render user combos in skills tab ---
function renderUserCombos() {
  var container = document.getElementById('userCombosList');
  if (!container) return;

  if (userCombos.length === 0) {
    container.innerHTML = '<div class="resource-empty" style="font-size:0.78rem;padding:1rem">暂无自定义工作流<br><span style="font-size:0.7rem;color:var(--text-3)">点击上方"新建工作流"按钮创建</span></div>';
    return;
  }

  container.innerHTML = userCombos.map(function(combo) {
    var stepsText = combo.steps.map(function(s, i) {
      return (i + 1) + '. ' + (s.skillName || s.prompt.substring(0, 20) + '...');
    }).join(' → ');
    var date = new Date(combo.updatedAt || combo.createdAt).toLocaleDateString('zh-CN');

    return '<div class="combo-user-card" onclick="launchUserCombo(\'' + combo.id + '\')">' +
      '<div class="combo-user-card-header">' +
        '<span class="combo-user-card-name">' + combo.name + '</span>' +
        '<span class="combo-user-card-count">' + combo.steps.length + '步</span>' +
      '</div>' +
      (combo.description ? '<div class="combo-user-card-desc">' + combo.description + '</div>' : '') +
      '<div class="combo-user-card-steps">' + stepsText + '</div>' +
      '<div class="combo-user-card-footer">' +
        '<span class="combo-user-card-date">' + date + '</span>' +
        '<div class="combo-user-card-actions">' +
          '<button class="combo-action-btn" onclick="event.stopPropagation();openComboBuilder(\'' + combo.id + '\')" title="编辑">' +
            '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>' +
          '</button>' +
          '<button class="combo-action-btn combo-action-danger" onclick="event.stopPropagation();deleteUserCombo(\'' + combo.id + '\')" title="删除">' +
            '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>' +
          '</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('');
}

// --- Render user combos on desktop home (alongside built-in combos) ---
function renderUserCombosOnHome() {
  var grid = document.getElementById('comboSkillsGrid');
  if (!grid || userCombos.length === 0) return;

  // Append user combos after built-in ones
  var existingUserCards = grid.querySelectorAll('.combo-skill-card[data-user-combo]');
  existingUserCards.forEach(function(el) { el.remove(); });

  userCombos.forEach(function(combo) {
    var card = document.createElement('div');
    card.className = 'combo-skill-card';
    card.setAttribute('data-user-combo', combo.id);
    card.onclick = function() { launchUserCombo(combo.id); };

    var tagsHtml = (combo.tags || []).map(function(t) {
      return '<span class="combo-skill-tag">' + t + '</span>';
    }).join('');
    if (!tagsHtml) tagsHtml = '<span class="combo-skill-tag">自定义</span>';

    card.innerHTML =
      '<div class="combo-skill-card-top">' +
        '<div class="combo-skill-icon icon-workflow">' +
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>' +
        '</div>' +
        '<div class="combo-skill-name">' + combo.name + '</div>' +
      '</div>' +
      '<div class="combo-skill-desc">' + (combo.description || combo.steps.length + '步工作流') + '</div>' +
      '<div class="combo-skill-tags">' + tagsHtml + '</div>';

    grid.appendChild(card);
  });
}

// --- Delete user combo ---
async function deleteUserCombo(comboId) {
  if (!confirm('确定要删除这个工作流吗？')) return;
  try {
    var resp = await fetch('/api/combos/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ comboId: comboId })
    });
    var data = await resp.json();
    if (data.success) {
      showToast('工作流已删除');
      loadUserCombos();
    } else {
      showToast(data.error || '删除失败');
    }
  } catch (e) {
    showToast('删除失败');
  }
}

// --- Launch user combo (execute workflow) ---
function launchUserCombo(comboId) {
  var combo = userCombos.find(function(c) { return c.id === comboId; });
  if (!combo || !combo.steps || combo.steps.length === 0) return;

  // Execute first step
  var firstStep = combo.steps[0];

  // Switch to target agent if specified
  if (firstStep.agentId) {
    quickStart(firstStep.agentId);
  }

  // Switch layout
  setTimeout(function() {
    if (typeof switchLayout === 'function' && combo.layout) {
      switchLayout(combo.layout);
    }

    // Load skill if specified
    if (firstStep.skillId) {
      loadSkillToCurrentChat(firstStep.skillId);
    }

    // Fill prompt
    var chatInput = document.getElementById('messageInput');
    if (!chatInput) chatInput = document.getElementById('desktopInput');
    if (chatInput) {
      // Build combined prompt with workflow context
      var workflowHint = combo.steps.length > 1
        ? '\n\n[工作流提示：这是"' + combo.name + '"的第1步（共' + combo.steps.length + '步）]'
        : '';
      chatInput.value = firstStep.prompt + workflowHint;
      if (typeof autoResize === 'function') autoResize(chatInput);
      chatInput.focus();
    }

    // Store remaining steps for sequential execution
    if (combo.steps.length > 1) {
      window._pendingComboSteps = combo.steps.slice(1);
      window._currentComboName = combo.name;
      window._currentComboStepIndex = 1;
      showComboProgress(combo.name, 1, combo.steps.length);
    }
  }, firstStep.agentId ? 800 : 100);
}

// --- Show combo progress indicator ---
function showComboProgress(comboName, currentStep, totalSteps) {
  var old = document.getElementById('comboProgressBar');
  if (old) old.remove();

  if (currentStep > totalSteps) return;

  var bar = document.createElement('div');
  bar.id = 'comboProgressBar';
  bar.className = 'combo-progress-bar';
  bar.innerHTML =
    '<div class="combo-progress-info">' +
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>' +
      '<span>' + comboName + '</span>' +
      '<span class="combo-progress-step">' + currentStep + '/' + totalSteps + '</span>' +
    '</div>' +
    '<div class="combo-progress-actions">' +
      '<button class="combo-progress-next" onclick="executeNextComboStep()">下一步</button>' +
      '<button class="combo-progress-cancel" onclick="cancelComboExecution()">取消</button>' +
    '</div>';

  var chatPanel = document.querySelector('.chat-main-panel');
  if (chatPanel) {
    var inputArea = chatPanel.querySelector('.chat-input-area');
    if (inputArea) {
      inputArea.parentNode.insertBefore(bar, inputArea);
    }
  }
}

// --- Execute next combo step ---
function executeNextComboStep() {
  var steps = window._pendingComboSteps;
  if (!steps || steps.length === 0) {
    cancelComboExecution();
    showToast('工作流已完成');
    return;
  }

  var step = steps.shift();
  window._currentComboStepIndex++;

  // Switch agent if needed
  if (step.agentId && step.agentId !== currentAgentId) {
    startChatFromDoudou(step.agentId);
  }

  // Load skill if specified
  if (step.skillId) {
    loadSkillToCurrentChat(step.skillId);
  }

  // Fill prompt
  setTimeout(function() {
    var chatInput = document.getElementById('messageInput');
    if (chatInput) {
      var workflowHint = steps.length > 0
        ? '\n\n[工作流提示：这是"' + window._currentComboName + '"的第' + window._currentComboStepIndex + '步（共' + (window._currentComboStepIndex + steps.length) + '步）]'
        : '\n\n[工作流提示：这是"' + window._currentComboName + '"的最后一步]';
      chatInput.value = step.prompt + workflowHint;
      if (typeof autoResize === 'function') autoResize(chatInput);
      chatInput.focus();
    }

    // Update progress
    showComboProgress(
      window._currentComboName,
      window._currentComboStepIndex,
      window._currentComboStepIndex + steps.length
    );
  }, step.agentId ? 800 : 100);
}

// --- Cancel combo execution ---
function cancelComboExecution() {
  window._pendingComboSteps = null;
  window._currentComboName = null;
  window._currentComboStepIndex = 0;
  var bar = document.getElementById('comboProgressBar');
  if (bar) bar.remove();
}

// ===== COMBO BUILDER MODAL =====

function openComboBuilder(comboId) {
  editingComboId = comboId || null;

  // Create modal if not exists
  var overlay = document.getElementById('comboBuilderOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'comboBuilderOverlay';
    overlay.className = 'combo-builder-overlay';
    overlay.onclick = function(e) { if (e.target === overlay) closeComboBuilder(); };
    document.body.appendChild(overlay);
  }

  // Build agent options
  var agentOptions = '<option value="">不指定（使用当前 Agent）</option>';
  if (typeof AGENT_GROUPS !== 'undefined') {
    AGENT_GROUPS.forEach(function(group) {
      if (group.hidden) return;
      group.agents.forEach(function(agent) {
        if (agent.hidden) return;
        agentOptions += '<option value="' + agent.id + '">' + agent.name + '</option>';
      });
    });
  }

  // Build skill options
  var skillOptions = '<option value="">不绑定技能包</option>';
  // Will be populated after loading snapshots

  overlay.innerHTML =
    '<div class="combo-builder-modal">' +
      '<div class="combo-builder-header">' +
        '<h3>' + (comboId ? '编辑工作流' : '新建工作流') + ' <span class="combo-builder-badge">beta</span></h3>' +
        '<button class="combo-builder-close" onclick="closeComboBuilder()">' +
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
        '</button>' +
      '</div>' +
      '<div class="combo-builder-body">' +
        '<div class="combo-builder-field">' +
          '<label>工作流名称</label>' +
          '<input type="text" id="comboBuilderName" placeholder="例如：竞品分析全流程" maxlength="50">' +
        '</div>' +
        '<div class="combo-builder-field">' +
          '<label>描述（可选）</label>' +
          '<input type="text" id="comboBuilderDesc" placeholder="简要描述工作流的用途" maxlength="200">' +
        '</div>' +
        '<div class="combo-builder-field">' +
          '<label>布局模式</label>' +
          '<select id="comboBuilderLayout">' +
            '<option value="preview-chat">预览 + 聊天</option>' +
            '<option value="three-panel">文件 + 预览 + 聊天</option>' +
            '<option value="resource-chat">文件 + 聊天</option>' +
            '<option value="chat-only">仅聊天</option>' +
          '</select>' +
        '</div>' +
        '<div class="combo-builder-steps-header">' +
          '<label>工作流步骤</label>' +
          '<button class="combo-builder-add-step" onclick="addComboStep()">' +
            '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>' +
            ' 添加步骤' +
          '</button>' +
        '</div>' +
        '<div class="combo-builder-steps" id="comboBuilderSteps">' +
          '<!-- Steps will be rendered here -->' +
        '</div>' +
      '</div>' +
      '<div class="combo-builder-footer">' +
        '<button class="combo-builder-cancel" onclick="closeComboBuilder()">取消</button>' +
        '<button class="combo-builder-save" onclick="saveComboFromBuilder()">保存工作流</button>' +
      '</div>' +
    '</div>';

  // Store agent options for step rendering
  window._comboAgentOptions = agentOptions;

  // If editing, load existing data
  if (comboId) {
    var combo = userCombos.find(function(c) { return c.id === comboId; });
    if (combo) {
      document.getElementById('comboBuilderName').value = combo.name;
      document.getElementById('comboBuilderDesc').value = combo.description || '';
      document.getElementById('comboBuilderLayout').value = combo.layout || 'preview-chat';
      // Render existing steps
      combo.steps.forEach(function(step) {
        addComboStep(step);
      });
    }
  } else {
    // Add one empty step by default
    addComboStep();
  }

  // Load available skills for dropdown
  loadSkillOptionsForBuilder();

  overlay.classList.add('active');
}

function closeComboBuilder() {
  var overlay = document.getElementById('comboBuilderOverlay');
  if (overlay) overlay.classList.remove('active');
  editingComboId = null;
}

// --- Add a step to the builder ---
var comboStepCounter = 0;
function addComboStep(existingStep) {
  comboStepCounter++;
  var container = document.getElementById('comboBuilderSteps');
  if (!container) return;

  var stepEl = document.createElement('div');
  stepEl.className = 'combo-step-item';
  stepEl.setAttribute('data-step-id', comboStepCounter);
  stepEl.draggable = true;

  var agentOptions = window._comboAgentOptions || '<option value="">不指定</option>';
  var selectedAgent = existingStep ? existingStep.agentId || '' : '';
  // Replace selected option
  if (selectedAgent) {
    agentOptions = agentOptions.replace(
      'value="' + selectedAgent + '"',
      'value="' + selectedAgent + '" selected'
    );
  }

  stepEl.innerHTML =
    '<div class="combo-step-drag-handle" title="拖拽排序">' +
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="18" x2="16" y2="18"/></svg>' +
    '</div>' +
    '<div class="combo-step-content">' +
      '<div class="combo-step-number">' + container.children.length + '</div>' +  // will be renumbered
      '<div class="combo-step-fields">' +
        '<div class="combo-step-row">' +
          '<select class="combo-step-agent" title="目标 Agent">' + agentOptions + '</select>' +
          '<select class="combo-step-skill" title="绑定技能包"><option value="">不绑定技能包</option></select>' +
        '</div>' +
        '<textarea class="combo-step-prompt" placeholder="输入这一步的提示词..." rows="2">' + (existingStep ? existingStep.prompt || '' : '') + '</textarea>' +
      '</div>' +
    '</div>' +
    '<button class="combo-step-remove" onclick="removeComboStep(this)" title="删除步骤">' +
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
    '</button>';

  container.appendChild(stepEl);

  // Set skill dropdown if editing
  if (existingStep && existingStep.skillId) {
    var skillSelect = stepEl.querySelector('.combo-step-skill');
    // Will be set after skills are loaded
    skillSelect.setAttribute('data-pending-skill', existingStep.skillId);
  }

  // Setup drag events
  setupStepDragEvents(stepEl);
  renumberSteps();
}

function removeComboStep(btn) {
  var stepEl = btn.closest('.combo-step-item');
  if (stepEl) {
    stepEl.remove();
    renumberSteps();
  }
}

function renumberSteps() {
  var steps = document.querySelectorAll('#comboBuilderSteps .combo-step-item');
  steps.forEach(function(el, i) {
    var num = el.querySelector('.combo-step-number');
    if (num) num.textContent = (i + 1);
  });
}

// --- Drag & drop for step reordering ---
function setupStepDragEvents(stepEl) {
  stepEl.addEventListener('dragstart', function(e) {
    e.dataTransfer.setData('text/plain', stepEl.getAttribute('data-step-id'));
    stepEl.classList.add('dragging');
  });
  stepEl.addEventListener('dragend', function() {
    stepEl.classList.remove('dragging');
  });
  stepEl.addEventListener('dragover', function(e) {
    e.preventDefault();
    var container = document.getElementById('comboBuilderSteps');
    var dragging = container.querySelector('.dragging');
    if (!dragging || dragging === stepEl) return;
    var rect = stepEl.getBoundingClientRect();
    var midY = rect.top + rect.height / 2;
    if (e.clientY < midY) {
      container.insertBefore(dragging, stepEl);
    } else {
      container.insertBefore(dragging, stepEl.nextSibling);
    }
    renumberSteps();
  });
}

// --- Load skill options for builder dropdowns ---
async function loadSkillOptionsForBuilder() {
  try {
    var resp = await fetch('/api/chat/snapshots', { credentials: 'include' });
    var data = await resp.json();
    var snapshots = data.snapshots || [];

    var options = '<option value="">不绑定技能包</option>';
    snapshots.forEach(function(s) {
      options += '<option value="' + s.id + '">' + (s.skillName || s.id) + '</option>';
    });

    // Update all skill dropdowns
    var selects = document.querySelectorAll('#comboBuilderSteps .combo-step-skill');
    selects.forEach(function(sel) {
      var pending = sel.getAttribute('data-pending-skill');
      sel.innerHTML = options;
      if (pending) {
        sel.value = pending;
        sel.removeAttribute('data-pending-skill');
      }
    });

    // Store for future steps
    window._comboSkillOptions = options;
  } catch (e) {
    console.error('[Combo] Load skills error:', e);
  }
}

// --- Save combo from builder ---
async function saveComboFromBuilder() {
  var name = document.getElementById('comboBuilderName').value.trim();
  var description = document.getElementById('comboBuilderDesc').value.trim();
  var layout = document.getElementById('comboBuilderLayout').value;

  if (!name) {
    showToast('请输入工作流名称');
    return;
  }

  // Collect steps
  var stepEls = document.querySelectorAll('#comboBuilderSteps .combo-step-item');
  if (stepEls.length === 0) {
    showToast('至少需要一个步骤');
    return;
  }

  var steps = [];
  var hasError = false;
  stepEls.forEach(function(el, i) {
    var prompt = el.querySelector('.combo-step-prompt').value.trim();
    var agentId = el.querySelector('.combo-step-agent').value;
    var skillId = el.querySelector('.combo-step-skill').value;

    if (!prompt) {
      showToast('步骤 ' + (i + 1) + ' 缺少提示词');
      hasError = true;
      return;
    }

    var agentName = '';
    if (agentId) {
      var agentOpt = el.querySelector('.combo-step-agent option[value="' + agentId + '"]');
      if (agentOpt) agentName = agentOpt.textContent;
    }
    var skillName = '';
    if (skillId) {
      var skillOpt = el.querySelector('.combo-step-skill option[value="' + skillId + '"]');
      if (skillOpt) skillName = skillOpt.textContent;
    }

    steps.push({
      prompt: prompt,
      agentId: agentId || null,
      agentName: agentName,
      skillId: skillId || null,
      skillName: skillName
    });
  });

  if (hasError) return;

  // Save to server
  try {
    var resp = await fetch('/api/combos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        comboId: editingComboId,
        name: name,
        description: description,
        steps: steps,
        layout: layout,
        tags: ['自定义', steps.length + '步']
      })
    });
    var data = await resp.json();
    if (data.success) {
      showToast(editingComboId ? '工作流已更新' : '工作流已创建');
      closeComboBuilder();
      loadUserCombos();
    } else {
      showToast(data.error || '保存失败');
    }
  } catch (e) {
    showToast('保存失败');
  }
}

// --- Hook into skills tab to show user combos ---
(function() {
  var _origSwitchTab = window.switchResourceTab;
  if (_origSwitchTab) {
    window.switchResourceTab = function(tab) {
      _origSwitchTab(tab);
      if (tab === 'skills') {
        loadUserCombos();
      }
    };
  }
})();

// --- Init: load combos on page load ---
(function() {
  function initCombos() {
    loadUserCombos();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCombos);
  } else {
    setTimeout(initCombos, 800);
  }
})();
