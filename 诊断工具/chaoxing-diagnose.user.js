// ==UserScript==
// @name         超星页面结构诊断
// @namespace    diagnose
// @version      1.0
// @match        *://*.chaoxing.com/*
// @match        *://mooc1*.chaoxing.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  var log = [];
  log.push("===== 超星页面结构诊断 =====");
  log.push("URL: " + location.href);
  log.push("");

  var sels = [
    ".TiMu", ".singleQuesId", ".questionLi", ".mark_question",
    "#ZyBottom", ".answerBg", ".Zy_TItle", ".mark_name",
    ".mark_letter", ".Zy_ulBottom",
    "[class*='question']", "[class*='Ques']", "[class*='ques']",
    "[class*='option']", "[class*='answer']", "[class*='stem']",
    "[class*='title']", "[class*='frame']",
    "iframe"
  ];

  log.push("--- 主页面选择器 ---");
  var mainFound = false;
  for (var i = 0; i < sels.length; i++) {
    try {
      var els = document.querySelectorAll(sels[i]);
      if (els.length > 0) {
        log.push("[OK] " + sels[i] + " x" + els.length);
        mainFound = true;
      }
    } catch (e) {}
  }
  if (!mainFound) log.push("[--] 主页面无匹配");

  log.push("");
  log.push("--- iframe 检查 ---");
  var iframes = document.querySelectorAll("iframe");
  log.push("iframe数量: " + iframes.length);

  for (var i = 0; i < iframes.length; i++) {
    var src = (iframes[i].src || "");
    if (src.length > 80) src = src.substring(0, 80) + "...";
    log.push("[" + i + "] src=" + src);
    log.push("     id=" + iframes[i].id + " class=" + iframes[i].className);
    try {
      var doc = iframes[i].contentDocument || iframes[i].contentWindow.document;
      if (doc) {
        log.push("     内容长度: " + (doc.body.innerHTML || "").length);
        for (var j = 0; j < sels.length; j++) {
          try {
            var found = doc.querySelectorAll(sels[j]);
            if (found.length > 0) {
              log.push("     [OK] iframe内 " + sels[j] + " x" + found.length);
            }
          } catch (e2) {}
        }
        var innerIframes = doc.querySelectorAll("iframe");
        if (innerIframes.length > 0) {
          log.push("     [!!] 嵌套iframe x" + innerIframes.length);
          for (var k = 0; k < innerIframes.length; k++) {
            log.push("       [" + k + "] " + (innerIframes[k].src || "").substring(0, 60));
            try {
              var innerDoc = innerIframes[k].contentDocument || innerIframes[k].contentWindow.document;
              if (innerDoc) {
                log.push("            内容长度: " + (innerDoc.body.innerHTML || "").length);
                for (var m = 0; m < sels.length; m++) {
                  try {
                    var innerFound = innerDoc.querySelectorAll(sels[m]);
                    if (innerFound.length > 0) {
                      log.push("            [OK] " + sels[m] + " x" + innerFound.length);
                    }
                  } catch (e3) {}
                }
              }
            } catch (e3) {
              log.push("            [!!] 无法访问");
            }
          }
        }
      }
    } catch (e) {
      log.push("     [!!] 无法访问: " + e.message);
    }
  }

  log.push("");
  log.push("--- 疑似题目文本 ---");
  var allEls = document.querySelectorAll("h3, h4, p, div, span, li");
  var qCount = 0;
  for (var i = 0; i < allEls.length && qCount < 5; i++) {
    var txt = (allEls[i].textContent || "").trim();
    if (/^[\d]+[\.\,\)]/.test(txt) && txt.length > 10 && txt.length < 300) {
      log.push("<" + allEls[i].tagName + "> c=" + allEls[i].className + " id=" + allEls[i].id);
      log.push("  " + txt.substring(0, 80));
      qCount++;
    }
  }
  if (qCount === 0) log.push("[--] 未找到疑似题目");

  log.push("");
  log.push("===== 诊断结束 =====");

  var div = document.createElement("div");
  div.style.cssText = "position:fixed;top:10px;left:10px;width:700px;max-height:85vh;overflow:auto;background:#1a1a2e;color:#0f0;padding:20px;font:13px Consolas,monospace;z-index:99999999;border-radius:10px;white-space:pre-wrap;word-break:break-all;line-height:1.6;box-shadow:0 4px 30px rgba(0,0,0,0.5);";
  div.textContent = log.join("\n");

  var btn = document.createElement("button");
  btn.textContent = "X 关闭";
  btn.style.cssText = "position:absolute;top:10px;right:10px;padding:6px 14px;background:#e53935;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;";
  btn.onclick = function () { div.remove(); };
  div.appendChild(btn);

  document.body.appendChild(div);
})();
