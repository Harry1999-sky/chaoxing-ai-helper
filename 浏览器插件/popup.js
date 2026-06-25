// popup.js - 弹出窗口逻辑

document.addEventListener('DOMContentLoaded', () => {
  // 加载保存的设置
  loadSettings();
  loadStats();

  // 开关切换
  document.querySelectorAll('.toggle').forEach(toggle => {
    toggle.addEventListener('click', () => {
      toggle.classList.toggle('active');
      saveSettings();
    });
  });

  // API 选择
  const apiSelect = document.getElementById('api-select');
  const customSection = document.getElementById('custom-api-section');
  apiSelect.addEventListener('change', () => {
    customSection.style.display = apiSelect.value === 'custom' ? 'block' : 'none';
    saveSettings();
  });

  // 延迟滑块
  const delayRange = document.getElementById('delay-range');
  const delayValue = document.getElementById('delay-value');
  delayRange.addEventListener('input', () => {
    delayValue.textContent = delayRange.value + 'ms';
    saveSettings();
  });

  // 按钮事件
  document.getElementById('btn-scan').addEventListener('click', () => {
    sendToContent('scan');
  });

  document.getElementById('btn-start').addEventListener('click', () => {
    sendToContent('start');
  });

  document.getElementById('btn-stop').addEventListener('click', () => {
    sendToContent('stop');
  });

  document.getElementById('btn-export').addEventListener('click', () => {
    sendToContent('export');
  });

  document.getElementById('btn-help').addEventListener('click', (e) => {
    e.preventDefault();
    alert(`使用帮助：

1. 打开超星学习通的作业/考试页面
2. 点击"扫描"查看识别到的题目
3. 点击"开始"自动搜题答题
4. 浮动面板可拖拽、最小化

注意事项：
- 首次使用请先在页面上手动登录
- 自动提交默认关闭，建议手动检查后再提交
- 如遇问题，请刷新页面重试`);
  });
});

// 发送消息给 content script
function sendToContent(action) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, { action: action });
    }
  });
}

// 保存设置
function saveSettings() {
  const settings = {
    autoFill: document.getElementById('toggle-autofill').classList.contains('active'),
    autoSubmit: document.getElementById('toggle-autosubmit').classList.contains('active'),
    showPanel: document.getElementById('toggle-panel').classList.contains('active'),
    apiIndex: document.getElementById('api-select').value,
    customApiUrl: document.getElementById('custom-api-url').value,
    customApiKey: document.getElementById('custom-api-key').value,
    delay: parseInt(document.getElementById('delay-range').value)
  };
  chrome.storage.local.set({ settings: settings });
}

// 加载设置
function loadSettings() {
  chrome.storage.local.get('settings', (data) => {
    if (data.settings) {
      const s = data.settings;
      if (s.autoFill) document.getElementById('toggle-autofill').classList.add('active');
      else document.getElementById('toggle-autofill').classList.remove('active');

      if (s.autoSubmit) document.getElementById('toggle-autosubmit').classList.add('active');
      else document.getElementById('toggle-autosubmit').classList.remove('active');

      if (s.showPanel !== false) document.getElementById('toggle-panel').classList.add('active');
      else document.getElementById('toggle-panel').classList.remove('active');

      if (s.apiIndex !== undefined) document.getElementById('api-select').value = s.apiIndex;
      if (s.customApiUrl) document.getElementById('custom-api-url').value = s.customApiUrl;
      if (s.customApiKey) document.getElementById('custom-api-key').value = s.customApiKey;
      if (s.delay) {
        document.getElementById('delay-range').value = s.delay;
        document.getElementById('delay-value').textContent = s.delay + 'ms';
      }

      document.getElementById('custom-api-section').style.display =
        s.apiIndex === 'custom' ? 'block' : 'none';
    }
  });
}

// 加载统计信息
function loadStats() {
  chrome.storage.local.get('stats', (data) => {
    if (data.stats) {
      document.getElementById('total-searched').textContent = data.stats.searched || 0;
      document.getElementById('total-found').textContent = data.stats.found || 0;
      const rate = data.stats.searched > 0
        ? Math.round((data.stats.found / data.stats.searched) * 100) + '%'
        : '0%';
      document.getElementById('success-rate').textContent = rate;
      document.getElementById('current-api').textContent = data.stats.lastApi || '-';
    }
  });
}

// 监听来自 content script 的统计更新
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'statsUpdate') {
    loadStats();
  }
});
