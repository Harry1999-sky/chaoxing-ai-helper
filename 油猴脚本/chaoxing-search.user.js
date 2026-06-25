// ==UserScript==
// @name         学习通辅助工具
// @namespace    https://github.com/chaoxing-helper
// @version      5.2.0
// @description  学习通作业辅助，支持多API切换与图片识别
// @author       You
// @match        *://*.chaoxing.com/*
// @match        *://mooc1.chaoxing.com/*
// @match        *://mooc1-1.chaoxing.com/*
// @match        *://mooc1-2.chaoxing.com/*
// @match        *://*.cx.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @connect      api.deepseek.com
// @connect      api.openai.com
// @connect      api.chatanywhere.tech
// @connect      api.xiaomimimo.com
// @connect      p.ananas.chaoxing.com
// @connect      *.chaoxing.com
// @connect      *
// @run-at       document-idle
// @license      MIT
// ==/UserScript==

(function () {
  'use strict';

  // ==================== 配置 ====================
  var DEFAULT_CONFIG = {
    // API 列表：每个 api = { name, apiBase, model, apiKey, useFor }
    // useFor: 'text' = 文字题, 'vision' = 图片题, 'all' = 通用
    apis: [
      { name: 'MiMo文字', apiBase: 'https://api.xiaomimimo.com/v1', model: 'mimo-v2.5-pro', apiKey: '', useFor: 'text' },
      { name: 'MiMo图片', apiBase: 'https://api.xiaomimimo.com/v1', model: 'mimo-v2.5', apiKey: '', useFor: 'vision' },
      { name: 'DeepSeek文字', apiBase: 'https://api.deepseek.com', model: 'deepseek-v4-flash', apiKey: '', useFor: 'text', enabled: false }
    ],
    systemPrompt: '你是一位经验丰富的阅卷老师，熟悉各类考试标准答案。请根据题型严格按以下格式回答：\n- 单选题：只回复一个字母，如 A\n- 多选题：回复字母组合，如 AB 或 ACD\n- 判断题：回复"正确"或"错误"\n- 填空题：只回复答案内容，多个空用 # 分隔\n- 简答题/计算题/论述题：必须包含计算步骤或推理过程，然后给出最终结果。禁止只回复结果！格式示例："由题意得xxx，计算得xxx，所以答案是xxx"',
    temperature: 0.1, maxTokens: 2048, delay: 2000, autoFill: true
  };

  function loadConfig() {
    var s = GM_getValue('chx_config', null);
    if (s) {
      try {
        var c = Object.assign({}, DEFAULT_CONFIG, JSON.parse(s));
        // 旧配置升级：maxTokens 太低自动提升
        if (c.maxTokens < 1024) c.maxTokens = 2048;
        return c;
      } catch (e) {}
    }
    return Object.assign({}, DEFAULT_CONFIG);
  }
  function saveConfig(c) { GM_setValue('chx_config', JSON.stringify(c)); }
  var CONFIG = loadConfig();
  var isRunning = false, panel = null;

  // ==================== 答案缓存 ====================
  var answerCache = {};
  var cacheKey = 'chx_cache_' + (location.href.match(/workId=(\d+)/) || ['', 'default'])[1];

  function loadCache() {
    try {
      var saved = GM_getValue(cacheKey, null);
      if (saved) answerCache = JSON.parse(saved);
    } catch (e) { answerCache = {}; }
  }

  function saveCache() {
    try { GM_setValue(cacheKey, JSON.stringify(answerCache)); } catch (e) {}
  }

  function getCacheKey(question, opts) {
    // 用题目文本前50字 + 选项前30字作为缓存 key
    var key = question.substring(0, 50);
    if (opts && opts.length) key += '|' + opts.join('|').substring(0, 30);
    return key;
  }

  // ==================== 获取 API 配置 ====================
  // 根据是否有图片，自动选择合适的 API
  function getApiForQuestion(hasImage) {
    var apis = CONFIG.apis || [];
    if (apis.length === 0) return null;

    // 只从已启用的 API 里选
    var enabled = apis.filter(function (a) { return a.enabled !== false && a.apiKey; });
    if (enabled.length === 0) return null;

    if (hasImage) {
      for (var i = 0; i < enabled.length; i++) { if (enabled[i].useFor === 'vision') return enabled[i]; }
      for (var i = 0; i < enabled.length; i++) { if (enabled[i].useFor === 'all') return enabled[i]; }
    } else {
      for (var i = 0; i < enabled.length; i++) { if (enabled[i].useFor === 'text') return enabled[i]; }
      for (var i = 0; i < enabled.length; i++) { if (enabled[i].useFor === 'all') return enabled[i]; }
    }
    // 兜底：第一个已启用的
    return enabled[0] || null;
  }

  // ==================== 下载图片转 base64 ====================
  function downloadImageAsBase64(url) {
    return new Promise(function (resolve, reject) {
      GM_xmlhttpRequest({
        method: 'GET',
        url: url,
        responseType: 'blob',
        timeout: 15000,
        onload: function (resp) {
          var blob = resp.response;
          var reader = new FileReader();
          reader.onloadend = function () {
            resolve(reader.result); // data:image/png;base64,...
          };
          reader.onerror = function () { reject(new Error('图片转base64失败')); };
          reader.readAsDataURL(blob);
        },
        onerror: function () { reject(new Error('图片下载失败')); },
        ontimeout: function () { reject(new Error('图片下载超时')); }
      });
    });
  }

  // ==================== AI 调用（带缓存 + 多API + 图片支持） ====================
  function callAI(question, type, options, imageUrl) {
    var ck = getCacheKey(question, options) + (imageUrl ? '|IMG' : '');
    if (answerCache[ck]) {
      return Promise.resolve(answerCache[ck]);
    }

    var api = getApiForQuestion(!!imageUrl);
    if (!api) {
      return Promise.reject(new Error('没有可用的 API，请在设置中配置'));
    }

    // 构造提示文本
    var textPart = '题目：' + question;
    if (imageUrl) {
      textPart += '\n（这道题包含一张图片，请结合图片内容来回答）';
    }
    if (options && options.length) {
      textPart += '\n选项：\n';
      for (var i = 0; i < options.length; i++) textPart += String.fromCharCode(65 + i) + '. ' + options[i] + '\n';
    }
    if (type === 'single') textPart += '\n（单选题，只回复一个字母如 A）';
    else if (type === 'multiple') textPart += '\n（多选题，回复字母如 AB 或 ACD）';
    else if (type === 'judge') textPart += '\n（判断题，回复"正确"或"错误"）';
    else if (type === 'fill') textPart += '\n（填空题，只回复答案，多空用 # 分隔）';
    else textPart += '\n（简答题，简洁回答关键点）';

    // 构造请求
    function doRequest(imageDataUrl) {
      var userContent;
      if (imageDataUrl) {
        userContent = [
          { type: 'image_url', image_url: { url: imageDataUrl } },
          { type: 'text', text: textPart }
        ];
      } else {
        userContent = textPart;
      }

      // 判断是否是 MiMo API（需要特殊处理）
      var isMiMo = api.apiBase.indexOf('xiaomimimo') !== -1 || api.model.indexOf('mimo') !== -1;
      var systemRole = isMiMo ? 'developer' : 'system';

      // 构造请求体
      var body = {
        model: api.model,
        messages: [
          { role: systemRole, content: CONFIG.systemPrompt },
          { role: 'user', content: userContent }
        ]
      };

      // MiMo 强制 temperature=1.0，不传 temperature
      if (!isMiMo) {
        body.temperature = CONFIG.temperature;
      }

      // MiMo 用 max_completion_tokens，OpenAI 用 max_tokens
      if (isMiMo) {
        body.max_completion_tokens = CONFIG.maxTokens;
      } else {
        body.max_tokens = CONFIG.maxTokens;
      }

      return new Promise(function (resolve, reject) {
        GM_xmlhttpRequest({
          method: 'POST',
          url: api.apiBase + '/chat/completions',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + api.apiKey },
          data: JSON.stringify(body),
          timeout: 90000,
          onload: function (r) {
            try {
              log('[响应] status=' + r.status);
              var d = JSON.parse(r.responseText);
              if (d.error) {
                log('[API错误] ' + (d.error.message || JSON.stringify(d.error)), 'err');
                reject(new Error(d.error.message || JSON.stringify(d.error)));
                return;
              }
              if (d.choices && d.choices[0]) {
                var msg = d.choices[0].message;
                var content = msg.content;
                var reasoningContent = msg.reasoning_content || '';
                if (reasoningContent) {
                  log('[推理] ' + reasoningContent.substring(0, 100) + '...', 'ai');
                }
                var ans = (content || '').trim();
                // 如果 content 为空但有推理链，尝试从推理链末尾提取答案
                if (!ans && reasoningContent) {
                  var lastLine = reasoningContent.trim().split('\n').pop().trim();
                  if (/^[A-Da-d]+$/.test(lastLine)) {
                    ans = lastLine.toUpperCase();
                    log('[从推理链提取] ' + ans, 'ok');
                  }
                }
                // 记录 token 使用情况
                if (d.usage) {
                  var u = d.usage;
                  log('[tokens] prompt=' + (u.prompt_tokens||'?') + ' completion=' + (u.completion_tokens||'?') + ' reasoning=' + (u.completion_tokens_details?.reasoning_tokens || (reasoningContent ? '~' : '0')));
                }
                if (ans) {
                  // MiMo: 去除 think 标签
                  if (api.isMimo || (api.model && api.model.indexOf('mimo') !== -1)) {
                    var thinkMatch = ans.match(/<think>([\s\S]*?)<\/think>/);
                    if (thinkMatch && thinkMatch[1].trim()) {
                      log('[思考] ' + thinkMatch[1].trim().substring(0, 100));
                    }
                    ans = ans.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
                  }
                  answerCache[ck] = ans;
                  saveCache();
                  resolve(ans);
                } else {
                  log('[空内容] finish_reason=' + (d.choices[0].finish_reason || '?'), 'warn');
                  reject(new Error('AI返回空答案'));
                }
              } else {
                log('[异常响应] ' + r.responseText.substring(0, 150), 'warn');
                reject(new Error('未知响应格式'));
              }
            } catch (e) {
              log('[解析失败] ' + e.message, 'err');
              reject(new Error('解析失败'));
            }
          },
          onerror: function (e) {
            log('[网络错误] ' + (e.error || '请求失败'), 'err');
            reject(new Error('网络错误'));
          },
          ontimeout: function () {
            log('[超时] 90秒无响应', 'err');
            reject(new Error('超时'));
          }
        });
      });
    }

    // 有图片：先下载转 base64，再发给 API
    if (imageUrl) {
      return downloadImageAsBase64(imageUrl).then(function (base64Url) {
        return doRequest(base64Url);
      });
    }

    // 无图片：直接调用
    return doRequest(null);
  }

  // ==================== 核心：直接调用页面函数 ====================

  /**
   * 选择单选题选项
   * 调用页面的 addChoice() 函数
   */
  function selectSingleOption(qid, letter) {
    // 找到该题的所有选项 div（单选题用 .choice{qid} + .num_option）
    var optionSpans = document.querySelectorAll('.choice' + qid + '.num_option');
    if (!optionSpans.length) {
      optionSpans = document.querySelectorAll('[qid="' + qid + '"] .num_option');
    }

    // 找到对应字母的选项
    var target = null;
    optionSpans.forEach(function (el) {
      var data = el.getAttribute('data');
      if (data && data.toUpperCase() === letter.toUpperCase()) {
        target = el;
      }
    });

    if (!target) return false;

    // 找到父级 .answerBg（它有 onclick="addChoice(this)"）
    var parentDiv = target.closest('.answerBg');
    if (parentDiv && typeof addChoice === 'function') {
      addChoice(parentDiv);
      return true;
    }
    return false;
  }

  /**
   * 选择多选题选项
   * 调用页面的 addMultipleChoice() 函数
   */
  function selectMultipleOption(qid, letter) {
    // 多选题用 .choice{qid} + .num_option_dx
    var optionSpans = document.querySelectorAll('.choice' + qid + '.num_option_dx');
    if (!optionSpans.length) {
      optionSpans = document.querySelectorAll('[qid="' + qid + '"] .num_option_dx');
    }

    // 找到对应字母的选项
    var target = null;
    optionSpans.forEach(function (el) {
      var data = el.getAttribute('data');
      if (data && data.toUpperCase() === letter.toUpperCase()) {
        target = el;
      }
    });

    if (!target) return false;

    // 找到父级 .answerBg（它有 onclick="addMultipleChoice(this)"）
    var parentDiv = target.closest('.answerBg');
    if (parentDiv && typeof addMultipleChoice === 'function') {
      addMultipleChoice(parentDiv);
      return true;
    }
    return false;
  }

  /**
   * 填写填空题/简答题
   * 直接调用 UEditor 的 setContent()，带重试
   */
  function fillUEditor(editorId, content) {
    var maxRetries = 3;
    var retryDelay = 1000;

    function tryFill(attempt) {
      try {
        var editor = UE.getEditor(editorId);
        if (editor && editor.isReady) {
          editor.setContent('<p>' + content + '</p>');
          return true;
        }
      } catch (e) {}
      return false;
    }

    // 第一次尝试
    if (tryFill(0)) return true;

    // 失败了，异步重试
    return new Promise(function (resolve) {
      var attempt = 0;
      var timer = setInterval(function () {
        attempt++;
        if (tryFill(attempt)) {
          clearInterval(timer);
          resolve(true);
        } else if (attempt >= maxRetries) {
          clearInterval(timer);
          // 最后尝试直接操作 textarea
          var ta = document.getElementById(editorId);
          if (ta) {
            ta.value = content;
            ta.dispatchEvent(new Event('input', { bubbles: true }));
            ta.dispatchEvent(new Event('change', { bubbles: true }));
            resolve(true);
          } else {
            resolve(false);
          }
        }
      }, retryDelay);
    });
  }

  // ==================== 样式 ====================
  GM_addStyle(
    '#chx-panel{position:fixed;top:80px;right:20px;width:340px;background:#fff;border-radius:12px;z-index:999999;box-shadow:0 4px 24px rgba(0,0,0,.18);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;font-size:13px;color:#333;overflow:hidden;border:1px solid rgba(102,126,234,.3)}' +
    '#chx-panel *{box-sizing:border-box}' +
    '#chx-panel .chx-hd{background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;padding:10px 14px;display:flex;justify-content:space-between;align-items:center;cursor:grab;user-select:none}' +
    '#chx-panel .chx-hd:active{cursor:grabbing}' +
    '#chx-panel .chx-hd span:first-child{font-weight:700;font-size:14px}' +
    '#chx-panel .chx-min{cursor:pointer;width:24px;height:24px;display:flex;align-items:center;justify-content:center;border-radius:4px;font-size:16px}' +
    '#chx-panel .chx-min:hover{background:rgba(255,255,255,.2)}' +
    '#chx-panel .chx-bd{padding:12px}' +
    '#chx-panel .chx-status{background:#f0f2ff;color:#667eea;padding:8px 10px;border-radius:6px;font-size:12px;margin-bottom:10px;text-align:center}' +
    '#chx-panel .chx-progress{position:relative;height:22px;background:#e8eaf6;border-radius:11px;overflow:hidden;margin-bottom:10px;display:none}' +
    '#chx-panel .chx-progress-bar{height:100%;background:linear-gradient(90deg,#667eea,#764ba2);border-radius:11px;transition:width .4s;width:0%}' +
    '#chx-panel .chx-progress-txt{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:11px;font-weight:700}' +
    '#chx-panel .chx-log{max-height:140px;overflow-y:auto;background:#1e1e1e;color:#d4d4d4;padding:8px;border-radius:6px;font-family:Consolas,"Courier New",monospace;font-size:11px;margin-bottom:10px;line-height:1.5}' +
    '#chx-panel .chx-log .ok{color:#4CAF50}' +
    '#chx-panel .chx-log .err{color:#f44336}' +
    '#chx-panel .chx-log .warn{color:#ff9800}' +
    '#chx-panel .chx-log .ai{color:#64b5f6}' +
    '#chx-panel .chx-btns{display:flex;gap:6px}' +
    '#chx-panel .chx-btn{flex:1;padding:8px 0;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;transition:all .2s;color:#fff}' +
    '#chx-panel .chx-btn:hover{transform:translateY(-1px);box-shadow:0 2px 8px rgba(0,0,0,.15)}' +
    '#chx-panel .chx-btn:disabled{opacity:.5;cursor:not-allowed;transform:none}' +
    '#chx-panel .chx-btn.b1{background:#667eea}' +
    '#chx-panel .chx-btn.b2{background:#4CAF50}' +
    '#chx-panel .chx-btn.b3{background:#f44336}' +
    '#chx-panel .chx-btn.b4{background:#ff9800}' +
    '#chx-panel .chx-opts{display:flex;gap:16px;margin-top:10px;padding-top:10px;border-top:1px solid #eee}' +
    '#chx-panel .chx-opts label{display:flex;align-items:center;gap:4px;font-size:11px;color:#666;cursor:pointer}' +
    '#chx-panel .chx-opts input{accent-color:#667eea}' +
    '#chx-panel .chx-settings{display:none;margin-top:10px;padding:10px;background:#f8f9fa;border-radius:6px;border:1px solid #eee}' +
    '#chx-panel .chx-settings.show{display:block}' +
    '#chx-panel .chx-settings label{display:block;font-size:11px;color:#666;margin-bottom:3px;margin-top:8px}' +
    '#chx-panel .chx-settings label:first-child{margin-top:0}' +
    '#chx-panel .chx-settings input,#chx-panel .chx-settings select{width:100%;padding:6px 8px;border:1px solid #ddd;border-radius:4px;font-size:12px;margin-bottom:4px}' +
    '#chx-panel .chx-save{width:100%;padding:8px;margin-top:8px;background:#667eea;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600}' +
    '#chx-panel .chx-save:hover{background:#5a6fd6}' +
    '#chx-panel .chx-api-item{background:#fff;border:1px solid #e8eaf6;border-radius:8px;padding:10px;margin-bottom:8px;}' +
    '#chx-panel .chx-api-hd{display:flex;gap:6px;align-items:center;margin-bottom:6px;}' +
    '#chx-panel .chx-api-name{flex:1;padding:4px 8px;border:1px solid #ddd;border-radius:4px;font-size:12px;}' +
    '#chx-panel .chx-api-use{padding:4px;border:1px solid #ddd;border-radius:4px;font-size:11px;background:#f8f9fa;}' +
    '#chx-panel .chx-api-del{padding:2px 8px;background:#f44336;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;}' +
    '#chx-panel .chx-api-del:hover{background:#d32f2f;}' +
    '#chx-panel .chx-api-toggle{display:flex;align-items:center;gap:3px;font-size:11px;color:#666;cursor:pointer;white-space:nowrap;}' +
    '#chx-panel .chx-api-toggle input{accent-color:#4CAF50;width:14px;height:14px;}' +
    '#chx-panel .chx-api-input{width:100%;padding:4px 8px;border:1px solid #ddd;border-radius:4px;font-size:12px;margin-bottom:4px;}' +
    '#chx-panel .chx-api-list{max-height:300px;overflow-y:auto;}' +
    '@keyframes chx-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.15)}}' +
    '#chx-ball:hover{transform:scale(1.1) !important;}'
  );

  // ==================== 工具函数 ====================
  function stripHTML(html) { var t = document.createElement('div'); t.innerHTML = html; return t.textContent.trim().replace(/\s+/g, ' '); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function log(msg, cls) { var el = document.getElementById('chx-log'); if (!el) return; var d = document.createElement('div'); if (cls) d.className = cls; d.textContent = '[' + new Date().toLocaleTimeString() + '] ' + msg; el.appendChild(d); el.scrollTop = el.scrollHeight; }
  function setStatus(t) { var el = document.getElementById('chx-status'); if (el) el.textContent = t; }
  function setProgress(cur, total) { var w = document.getElementById('chx-progress'), b = document.getElementById('chx-progress-bar'), t = document.getElementById('chx-progress-txt'); if (w) w.style.display = 'block'; if (b) b.style.width = ((cur / total) * 100) + '%'; if (t) t.textContent = cur + '/' + total; }

  // ==================== 题目识别 ====================
  /**
   * 检查题目是否已作答
   */
  function isAnswered(q) {
    // 方法1: 检查隐藏 input 的值
    var answerInput = document.getElementById('answer' + q.qid);
    if (answerInput && answerInput.value && answerInput.value.trim().length > 0) {
      return true;
    }

    // 方法2: 检查答案卡是否有 active class
    var sheet = document.getElementById('answerSheet' + q.qid);
    if (sheet && sheet.classList.contains('active')) {
      return true;
    }

    // 方法3: 单选/多选检查是否有选中状态
    if (q.type === 'single') {
      var checked = q.el.querySelector('.num_option.check_answer');
      if (checked) return true;
    }
    if (q.type === 'multiple') {
      var checked = q.el.querySelector('.num_option_dx.check_answer_dx');
      if (checked) return true;
    }

    // 方法4: 填空/简答检查 UEditor 内容
    if (q.type === 'fill' || q.type === 'essay') {
      for (var i = 0; i < q.editorIds.length; i++) {
        try {
          var editor = UE.getEditor(q.editorIds[i]);
          if (editor && editor.getContent && editor.getContent().replace(/<[^>]*>/g, '').trim().length > 0) {
            return true;
          }
        } catch (e) {}
      }
    }

    return false;
  }

  function getQuestions(skipAnswered) {
    var qs = [];
    var containers = document.querySelectorAll('.questionLi.singleQuesId');
    if (!containers.length) containers = document.querySelectorAll('.singleQuesId');
    if (!containers.length) return qs;

    containers.forEach(function (el) {
      try {
        var qid = el.getAttribute('data') || el.id.replace('question', '');
        var titleEl = el.querySelector('h3.mark_name');
        if (!titleEl) return;

        var titleText = titleEl.textContent.trim();
        var typeName = el.getAttribute('typeName') || '';
        var type = 'unknown';
        if (/单选/.test(typeName) || /单选/.test(titleText)) type = 'single';
        else if (/多选/.test(typeName) || /多选/.test(titleText)) type = 'multiple';
        else if (/判断/.test(typeName) || /判断/.test(titleText)) type = 'judge';
        else if (/填空/.test(typeName) || /填空/.test(titleText)) type = 'fill';
        else if (/简答|论述|名词解释/.test(typeName) || /简答|论述|名词解释/.test(titleText)) type = 'essay';
        else if (/作图/.test(typeName) || /作图/.test(titleText)) type = 'essay';

        var text = stripHTML(titleEl.innerHTML)
          .replace(/^\d+[\.\、\)\]】．]\s*/, '')
          .replace(/[\(（]\s*(?:单选|多选|判断|填空|简答|论述|名词解释|作图)[题]?\s*[\)）]\s*/i, '')
          .trim();

        // 检测图片题：文本过短或包含大量空白，查找题目区域的图片
        var imageUrl = null;
        var imgEls = titleEl.querySelectorAll('img');
        if (!imgEls.length) imgEls = el.querySelector('.stem_answer') ? el.querySelector('.stem_answer').querySelectorAll('img') : [];
        if (imgEls.length > 0) {
          imageUrl = imgEls[0].getAttribute('data-original') || imgEls[0].getAttribute('src') || '';
          // 转为高清原图URL
          imageUrl = imageUrl.replace(/375_1024|750_1024/, 'origin');
        }

        // 如果文本太短且有图片，用图片；如果文本为空且无图片，跳过
        if ((!text || text.length < 4) && !imageUrl) return;
        // 如果文本为空但有图片，用占位文本
        if ((!text || text.length < 2) && imageUrl) text = '[图片题]';

        var opts = [];
        el.querySelectorAll('.answer_p p').forEach(function (p) {
          var t = stripHTML(p.innerHTML);
          if (t) opts.push(t);
        });

        var editorIds = [];
        el.querySelectorAll('textarea[id^="answerEditor"], textarea[id^="answer"]').forEach(function (ta) {
          editorIds.push(ta.id);
        });

        var answerInput = document.getElementById('answer' + qid);

        var q = {
          qid: qid,
          type: type,
          text: text,
          opts: opts,
          imageUrl: imageUrl,
          editorIds: editorIds,
          answerInput: answerInput,
          el: el
        };

        // 如果需要跳过已答题目
        if (skipAnswered && isAnswered(q)) {
          return; // skip
        }

        qs.push(q);
      } catch (e) {}
    });

    return qs;
  }

  // ==================== 面板 ====================
  function renderApiList() {
    var apis = CONFIG.apis || [];
    var html = '';
    for (var i = 0; i < apis.length; i++) {
      var a = apis[i];
      var enabled = a.enabled !== false; // 默认启用
      html += '<div class="chx-api-item" data-idx="' + i + '" style="opacity:' + (enabled ? '1' : '0.5') + '">' +
        '<div class="chx-api-hd">' +
          '<label class="chx-api-toggle"><input type="checkbox" ' + (enabled ? 'checked' : '') + ' data-idx="' + i + '" data-field="enabled"> 启用</label>' +
          '<input class="chx-api-name" value="' + (a.name || '') + '" placeholder="名称" data-idx="' + i + '" data-field="name">' +
          '<select class="chx-api-use" data-idx="' + i + '" data-field="useFor">' +
            '<option value="text"' + (a.useFor === 'text' ? ' selected' : '') + '>文字题</option>' +
            '<option value="vision"' + (a.useFor === 'vision' ? ' selected' : '') + '>图片题</option>' +
            '<option value="all"' + (a.useFor === 'all' ? ' selected' : '') + '>通用</option>' +
          '</select>' +
          '<button class="chx-api-del" data-idx="' + i + '">✕</button>' +
        '</div>' +
        '<input class="chx-api-input" value="' + (a.apiBase || '') + '" placeholder="接口地址 (https://api.xxx.com)" data-idx="' + i + '" data-field="apiBase">' +
        '<input class="chx-api-input" value="' + (a.model || '') + '" placeholder="模型名 (gpt-4o)" data-idx="' + i + '" data-field="model">' +
        '<input class="chx-api-input" type="password" value="' + (a.apiKey || '') + '" placeholder="API Key" data-idx="' + i + '" data-field="apiKey">' +
      '</div>';
    }
    return html;
  }

  function createPanel() {
    if (panel) return;
    panel = document.createElement('div');
    panel.id = 'chx-panel';
    panel.innerHTML =
      '<div class="chx-hd"><span>🤖 超星AI搜题助手 v5</span><span class="chx-min" id="chx-min">─</span></div>' +
      '<div class="chx-bd" id="chx-bd">' +
      '<div class="chx-status" id="chx-status">就绪</div>' +
      '<div class="chx-progress" id="chx-progress"><div class="chx-progress-bar" id="chx-progress-bar"></div><span class="chx-progress-txt" id="chx-progress-txt">0/0</span></div>' +
      '<div class="chx-log" id="chx-log"></div>' +
      '<div class="chx-btns">' +
      '<button class="chx-btn b1" id="chx-scan">🔍 扫描</button>' +
      '<button class="chx-btn b2" id="chx-start">▶ 开始</button>' +
      '<button class="chx-btn b3" id="chx-stop" disabled>⏹ 停止</button>' +
      '<button class="chx-btn b4" id="chx-cfg">⚙</button>' +
      '</div>' +
      '<div class="chx-opts"><label><input type="checkbox" id="chx-autofill" ' + (CONFIG.autoFill ? 'checked' : '') + '> 自动填写</label></div>' +
      '<div class="chx-settings" id="chx-settings">' +
      '<div class="chx-api-list" id="chx-api-list">' + renderApiList() + '</div>' +
      '<button class="chx-btn b1" id="chx-add-api" style="margin:8px 0;width:100%">+ 添加 API</button>' +
      '<label>答题间隔 (ms)</label><input type="number" id="chx-delay" value="' + CONFIG.delay + '" min="500" max="10000">' +
      '<label>最大输出 tokens</label><input type="number" id="chx-max-tokens" value="' + CONFIG.maxTokens + '" min="100" max="8192">' +
      '<button class="chx-save" id="chx-save">💾 保存配置</button>' +
      '<button class="chx-btn b3" id="chx-clear-cache" style="margin-top:6px;width:100%">🗑 清除答案缓存</button>' +
      '</div></div>';
    document.body.appendChild(panel);

    // 事件
    document.getElementById('chx-min').onclick = function () { minimizePanel(); };
    document.getElementById('chx-cfg').onclick = function () { document.getElementById('chx-settings').classList.toggle('show'); };

    // 保存配置
    document.getElementById('chx-save').onclick = function () {
      var apis = [];
      var items = document.querySelectorAll('.chx-api-item');
      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        var name = item.querySelector('[data-field="name"]').value.trim();
        var apiBase = item.querySelector('[data-field="apiBase"]').value.trim();
        var model = item.querySelector('[data-field="model"]').value.trim();
        var apiKey = item.querySelector('[data-field="apiKey"]').value.trim();
        var useFor = item.querySelector('[data-field="useFor"]').value;
        var enabled = item.querySelector('[data-field="enabled"]').checked;
        if (apiKey) apis.push({ name: name, apiBase: apiBase, model: model, apiKey: apiKey, useFor: useFor, enabled: enabled });
      }
      CONFIG.apis = apis;
      CONFIG.delay = parseInt(document.getElementById('chx-delay').value) || 2000;
      CONFIG.maxTokens = parseInt(document.getElementById('chx-max-tokens').value) || 1024;
      saveConfig(CONFIG);
      log('配置已保存！共 ' + apis.length + ' 个 API', 'ok');
      document.getElementById('chx-settings').classList.remove('show');
    };

    // 添加 API
    document.getElementById('chx-add-api').onclick = function () {
      CONFIG.apis = CONFIG.apis || [];
      CONFIG.apis.push({ name: '新接口', apiBase: '', model: '', apiKey: '', useFor: 'text' });
      document.getElementById('chx-api-list').innerHTML = renderApiList();
      bindApiEvents();
    };

    // 删除 API + 启用/禁用切换
    function bindApiEvents() {
      document.querySelectorAll('.chx-api-del').forEach(function (btn) {
        btn.onclick = function () {
          var idx = parseInt(this.getAttribute('data-idx'));
          saveApiInputs();
          CONFIG.apis.splice(idx, 1);
          document.getElementById('chx-api-list').innerHTML = renderApiList();
          bindApiEvents();
        };
      });
      document.querySelectorAll('.chx-api-toggle input').forEach(function (cb) {
        cb.onchange = function () {
          var item = this.closest('.chx-api-item');
          item.style.opacity = this.checked ? '1' : '0.5';
        };
      });
    }

    // 读取输入框的值到 CONFIG（删除前用）
    function saveApiInputs() {
      var items = document.querySelectorAll('.chx-api-item');
      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        var idx = parseInt(item.getAttribute('data-idx'));
        if (CONFIG.apis[idx]) {
          CONFIG.apis[idx].name = item.querySelector('[data-field="name"]').value.trim();
          CONFIG.apis[idx].apiBase = item.querySelector('[data-field="apiBase"]').value.trim();
          CONFIG.apis[idx].model = item.querySelector('[data-field="model"]').value.trim();
          CONFIG.apis[idx].apiKey = item.querySelector('[data-field="apiKey"]').value.trim();
          CONFIG.apis[idx].useFor = item.querySelector('[data-field="useFor"]').value;
        }
      }
    }

    bindApiEvents();

    document.getElementById('chx-scan').onclick = doScan;
    document.getElementById('chx-start').onclick = startAuto;
    document.getElementById('chx-stop').onclick = stopAuto;

    // 清除缓存
    document.getElementById('chx-clear-cache').onclick = function () {
      answerCache = {};
      GM_setValue(cacheKey, '{}');
      log('答案缓存已清除！', 'ok');
    };

    // 拖拽
    var hd = panel.querySelector('.chx-hd'), dr = false, ox, oy;
    hd.onmousedown = function (e) { dr = true; ox = e.clientX - panel.offsetLeft; oy = e.clientY - panel.offsetTop; };
    document.addEventListener('mousemove', function (e) { if (!dr) return; panel.style.left = (e.clientX - ox) + 'px'; panel.style.top = (e.clientY - oy) + 'px'; panel.style.right = 'auto'; });
    document.addEventListener('mouseup', function () { dr = false; });
  }

  // ==================== 扫描 ====================
  function doScan() {
    var qs = getQuestions();
    if (qs.length) {
      setStatus('扫描完成，发现 ' + qs.length + ' 道题');
      log('扫描到 ' + qs.length + ' 道题', 'ok');
      qs.forEach(function (q, i) { log((i + 1) + '. [' + q.type + '] ' + q.text.substring(0, 45) + '...'); });
    } else {
      setStatus('未找到题目');
      log('未找到题目，请确认页面已加载', 'warn');
    }
  }

  // ==================== 核心答题 ====================
  async function startAuto() {
    if (isRunning) return;
    var hasApi = (CONFIG.apis || []).some(function (a) { return a.apiKey && a.enabled !== false; });
    if (!hasApi) { log('请先配置 API！点击 ⚙ 设置', 'err'); document.getElementById('chx-settings').classList.add('show'); return; }

    isRunning = true;
    document.getElementById('chx-start').disabled = true;
    document.getElementById('chx-stop').disabled = false;

    // 先扫全部题目统计已答数量
    var allQs = getQuestions(false);
    var unansweredQs = getQuestions(true);
    var answeredCount = allQs.length - unansweredQs.length;

    if (!allQs.length) { log('未找到题目', 'err'); setStatus('未找到题目'); isRunning = false; document.getElementById('chx-start').disabled = false; document.getElementById('chx-stop').disabled = true; return; }

    if (answeredCount > 0) {
      log('已答 ' + answeredCount + ' 题，跳过', 'ok');
    }

    if (!unansweredQs.length) {
      log('所有题目已作答完毕！', 'ok');
      setStatus('全部已答完');
      isRunning = false;
      document.getElementById('chx-start').disabled = false;
      document.getElementById('chx-stop').disabled = true;
      return;
    }

    var qs = unansweredQs;
    log('剩余 ' + qs.length + ' 题未答，AI 开始答题...', 'ok');
    setStatus('AI 搜题中...');
    var found = 0;

    for (var i = 0; i < qs.length; i++) {
      if (!isRunning) break;
      var q = qs[i];
      setProgress(i + 1, qs.length);
      setStatus('AI 思考中 ' + (i + 1) + '/' + qs.length + '...');

      try {
        var usedApi = getApiForQuestion(!!q.imageUrl);
        if (q.imageUrl) {
          log('问AI: [图片题] ' + q.text.substring(0, 20) + '... [' + (usedApi ? usedApi.name : '?') + ']', 'ai');
        } else {
          log('问AI: ' + q.text.substring(0, 35) + '... [' + (usedApi ? usedApi.name : '?') + ']', 'ai');
        }

        // 调用 AI，失败自动重试 1 次
        var answer = '';
        try {
          answer = await callAI(q.text, q.type, q.opts, q.imageUrl);
        } catch (retryErr) {
          log('重试中...', 'warn');
          await sleep(2000);
          try { answer = await callAI(q.text, q.type, q.opts, q.imageUrl); } catch (e2) {}
        }

        if (answer) {
          log('AI答: ' + answer.substring(0, 50), 'ok');
          found++;
        } else {
          log('AI未返回答案', 'err');
        }

        if (document.getElementById('chx-autofill').checked) {
          var filled = false;

          if (q.type === 'single') {
            // 单选题：调用 addChoice
            var letters = answer.toUpperCase().match(/[A-Z]/g);
            if (letters) {
              for (var j = 0; j < letters.length; j++) {
                if (selectSingleOption(q.qid, letters[j])) {
                  filled = true;
                  log('选中选项 ' + letters[j], 'ok');
                }
              }
            }
          } else if (q.type === 'multiple') {
            // 多选题：调用 addMultipleChoice
            var letters = answer.toUpperCase().match(/[A-Z]/g);
            if (letters) {
              for (var j = 0; j < letters.length; j++) {
                if (selectMultipleOption(q.qid, letters[j])) {
                  filled = true;
                  log('选中选项 ' + letters[j], 'ok');
                }
              }
            }
          } else if (q.type === 'judge') {
            // 判断题：找到对/错的选项
            var isYes = /正确|对|√|是|true|^\s*A\s*$/i.test(answer.trim());
            var judgeOpts = q.el.querySelectorAll('.answerBg');
            var targetIdx = isYes ? 0 : 1;
            if (judgeOpts[targetIdx] && typeof addChoice === 'function') {
              addChoice(judgeOpts[targetIdx]);
              filled = true;
              log('判断: ' + (isYes ? '对' : '错'), 'ok');
            }
          } else if (q.type === 'fill' || q.type === 'essay') {
            // 填空题/简答题：用 UEditor API（带重试）
            var parts = answer.split('#').map(function (s) { return s.trim(); }).filter(Boolean);
            for (var j = 0; j < q.editorIds.length; j++) {
              var val = parts[j] || parts[0] || answer;
              var ok = await fillUEditor(q.editorIds[j], val);
              if (ok) {
                filled = true;
                log('填写: ' + val.substring(0, 20), 'ok');
              }
            }
            // 如果没有 editorIds，尝试直接找 textarea
            if (!q.editorIds.length) {
              var textareas = q.el.querySelectorAll('textarea');
              textareas.forEach(function (ta, idx) {
                var val = parts[idx] || parts[0] || answer;
                ta.value = val;
                ta.dispatchEvent(new Event('input', { bubbles: true }));
                ta.dispatchEvent(new Event('change', { bubbles: true }));
                filled = true;
              });
              if (filled) log('填写（textarea）', 'ok');
            }
          }

          if (!filled) log('填写失败，请手动', 'warn');
        }
      } catch (e) {
        log('AI错误: ' + e.message, 'err');
      }

      if (i < qs.length - 1) await sleep(CONFIG.delay);
    }

    setStatus('完成！AI 回答 ' + found + '/' + qs.length + ' 题');
    log('搜题完成，AI 回答了 ' + found + '/' + qs.length + ' 题', 'ok');
    isRunning = false;
    document.getElementById('chx-start').disabled = false;
    document.getElementById('chx-stop').disabled = true;
  }

  function stopAuto() { isRunning = false; setStatus('已停止'); log('用户手动停止', 'warn'); document.getElementById('chx-start').disabled = false; document.getElementById('chx-stop').disabled = true; }

  // ==================== 悬浮球 ====================
  var ball = null;
  var BALL_POS_KEY = 'chx_ball_pos';

  // 读取悬浮球位置
  function getBallPos() {
    var saved = GM_getValue(BALL_POS_KEY, null);
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    return { top: 'auto', bottom: '80px', right: '30px', left: 'auto' };
  }

  // 保存悬浮球位置
  function saveBallPos(pos) {
    GM_setValue(BALL_POS_KEY, JSON.stringify(pos));
  }

  // 展开面板（隐藏悬浮球）
  function expandPanel() {
    if (ball) { ball.remove(); ball = null; }
    if (panel) panel.style.display = 'block';
  }

  // 缩小为悬浮球（隐藏面板）
  function minimizePanel() {
    if (panel) panel.style.display = 'none';
    showBall();
  }

  // 显示悬浮球
  function showBall() {
    if (ball) return;
    var pos = getBallPos();

    ball = document.createElement('div');
    ball.id = 'chx-ball';
    ball.innerHTML = '🤖';
    ball.style.cssText = 'position:fixed;width:50px;height:50px;background:linear-gradient(135deg,#667eea,#764ba2);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:24px;cursor:grab;z-index:999998;box-shadow:0 4px 15px rgba(102,126,234,0.5);user-select:none;transition:transform 0.15s;';
    ball.title = '点击展开面板 (Alt+W)';

    // 恢复位置
    ball.style.top = pos.top;
    ball.style.bottom = pos.bottom;
    ball.style.right = pos.right;
    ball.style.left = pos.left;

    document.body.appendChild(ball);

    // 答题中闪烁
    if (isRunning) ball.style.animation = 'chx-pulse 1s infinite';

    // --- 区分点击和拖动 ---
    var startX = 0, startY = 0;
    var hasMoved = false;
    var DRAG_THRESHOLD = 5; // 移动超过5px才算拖动

    ball.addEventListener('mousedown', function (e) {
      e.preventDefault();
      startX = e.clientX;
      startY = e.clientY;
      hasMoved = false;

      var onMove = function (ev) {
        var dx = ev.clientX - startX;
        var dy = ev.clientY - startY;
        if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
          hasMoved = true;
        }
        if (hasMoved) {
          ball.style.cursor = 'grabbing';
          // 计算新位置（基于视口中心偏移）
          var newLeft = ev.clientX - 25;
          var newTop = ev.clientY - 25;
          // 边界限制
          newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - 50));
          newTop = Math.max(0, Math.min(newTop, window.innerHeight - 50));
          ball.style.left = newLeft + 'px';
          ball.style.top = newTop + 'px';
          ball.style.right = 'auto';
          ball.style.bottom = 'auto';
        }
      };

      var onUp = function () {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        ball.style.cursor = 'grab';

        if (hasMoved) {
          // 拖动结束，保存位置
          saveBallPos({
            top: ball.style.top,
            bottom: ball.style.bottom || 'auto',
            left: ball.style.left,
            right: ball.style.right || 'auto'
          });
        } else {
          // 没有移动，视为点击 → 展开面板
          expandPanel();
        }
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  // ==================== 快捷键 ====================
  function initShortcuts() {
    document.addEventListener('keydown', function (e) {
      // Alt+S = 开始答题
      if (e.altKey && !e.shiftKey && !e.ctrlKey && e.code === 'KeyS') {
        e.preventDefault();
        if (!isRunning) startAuto();
      }
      // Alt+P = 停止
      if (e.altKey && !e.shiftKey && !e.ctrlKey && e.code === 'KeyP') {
        e.preventDefault();
        if (isRunning) stopAuto();
      }
      // Alt+W = 展开/缩小 切换
      if (e.altKey && !e.shiftKey && !e.ctrlKey && e.code === 'KeyW') {
        e.preventDefault();
        if (ball) {
          expandPanel();
        } else if (panel && panel.style.display !== 'none') {
          minimizePanel();
        } else {
          expandPanel();
        }
      }
    });
  }

  // ==================== 初始化 ====================
  function init() {
    loadCache();
    createPanel();
    initShortcuts();

    var hasApi = (CONFIG.apis || []).some(function (a) { return a.apiKey && a.enabled !== false; });
    if (!hasApi) log('首次使用请配置 API，点击 ⚙ 设置', 'warn');
    else {
      var cacheCount = Object.keys(answerCache).length;
      var apiCount = (CONFIG.apis || []).filter(function(a) { return a.apiKey; }).length;
      var textApi = getApiForQuestion(false);
      var visionApi = getApiForQuestion(true);
      log('就绪 | API: ' + apiCount + '个' +
        (textApi ? ' | 文字:' + textApi.name : '') +
        (visionApi ? ' | 图片:' + visionApi.name : '') +
        (cacheCount > 0 ? ' | 缓存:' + cacheCount + '条' : ''));
    }

    // 快捷键提示
    log('快捷键: Alt+S 开始 | Alt+P 停止 | Alt+W 展开/缩小');

    new MutationObserver(function () { if (!document.getElementById('chx-panel')) { panel = null; createPanel(); } }).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'complete') init();
  else window.addEventListener('load', init);
})();
