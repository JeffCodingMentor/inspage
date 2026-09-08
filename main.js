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

async function initCalendar() {
  cleanupExpiredInterests();
  
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
主講: ${course.speaker}`;
      
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
