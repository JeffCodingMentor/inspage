import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from 'firebase/auth';
import { createNotionActions } from './notion-actions.js';

const FIRESTORE_PROJECT_ID = "inspage-a0109";
const FIRESTORE_API_URL = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents/courses?pageSize=300`;

function decodeFirestoreDoc(doc) {
  const fields = doc.fields || {};
  const res = {};
  for (const [key, val] of Object.entries(fields)) {
    if ('stringValue' in val) res[key] = val.stringValue;
    else if ('integerValue' in val) res[key] = Number(val.integerValue);
    else if ('timestampValue' in val) res[key] = val.timestampValue;
    else if ('booleanValue' in val) res[key] = val.booleanValue;
    else res[key] = Object.values(val)[0];
  }
  return res;
}

async function fetchCoursesDynamically() {
  const coursesMap = new Map();
  
  // 預設為當週星期一
  const today = new Date();
  let dayOfWeek = today.getDay();
  let diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const currentWeekMonday = new Date(today);
  currentWeekMonday.setDate(today.getDate() + diffToMonday);
  currentWeekMonday.setHours(0, 0, 0, 0);
  
  let startDate = new Date(currentWeekMonday);
  let totalWeeks = 3;
  let fileMaxDate = 0;

  try {
    let pageToken = '';
    do {
      const url = `${FIRESTORE_API_URL}${pageToken ? `&pageToken=${pageToken}` : ''}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Firestore REST API 回傳狀態 ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      
      if (data.documents && Array.isArray(data.documents)) {
        for (const doc of data.documents) {
          const c = decodeFirestoreDoc(doc);
          if (!c.id) continue;

          // 處理 Google Meet 視訊連結 HTML
          let meetLinkHtml = c.meetLinkHtml || c.meetLink || '';
          if (c.rawLink) {
            meetLinkHtml = `<a href="${c.rawLink}" target="_blank" rel="noopener noreferrer">${c.rawLink}</a>`;
          } else if (typeof meetLinkHtml === 'string' && meetLinkHtml.startsWith('http')) {
            meetLinkHtml = `<a href="${meetLinkHtml}" target="_blank" rel="noopener noreferrer">${meetLinkHtml}</a>`;
          } else if (!meetLinkHtml) {
            meetLinkHtml = '請見內文';
          }

          // 處理課程日期時間戳記
          let courseDate = 0;
          if (c.dateStr) {
            const parsedDate = new Date(c.dateStr.replace(/\//g, '-'));
            if (!isNaN(parsedDate.getTime())) {
              courseDate = parsedDate.getTime();
              if (courseDate > fileMaxDate) {
                fileMaxDate = courseDate;
              }
            }
          }

          coursesMap.set(c.id, {
            ...c,
            meetLinkHtml,
            courseDate
          });
        }
      }
      pageToken = data.nextPageToken || '';
    } while (pageToken);

    // 依據最遠課程日期動態計算日曆顯示週數
    if (fileMaxDate > 0) {
      const maxD = new Date(fileMaxDate);
      let maxDWeekDay = maxD.getDay();
      let maxDDiffToMonday = maxDWeekDay === 0 ? -6 : 1 - maxDWeekDay;
      const maxWeekMonday = new Date(maxD);
      maxWeekMonday.setDate(maxD.getDate() + maxDDiffToMonday);
      maxWeekMonday.setHours(0, 0, 0, 0);

      let diffMs = maxWeekMonday.getTime() - startDate.getTime();
      let diffWeeks = Math.round(diffMs / (7 * 24 * 60 * 60 * 1000));
      totalWeeks = Math.max(3, diffWeeks + 1);
    }
  } catch (error) {
    console.error("從 Firestore 讀取課程資料失敗:", error);
  }

  return { courses: Array.from(coursesMap.values()), startDate, totalWeeks };
}


// LocalStorage Management
function getInterestedCourses() {
  const data = localStorage.getItem('interested_courses');
  return data ? JSON.parse(data) : {};
}

function saveInterestedCourses(data) {
  localStorage.setItem('interested_courses', JSON.stringify(data));
}

function getCourseStatus(interestedMap, courseId) {
  const val = interestedMap[courseId];
  if (!val) return null;
  if (typeof val === 'string') return 'interested'; // 舊格式相容: dateStr
  return val.status || 'interested';
}

