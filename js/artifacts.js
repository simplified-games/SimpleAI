// js/artifacts.js — localStorage-backed artifact store

const STORAGE_KEY = "simpleai_artifacts";

/** Load all artifacts from localStorage */
export function getArtifacts() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch { return []; }
}

/** Persist the full artifacts array */
function persist(artifacts) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(artifacts));
}

/** Create a new artifact and return it */
export function createArtifact({ filename, language, content }) {
  const all = getArtifacts();
  // If a file with the same name already exists, treat as edit
  const existing = all.find(a => a.filename === filename);
  if (existing) {
    existing.content    = content;
    existing.language   = language;
    existing.updatedAt  = Date.now();
    persist(all);
    return existing;
  }
  const artifact = {
    id:        `art_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    filename,
    language,
    content,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  all.push(artifact);
  persist(all);
  return artifact;
}

/** Update an artifact's content by id */
export function updateArtifactContent(id, content) {
  const all = getArtifacts();
  const idx = all.findIndex(a => a.id === id);
  if (idx < 0) return null;
  all[idx] = { ...all[idx], content, updatedAt: Date.now() };
  persist(all);
  return all[idx];
}

/** Delete an artifact by id */
export function deleteArtifact(id) {
  persist(getArtifacts().filter(a => a.id !== id));
}

/** Find by filename (case-sensitive) */
export function getArtifactByFilename(filename) {
  return getArtifacts().find(a => a.filename === filename) ?? null;
}

/** Wipe everything */
export function clearAllArtifacts() {
  localStorage.removeItem(STORAGE_KEY);
}
