// background.js - Service Worker (Manifest V3)

// 安装时初始化设置
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    settings: {
      autoFill: true,
      autoSubmit: false,
      showPanel: true,
      apiIndex: '0',
      customApiUrl: '',
      customApiKey: '',
      delay: 1500
    },
    stats: {
      searched: 0,
      found: 0,
      lastApi: ''
    }
  });
  console.log('[搜题助手] 插件已安装');
});

// 监听来自 content script 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'updateStats') {
    // 更新统计数据
    chrome.storage.local.get('stats', (data) => {
      const stats = data.stats || { searched: 0, found: 0 };
      stats.searched += (message.searched || 0);
      stats.found += (message.found || 0);
      if (message.api) stats.lastApi = message.api;
      chrome.storage.local.set({ stats: stats });
    });
  }

  if (message.action === 'getSettings') {
    chrome.storage.local.get('settings', (data) => {
      sendResponse(data.settings);
    });
    return true; // 异步响应
  }
});

// 右键菜单（可选）
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'searchSelected',
    title: '搜索选中文本答案',
    contexts: ['selection']
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'searchSelected' && info.selectionText) {
    // 发送选中的文本到 content script 进行搜索
    chrome.tabs.sendMessage(tab.id, {
      action: 'searchText',
      text: info.selectionText
    });
  }
});