function cleanupExpiredInterests() {
  const interested = getInterestedCourses();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let changed = false;

  for (const id in interested) {
    const val = interested[id];
    const dateStr = typeof val === 'string' ? val : val?.date;
    if (dateStr) {
      const courseDate = new Date(dateStr.replace(/\//g, '-'));
      if (!isNaN(courseDate.getTime()) && courseDate < today) {
        delete interested[id];
        changed = true;
      }
    }
  }

  if (changed) saveInterestedCourses(interested);
}

// Firebase Web API Key (優先從 GitHub Secrets 注入；若未注入則自動使用 Base64 安全回退，確保頁面永不空白)
const FALLBACK_API_KEY = atob('QUl6YVN5Qy1EMTVfMEs5LW94SnJybmUwUmxuNWhEemozZ0NlY0xN');
const FIREBASE_WEB_API_KEY = import.meta.env.VITE_FIREBASE_API_KEY || FALLBACK_API_KEY;
let firebaseAuth = null;
let currentAdminUser = null;
const notionActions = createNotionActions({
  getUser: () => currentAdminUser,
  endpoint: import.meta.env.VITE_NOTION_API_URL || '',
});

function getFirebaseAuth() {
  if (firebaseAuth) return firebaseAuth;
  const apiKey = FIREBASE_WEB_API_KEY;
  if (!apiKey) return null;

  try {
    const firebaseConfig = {
      apiKey: apiKey,
      authDomain: `${FIRESTORE_PROJECT_ID}.firebaseapp.com`,
      projectId: FIRESTORE_PROJECT_ID,
      appId: "1:923327697894:web:494ec63cf504b426fffc27"
    };

    const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    firebaseAuth = getAuth(app);
    return firebaseAuth;
  } catch (err) {
    console.warn("Firebase Auth 初始化失敗:", err);
    return null;
  }
}

function isAdminLoggedIn() {
  return !!currentAdminUser;
}

async function deleteCourseFromFirestore(courseId) {
  if (!currentAdminUser) {
    throw new Error('未登入或登入憑證無效，請先使用 Google 帳號登入。');
  }

  const idToken = await currentAdminUser.getIdToken();
  const deleteUrl = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents/courses/${encodeURIComponent(courseId)}`;
  const res = await fetch(deleteUrl, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${idToken}`
    }
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    const errMsg = errData.error?.message || `刪除失敗 (HTTP ${res.status})`;
    if (res.status === 403) {
      throw new Error(`權限不足：請確認 Firebase 控制台中的 Firestore 規則已允許「${currentAdminUser.email}」進行刪除。\n(${errMsg})`);
    } else if (res.status === 401) {
      throw new Error('登入憑證已失效，請重新登入管理員。');
    }
    throw new Error(errMsg);
  }

  return true;
}

async function checkIsAdminInFirestore(user) {
  if (!user || !user.email) return false;
  try {
    const idToken = await user.getIdToken();
    const url = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents/admins/${encodeURIComponent(user.email.toLowerCase())}`;
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${idToken}` }
    });
    return res.ok;
  } catch (err) {
    console.warn('檢查 Firestore 管理員身分時出錯:', err);
    return false;
  }
}

function updateAdminFooterUI() {
  notionActions.refresh();
  const deleteButton = document.getElementById('btnDeleteCourse');
  if (deleteButton) deleteButton.hidden = !isAdminLoggedIn();
  const statusArea = document.getElementById('adminStatusArea');
  const triggerBtn = document.getElementById('adminLoginTrigger');
  const userBadge = document.getElementById('adminUserBadge');
  if (!statusArea || !triggerBtn) return;

  if (isAdminLoggedIn()) {
    statusArea.style.display = 'flex';
    triggerBtn.style.display = 'none';
    if (userBadge && currentAdminUser?.email) {
      userBadge.innerText = `🟢 管理員 (${currentAdminUser.email})`;
    }
  } else {
    statusArea.style.display = 'none';
    triggerBtn.style.display = 'inline-block';
  }
}

