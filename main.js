const GITHUB_API_URL = "https://api.github.com/repos/JeffCodingMentor/inspage/contents/data";

async function fetchCoursesDynamically() {
  const coursesMap = new Map();
  
  // Default to current week's Monday if no data found
  const today = new Date();
  let dayOfWeek = today.getDay();
  let diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const currentWeekMonday = new Date(today);
  currentWeekMonday.setDate(today.getDate() + diffToMonday);
  currentWeekMonday.setHours(0, 0, 0, 0);
  
  let startDate = new Date(currentWeekMonday);
  let dynamicCutoffTime = startDate.getTime();
  let isFirstValidFile = true;
  let totalWeeks = 3;

  try {
    const response = await fetch(GITHUB_API_URL);
    if (!response.ok) throw new Error("Failed to fetch file list from GitHub");
    const files = await response.json();
    
    // Filter markdown files and sort by name descending (newest first)
    const mdFiles = files.filter(f => f.name.endsWith('.md'))
                         .sort((a, b) => b.name.localeCompare(a.name));

    for (const file of mdFiles) {
      const fileRes = await fetch(file.download_url);
      if (!fileRes.ok) continue;
      const rawMarkdown = await fileRes.text();
      
      const lines = rawMarkdown.split('\n');
      let isTable = false;
      let hasValidCourse = false;
      let allCoursesAreOld = true;
      let fileMaxDate = 0;
      let fileCourses = [];
      
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('| 課程代碼 |')) {
          isTable = true;
          continue;
        }
        if (isTable && trimmed.startsWith('| :---')) {
          continue;
        }
        if (isTable && trimmed.startsWith('|')) {
          const cols = trimmed.split('|').map(s => s.trim());
          if (cols.length >= 6) {
            const rawIdStr = cols[1]; // e.g. [5547097](https://...) or 5547097
            let id = '';
            let sourceUrl = '';

            const idMatch = rawIdStr.match(/\[(\d+)\]/);
            if (idMatch) {
              id = idMatch[1];
              const rawUrlMatch = rawIdStr.match(/\((https?:\/\/[^\)]+)\)/);
              sourceUrl = rawUrlMatch ? rawUrlMatch[1] : '';
            } else {
              const pureDigits = rawIdStr.match(/(\d{7})/);
              if (pureDigits) id = pureDigits[1];
            }

            if (!id) continue;

            const name = cols[2].replace(/\*\*/g, '');
            const rawTime = cols[3].replace(/\*\*/g, ''); // e.g. 2026/04/12(日) 09:00~12:00
            
            // Flexible date matching for YYYY/MM/DD or YYYY-MM-DD (with 1 or 2 digits month/day)
            const dateMatch = rawTime.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
            let dateStr = '';
            if (dateMatch) {
              const yyyy = dateMatch[1];
              const mm = String(dateMatch[2]).padStart(2, '0');
              const dd = String(dateMatch[3]).padStart(2, '0');
              dateStr = `${yyyy}/${mm}/${dd}`;
            }

            const timeRangeMatch = rawTime.match(/(\d{2}:\d{2}.*)$/);
            const timeRange = timeRangeMatch ? timeRangeMatch[1].trim() : '';
            const startTime = timeRange.match(/(\d{2}:\d{2})/) ? timeRange.match(/(\d{2}:\d{2})/)[1] : '';

            const meetLink = cols[4];
            let meetLinkHtml = meetLink;
            let rawLink = '';
            
            const linkUrlMatch = meetLink.match(/\((https?:\/\/[^\)]+)\)/) || meetLink.match(/(https?:\/\/[^\s\)]+)/);
            if (linkUrlMatch) {
              rawLink = linkUrlMatch[1];
              meetLinkHtml = `<a href="${rawLink}" target="_blank" rel="noopener noreferrer">${rawLink}</a>`;
            } else if (meetLink.includes('meet.google.com')) {
              const m = meetLink.match(/(https?:\/\/meet\.google\.com\/[a-z-]+)/);
              if (m) {
                rawLink = m[1];
                meetLinkHtml = `<a href="${rawLink}" target="_blank" rel="noopener noreferrer">${rawLink}</a>`;
              }
            }
            
            const speaker = cols[5];

            let courseDate = 0;
            if (dateStr) {
              const parsedDate = new Date(dateStr.replace(/\//g, '-'));
              if (!isNaN(parsedDate.getTime())) {
                courseDate = parsedDate.getTime();
                hasValidCourse = true;
                if (courseDate > fileMaxDate) {
                  fileMaxDate = courseDate;
                }
              }
            }

            fileCourses.push({
              id,
              name,
              rawTime,
              dateStr,
              startTime,
              timeRange,
              meetLinkHtml,
              rawLink,
              speaker,
              sourceUrl,
              courseDate
            });
          }
        } else if (isTable && line.trim() === '') {
          isTable = false; // End of table
        }
      }

      // If we found valid courses in this first file, set the dynamic window
      if (isFirstValidFile && hasValidCourse) {
        const maxD = new Date(fileMaxDate);
        let maxDWeekDay = maxD.getDay();
        let maxDDiffToMonday = maxDWeekDay === 0 ? -6 : 1 - maxDWeekDay;
        const maxWeekMonday = new Date(maxD);
        maxWeekMonday.setDate(maxD.getDate() + maxDDiffToMonday);
        maxWeekMonday.setHours(0, 0, 0, 0);

        let diffMs = maxWeekMonday.getTime() - startDate.getTime();
        let diffWeeks = Math.round(diffMs / (7 * 24 * 60 * 60 * 1000));
        totalWeeks = Math.max(3, diffWeeks + 1);
        
        isFirstValidFile = false;
      }

      if (hasValidCourse) {
        for (const c of fileCourses) {
          if (c.courseDate >= dynamicCutoffTime) {
            allCoursesAreOld = false;
          }
          if (!coursesMap.has(c.id)) {
            coursesMap.set(c.id, c);
          }
        }
      }

      // If we found courses in this file, and EVERY single one was older than the cutoff time
      // we can comfortably stop fetching any older historical files to save time and bandwidth.
      if (!isFirstValidFile && hasValidCourse && allCoursesAreOld) {
        console.log(`Stopping fetch because file ${file.name} contains only courses older than the calendar start date.`);
        break;
      }
    }
  } catch (error) {
    console.error("Error fetching courses from GitHub:", error);
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
