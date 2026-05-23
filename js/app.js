// js/app.js — SimpleAI main application
import { FIREBASE_CONFIG, DENO_API_URL, ADMIN_EMAIL, TOKEN_CONFIG } from "./firebase-config.js";
import { MODELS, CATEGORIES, PROVIDER_INFO } from "./models.js";
import {
  initTokens, ensureUserDoc, getTokenData, checkAndDeductTokens,
  getTimeUntilReset, formatResetTime, calculateCost,
  adminGrantTokens, adminGetAllUsers,
} from "./tokens.js";
import {
  initChat, createNewChat, listChats, getMessages, addMessage, updateChatTitle, deleteChat,
} from "./chat.js";

// ─── FIREBASE INIT ─────────────────────────────────────────────────────────────
firebase.initializeApp(FIREBASE_CONFIG);
const auth = firebase.auth();
const db   = firebase.firestore();

// ─── STATE ─────────────────────────────────────────────────────────────────────
let currentUser     = null;
let currentChatId   = null;
let selectedModel   = MODELS[0];
let useReasoning    = false;
let messageHistory  = [];   // [{role, content}]
let tokenBalance    = 0;
let isAdmin         = false;
let resetCountdownInterval = null;
let pendingImage    = null;  // { base64, mimeType, objectURL }
let sidebarOpen     = true;

// ─── DOM REFS ──────────────────────────────────────────────────────────────────
const $  = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

const loginPage      = $("#login-page");
const appEl          = $("#app");
const chatArea       = $("#chat-area");
const chatList       = $("#chat-list");
const welcomeScreen  = $("#welcome-screen");
const messageInput   = $("#message-input");
const sendBtn        = $("#send-btn");
const modelBtn       = $("#model-selector-btn");
const modelModal     = $("#model-modal");
const adminPanel     = $("#admin-panel");
const sidebar        = $("#sidebar");
const tokenBadgeEl   = $("#token-badge");
const resetTimerEl   = $("#reset-timer");
const reasoningToggle = $("#reasoning-toggle");
const reasoningLabel  = $("#reasoning-label");
const imageUploadBtn  = $("#image-upload-btn");
const imageInput      = $("#image-input");
const imagePreview    = $("#image-preview-container");
const toastContainer  = $("#toast-container");
const userNameEl      = $("#user-name");
const userEmailEl     = $("#user-email");
const userAvatarEl    = $("#user-avatar-img");

// ─── AUTH ──────────────────────────────────────────────────────────────────────
auth.onAuthStateChanged(async (user) => {
  if (user) {
    currentUser = user;
    loginPage.classList.add("hidden");
    initTokens(db, user);
    initChat(db, user);
    await ensureUserDoc();
    await refreshUserData();
    await loadChatList();
    startResetCountdown();
  } else {
    currentUser = null;
    loginPage.classList.remove("hidden");
  }
});

async function refreshUserData() {
  const data = await getTokenData();
  if (!data) return;
  isAdmin       = data.isAdmin ?? false;
  tokenBalance  = data.isAdmin ? Infinity : (data.tokenBalance ?? 0);
  updateTokenUI();
  if (currentUser) {
    userNameEl.textContent  = currentUser.displayName ?? currentUser.email;
    userEmailEl.textContent = currentUser.email;
    if (currentUser.photoURL) {
      userAvatarEl.src = currentUser.photoURL;
      userAvatarEl.style.display = "block";
    }
    if (isAdmin) {
      $("#admin-nav-btn").style.display = "flex";
      document.querySelectorAll(".admin-badge-placeholder").forEach(el => {
        el.innerHTML = `<span class="admin-badge">ADMIN</span>`;
      });
    }
  }
}

function updateTokenUI() {
  if (!tokenBadgeEl) return;
  tokenBadgeEl.textContent = isAdmin ? "∞ tokens" : `${tokenBalance.toLocaleString()} tokens`;
}

function startResetCountdown() {
  if (resetCountdownInterval) clearInterval(resetCountdownInterval);
  resetCountdownInterval = setInterval(async () => {
    if (isAdmin) { if (resetTimerEl) resetTimerEl.textContent = "Resets: Never"; return; }
    const ms = await getTimeUntilReset();
    if (resetTimerEl) resetTimerEl.textContent = ms > 0 ? `Resets in ${formatResetTime(ms)}` : "Resetting…";
    if (ms <= 0) await refreshUserData();
  }, 1000);
}