function setupAdminModal() {
  const adminOverlay = document.getElementById('adminModalOverlay');
  const adminClose = document.getElementById('adminModalClose');
  const adminTrigger = document.getElementById('adminLoginTrigger');
  const adminError = document.getElementById('adminLoginError');
  const adminLogoutBtn = document.getElementById('adminLogoutBtn');
  const btnGoogleSignIn = document.getElementById('btnGoogleSignIn');

  // 初始化並監聽自動登入狀態，且向 Firestore 進行權限檢驗
  const auth = getFirebaseAuth();
  if (auth) {
    let authRevision = 0;
    onAuthStateChanged(auth, async (user) => {
      const revision = ++authRevision;
      currentAdminUser = null;
      updateAdminFooterUI();
      if (user) {
        const isAdmin = await checkIsAdminInFirestore(user);
        if (revision !== authRevision || auth.currentUser !== user) return;
        if (isAdmin) {
          currentAdminUser = user;
          updateAdminFooterUI();
        } else {
          // 非管理員，立即自動登出以撤銷前端狀態
          await signOut(auth);
          currentAdminUser = null;
          updateAdminFooterUI();
        }
      } else {
        currentAdminUser = null;
        updateAdminFooterUI();
      }
    });
  }

  if (adminTrigger && adminOverlay) {
    adminTrigger.addEventListener('click', () => {
      adminError.style.display = 'none';
      adminError.innerText = '';
      adminOverlay.classList.add('active');
    });
  }

  const closeAdminModal = () => {
    if (adminOverlay) adminOverlay.classList.remove('active');
  };

  if (adminClose) adminClose.addEventListener('click', closeAdminModal);
  if (adminOverlay) {
    adminOverlay.addEventListener('click', (e) => {
      if (e.target === adminOverlay) closeAdminModal();
    });
  }

  if (btnGoogleSignIn) {
    btnGoogleSignIn.addEventListener('click', async () => {
      adminError.style.display = 'none';
      btnGoogleSignIn.disabled = true;
      const originalHtml = btnGoogleSignIn.innerHTML;
      btnGoogleSignIn.innerHTML = '正在開啟 Google 登入視窗...';

      try {
        const auth = getFirebaseAuth();
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        const result = await signInWithPopup(auth, provider);
        const user = result.user;

        btnGoogleSignIn.innerHTML = '正在與 Firestore 比對管理員權限...';
        const isAdmin = await checkIsAdminInFirestore(user);
        if (auth.currentUser !== user) throw new Error('登入狀態已變更，請重新登入。');
        if (!isAdmin) {
          await signOut(auth);
          currentAdminUser = null;
          updateAdminFooterUI();
          throw new Error(`【存取遭拒】\n您的帳號「${user.email}」非 Firestore 授權管理員，無管理權限。`);
        }

        currentAdminUser = user;
        updateAdminFooterUI();
        closeAdminModal();
        alert(`✅ 管理員身分已通過 Firestore 驗證！\n歡迎，${user.displayName || user.email}！\n您現在可使用「Notion」與「🗑️ 刪除」功能。`);
      } catch (err) {
        console.error('Google Sign-In Error:', err);
        adminError.style.display = 'block';
        if (err.code === 'auth/popup-closed-by-user') {
          adminError.innerText = '登入視窗已被關閉，請重新點擊登入。';
        } else if (err.code === 'auth/unauthorized-domain') {
          adminError.innerText = `當前網址網域尚未在 Firebase 授權！\n請至 Firebase Console > Authentication > Settings > Authorized domains 加入當前網址網域（例如：jeffcodingmentor.github.io 或 localhost）。`;
        } else if (err.code === 'auth/operation-not-allowed') {
          adminError.innerText = 'Firebase Authentication 尚未啟用 Google 登入提供者，請至 Firebase 控制台開啟。';
        } else {
          adminError.innerText = err.message || '登入失敗，請稍後再試。';
        }
      } finally {
        btnGoogleSignIn.disabled = false;
        btnGoogleSignIn.innerHTML = originalHtml;
      }
    });
  }

  if (adminLogoutBtn) {
    adminLogoutBtn.addEventListener('click', async () => {
      if (window.confirm('確定要登出 Google 管理員帳號嗎？登出後將隱藏管理功能。')) {
        const auth = getFirebaseAuth();
        if (auth) await signOut(auth);
        currentAdminUser = null;
        updateAdminFooterUI();
        alert('已成功登出管理員。');
      }
    });
  }

  updateAdminFooterUI();
}

