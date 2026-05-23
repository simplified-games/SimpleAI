// ═══════════════════════════════════════════════════════════════════════════
//  app.js — PATCH FILE
//  Apply each section below by replacing the matching block in your app.js
// ═══════════════════════════════════════════════════════════════════════════


// ─────────────────────────────────────────────────────────────────────────────
// PATCH 1 of 4 — selectModel()
//   Replace your existing window.selectModel = (modelId) => { … } with this.
//   Adds: Pixazo placeholder text + disables image-upload button for image models.
// ─────────────────────────────────────────────────────────────────────────────

window.selectModel = (modelId) => {
  selectedModel = MODELS.find(m => m.id === modelId) ?? MODELS[0];
  updateModelBtn();
  modelModal.classList.add("hidden");

  // Reasoning toggle
  const canReason = selectedModel.hasReasoning;
  const reasoningRow = $("#reasoning-row");
  if (reasoningRow) reasoningRow.style.display = canReason ? "flex" : "none";
  if (!canReason) { useReasoning = false; updateReasoningUI(); }

  // Pixazo image model — update placeholder + hide image-upload (not needed)
  if (selectedModel.isImageModel) {
    messageInput.placeholder = "Describe the image you want to generate…";
    imageUploadBtn.style.display = "none";
  } else {
    messageInput.placeholder = "Ask SimpleAI anything…";
    imageUploadBtn.style.display = "";
  }
};


// ─────────────────────────────────────────────────────────────────────────────
// PATCH 2 of 4 — sendMessage() image-request detection
//   Find this line inside sendMessage():
//
//     const isImageRequest = /\b(generate|create|draw|make|paint|render)\b...
//
//   Replace ONLY that one line with the two lines below.
//   Pixazo model always generates an image regardless of the prompt wording.
// ─────────────────────────────────────────────────────────────────────────────

  const isImageRequest =
    selectedModel.isImageModel ||   // ← NEW: Pixazo always generates images
    (/\b(generate|create|draw|make|paint|render)\b.*\b(image|picture|photo|art|illustration)\b/i.test(userText) && !capturedImage);


// ─────────────────────────────────────────────────────────────────────────────
// PATCH 3 of 4 — markdownToHtml()
//   Replace your entire markdownToHtml() function with this version.
//   Adds: copy button, language label, highlight.js hook on code blocks.
// ─────────────────────────────────────────────────────────────────────────────

function markdownToHtml(md) {
  let html = escHtml(md);

  // ── Fenced code blocks ──────────────────────────────────────────────────────
  // Produces a wrapper div with a header bar (language label + copy button)
  // and a <pre><code> block that highlight.js will colour automatically.
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const langLabel = lang
      ? `<span class="code-lang-label">${lang}</span>`
      : `<span class="code-lang-label">code</span>`;
    return `
<div class="code-block-wrapper">
  <div class="code-block-header">
    ${langLabel}
    <button class="copy-code-btn" onclick="copyCode(this)" title="Copy code">📋 Copy</button>
  </div>
  <pre><code class="language-${lang || 'plaintext'}">${code.trim()}</code></pre>
</div>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, "<code class=\"inline-code\">$1</code>");
  // Bold + italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g,     "<em>$1</em>");
  // Headings
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm,  "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm,   "<h1>$1</h1>");
  // Blockquote
  html = html.replace(/^&gt; (.+)$/gm, "<blockquote>$1</blockquote>");
  // Unordered list
  html = html.replace(/^(\s*)[*\-] (.+)$/gm, "<li>$2</li>");
  html = html.replace(/(<li>.*<\/li>\n?)+/gs, "<ul>$&</ul>");
  // Ordered list
  html = html.replace(/^\d+\. (.+)$/gm, "<li>$1</li>");
  // Links
  html = html.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  // Horizontal rule
  html = html.replace(/^---+$/gm, "<hr>");
  // Paragraphs (double newline) — avoid wrapping code blocks
  html = html.replace(/\n{2,}/g, "</p><p>");
  // Single newline
  html = html.replace(/\n/g, "<br>");
  html = `<p>${html}</p>`;
  // Clean up empty / redundant paragraphs around block elements
  html = html.replace(/<p><\/p>/g, "");
  html = html.replace(/<p>(<h[1-6]>)/g, "$1");
  html = html.replace(/(<\/h[1-6]>)<\/p>/g, "$1");
  html = html.replace(/<p>(<ul>|<ol>|<pre>|<blockquote>|<hr>|<div class="code-block)/g, "$1");
  html = html.replace(/(<\/ul>|<\/ol>|<\/pre>|<\/blockquote>|<hr>|<\/div>)<\/p>/g, "$1");
  return html;
}


// ─────────────────────────────────────────────────────────────────────────────
// PATCH 4 of 4 — New helper functions
//   Add these two functions anywhere in app.js (e.g. right after markdownToHtml).
//
//   copyCode    — handles the copy-to-clipboard button inside code blocks.
//   highlightCodeBlocks — calls highlight.js on newly rendered code blocks.
//
//   You also need to call highlightCodeBlocks(wrapper) at the end of
//   renderMessage(), just before the closing brace, like this:
//
//     chatArea.appendChild(wrapper);
//     highlightCodeBlocks(wrapper);   // ← ADD THIS LINE
//   }
// ─────────────────────────────────────────────────────────────────────────────

/** Copy the text content of a <code> block to the clipboard. */
window.copyCode = (btn) => {
  const codeEl = btn.closest(".code-block-wrapper")?.querySelector("code");
  if (!codeEl) return;
  navigator.clipboard.writeText(codeEl.textContent ?? "").then(() => {
    btn.textContent = "✅ Copied!";
    btn.classList.add("copied");
    setTimeout(() => {
      btn.textContent = "📋 Copy";
      btn.classList.remove("copied");
    }, 2000);
  }).catch(() => {
    // Fallback for browsers without clipboard API
    const ta = document.createElement("textarea");
    ta.value = codeEl.textContent ?? "";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    btn.textContent = "✅ Copied!";
    setTimeout(() => btn.textContent = "📋 Copy", 2000);
  });
};

/** Run highlight.js on any unhighlighted <code> elements inside a container. */
function highlightCodeBlocks(container) {
  if (typeof hljs === "undefined") return;
  container.querySelectorAll("pre code:not(.hljs)").forEach((el) => {
    hljs.highlightElement(el);
  });
}