// ─── GOOGLE LOGIN ──────────────────────────────────────────────────────────────
$("#google-login-btn").onclick = () => {
  const provider = new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(provider).catch((e) => showToast(e.message, "error"));
};
$("#signout-btn").onclick = () => auth.signOut();

// ─── SIDEBAR ───────────────────────────────────────────────────────────────────
function toggleSidebar() {
  sidebarOpen = !sidebarOpen;
  if (sidebarOpen) sidebar.classList.remove("collapsed");
  else sidebar.classList.add("collapsed");
}
$$(".sidebar-toggle-btn").forEach(btn => { btn.onclick = toggleSidebar; });

// ─── CHAT LIST ─────────────────────────────────────────────────────────────────
async function loadChatList() {
  const chats = await listChats();
  chatList.innerHTML = "";
  if (chats.length === 0) {
    chatList.innerHTML = `<p style="padding:12px 16px;font-size:.82rem;color:var(--text-muted)">No chats yet.</p>`;
    return;
  }
  chats.forEach((chat) => {
    const item = document.createElement("div");
    item.className = `chat-item${chat.id === currentChatId ? " active" : ""}`;
    item.dataset.id = chat.id;
    item.innerHTML = `
      <span style="font-size:.9rem">💬</span>
      <span class="chat-item-title">${escHtml(chat.title || "New Chat")}</span>
      <button class="chat-item-delete" data-id="${chat.id}" title="Delete">✕</button>
    `;
    item.onclick = (e) => {
      if (e.target.classList.contains("chat-item-delete")) {
        e.stopPropagation();
        handleDeleteChat(chat.id);
        return;
      }
      switchToChat(chat.id);
    };
    chatList.appendChild(item);
  });
}

async function switchToChat(chatId) {
  currentChatId = chatId;
  messageHistory = [];
  chatArea.innerHTML = "";
  welcomeScreen && welcomeScreen.remove();

  $$(".chat-item").forEach(el => {
    el.classList.toggle("active", el.dataset.id === chatId);
  });

  const msgs = await getMessages(chatId);
  for (const msg of msgs) {
    messageHistory.push({ role: msg.role, content: msg.content });
    renderMessage(msg.role, msg.content, msg.thinking ?? "", msg.tokensUsed ?? 0);
  }
  scrollToBottom();
}

async function handleDeleteChat(chatId) {
  await deleteChat(chatId);
  if (currentChatId === chatId) {
    currentChatId = null;
    messageHistory = [];
    chatArea.innerHTML = "";
    showWelcomeScreen();
  }
  await loadChatList();
  showToast("Chat deleted", "info");
}

// ─── NEW CHAT ──────────────────────────────────────────────────────────────────
$("#new-chat-btn").onclick = startNewChat;
async function startNewChat() {
  currentChatId = null;
  messageHistory = [];
  chatArea.innerHTML = "";
  $$(".chat-item").forEach(el => el.classList.remove("active"));
  showWelcomeScreen();
}

function showWelcomeScreen() {
  chatArea.innerHTML = `
    <div id="welcome-screen">
      <div class="welcome-logo">SimpleAI</div>
      <p class="welcome-sub">What should we focus on?</p>
      <div class="welcome-suggestions">
        ${["✍️ Write a poem about the ocean","💻 Debug my Python code","🎨 Generate an image of a sunset","🧠 Explain quantum computing","📝 Summarize a document","🌍 Translate to Spanish"].map(s =>
          `<div class="suggestion-chip" onclick="useSuggestion('${escHtml(s)}')">${s}</div>`
        ).join("")}
      </div>
    </div>
  `;
}

window.useSuggestion = (text) => {
  messageInput.value = text;
  messageInput.focus();
};

// ─── MODEL PICKER ──────────────────────────────────────────────────────────────
let activeCategory = "All";

modelBtn.onclick = () => {
  modelModal.classList.remove("hidden");
  renderModelGrid("All");
};
$("#modal-close").onclick = () => modelModal.classList.add("hidden");
modelModal.addEventListener("click", (e) => { if (e.target === modelModal) modelModal.classList.add("hidden"); });

