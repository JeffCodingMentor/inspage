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

// ==========================================
// Firebase Authentication & 管理員模組
// ==========================================
const AUTH_STORAGE_KEY = 'firebase_admin_auth';

function getAdminAuth() {
  const data = localStorage.getItem(AUTH_STORAGE_KEY);
  if (!data) return null;
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

function saveAdminAuth(authData) {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authData));
}

function clearAdminAuth() {
  localStorage.removeItem(AUTH_STORAGE_KEY);
}

function isAdminLoggedIn() {
  const auth = getAdminAuth();
  return !!(auth && auth.idToken);
}

async function loginAdminWithEmail(apiKey, email, password) {
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      returnSecureToken: true
    })
  });
  const data = await res.json();
  if (!res.ok) {
    let msg = '登入失敗';
    if (data.error && data.error.message) {
      const code = data.error.message;
      if (code === 'EMAIL_NOT_FOUND' || code === 'INVALID_PASSWORD' || code === 'INVALID_LOGIN_CREDENTIALS') {
        msg = '帳號或密碼錯誤，請重新確認。';
      } else if (code === 'API_KEY_INVALID') {
        msg = 'Firebase 網路 API 金鑰無效，請至 Firebase 控制台確認。';
      } else if (code === 'OPERATION_NOT_ALLOWED') {
        msg = 'Firebase Authentication 尚未啟用 Email/密碼 登入提供者。';
      } else if (code === 'TOO_MANY_ATTEMPTS_TRY_LATER') {
        msg = '嘗試次數過多，已被暫時封鎖，請稍後再試。';
      } else {
        msg = `錯誤：${code}`;
      }
    }
    throw new Error(msg);
  }

  const authData = {
    apiKey,
    email: data.email,
    idToken: data.idToken,
    refreshToken: data.refreshToken,
    expiresAt: Date.now() + parseInt(data.expiresIn || '3600', 10) * 1000
  };
  saveAdminAuth(authData);
  localStorage.setItem('firebase_web_api_key', apiKey);
  return authData;
}

