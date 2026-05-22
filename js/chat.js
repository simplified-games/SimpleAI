// js/chat.js
let db, currentUser;

export function initChat(firestore, user) {
  db = firestore;
  currentUser = user;
}

export async function createNewChat(title = "New Chat") {
  if (!db || !currentUser) return null;
  const ref = await db
    .collection("chats")
    .doc(currentUser.uid)
    .collection("conversations")
    .add({
      title,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      model: "meta-llama/llama-4-maverick-17b-128e-instruct",
      messageCount: 0,
    });
  return ref.id;
}

export async function listChats() {
  if (!db || !currentUser) return [];
  const snap = await db
    .collection("chats")
    .doc(currentUser.uid)
    .collection("conversations")
    .orderBy("updatedAt", "desc")
    .limit(50)
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getMessages(chatId) {
  if (!db || !currentUser) return [];
  const snap = await db
    .collection("chats")
    .doc(currentUser.uid)
    .collection("conversations")
    .doc(chatId)
    .collection("messages")
    .orderBy("timestamp", "asc")
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function addMessage(chatId, message) {
  if (!db || !currentUser) return null;
  const convRef = db
    .collection("chats")
    .doc(currentUser.uid)
    .collection("conversations")
    .doc(chatId);

  const msgRef = await convRef.collection("messages").add({
    ...message,
    timestamp: Date.now(),
  });

  // Update conversation metadata
  const updates = {
    updatedAt: Date.now(),
    messageCount: firebase.firestore.FieldValue.increment(1),
  };
  if (message.role === "user" && message.content?.length > 0) {
    const preview = typeof message.content === "string"
      ? message.content.slice(0, 60)
      : message.content.find((c) => c.type === "text")?.text?.slice(0, 60) ?? "Image";
    updates.lastMessage = preview;
  }
  await convRef.update(updates);
  return msgRef.id;
}

export async function updateChatTitle(chatId, title) {
  if (!db || !currentUser) return;
  await db
    .collection("chats")
    .doc(currentUser.uid)
    .collection("conversations")
    .doc(chatId)
    .update({ title });
}

export async function deleteChat(chatId) {
  if (!db || !currentUser) return;
  const convRef = db
    .collection("chats")
    .doc(currentUser.uid)
    .collection("conversations")
    .doc(chatId);

  // Delete all messages first
  const msgs = await convRef.collection("messages").get();
  const batch = db.batch();
  msgs.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(convRef);
  await batch.commit();
}