function renderModelGrid(category) {
  activeCategory = category;
  $$(".cat-btn").forEach(b => b.classList.toggle("active", b.dataset.cat === category));

  const grid = $("#model-grid");
  const filtered = category === "All" ? MODELS : MODELS.filter(m => m.category === category);
  grid.innerHTML = filtered.map(m => {
    const prov = PROVIDER_INFO[m.provider] ?? {};
    const isSelected = m.id === selectedModel.id;
    // Show flat token cost for image models, per-1K for others
    const costLabel = m.isImageModel ? `${m.costPerKTokens}t/img` : `${m.costPerKTokens}t/1K`;
    return `
      <div class="model-card${isSelected ? " selected" : ""}" onclick="selectModel('${m.id}')">
        ${isSelected ? `<div class="model-selected-check">✓</div>` : ""}
        <div class="model-card-provider">${prov.logo ?? ""} ${prov.name ?? m.provider}</div>
        <div class="model-card-name">${m.name}</div>
        <div class="model-card-desc">${m.description}</div>
        <div class="model-card-footer">
          <span class="model-card-badge" style="background:${m.badgeColor}">${m.badge}</span>
          ${m.hasReasoning ? `<span class="model-card-reason">🧠 Reasoning</span>` : ""}
          ${m.hasVision    ? `<span class="model-card-vision">👁 Vision</span>` : ""}
          <span class="model-card-cost">${costLabel}</span>
        </div>
      </div>
    `;
  }).join("");
}

$$(".cat-btn").forEach(btn => {
  btn.onclick = () => renderModelGrid(btn.dataset.cat);
});

// ─── SELECT MODEL ─────────────────────────────────────────────────────────────
window.selectModel = (modelId) => {
  selectedModel = MODELS.find(m => m.id === modelId) ?? MODELS[0];
  updateModelBtn();
  modelModal.classList.add("hidden");

  // Reasoning toggle — hide for image / non-reasoning models
  const canReason = selectedModel.hasReasoning;
  const reasoningRow = $("#reasoning-row");
  if (reasoningRow) reasoningRow.style.display = canReason ? "flex" : "none";
  if (!canReason) { useReasoning = false; updateReasoningUI(); }

  // Pixazo image model — swap placeholder and hide the image-upload button
  if (selectedModel.isImageModel) {
    messageInput.placeholder = "Describe the image you want to generate…";
    imageUploadBtn.style.display = "none";
  } else {
    messageInput.placeholder = "Ask SimpleAI anything…";
    imageUploadBtn.style.display = "";
  }
};

function updateModelBtn() {
  modelBtn.innerHTML = `
    <span>${selectedModel.name}</span>
    <span class="model-badge-sm" style="background:${selectedModel.badgeColor}">${selectedModel.badge}</span>
    <span style="color:var(--text-muted);font-size:.85rem">▾</span>
  `;
}
updateModelBtn();

// ─── REASONING TOGGLE ─────────────────────────────────────────────────────────
reasoningToggle.onchange = () => {
  useReasoning = reasoningToggle.checked;
  updateReasoningUI();
};
function updateReasoningUI() {
  reasoningToggle.checked = useReasoning;
  reasoningLabel.style.color = useReasoning ? "#7c3aed" : "";
  reasoningLabel.textContent = useReasoning ? "🧠 Reasoning (1.5× tokens)" : "🧠 Reasoning";
}

// ─── IMAGE UPLOAD ─────────────────────────────────────────────────────────────
imageUploadBtn.onclick = () => imageInput.click();
imageInput.onchange = (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (!selectedModel.hasVision && selectedModel.provider !== "groq") {
    showToast("Switch to a vision-capable model (Llama 4 Maverick, Gemini)", "error");
    return;
  }
  const reader = new FileReader();
  reader.onload = (ev) => {
    const dataURL = ev.target.result;
    const base64  = dataURL.split(",")[1];
    pendingImage  = { base64, mimeType: file.type, objectURL: dataURL };
    imagePreview.innerHTML = `
      <div class="image-preview-container">
        <img src="${dataURL}" alt="preview">
        <button class="image-preview-remove" onclick="clearImage()">✕</button>
      </div>
    `;
  };
  reader.readAsDataURL(file);
  imageInput.value = "";
};
window.clearImage = () => { pendingImage = null; imagePreview.innerHTML = ""; };

