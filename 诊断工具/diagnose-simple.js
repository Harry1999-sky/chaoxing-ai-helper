// 在超星题目页面的控制台(F12)中逐段粘贴运行

// 第1步：看URL和iframe
console.log("URL:", location.href);
var iframes = document.querySelectorAll("iframe");
console.log("iframe数量:", iframes.length);
for (var i = 0; i < iframes.length; i++) {
  console.log("iframe[" + i + "]:", iframes[i].src, "id=" + iframes[i].id);
}

// 第2步：看主页面有没有题目相关元素
var check = [".TiMu",".questionLi",".mark_question","#ZyBottom",".answerBg",".Zy_TItle",".mark_name"];
for (var j = 0; j < check.length; j++) {
  var found = document.querySelectorAll(check[j]);
  if (found.length > 0) console.log("找到 " + check[j] + " x" + found.length);
}

// 第3步：检查iframe内部
for (var i = 0; i < iframes.length; i++) {
  try {
    var doc = iframes[i].contentDocument;
    if (doc) {
      console.log("iframe[" + i + "] 内容长度:", doc.body.innerHTML.length);
      for (var j = 0; j < check.length; j++) {
        var found = doc.querySelectorAll(check[j]);
        if (found.length > 0) console.log("  iframe内找到 " + check[j] + " x" + found.length);
      }
    }
  } catch(e) {
    console.log("iframe[" + i + "] 无法访问:", e.message);
  }
}
