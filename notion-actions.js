function notionUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && /(^|\.)notion\.(so|site|com)$/.test(url.hostname) ? url.href : null;
  } catch { return null; }
}

export function createNotionActions({ getUser, endpoint, fetchImpl = (...args) => fetch(...args) }) {
  const pending = new Set();
  const views = new Set();
  const refresh = () => { for (const view of views) view.refresh(); };

  return {
    mount(container, courseId) {
      const doc = container.ownerDocument;
      const button = doc.createElement('button');
      button.type = 'button'; button.className = 'btn-action'; button.id = 'btnNotion';
      const status = doc.createElement('span');
      status.className = 'notion-status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
      container.replaceChildren(button, status);
      let mounted = true;
      let lastUser = getUser();
      const view = {
        refresh() {
          const user = getUser();
          container.hidden = !user;
          if (user !== lastUser) status.replaceChildren();
          lastUser = user;
          button.disabled = !user || pending.has(courseId);
          button.textContent = pending.has(courseId) ? '加入中…' : '加入 Notion';
        },
        dispose() { mounted = false; views.delete(view); button.onclick = null; },
      };
      views.add(view); view.refresh();
      button.onclick = async () => {
        const user = getUser();
        if (!mounted || !user || pending.has(courseId)) return;
        if (!endpoint) { status.textContent = 'Notion 功能尚未設定。'; return; }
        pending.add(courseId); status.replaceChildren(); refresh();
        const canUpdate = () => mounted && container.isConnected && getUser() === user;
        try {
          const token = await user.getIdToken();
          if (getUser() !== user) return;
          const response = await fetchImpl(endpoint, {
            method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ courseId }), signal: AbortSignal.timeout(45000),
          });
          const data = await response.json().catch(() => null);
          if (!response.ok) {
            const messages = {
              401: '登入已失效，請重新登入。', 403: '您沒有權限執行此操作。',
              404: '課程不存在，請重新整理日曆。', 400: '課程資料不完整，請先確認日期與內容。',
              503: 'Notion 功能尚未設定或暫時無法使用。',
            };
            throw new Error(messages[response.status] || '操作未完成；請先確認 Notion 是否已新增，再重試。');
          }
          const url = notionUrl(data?.pageUrl);
          if (!['created', 'exists'].includes(data?.status) || !url) throw new Error('無法確認新增結果，請先查看 Notion 再重試。');
          if (canUpdate()) {
            status.textContent = data.status === 'created' ? '已加入 Notion。 ' : '此課程已存在。 ';
            const link = doc.createElement('a'); link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer';
            link.textContent = '查看課程'; status.append(link);
          }
        } catch (error) {
          if (canUpdate()) status.textContent = error.code?.startsWith('auth/') ? '登入驗證失敗，請重新登入。' :
            error.name === 'TypeError' || error.name === 'TimeoutError' ? '連線失敗或逾時；請先確認 Notion 是否已新增，再重試。' : error.message;
        } finally {
          pending.delete(courseId); refresh();
        }
      };
      return view;
    },
    refresh,
  };
}