async function getValidIdToken() {
  const auth = getAdminAuth();
  if (!auth) return null;

  // 若 Token 還剩 5 分鐘以上才過期，直接回傳
  if (auth.expiresAt && Date.now() < auth.expiresAt - 5 * 60 * 1000) {
    return auth.idToken;
  }

  // 嘗試透過 Google Secure Token API 刷新憑證
  if (auth.refreshToken && auth.apiKey) {
    try {
      const url = `https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(auth.apiKey)}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: auth.refreshToken
        })
      });
      if (res.ok) {
        const refreshData = await res.json();
        auth.idToken = refreshData.id_token;
        auth.refreshToken = refreshData.refresh_token;
        auth.expiresAt = Date.now() + parseInt(refreshData.expires_in || '3600', 10) * 1000;
        saveAdminAuth(auth);
        return auth.idToken;
      }
    } catch (e) {
      console.error('刷新 Token 失敗:', e);
    }
  }

  return auth.idToken;
}

async function deleteCourseFromFirestore(courseId) {
  const idToken = await getValidIdToken();
  if (!idToken) {
    throw new Error('未登入或登入憑證無效，請重新登入管理員。');
  }

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
      throw new Error(`權限不足：請確認 Firebase 控制台中的 Firestore 安全規則已允許已登入者進行 delete。\n(${errMsg})`);
    } else if (res.status === 401) {
      clearAdminAuth();
      updateAdminFooterUI();
      throw new Error('登入憑證已失效，請重新登入管理員。');
    }
    throw new Error(errMsg);
  }

  return true;
}

function updateAdminFooterUI() {
  const statusArea = document.getElementById('adminStatusArea');
  const triggerBtn = document.getElementById('adminLoginTrigger');
  if (!statusArea || !triggerBtn) return;

  if (isAdminLoggedIn()) {
    statusArea.style.display = 'flex';
    triggerBtn.style.display = 'none';
  } else {
    statusArea.style.display = 'none';
    triggerBtn.style.display = 'inline-block';
  }
}

function setupAdminModal() {
  const adminOverlay = document.getElementById('adminModalOverlay');
  const adminClose = document.getElementById('adminModalClose');
  const adminTrigger = document.getElementById('adminLoginTrigger');
  const adminCancel = document.getElementById('btnAdminCancel');
  const adminForm = document.getElementById('adminLoginForm');
  const adminError = document.getElementById('adminLoginError');
  const adminLogoutBtn = document.getElementById('adminLogoutBtn');
  const submitBtn = document.getElementById('btnAdminSubmit');

  if (adminTrigger && adminOverlay) {
    adminTrigger.addEventListener('click', () => {
      const savedKey = localStorage.getItem('firebase_web_api_key') || getAdminAuth()?.apiKey || '';
      const savedEmail = getAdminAuth()?.email || '';
      document.getElementById('adminApiKey').value = savedKey;
      document.getElementById('adminEmail').value = savedEmail;
      document.getElementById('adminPassword').value = '';
      adminError.style.display = 'none';
      adminError.innerText = '';
      adminOverlay.classList.add('active');
    });
  }

  const closeAdminModal = () => {
    if (adminOverlay) adminOverlay.classList.remove('active');
  };

  if (adminClose) adminClose.addEventListener('click', closeAdminModal);
  if (adminCancel) adminCancel.addEventListener('click', closeAdminModal);
  if (adminOverlay) {
    adminOverlay.addEventListener('click', (e) => {
      if (e.target === adminOverlay) closeAdminModal();
    });
  }

  if (adminForm) {
    adminForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const apiKey = document.getElementById('adminApiKey').value.trim();
      const email = document.getElementById('adminEmail').value.trim();
      const password = document.getElementById('adminPassword').value;

      adminError.style.display = 'none';
      submitBtn.disabled = true;
      submitBtn.innerText = '登入中...';

      try {
        await loginAdminWithEmail(apiKey, email, password);
        updateAdminFooterUI();
        closeAdminModal();
        alert('✅ 管理員登入成功！您現在開啟課程時將可使用「🗑️ 刪除」功能。');
      } catch (err) {
        adminError.style.display = 'block';
        adminError.innerText = err.message;
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = '登入';
      }
    });
  }

  if (adminLogoutBtn) {
    adminLogoutBtn.addEventListener('click', () => {
      if (window.confirm('確定要登出管理員嗎？登出後將隱藏刪除按鈕。')) {
        clearAdminAuth();
        updateAdminFooterUI();
        alert('已成功登出管理員。');
      }
    });
  }

  updateAdminFooterUI();
}

async function initCalendar() {
  cleanupExpiredInterests();
  setupAdminModal();
  
  const calendarEl = document.getElementById('calendar');
  const modalOverlay = document.getElementById('modalOverlay');
  const modalClose = document.getElementById('modalClose');
  const modalBody = document.getElementById('modalBody');

  // Insert a simple loading indicator
  calendarEl.innerHTML = '<div class="calendar-day" style="width: 100%; border: none; grid-column: 1 / -1; height: 100px; display: flex; align-items: center; justify-content: center; color: var(--text-muted);">正在載入最新課程資料...</div>';

  const today = new Date();
  
  // Fetch courses dynamically from GitHub and get the computed start date
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

  function showModal(course) {
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
        ${isAdminLoggedIn() ? `
        <button id="btnDeleteCourse" class="btn-action btn-danger" title="永久刪除此課程">
          <span class="icon">🗑️</span> 刪除
        </button>
        ` : ''}
        <button id="btnInterested" class="btn-action ${btnClass}">
          <span class="icon">${btnIcon}</span> <span class="text">${btnText}</span>
        </button>
        <button id="btnCopy" class="btn-action">
          <span class="icon">📋</span> Copy
        </button>
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

    document.getElementById('btnCopy').onclick = async () => {
      const link = course.rawLink || 'http://tbd/tbd';
      const cleanName = course.name.replace(/^([\[【].*?[\]】]\s*)+/g, '').trim();
      const textToCopy = `課程: ${cleanName}
時間: ${course.dateStr} ${course.timeRange}
連結: ${link}
主講: ${course.speaker}
主辦: 教師研習`;
      
      try {
        await navigator.clipboard.writeText(textToCopy);
        const btn = document.getElementById('btnCopy');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<span class="icon">✅</span> Copied!';
        setTimeout(() => { btn.innerHTML = originalText; }, 2000);
      } catch (err) {
        console.error('Failed to copy: ', err);
      }
    };

    // Admin Delete Event Listener
    const btnDelete = document.getElementById('btnDeleteCourse');
    if (btnDelete) {
      btnDelete.onclick = async () => {
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
    modalOverlay.classList.remove('active');
  });

  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) {
      modalOverlay.classList.remove('active');
    }
  });
}

document.addEventListener('DOMContentLoaded', initCalendar);