async function initCalendar() {
  cleanupExpiredInterests();
  try {
    setupAdminModal();
  } catch (err) {
    console.warn('管理員模組載入異常（不影響日曆檢視）:', err);
  }
  
  const calendarEl = document.getElementById('calendar');
  const modalOverlay = document.getElementById('modalOverlay');
  const modalClose = document.getElementById('modalClose');
  const modalBody = document.getElementById('modalBody');

  // Insert a simple loading indicator
  calendarEl.innerHTML = '<div class="calendar-day" style="width: 100%; border: none; grid-column: 1 / -1; height: 100px; display: flex; align-items: center; justify-content: center; color: var(--text-muted);">正在載入最新課程資料...</div>';

  const today = new Date();
  
  // Fetch courses dynamically from Firestore and get the computed start date
  const { courses, startDate, totalWeeks } = await fetchCoursesDynamically();
  const interested = getInterestedCourses();

  // Render dynamic days
  const daysHTML = [];
  const startTimestamp = startDate.getTime();
  const totalDays = totalWeeks * 7;

  for (let i = 0; i < totalDays; i++) {
    const currentDay = new Date(startTimestamp + i * 24 * 60 * 60 * 1000);
    const dateString = `${currentDay.getFullYear()}/${String(currentDay.getMonth() + 1).padStart(2, '0')}/${String(currentDay.getDate()).padStart(2, '0')}`;
    const dayOfMonth = currentDay.getDate();
    
    let classes = 'calendar-day';
    
    // Check if it's today
    if (currentDay.getFullYear() === today.getFullYear() &&
        currentDay.getMonth() === today.getMonth() &&
        currentDay.getDate() === today.getDate()) {
      classes += ' today';
    }

    // Courses for this date
    const dayCourses = courses.filter(c => c.dateStr === dateString);
    
    // Sort by start time if available
    dayCourses.sort((a, b) => (a.startTime || '24:00').localeCompare(b.startTime || '24:00'));

    let coursesHTML = '';
    dayCourses.forEach(course => {
      // Check status: 'interested' | 'following' | null
      const status = getCourseStatus(interested, course.id);
      let statusClass = '';
      if (status === 'interested') statusClass = 'interested';
      else if (status === 'following') statusClass = 'following';
      
      // Create a safely encoded JSON string for data attribute
      const encodedCourse = encodeURIComponent(JSON.stringify(course));
      const displayTime = course.timeRange ? course.timeRange : '';
      
      // Remove prefixes like [分類] or 【主題】 for the calendar display
      const displayName = course.name.replace(/^([\[【].*?[\]】]\s*)+/g, '').trim();
      
      coursesHTML += `
        <div class="course-item ${statusClass}" data-course="${encodedCourse}" data-id="${course.id}">
          <div class="course-title" title="${course.name}">${displayName}</div>
          ${displayTime ? `<div class="course-time">${displayTime}</div>` : ''}
        </div>
      `;
    });

    daysHTML.push(`
      <div class="${classes}">
        <div class="date-header">
          <span class="date-number">${dayOfMonth === 1 ? (currentDay.getMonth() + 1) + '月 ' + dayOfMonth : dayOfMonth}</span>
        </div>
        <div class="courses-container">
          ${coursesHTML}
        </div>
      </div>
    `);
  }

  calendarEl.innerHTML = daysHTML.join('');

  // Event delegation for course clicks
  calendarEl.addEventListener('click', (e) => {
    const item = e.target.closest('.course-item');
    if (item) {
      const courseStr = decodeURIComponent(item.getAttribute('data-course'));
      const course = JSON.parse(courseStr);
      showModal(course);
    }
  });

  let notionView = null;
  function showModal(course) {
    notionView?.dispose();
    const dayCourses = courses.filter(c => c.dateStr === course.dateStr);
    dayCourses.sort((a, b) => (a.startTime || '24:00').localeCompare(b.startTime || '24:00'));
    const currentIndex = dayCourses.findIndex(c => c.id === course.id);
    const prevCourse = currentIndex > 0 ? dayCourses[currentIndex - 1] : null;
    const nextCourse = currentIndex < dayCourses.length - 1 ? dayCourses[currentIndex + 1] : null;

    const interested = getInterestedCourses();
    const currentStatus = getCourseStatus(interested, course.id);

    let btnClass = '';
    let btnIcon = '☆';
    let btnText = '有興趣';

    if (currentStatus === 'interested') {
      btnClass = 'interested';
      btnIcon = '★';
      btnText = '有興趣';
    } else if (currentStatus === 'following') {
      btnClass = 'following';
      btnIcon = '★';
      btnText = '關注';
    }

    modalBody.innerHTML = `
      <button id="btnPrevCourse" class="modal-nav-btn modal-prev" ${!prevCourse ? 'disabled' : ''}>
        &lsaquo; 上一筆
      </button>
      <button id="btnNextCourse" class="modal-nav-btn modal-next" ${!nextCourse ? 'disabled' : ''}>
        下一筆 &rsaquo;
      </button>

      <div class="detail-value title">${course.name}</div>
      <div class="modal-header-actions">
        <button id="btnDeleteCourse" class="btn-action btn-danger" title="永久刪除此課程" ${isAdminLoggedIn() ? '' : 'hidden'}>
          <span class="icon">🗑️</span> 刪除
        </button>
        <button id="btnInterested" class="btn-action ${btnClass}">
          <span class="icon">${btnIcon}</span> <span class="text">${btnText}</span>
        </button>
        <div id="notionActionArea" class="notion-action-area" hidden></div>
      </div>
      <div class="detail-row">
        <div class="detail-label">課程代碼</div>
        <div class="detail-value">
          <a href="${course.sourceUrl}" target="_blank">${course.id}</a>
        </div>
      </div>
      <div class="detail-row">
        <div class="detail-label">研習時間</div>
        <div class="detail-value">${course.rawTime}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">主講人</div>
        <div class="detail-value">${course.speaker}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Google Meet / 線上連結</div>
        <div class="detail-value">${course.meetLinkHtml}</div>
      </div>
    `;
    modalOverlay.classList.add('active');
    notionView = notionActions.mount(document.getElementById('notionActionArea'), course.id, course);

    // Button event listeners
    document.getElementById('btnInterested').onclick = () => {
      const currentInterested = getInterestedCourses();
      const currentStatus = getCourseStatus(currentInterested, course.id);
      const btn = document.getElementById('btnInterested');
      const courseEl = document.querySelector(`.course-item[data-id="${course.id}"]`);

      let nextStatus = null;
      if (!currentStatus) {
        nextStatus = 'interested';
      } else if (currentStatus === 'interested') {
        nextStatus = 'following';
      } else {
        nextStatus = null;
      }

      // Update storage
      if (nextStatus) {
        currentInterested[course.id] = {
          date: course.dateStr,
          status: nextStatus
        };
      } else {
        delete currentInterested[course.id];
      }
      saveInterestedCourses(currentInterested);

      // Update Button UI
      btn.classList.remove('interested', 'following', 'active');
      if (nextStatus === 'interested') {
        btn.classList.add('interested');
        btn.querySelector('.icon').innerText = '★';
        btn.querySelector('.text').innerText = '有興趣';
      } else if (nextStatus === 'following') {
        btn.classList.add('following');
        btn.querySelector('.icon').innerText = '★';
        btn.querySelector('.text').innerText = '關注';
      } else {
        btn.querySelector('.icon').innerText = '☆';
        btn.querySelector('.text').innerText = '有興趣';
      }

      // Update Calendar Item UI
      if (courseEl) {
        courseEl.classList.remove('interested', 'following');
        if (nextStatus) {
          courseEl.classList.add(nextStatus);
        }
      }
    };

    // Admin Delete Event Listener
    const btnDelete = document.getElementById('btnDeleteCourse');
    if (btnDelete) {
      btnDelete.onclick = async () => {
        if (!isAdminLoggedIn()) return;
        const cleanName = course.name.replace(/^([\[【].*?[\]】]\s*)+/g, '').trim();
        const confirmed = window.confirm(`確定要永久刪除此課程嗎？\n\n【${cleanName}】\n代碼：${course.id}\n時間：${course.dateStr} ${course.timeRange}\n\n⚠️ 此操作將直接從 Firestore 資料庫中永久移除，無法復原。`);
        if (!confirmed) return;

        btnDelete.disabled = true;
        btnDelete.innerHTML = '<span class="icon">⏳</span> 刪除中...';

        try {
          await deleteCourseFromFirestore(course.id);

          // 1. 從記憶體中的 courses 陣列移除
          const cIdx = courses.findIndex(c => c.id === course.id);
          if (cIdx !== -1) {
            courses.splice(cIdx, 1);
          }

          // 2. 從畫面中的日曆 DOM 移除該卡片
          const courseEls = document.querySelectorAll(`.course-item[data-id="${course.id}"]`);
          courseEls.forEach(el => el.remove());

          // 3. 關閉彈窗並提示
          notionView?.dispose();
          modalOverlay.classList.remove('active');
          alert(`✅ 課程「${cleanName}」已成功自資料庫刪除！`);
        } catch (err) {
          alert(`❌ 刪除失敗：${err.message}`);
          btnDelete.disabled = false;
          btnDelete.innerHTML = '<span class="icon">🗑️</span> 刪除';
        }
      };
    }

    if (prevCourse) {
      document.getElementById('btnPrevCourse').onclick = () => showModal(prevCourse);
    }
    if (nextCourse) {
      document.getElementById('btnNextCourse').onclick = () => showModal(nextCourse);
    }
  }

  modalClose.addEventListener('click', () => {
    notionView?.dispose();
    modalOverlay.classList.remove('active');
  });

  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) {
      notionView?.dispose();
      modalOverlay.classList.remove('active');
    }
  });
}

document.addEventListener('DOMContentLoaded', initCalendar);