// ─── SEND MESSAGE ─────────────────────────────────────────────────────────────
messageInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});
messageInput.addEventListener("input", () => {
  messageInput.style.height = "auto";
  messageInput.style.height = Math.min(messageInput.scrollHeight, 180) + "px";
});
sendBtn.onclick = sendMessage;

async function sendMessage() {
  const text = messageInput.value.trim();
  if (!text && !pendingImage) return;
  if (!currentUser) { showToast("Please log in", "error"); return; }

  // Estimate cost (pre-check with rough estimate)
  const estimatedCost = 50;
  const precheck = await checkAndDeductTokens(0); // just to check balance
  if (!precheck.ok && !isAdmin) {
    showToast(`Not enough tokens! Balance: ${tokenBalance.toLocaleString()}`, "error");
    return;
  }

  // Create chat if needed
  if (!currentChatId) {
    const title = text.slice(0, 50) || "Image Chat";
    currentChatId = await createNewChat(title);
    await loadChatList();
  }

  // Clear input
  const userText = messageInput.value.trim();
  messageInput.value = "";
  messageInput.style.height = "auto";

  // Build user message content
  let userContent;
  const capturedImage = pendingImage;
  window.clearImage();

  if (capturedImage) {
    userContent = [
      { type: "image_url", image_url: { url: `data:${capturedImage.mimeType};base64,${capturedImage.base64}` } },
      { type: "text", text: userText || "Describe this image." },
    ];
  } else {
    userContent = userText;
  }

  // Render user message
  renderMessage("user", userContent, "", 0);
  scrollToBottom();

  // Save user message to Firebase
  await addMessage(currentChatId, { role: "user", content: userContent });

  // Detect image generation:
  //   • Always generate for Pixazo model
  //   • Also trigger for keyword phrases on other models (unless a real image is attached)
  const isImageRequest =
    selectedModel.isImageModel ||
    (/\b(generate|create|draw|make|paint|render)\b.*\b(image|picture|photo|art|illustration)\b/i.test(userText) && !capturedImage);

  // Show typing indicator
  const typingEl = showTyping();

  let responseText = "";
  let thinkingText = "";
  let tokensUsed   = 0;

  try {
    const idToken = await currentUser.getIdToken();
    const headers = { "Content-Type": "application/json", "Authorization": `Bearer ${idToken}` };

    if (isImageRequest) {
      // ── IMAGE GENERATION ──────────────────────────────────────────────────
      const res = await fetch(`${DENO_API_URL}/api/image`, {
        method: "POST", headers,
        body: JSON.stringify({ prompt: userText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Image generation failed");
      responseText = `__IMAGE__${data.imageUrl}`;
      tokensUsed   = data.tokensUsed ?? 1000;

    } else if (capturedImage) {
      // ── VISION (Groq Llama 4 Maverick) ────────────────────────────────────
      const res = await fetch(`${DENO_API_URL}/api/vision`, {
        method: "POST", headers,
        body: JSON.stringify({
          prompt: userText || "Describe this image.",
          imageBase64: capturedImage.base64,
          mimeType: capturedImage.mimeType,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Vision failed");
      responseText = data.text;
      tokensUsed   = data.tokensUsed ?? 100;

    } else {
      // ── TEXT CHAT ──────────────────────────────────────────────────────────
      messageHistory.push({ role: "user", content: userText });

      const res = await fetch(`${DENO_API_URL}/api/chat`, {
        method: "POST", headers,
        body: JSON.stringify({
          model:     selectedModel.id,
          provider:  selectedModel.provider,
          messages:  messageHistory,
          reasoning: useReasoning && selectedModel.hasReasoning,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Chat failed");
      responseText = data.text;
      thinkingText = data.thinking ?? "";
      tokensUsed   = data.tokensUsed ?? 50;
    }

    // Deduct tokens
    const actualCost = calculateCost(tokensUsed, selectedModel, useReasoning && !!thinkingText);
    const deduction  = await checkAndDeductTokens(actualCost);
    if (deduction.ok) {
      tokenBalance = deduction.newBalance;
      updateTokenUI();
    }

    // Render AI response
    typingEl.remove();
    renderMessage("assistant", responseText, thinkingText, actualCost);
    scrollToBottom();

    // Save to Firebase
    messageHistory.push({ role: "assistant", content: responseText });
    await addMessage(currentChatId, {
      role: "assistant",
      content: responseText,
      thinking: thinkingText,
      tokensUsed: actualCost,
      model: selectedModel.id,
    });

    // Auto-title on first message
    const msgs = await getMessages(currentChatId);
    if (msgs.length === 2) {
      const autoTitle = userText.slice(0, 50) || "Chat";
      await updateChatTitle(currentChatId, autoTitle);
      await loadChatList();
    }

  } catch (err) {
    typingEl.remove();
    renderMessage("assistant", `❌ Error: ${err.message}`, "", 0);
    showToast(err.message, "error");
  }
}

// ─── RENDER MESSAGE ───────────────────────────────────────────────────────────
function renderMessage(role, content, thinking = "", tokensUsed = 0) {
  // Remove welcome screen on first message
  const ws = chatArea.querySelector("#welcome-screen");
  if (ws) ws.remove();

  const wrapper = document.createElement("div");
  wrapper.className = `message-wrapper ${role}`;

  const avatarHTML = role === "user"
    ? `<div class="msg-avatar">${currentUser?.photoURL ? `<img src="${currentUser.photoURL}">` : (currentUser?.displayName?.[0] ?? "U")}</div>`
    : `<div class="msg-avatar ai-avatar">S</div>`;

  // Format content
  let bubbleHTML = "";

  if (typeof content === "string" && content.startsWith("__IMAGE__")) {
    const imgUrl = content.replace("__IMAGE__", "");
    bubbleHTML = `
      <p style="font-size:.82rem;color:#7c3aed;font-weight:600;margin-bottom:8px">
        <i>✨ Generated image</i>
      </p>
      <img src="${imgUrl}" style="max-width:100%;border-radius:12px;" alt="Generated image">
    `;
  } else if (Array.isArray(content)) {
    // Vision message with image
    const textPart = content.find(c => c.type === "text")?.text ?? "";
    const imgPart  = content.find(c => c.type === "image_url");
    bubbleHTML = "";
    if (imgPart) bubbleHTML += `<img src="${imgPart.image_url?.url}" style="max-height:140px;border-radius:8px;margin-bottom:8px;display:block;">`;
    if (textPart) bubbleHTML += `<span>${escHtml(textPart)}</span>`;
  } else {
    bubbleHTML = markdownToHtml(String(content));
  }

  const thinkingBlock = thinking ? `
    <div class="thinking-block">
      <div class="thinking-toggle" onclick="toggleThinking(this)">
        <span>🧠</span>
        <span>View reasoning</span>
        <span class="thinking-chevron">▾</span>
      </div>
      <div class="thinking-content">${escHtml(thinking)}</div>
    </div>
  ` : "";

  const tokenTag = tokensUsed > 0 ? `
    <div class="token-usage-tag">
      <span>⚡</span>
      <span><span class="token-count">${tokensUsed.toLocaleString()}</span> tokens used</span>
    </div>
  ` : "";

  wrapper.innerHTML = `
    ${role === "user" ? "" : avatarHTML}
    <div class="message-body">
      ${thinkingBlock}
      <div class="bubble">${bubbleHTML}</div>
      ${tokenTag}
    </div>
    ${role === "user" ? avatarHTML : ""}
  `;

  chatArea.appendChild(wrapper);
  highlightCodeBlocks(wrapper); // run highlight.js on any new code blocks
}

window.toggleThinking = (toggleEl) => {
  const content = toggleEl.nextElementSibling;
  const isOpen  = content.classList.contains("open");
  content.classList.toggle("open", !isOpen);
  toggleEl.classList.toggle("open", !isOpen);
  toggleEl.querySelector(".thinking-chevron").textContent = isOpen ? "▾" : "▴";
};

function showTyping() {
  const ws = chatArea.querySelector("#welcome-screen");
  if (ws) ws.remove();

  const el = document.createElement("div");
  el.className = "message-wrapper assistant";
  el.innerHTML = `
    <div class="msg-avatar ai-avatar">S</div>
    <div class="message-body">
      <div class="bubble">
        <div class="typing-indicator">
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
        </div>
      </div>
    </div>
  `;
  chatArea.appendChild(el);
  scrollToBottom();
  return el;
}

// ─── MARKDOWN RENDERER ────────────────────────────────────────────────────────
function markdownToHtml(md) {
  let html = escHtml(md);

  // ── Fenced code blocks — wrapped with header bar + copy button ──────────────
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const langLabel = lang || "code";
    return `<div class="code-block-wrapper"><div class="code-block-header"><span class="code-lang-label">${langLabel}</span><button class="copy-code-btn" onclick="copyCode(this)">📋 Copy</button></div><pre><code class="language-${lang || "plaintext"}">${code.trim()}</code></pre></div>`;
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
  // Paragraphs (double newline)
  html = html.replace(/\n{2,}/g, "</p><p>");
  // Single newline
  html = html.replace(/\n/g, "<br>");
  html = `<p>${html}</p>`;
  // Clean up empty / mis-wrapped paragraphs around block elements
  html = html.replace(/<p><\/p>/g, "");
  html = html.replace(/<p>(<h[1-6]>)/g, "$1");
  html = html.replace(/(<\/h[1-6]>)<\/p>/g, "$1");
  html = html.replace(/<p>(<ul>|<ol>|<pre>|<blockquote>|<hr>|<div class="code-block-wrapper)/g, "$1");
  html = html.replace(/(<\/ul>|<\/ol>|<\/pre>|<\/blockquote>|<hr>|<\/div>)<\/p>/g, "$1");
  return html;
}

// ─── CODE BLOCK HELPERS ───────────────────────────────────────────────────────

/** Copy button handler — writes the code text to the clipboard. */
window.copyCode = (btn) => {
  const codeEl = btn.closest(".code-block-wrapper")?.querySelector("code");
  if (!codeEl) return;
  navigator.clipboard.writeText(codeEl.textContent ?? "").then(() => {
    btn.textContent = "✅ Copied!";
    btn.classList.add("copied");
    setTimeout(() => { btn.textContent = "📋 Copy"; btn.classList.remove("copied"); }, 2000);
  }).catch(() => {
    // Fallback for older / restricted browsers
    const ta = document.createElement("textarea");
    ta.value = codeEl.textContent ?? "";
    ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    btn.textContent = "✅ Copied!";
    setTimeout(() => btn.textContent = "📋 Copy", 2000);
  });
};

/** Run highlight.js on any un-highlighted <code> blocks inside a container. */
function highlightCodeBlocks(container) {
  if (typeof hljs === "undefined") return;
  container.querySelectorAll("pre code:not(.hljs)").forEach((el) => hljs.highlightElement(el));
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function scrollToBottom() {
  chatArea.scrollTop = chatArea.scrollHeight;
}

// ─── ADMIN PANEL ──────────────────────────────────────────────────────────────
$("#admin-nav-btn").onclick = async () => {
  adminPanel.classList.remove("hidden");
  await loadAdminUsers();
};
$("#admin-close").onclick = () => adminPanel.classList.add("hidden");

async function loadAdminUsers() {
  const users = await adminGetAllUsers();
  const tbody = $("#admin-users-body");
  tbody.innerHTML = users.map(u => `
    <tr>
      <td>${escHtml(u.email)}</td>
      <td>${u.isAdmin ? "✅ Admin" : "User"}</td>
      <td>${u.tokenBalance === Infinity ? "∞" : (u.tokenBalance ?? 0).toLocaleString()}</td>
      <td>${(u.totalUsed ?? 0).toLocaleString()}</td>
    </tr>
  `).join("");
}

$("#admin-grant-btn").onclick = async () => {
  const email  = $("#admin-email-input").value.trim();
  const amount = parseInt($("#admin-amount-input").value, 10);
  if (!email || !amount || isNaN(amount)) { showToast("Enter email and amount", "error"); return; }
  const result = await adminGrantTokens(email, amount);
  if (result.ok) {
    showToast(`Granted ${amount.toLocaleString()} tokens to ${email}`, "success");
    await loadAdminUsers();
  } else {
    showToast(result.reason ?? "Failed", "error");
  }
};

// ─── TOAST ────────────────────────────────────────────────────────────────────
function showToast(msg, type = "info") {
  const t = document.createElement("div");
  t.className = `toast ${type}`;
  t.textContent = msg;
  toastContainer.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}
window.showToast = showToast;

// ─── INIT ─────────────────────────────────────────────────────────────────────
showWelcomeScreen();
updateModelBtn();
