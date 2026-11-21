function prefix(user) {
  const identity = user?.id || user?._id || user?.email || user?.username;
  return 'proxispeak.layout-draft.' + (identity ? 'user.'+encodeURIComponent(String(identity).toLowerCase()) : 'guest') + '/';
}
export function listDrafts(user) {
  const drafts = [];
  const scope = prefix(user);
  let storage;
  try { storage = window.localStorage; } catch { return drafts; }
  for (let i=0;i<storage.length;i++) {
    const key = storage.key(i);
    if (!key?.startsWith(scope)) continue;
    try {
      const draft = JSON.parse(storage.getItem(key));
      if (draft?.layout && draft.id && key === scope+draft.id) drafts.push(draft);
    } catch { /* A damaged entry should not hide other drafts. */ }
  }
  return drafts.sort((a,b)=>b.updatedAt-a.updatedAt);
}
export function storeDraft(user,draft) {
  localStorage.setItem(prefix(user)+draft.id,JSON.stringify(draft));
}
export function clearDraft(user,id) {
  localStorage.removeItem(prefix(user)+id);
}
