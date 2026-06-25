// ==超星学习通页面结构诊断脚本==
// 使用方法：在超星学习通的题目页面上，按 F12 打开控制台，粘贴此代码并回车运行
// 然后把控制台输出的内容截图或复制发给我

(function () {
  console.log('========== 超星学习通页面结构诊断 ==========');
  console.log('当前URL:', location.href);
  console.log('');

  // 1. 检查常见选择器
  const selectors = [
    '.TiMu', '.singleQuesId', '.questionLi', '.mark_question',
    '#ZyBottom', '.answerBg', '.Zy_TItle', '.mark_name',
    '[class*="question"]', '[class*="Ques"]', '[class*="ques"]',
    '[id*="divCur"]', '[class*="TiMu"]', '[class*="timu"]',
    '.mark_letter', '.Zy_ulBottom', '[class*="option"]',
    '[class*="answer"]', '[class*="stem"]', '[class*="title"]',
    'iframe', '#iframe', '[class*="frame"]',
    '.new答题', '[class*="答题"]', '[class*="题目"]',
    '[class*="test"]', '[class*="exam"]', '[class*="work"]'
  ];

  console.log('【选择器匹配结果】');
  selectors.forEach(sel => {
    try {
      const els = document.querySelectorAll(sel);
      if (els.length > 0) {
        console.log(`✅ ${sel} → 找到 ${els.length} 个元素`);
      }
    } catch (e) {}
  });

  console.log('');
  console.log('【iframe 检查】');
  const iframes = document.querySelectorAll('iframe');
  console.log(`共 ${iframes.length} 个 iframe`);
  iframes.forEach((iframe, i) => {
    console.log(`  iframe[${i}]: src=${iframe.src}, id=${iframe.id}, class=${iframe.className}`);
    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (doc) {
        console.log(`    内容长度: ${doc.body?.innerHTML?.length || 0}`);
        // 在 iframe 内也搜索一下
        selectors.forEach(sel => {
          const found = doc.querySelectorAll(sel);
          if (found.length > 0) {
            console.log(`    ✅ iframe内 ${sel} → ${found.length} 个`);
          }
        });
      } else {
        console.log('    ⚠ 无法访问（跨域）');
      }
    } catch (e) {
      console.log(`    ⚠ 无法访问: ${e.message}`);
    }
  });

  console.log('');
  console.log('【页面内所有可能的题目元素】');
  // 通用搜索：包含题号特征的元素
  const allElements = document.querySelectorAll('h3, h4, p, div, span, li');
  const questionLike = [];
  allElements.forEach(el => {
    const text = el.textContent?.trim() || '';
    // 匹配 "1." "2、" "3)" 等题号开头的文本
    if (/^[\d]+[\.\、\)】．]\s*.{8,}/.test(text) && text.length < 500) {
      questionLike.push({
        tag: el.tagName,
        class: el.className,
        id: el.id,
        text: text.substring(0, 100),
        parent: el.parentElement?.className
      });
    }
  });
  console.log(`找到 ${questionLike.length} 个疑似题目元素:`);
  questionLike.slice(0, 10).forEach((q, i) => {
    console.log(`  [${i}] <${q.tag}> class="${q.class}" id="${q.id}"`);
    console.log(`      文本: ${q.text}`);
    console.log(`      父级: class="${q.parent}"`);
  });

  console.log('');
  console.log('【body 的前 5 个子元素 class/id】');
  Array.from(document.body.children).slice(0, 10).forEach((el, i) => {
    console.log(`  [${i}] <${el.tagName}> class="${el.className}" id="${el.id}"`);
  });

  console.log('');
  console.log('========== 诊断结束，请截图或复制以上内容 ==========');
})();
