// ==超星学习通自动搜题助手 - Content Script==
// 运行在超星学习通页面上，自动识别题目并搜索答案

(function () {
  'use strict';

  // ========== 配置 ==========
  const CONFIG = {
    // 搜题 API 列表（按优先级排列）
    apis: [
      {
        name: '题库网',
        url: 'https://tk.enncy.cn/query',
        method: 'POST',
        buildBody: (q) => `title=${encodeURIComponent(q)}`,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        parse: (res) => {
          try {
            const data = JSON.parse(res);
            if (data.code === 200 && data.data) return data.data.answer || '';
          } catch (e) {}
          return '';
        }
      },
      {
        name: '小猿题库',
        url: 'https://api.muketool.com/selectq',
        method: 'POST',
        buildBody: (q) => JSON.stringify({ question: q }),
        headers: { 'Content-Type': 'application/json' },
        parse: (res) => {
          try {
            const data = JSON.parse(res);
            if (data.code === 200 && data.data && data.data.length > 0) {
              return data.data[0].answer || '';
            }
          } catch (e) {}
          return '';
        }
      }
    ],
    autoFill: true,        // 是否自动填写答案
    autoSubmit: false,     // 是否自动提交（默认关闭，安全起见）
    delay: 1500,           // 每题间隔时间(ms)
    showPanel: true        // 是否显示浮动面板
  };

  // ========== 状态管理 ==========
  let isRunning = false;
  let currentQuestionIndex = 0;
  let totalQuestions = 0;
  let panel = null;

  // ========== 工具函数 ==========

  /**
   * 去除 HTML 标签，提取纯文本
   */
  function stripHTML(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent.trim().replace(/\s+/g, ' ');
  }

  /**
   * 清理题目文本
   */
  function cleanQuestion(text) {
    return text
      .replace(/^\d+[\.\、\)\]】．]\s*/, '')   // 去除题号
      .replace(/^[（\(]\s*[A-Z]+\s*[）\)]\s*/i, '') // 去除已有选项标记
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * 延迟函数
   */
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 通过 API 搜题
   */
  async function searchAnswer(question) {
    const cleanQ = cleanQuestion(question);
    if (!cleanQ || cleanQ.length < 4) return null;

    for (const api of CONFIG.apis) {
      try {
        console.log(`[搜题助手] 尝试 ${api.name}: ${cleanQ.substring(0, 30)}...`);
        const response = await fetch(api.url, {
          method: api.method,
          headers: api.headers || {},
          body: api.buildBody(cleanQ)
        });
        const text = await response.text();
        const answer = api.parse(text);
        if (answer) {
          console.log(`[搜题助手] ${api.name} 找到答案:`, answer);
          return { source: api.name, answer: answer };
        }
      } catch (e) {
        console.warn(`[搜题助手] ${api.name} 请求失败:`, e);
      }
    }

    // 兜底：使用百度搜索
    try {
      const baiduUrl = `https://www.baidu.com/s?wd=${encodeURIComponent(cleanQ)}`;
      console.log(`[搜题助手] 尝试百度搜索: ${cleanQ.substring(0, 30)}...`);
      // 百度搜索需要在后台处理，这里返回搜索链接
      return { source: '百度搜索', answer: '', searchUrl: baiduUrl };
    } catch (e) {}

    return null;
  }

  // ========== 题目识别 ==========

  /**
   * 获取页面上所有题目
   */
  function getQuestions() {
    const questions = [];

    // 超星学习通常见题目容器选择器
    const selectors = [
      '.TiMu',                    // 常见题目容器
      '.singleQuesId',            // 单题容器
      '.questionLi',              // 题目列表项
      '[class*="question"]',      // 模糊匹配
      '.mark_question',           // 标记题目
      '#ZyBottom .clearfix',      // 作业底部题目
      '.answerBg'                 // 答题区域
    ];

    let containers = [];
    for (const sel of selectors) {
      const found = document.querySelectorAll(sel);
      if (found.length > 0) {
        containers = found;
        break;
      }
    }

    if (containers.length === 0) {
      // 尝试直接提取所有可能的题目元素
      containers = document.querySelectorAll('[id*="divCur"], [class*="Ques"]');
    }

    containers.forEach((container, index) => {
      try {
        // 提取题目类型
        const typeEl = container.querySelector('.Zy_TItle .clearfix, .mark_name, [class*="type"]');
        let questionType = 'unknown';
        if (typeEl) {
          const typeText = typeEl.textContent;
          if (/单选/i.test(typeText)) questionType = 'single';
          else if (/多选/i.test(typeText)) questionType = 'multiple';
          else if (/判断/i.test(typeText)) questionType = 'judge';
          else if (/填空/i.test(typeText)) questionType = 'fill';
          else if (/简答|论述|名词解释/i.test(typeText)) questionType = 'essay';
        }

        // 提取题目文本
        const titleEl = container.querySelector(
          '.Zy_TItle h3, .mark_name h3, [class*="title"], [class*="stem"], p'
        );
        if (!titleEl) return;

        const questionText = stripHTML(titleEl.innerHTML);
        if (!questionText || questionText.length < 4) return;

        // 提取选项（如果有）
        const options = [];
        const optionEls = container.querySelectorAll(
          '.Zy_ulBottom li, .mark_letter li, [class*="option"], [class*="answer"] li'
        );
        optionEls.forEach(opt => {
          const text = stripHTML(opt.innerHTML);
          if (text) options.push(text);
        });

        // 提取填空题的输入框
        const fillInputs = container.querySelectorAll(
          'input[type="text"], textarea, [contenteditable="true"]'
        );

        questions.push({
          index: index,
          container: container,
          type: questionType,
          text: questionText,
          options: options,
          fillInputs: Array.from(fillInputs),
          titleEl: titleEl
        });
      } catch (e) {
        console.warn('[搜题助手] 解析题目出错:', e);
      }
    });

    return questions;
  }

  // ========== 答案填写 ==========

  /**
   * 填写单选/多选题
   */
  function fillChoice(question, answer) {
    const answerText = answer.toUpperCase();
    const container = question.container;

    // 提取答案中的选项字母
    const letters = answerText.match(/[A-Z]/g) || [];
    if (letters.length === 0 && question.options.length > 0) {
      // 尝试按内容匹配
      for (let i = 0; i < question.options.length; i++) {
        if (answerText.includes(question.options[i].substring(0, 10))) {
          letters.push(String.fromCharCode(65 + i));
        }
      }
    }

    // 点击对应选项
    const optionEls = container.querySelectorAll(
      '.Zy_ulBottom li, .mark_letter li, [class*="option"] li'
    );

    let filled = false;
    letters.forEach(letter => {
      const index = letter.charCodeAt(0) - 65;
      if (index >= 0 && index < optionEls.length) {
        optionEls[index].click();
        filled = true;
        highlightElement(optionEls[index], '#4CAF50');
      }
    });

    return filled;
  }

  /**
   * 填写判断题
   */
  function fillJudge(question, answer) {
    const container = question.container;
    const isCorrect = /正确|对|√|是|true|A/i.test(answer);

    const labels = container.querySelectorAll(
      '.Zy_ulBottom li, .mark_letter li, [class*="option"] li, label'
    );

    for (const label of labels) {
      const text = label.textContent.trim();
      if (isCorrect && (/正确|对|√|是/.test(text) || /^A/i.test(text))) {
        label.click();
        highlightElement(label, '#4CAF50');
        return true;
      }
      if (!isCorrect && (/错误|错|×|否/.test(text) || /^B/i.test(text))) {
        label.click();
        highlightElement(label, '#4CAF50');
        return true;
      }
    }
    return false;
  }

  /**
   * 填写填空题
   */
  function fillBlank(question, answer) {
    const inputs = question.fillInputs;
    if (inputs.length === 0) return false;

    // 将答案按常见分隔符拆分
    const answers = answer.split(/[#\n\r|；;]/).map(s => s.trim()).filter(Boolean);

    let filled = false;
    inputs.forEach((input, i) => {
      const ans = answers[i] || answers[0] || answer;
      if (input.tagName === 'INPUT' || input.tagName === 'TEXTAREA') {
        // 触发 React/Vue 的 onChange
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype, 'value'
        ).set;
        nativeInputValueSetter.call(input, ans);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        filled = true;
        highlightElement(input, '#2196F3');
      } else if (input.isContentEditable) {
        input.textContent = ans;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        filled = true;
        highlightElement(input, '#2196F3');
      }
    });

    return filled;
  }

  /**
   * 高亮元素
   */
  function highlightElement(el, color) {
    el.style.outline = `3px solid ${color}`;
    el.style.outlineOffset = '2px';
    el.style.transition = 'outline 0.3s ease';
    setTimeout(() => {
      el.style.outline = '';
      el.style.outlineOffset = '';
    }, 3000);
  }

  // ========== UI 面板 ==========

  /**
   * 创建浮动控制面板
   */
  function createPanel() {
    if (panel) return;

    panel = document.createElement('div');
    panel.id = 'chaoxing-helper-panel';
    panel.innerHTML = `
      <div class="chx-header">
        <span class="chx-title">📚 超星搜题助手</span>
        <span class="chx-toggle" id="chx-minimize">─</span>
      </div>
      <div class="chx-body" id="chx-body">
        <div class="chx-status" id="chx-status">就绪，等待操作...</div>
        <div class="chx-progress" id="chx-progress" style="display:none">
          <div class="chx-progress-bar" id="chx-progress-bar"></div>
          <span class="chx-progress-text" id="chx-progress-text">0/0</span>
        </div>
        <div class="chx-log" id="chx-log"></div>
        <div class="chx-buttons">
          <button class="chx-btn chx-btn-primary" id="chx-scan">🔍 扫描题目</button>
          <button class="chx-btn chx-btn-success" id="chx-start">▶ 开始答题</button>
          <button class="chx-btn chx-btn-warning" id="chx-stop" disabled>⏹ 停止</button>
        </div>
        <div class="chx-options">
          <label><input type="checkbox" id="chx-autofill" checked> 自动填写</label>
          <label><input type="checkbox" id="chx-autosubmit"> 自动提交</label>
        </div>
      </div>
    `;
    document.body.appendChild(panel);

    // 绑定事件
    document.getElementById('chx-minimize').addEventListener('click', () => {
      const body = document.getElementById('chx-body');
      body.style.display = body.style.display === 'none' ? 'block' : 'none';
    });

    document.getElementById('chx-scan').addEventListener('click', () => {
      const questions = getQuestions();
      updateStatus(`扫描完成，发现 ${questions.length} 道题目`);
      questions.forEach((q, i) => {
        addLog(`题目${i + 1} [${q.type}]: ${q.text.substring(0, 40)}...`);
      });
    });

    document.getElementById('chx-start').addEventListener('click', startAutoAnswer);
    document.getElementById('chx-stop').addEventListener('click', stopAutoAnswer);

    // 拖拽功能
    makeDraggable(panel);
  }

  /**
   * 使面板可拖拽
   */
  function makeDraggable(el) {
    const header = el.querySelector('.chx-header');
    let isDragging = false;
    let offsetX, offsetY;

    header.addEventListener('mousedown', (e) => {
      isDragging = true;
      offsetX = e.clientX - el.offsetLeft;
      offsetY = e.clientY - el.offsetTop;
      header.style.cursor = 'grabbing';
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      el.style.left = (e.clientX - offsetX) + 'px';
      el.style.top = (e.clientY - offsetY) + 'px';
      el.style.right = 'auto';
    });

    document.addEventListener('mouseup', () => {
      isDragging = false;
      header.style.cursor = 'grab';
    });
  }

  /**
   * 更新状态文本
   */
  function updateStatus(text) {
    const statusEl = document.getElementById('chx-status');
    if (statusEl) statusEl.textContent = text;
  }

  /**
   * 更新进度条
   */
  function updateProgress(current, total) {
    const progressEl = document.getElementById('chx-progress');
    const barEl = document.getElementById('chx-progress-bar');
    const textEl = document.getElementById('chx-progress-text');

    if (progressEl) progressEl.style.display = 'block';
    if (barEl) barEl.style.width = `${(current / total) * 100}%`;
    if (textEl) textEl.textContent = `${current}/${total}`;
  }

  /**
   * 添加日志
   */
  function addLog(text, type = 'info') {
    const logEl = document.getElementById('chx-log');
    if (!logEl) return;

    const colors = { info: '#e0e0e0', success: '#4CAF50', error: '#f44336', warn: '#ff9800' };
    const line = document.createElement('div');
    line.style.color = colors[type] || colors.info;
    line.style.fontSize = '12px';
    line.style.marginBottom = '2px';
    line.textContent = `[${new Date().toLocaleTimeString()}] ${text}`;
    logEl.appendChild(line);
    logEl.scrollTop = logEl.scrollHeight;
  }

  // ========== 核心流程 ==========

  /**
   * 开始自动答题
   */
  async function startAutoAnswer() {
    if (isRunning) return;
    isRunning = true;

    document.getElementById('chx-start').disabled = true;
    document.getElementById('chx-stop').disabled = false;
    CONFIG.autoFill = document.getElementById('chx-autofill').checked;
    CONFIG.autoSubmit = document.getElementById('chx-autosubmit').checked;

    const questions = getQuestions();
    totalQuestions = questions.length;
    currentQuestionIndex = 0;

    if (totalQuestions === 0) {
      addLog('未找到任何题目，请确认页面已加载完成', 'error');
      updateStatus('未找到题目');
      isRunning = false;
      document.getElementById('chx-start').disabled = false;
      document.getElementById('chx-stop').disabled = true;
      return;
    }

    addLog(`发现 ${totalQuestions} 道题目，开始搜题...`, 'success');
    updateStatus('正在搜题中...');

    for (const question of questions) {
      if (!isRunning) break;

      currentQuestionIndex++;
      updateProgress(currentQuestionIndex, totalQuestions);
      updateStatus(`正在处理第 ${currentQuestionIndex}/${totalQuestions} 题...`);
      addLog(`搜题: ${question.text.substring(0, 50)}...`);

      try {
        const result = await searchAnswer(question.text);

        if (result && result.answer) {
          addLog(`✓ 找到答案 (${result.source}): ${result.answer.substring(0, 60)}`, 'success');

          if (CONFIG.autoFill) {
            let filled = false;
            switch (question.type) {
              case 'single':
              case 'multiple':
                filled = fillChoice(question, result.answer);
                break;
              case 'judge':
                filled = fillJudge(question, result.answer);
                break;
              case 'fill':
                filled = fillBlank(question, result.answer);
                break;
              default:
                // 尝试通用填写
                if (question.fillInputs.length > 0) {
                  filled = fillBlank(question, result.answer);
                } else {
                  filled = fillChoice(question, result.answer);
                }
            }
            addLog(filled ? '已自动填写答案' : '填写失败，请手动操作', filled ? 'success' : 'warn');
          }
        } else if (result && result.searchUrl) {
          addLog(`未找到答案，百度搜索: ${result.searchUrl}`, 'warn');
        } else {
          addLog('未找到答案', 'error');
        }
      } catch (e) {
        addLog(`搜题出错: ${e.message}`, 'error');
      }

      // 间隔等待，避免请求过快
      if (currentQuestionIndex < totalQuestions) {
        await sleep(CONFIG.delay);
      }
    }

    updateStatus('搜题完成！');
    addLog(`全部完成！共处理 ${totalQuestions} 道题`, 'success');
    isRunning = false;
    document.getElementById('chx-start').disabled = false;
    document.getElementById('chx-stop').disabled = true;
  }

  /**
   * 停止自动答题
   */
  function stopAutoAnswer() {
    isRunning = false;
    updateStatus('已停止');
    addLog('用户手动停止', 'warn');
    document.getElementById('chx-start').disabled = false;
    document.getElementById('chx-stop').disabled = true;
  }

  // ========== 初始化 ==========

  function init() {
    console.log('[搜题助手] 超星学习通搜题助手已加载');
    createPanel();
    addLog('插件已加载，点击"扫描题目"开始');

    // 监听页面变化（SPA 页面切换）
    const observer = new MutationObserver((mutations) => {
      // 如果面板被移除，重新创建
      if (!document.getElementById('chaoxing-helper-panel')) {
        panel = null;
        createPanel();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // 等待页面加载完成
  if (document.readyState === 'complete') {
    init();
  } else {
    window.addEventListener('load', init);
  }
})();
