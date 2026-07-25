(function () {
  'use strict';

  const store = window.CentumStore;
  const prompts = window.DIARY_PROMPTS || [];
  const APP_VERSION = window.CENTUM_VERSION || '3.0.0';
  const views = {};

  let currentView = 'home';
  let editorDate = '';
  let selectedMood = 'calm';
  let editorPhoto = null;
  let pinBuffer = '';
  let memorySearch = '';
  let installPrompt = null;
  let waitingWorker = null;
  let storageStatus = { mode: '확인 중', persisted: false, usage: 0, quota: 0 };
  let snapshots = [];
  let lastHiddenAt = 0;
  let appLocked = false;
  let isVerifyingPin = false;

  const moodMap = {
    happy: { icon: '😄', label: '행복' },
    good: { icon: '🙂', label: '좋음' },
    calm: { icon: '😌', label: '평온' },
    tired: { icon: '😴', label: '피곤' },
    sad: { icon: '😢', label: '슬픔' }
  };

  const escapeHtml = (value = '') => String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  const formatKoreanDate = (value) => new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'short'
  }).format(new Date(`${value}T00:00:00`));

  const formatDateTime = (value) => value
    ? new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
    : '없음';

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
    const units = ['B', 'KB', 'MB', 'GB'];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / (1024 ** index)).toFixed(index > 1 ? 1 : 0)} ${units[index]}`;
  }

  async function init() {
    await store.ready;
    editorDate = store.today();

    document.querySelectorAll('.view-page').forEach((element) => {
      views[element.id.replace('view-', '')] = element;
    });

    document.querySelectorAll('.nav-item').forEach((button) => {
      button.addEventListener('click', () => navigate(button.dataset.view));
    });

    document.getElementById('fab-write-btn').addEventListener('click', () => openEditor(store.today()));
    document.getElementById('header-menu-btn').addEventListener('click', () => navigate('settings'));
    document.getElementById('header-user-btn').addEventListener('click', () => navigate('stats'));
    document.getElementById('update-now-btn')?.addEventListener('click', applyUpdate);
    document.getElementById('update-later-btn')?.addEventListener('click', hideUpdateBanner);

    document.addEventListener('click', handleDelegatedClick);
    document.addEventListener('submit', handleSubmit);
    document.addEventListener('input', handleInput);
    document.addEventListener('change', handleChange);
    window.addEventListener('centum:statechange', handleStateChange);
    window.addEventListener('centum:storageerror', () => showToast('저장 공간이 부족합니다. 백업 후 사진을 줄여주세요.', 3500));
    window.addEventListener('online', updateNetworkStatus);
    window.addEventListener('offline', updateNetworkStatus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    setupPinPad();
    applyTheme();
    updateNetworkStatus();
    renderAll();
    navigate(resolveInitialView());
    setupPwa();
    await refreshSystemInfo();
    checkInAppReminder();
    document.getElementById('boot-screen')?.classList.add('hidden');

    if (store.getState().settings.pinEnabled) openPinLock();
  }

  function resolveInitialView() {
    const params = new URLSearchParams(location.search);
    if (params.get('action') === 'write') {
      setTimeout(() => openEditor(store.today()), 0);
      return 'home';
    }
    if (params.get('view') === 'calendar') return 'calendar';
    return 'home';
  }

  function handleStateChange(event) {
    applyTheme();
    const reason = event.detail?.reason;
    if (currentView === 'editor' && reason === 'draft') return;
    renderAll();
  }

  function projectMetrics() {
    const project = store.getProject();
    const todayDay = store.dayNumber(store.today(), project);
    const completedDays = Object.keys(project.entries).filter((date) => {
      const day = store.dayNumber(date, project);
      return day >= 1 && day <= 100;
    }).length;
    const currentDay = clamp(todayDay, 1, 100);
    const progress = Math.round((completedDays / 100) * 100);
    const streak = calculateStreak(project.entries);
    return { project, currentDay, completedDays, progress, streak, todayDay };
  }

  function calculateStreak(entries) {
    let streak = 0;
    const date = new Date(`${store.today()}T00:00:00`);
    if (!entries[store.today()]) date.setDate(date.getDate() - 1);
    while (true) {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      if (!entries[`${y}-${m}-${d}`]) break;
      streak += 1;
      date.setDate(date.getDate() - 1);
    }
    return streak;
  }

  function renderAll() {
    renderHome();
    renderStats();
    renderCalendar();
    renderMemories();
    renderSettings();
    renderCompletion();
    renderCreate();
    renderOnboarding();
    if (currentView === 'editor') renderEditor();
  }

  function renderHome() {
    const { project, currentDay, completedDays, progress, streak, todayDay } = projectMetrics();
    const todayEntry = project.entries[store.today()];
    const promptText = prompts[(currentDay - 1) % Math.max(prompts.length, 1)] || '오늘의 이야기를 기록해보세요.';
    const journeyMessage = todayDay < 1
      ? `${Math.abs(todayDay) + 1}일 뒤 여정이 시작돼요.`
      : todayDay > 100
        ? '100일 여정을 완주했어요!'
        : `오늘은 여정의 ${currentDay}일째예요.`;

    views.home.innerHTML = `
      <div class="hero">
        <p class="eyebrow">CENTUM 100 DAY JOURNEY</p>
        <h1>${escapeHtml(project.title)}</h1>
        <p>${escapeHtml(project.description || journeyMessage)}</p>
        <div class="progress-row"><span>${journeyMessage}</span><strong>${completedDays}/100</strong></div>
        <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}"><span style="width:${progress}%"></span></div>
      </div>

      <div class="section-title"><h2>오늘의 질문</h2><button class="text-btn" data-action="new-prompt">다른 질문</button></div>
      <div class="card prompt-card">
        <p class="eyebrow accent-text">DAY ${String(currentDay).padStart(2, '0')}</p>
        <div class="quote" id="daily-prompt">“${escapeHtml(promptText)}”</div>
        <button class="btn btn-primary btn-block top-gap" data-action="write-today">${todayEntry ? '오늘 기록 이어쓰기' : '오늘 기록 시작하기'}</button>
      </div>

      <div class="section-title"><h2>한눈에 보기</h2></div>
      <div class="quick-grid">
        <button class="card quick-card" data-view-target="calendar"><span class="icon">🗓️</span><strong>100일 히스토리</strong><small>기록한 날을 한눈에 확인해요.</small></button>
        <button class="card quick-card" data-view-target="stats"><span class="icon">🔥</span><strong>${streak}일 연속 기록</strong><small>꾸준한 흐름을 확인해요.</small></button>
        <button class="card quick-card" data-view-target="memories"><span class="icon">🔎</span><strong>기억 검색</strong><small>제목, 내용, 태그로 찾아보세요.</small></button>
        <button class="card quick-card" data-action="new-project"><span class="icon">🌱</span><strong>새 여정 만들기</strong><small>새로운 100일을 시작해요.</small></button>
      </div>
    `;
  }

  function renderStats() {
    const { project, completedDays, progress, streak } = projectMetrics();
    const entries = Object.values(project.entries);
    const counts = Object.keys(moodMap).reduce((result, key) => ({ ...result, [key]: 0 }), {});
    entries.forEach((entry) => { counts[entry.mood] = (counts[entry.mood] || 0) + 1; });
    const max = Math.max(1, ...Object.values(counts));
    const wordCount = entries.reduce((sum, entry) => sum + String(entry.content || '').trim().split(/\s+/).filter(Boolean).length, 0);
    const photoCount = entries.filter((entry) => entry.photo?.dataUrl).length;

    views.stats.innerHTML = `
      <div class="section-title first"><h2>나의 기록 통계</h2></div>
      <div class="stat-grid">
        <div class="card stat-card"><div class="stat-value">${completedDays}</div><div class="stat-label">작성한 일기</div></div>
        <div class="card stat-card"><div class="stat-value">${progress}%</div><div class="stat-label">여정 달성률</div></div>
        <div class="card stat-card"><div class="stat-value">${streak}</div><div class="stat-label">현재 연속 기록</div></div>
        <div class="card stat-card"><div class="stat-value">${Math.max(0, 100 - completedDays)}</div><div class="stat-label">남은 기록</div></div>
      </div>
      <div class="card summary-strip"><span>✍️ ${wordCount.toLocaleString()}단어</span><span>📷 사진 ${photoCount}장</span></div>
      <div class="section-title"><h2>감정 분포</h2></div>
      <div class="card form-card mood-list">
        ${Object.entries(moodMap).map(([key, mood]) => `
          <div class="mood-row"><span>${mood.icon} ${mood.label}</span><div class="mood-bar"><span style="width:${(counts[key] / max) * 100}%"></span></div><strong>${counts[key]}</strong></div>
        `).join('')}
      </div>
      ${completedDays >= 100 ? '<button class="btn btn-primary btn-block top-gap" data-view-target="completion">완주 인증서 보기</button>' : ''}
    `;
  }

  function renderCalendar() {
    const { project, currentDay } = projectMetrics();
    views.calendar.innerHTML = `
      <div class="card form-card">
        <div class="calendar-head"><div><p class="eyebrow accent-text">100-DAY MAP</p><h2>${escapeHtml(project.title)}</h2></div><strong>DAY ${currentDay}</strong></div>
        <div class="calendar-grid">
          ${Array.from({ length: 100 }, (_, index) => {
            const day = index + 1;
            const date = store.dateForDay(day, project);
            const written = Boolean(project.entries[date]);
            const isToday = date === store.today();
            const future = day > currentDay;
            return `<button class="day-cell ${written ? 'written' : ''} ${isToday ? 'today' : ''} ${future ? 'future' : ''}" aria-label="${day}일차 ${date}${written ? ' 작성 완료' : ''}" data-date="${date}">${day}</button>`;
          }).join('')}
        </div>
        <div class="legend"><span>작성 완료</span><span>미작성</span></div>
      </div>
      <div class="section-title"><h2>최근 기록</h2><button class="text-btn" data-view-target="memories">전체 보기</button></div>
      ${renderEntryList(5)}
    `;
  }

  function matchingEntries(limit = 100, term = '') {
    const project = store.getProject();
    const keyword = term.trim().toLocaleLowerCase('ko-KR');
    return Object.entries(project.entries)
      .filter(([, entry]) => {
        if (!keyword) return true;
        return [entry.title, entry.content, ...(entry.tags || [])]
          .join(' ')
          .toLocaleLowerCase('ko-KR')
          .includes(keyword);
      })
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, limit);
  }

  function renderEntryList(limit, term = '') {
    const project = store.getProject();
    const entries = matchingEntries(limit, term);
    if (!entries.length) {
      return `<div class="card empty"><div class="emoji">${term ? '🔎' : '📝'}</div><p>${term ? '검색 결과가 없어요.' : '아직 작성한 기록이 없어요.'}</p></div>`;
    }
    return `<div class="entry-list">${entries.map(([date, entry]) => {
      const day = store.dayNumber(date, project);
      const tags = (entry.tags || []).slice(0, 3).map((tag) => `<span class="tag">#${escapeHtml(tag)}</span>`).join('');
      const photo = entry.photo?.dataUrl ? `<img class="entry-thumb" src="${entry.photo.dataUrl}" alt="">` : '';
      return `<button class="card entry-item ${photo ? 'has-photo' : ''}" data-date="${date}">
        <div class="entry-day">${day}</div>
        <div class="entry-copy"><h3>${moodMap[entry.mood]?.icon || '😌'} ${escapeHtml(entry.title || formatKoreanDate(date))}</h3><p>${escapeHtml(entry.content)}</p>${tags ? `<div class="tag-row">${tags}</div>` : ''}</div>
        ${photo}<span class="chevron">›</span>
      </button>`;
    }).join('')}</div>`;
  }

  function renderMemories() {
    views.memories.innerHTML = `
      <div class="section-title first"><h2>기억 다시보기</h2></div>
      <div class="search-box"><span>🔎</span><input id="memory-search" type="search" inputmode="search" autocomplete="off" placeholder="제목, 내용, 태그 검색" value="${escapeHtml(memorySearch)}"><button type="button" data-action="clear-search" aria-label="검색어 지우기">×</button></div>
      <p class="result-count">${matchingEntries(100, memorySearch).length}개의 기록</p>
      ${renderEntryList(100, memorySearch)}
    `;
  }

  function editorSource() {
    const entry = store.getProject().entries[editorDate] || null;
    const draft = store.getDraft(editorDate);
    return { entry, draft, source: draft || entry || {} };
  }

  function renderEditor() {
    const project = store.getProject();
    const { entry, draft, source } = editorSource();
    selectedMood = source.mood || selectedMood || 'calm';
    editorPhoto = source.photo || null;
    const day = store.dayNumber(editorDate, project);
    const tags = Array.isArray(source.tags) ? source.tags.join(', ') : '';
    const outsideJourney = day < 1 || day > 100;

    views.editor.innerHTML = `
      <div class="section-title first"><div><p class="eyebrow accent-text">DAY ${day}</p><h2>${formatKoreanDate(editorDate)}</h2></div><button class="text-btn" data-action="close-editor">닫기</button></div>
      ${draft ? '<div class="notice success" style="display:flex; justify-content:space-between; align-items:center; gap:8px;"><span>작성 중이던 내용을 자동으로 복구했습니다.</span><button type="button" class="text-btn" data-action="discard-draft" style="min-height:auto; padding:0; text-decoration:underline;">임시 내용 버리기</button></div>' : ''}
      ${outsideJourney ? '<div class="notice warning">이 날짜는 현재 100일 여정 범위 밖입니다. 기록은 저장할 수 있지만 달성률에는 포함되지 않습니다.</div>' : ''}
      <form id="entry-form" class="card form-card">
        <input type="hidden" name="date" value="${editorDate}">
        <div class="field"><label for="entry-title">제목</label><input id="entry-title" name="title" maxlength="120" placeholder="오늘을 한 문장으로 남겨보세요" value="${escapeHtml(source.title || '')}"></div>
        <div class="field"><label>오늘의 기분</label><div class="mood-picker">${Object.entries(moodMap).map(([key, mood]) => `<button type="button" class="mood-choice ${selectedMood === key ? 'active' : ''}" data-mood="${key}" aria-label="${mood.label}" title="${mood.label}">${mood.icon}</button>`).join('')}</div></div>
        <div class="field"><label for="entry-content">오늘의 기록</label><textarea id="entry-content" name="content" maxlength="30000" placeholder="서두르지 말고 오늘의 마음을 기록해보세요.">${escapeHtml(source.content || '')}</textarea><div class="field-foot"><span id="autosave-status">자동 저장 준비됨</span><span id="content-count">${String(source.content || '').length.toLocaleString()}자</span></div></div>
        <div class="field"><label for="entry-tags">태그</label><input id="entry-tags" name="tags" maxlength="160" placeholder="예: 가족, 산책, 감사" value="${escapeHtml(tags)}"><small>쉼표로 구분하며 최대 10개까지 저장됩니다.</small></div>
        <div class="field"><label>사진 한 장</label>
          ${editorPhoto?.dataUrl ? `<div class="photo-preview"><img src="${editorPhoto.dataUrl}" alt="일기 사진 미리보기"><button type="button" class="photo-remove" data-action="remove-photo">사진 삭제</button></div>` : '<div class="photo-empty">사진은 휴대폰 안에 압축 저장되며 서버로 전송되지 않습니다.</div>'}
          <label class="btn btn-secondary btn-block file-btn">${editorPhoto ? '사진 바꾸기' : '사진 추가하기'}<input id="entry-photo-input" type="file" accept="image/*" hidden></label>
        </div>
        <div class="actions"><button class="btn btn-primary" type="submit">기록 저장</button>${entry ? '<button class="btn btn-danger" type="button" data-action="delete-entry">삭제</button>' : ''}</div>
      </form>
    `;
    bindEditorAutosave();
  }

  function renderSettings() {
    const state = store.getState();
    const settings = state.settings;
    const project = store.getProject();
    const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    const storagePercent = storageStatus.quota ? Math.min(100, (storageStatus.usage / storageStatus.quota) * 100) : 0;

    views.settings.innerHTML = `
      <div class="section-title first"><h2>설정</h2></div>
      <div class="card settings-list">
        <div class="setting-row"><div><strong>현재 여정</strong><small>기록할 100일 프로젝트 선택</small></div><select id="project-select">${state.projects.map((item) => `<option value="${item.id}" ${item.id === state.activeProjectId ? 'selected' : ''}>${escapeHtml(item.title)}</option>`).join('')}</select></div>
        <div class="setting-row"><div><strong>화면 테마</strong><small>휴대폰 화면에 맞는 색상</small></div><select id="theme-select"><option value="forest" ${settings.theme === 'forest' ? 'selected' : ''}>포레스트</option><option value="sepia" ${settings.theme === 'sepia' ? 'selected' : ''}>세피아</option><option value="dark" ${settings.theme === 'dark' ? 'selected' : ''}>다크</option></select></div>
        <div class="setting-row"><div><strong>PIN 잠금</strong><small>4자리 PIN은 간단한 화면 보호 기능입니다.</small></div><button class="switch ${settings.pinEnabled ? 'on' : ''}" data-action="toggle-pin" role="switch" aria-checked="${settings.pinEnabled}"><span></span></button></div>
        <div class="setting-row"><div><strong>백그라운드 화면 가림</strong><small>앱 전환 화면에서 일기 내용을 숨깁니다.</small></div><button class="switch ${settings.privacyOnBackground ? 'on' : ''}" data-action="toggle-privacy" role="switch" aria-checked="${settings.privacyOnBackground}"><span></span></button></div>
        <div class="setting-row"><div><strong>앱 실행 시 기록 알림</strong><small>지정 시간 이후 앱을 열면 안내합니다.</small></div><button class="switch ${settings.reminderEnabled ? 'on' : ''}" data-action="toggle-reminder" role="switch" aria-checked="${settings.reminderEnabled}"><span></span></button></div>
        ${settings.reminderEnabled ? `<div class="setting-row"><div><strong>알림 기준 시간</strong><small>앱이 닫혀 있을 때의 예약 알림은 PWA에서 보장되지 않습니다.</small></div><input id="reminder-time" type="time" value="${escapeHtml(settings.reminderTime)}"></div>` : ''}
      </div>

      <div class="section-title"><h2>현재 여정 관리</h2></div>
      <form id="project-settings-form" class="card form-card compact-form">
        <div class="field"><label for="settings-project-title">여정 이름</label><input id="settings-project-title" name="title" maxlength="80" required value="${escapeHtml(project.title)}"></div>
        <div class="field"><label for="settings-project-description">소개</label><textarea id="settings-project-description" name="description" maxlength="500">${escapeHtml(project.description || '')}</textarea></div>
        <div class="field"><label for="settings-project-start">시작일</label><input id="settings-project-start" name="startDate" type="date" required value="${project.startDate}"></div>
        <button class="btn btn-secondary btn-block" type="submit">여정 정보 저장</button>
      </form>

      <div class="section-title"><h2>휴대폰 저장 공간</h2></div>
      <div class="card storage-card">
        <div class="storage-head"><div><strong>${storageStatus.mode === 'indexeddb' ? 'IndexedDB 안전 저장' : '대체 저장 모드'}</strong><small>${storageStatus.persisted ? '영구 저장 보호가 허용됨' : '브라우저가 공간 부족 시 삭제할 가능성이 있음'}</small></div><span>${formatBytes(storageStatus.usage)}</span></div>
        <div class="storage-meter"><span style="width:${storagePercent}%"></span></div>
        <small>예상 한도 ${formatBytes(storageStatus.quota)} · 데이터는 이 휴대폰의 현재 브라우저 프로필에 저장됩니다.</small>
        ${!storageStatus.persisted ? '<button class="btn btn-secondary btn-block top-gap" data-action="request-persistent">저장 데이터 보호 요청</button>' : ''}
      </div>

      <div class="section-title"><h2>백업과 복구</h2></div>
      <div class="card settings-list">
        <button class="setting-row action-row" data-action="export"><div><strong>암호화되지 않은 백업 내보내기</strong><small>사진을 포함한 전체 JSON 파일 · 마지막 백업 ${formatDateTime(settings.lastBackupAt)}</small></div><span>↓</span></button>
        <label class="setting-row action-row"><div><strong>백업 파일 가져오기</strong><small>가져오기 전 현재 상태를 자동 보관합니다.</small></div><span>↑</span><input id="import-file" type="file" accept="application/json,.json" hidden></label>
        <button class="setting-row action-row" data-action="create-snapshot"><div><strong>휴대폰 내부 복구 지점 만들기</strong><small>최근 ${snapshots.length}개의 복구 지점 보관</small></div><span>＋</span></button>
        ${snapshots.length ? `<button class="setting-row action-row" data-action="restore-latest"><div><strong>최근 복구 지점으로 되돌리기</strong><small>${escapeHtml(snapshots[0].reason)} · ${formatDateTime(snapshots[0].createdAt)}</small></div><span>↶</span></button>` : ''}
      </div>

      <div class="section-title"><h2>앱 설치와 도움말</h2></div>
      <div class="card settings-list">
        <button class="setting-row action-row" data-view-target="onboarding"><div><strong>시작 안내 (도움말)</strong><small>앱의 특징과 오프라인 데이터 안전 수칙 안내</small></div><span>›</span></button>
        <button class="setting-row action-row" data-action="install-app" ${standalone ? 'disabled' : ''}><div><strong>${standalone ? '홈 화면에 설치됨' : '홈 화면에 앱 설치'}</strong><small>${standalone ? '독립 앱 모드로 실행 중입니다.' : '브라우저 메뉴에서도 설치할 수 있습니다.'}</small></div><span>${standalone ? '✓' : '＋'}</span></button>
        <button class="setting-row action-row" data-action="check-update"><div><strong>프로그램 업데이트 확인</strong><small>일기 데이터는 유지하고 앱 코드만 갱신합니다.</small></div><span>↻</span></button>
        <div class="setting-row"><div><strong>앱 버전</strong><small>업데이트 주소는 반드시 같은 도메인과 경로를 유지하세요.</small></div><span>v${APP_VERSION}</span></div>
      </div>

      <button class="btn btn-primary btn-block top-gap" data-action="new-project">새로운 100일 여정 만들기</button>
      ${state.projects.length > 1 ? '<button class="btn btn-danger btn-block top-gap-sm" data-action="delete-project">현재 여정 삭제</button>' : ''}
      <button class="danger-link" data-action="reset">모든 데이터 초기화</button>
    `;
  }

  function renderCompletion() {
    const { project, completedDays } = projectMetrics();
    views.completion.innerHTML = `
      <div class="card completion">
        <div class="seal">🏅</div>
        <p class="eyebrow accent-text">CERTIFICATE OF COMPLETION</p>
        <h1>100일 여정 완주 인증서</h1>
        <p><strong>${escapeHtml(project.title)}</strong></p>
        <p>${completedDays >= 100 ? '100일 동안 자신의 하루를 성실히 기록하여 이 여정을 완주했음을 인증합니다.' : `현재 ${completedDays}일을 기록했습니다. 100일을 채우면 인증서가 완성됩니다.`}</p>
        <p class="certificate-date">${formatKoreanDate(store.today())}</p>
        <strong>CENTUM DIARY</strong>
      </div>
      <button class="btn btn-secondary btn-block top-gap" data-view-target="home">홈으로 돌아가기</button>
    `;
  }

  function renderCreate() {
    views.create.innerHTML = `
      <div class="section-title first"><h2>새로운 100일 여정</h2><button class="text-btn" data-view-target="home">취소</button></div>
      <form id="project-form" class="card form-card">
        <div class="field"><label for="project-title">여정 이름</label><input id="project-title" name="title" required maxlength="80" placeholder="예: 매일 한 줄 감사 일기"></div>
        <div class="field"><label for="project-description">소개</label><textarea id="project-description" name="description" maxlength="500" class="short-textarea" placeholder="이 여정을 시작하는 이유를 적어보세요."></textarea></div>
        <div class="field"><label for="project-start">시작일</label><input id="project-start" name="startDate" type="date" required value="${store.today()}"></div>
        <button class="btn btn-primary btn-block" type="submit">100일 여정 시작하기</button>
      </form>
    `;
  }

  function renderOnboarding() {
    views.onboarding.innerHTML = `
      <div class="section-title first"><h2>시작 안내 (도움말)</h2><button class="text-btn" data-view-target="home">닫기</button></div>
      <div class="card form-card">
        <p class="eyebrow accent-text">CENTUM DIARY GUIDE</p>
        <h3 style="margin-bottom:10px;">오프라인 중심 100일 여정 다이어리</h3>
        <p>Centum Diary는 일기와 사진을 외부 서버로 전송하지 않고 <strong>사용자의 휴대폰 브라우저(IndexedDB)</strong>에만 안전하게 보관하는 독립형 PWA 앱입니다.</p>
      </div>

      <div class="section-title"><h2>핵심 기능 안내</h2></div>
      <div class="card settings-list">
        <div class="setting-row"><div><strong>📱 오프라인 PWA 지원</strong><small>인터넷 연결이 없어도 언제 어디서나 일기를 작성하고 사진을 첨부할 수 있습니다.</small></div></div>
        <div class="setting-row"><div><strong>🔐 PIN 및 화면 보호</strong><small>앱 전환 시 일기 내용을 가리고, 4자리 PIN 잠금으로 화면을 보호합니다.</small></div></div>
        <div class="setting-row"><div><strong>💾 자동 복구 지점</strong><small>일기를 수정하거나 백업을 가져오기 전 최근 7개의 복구 지점이 자동 보관됩니다.</small></div></div>
        <div class="setting-row"><div><strong>🖼️ 로컬 사진 압축 저장</strong><small>첨부한 사진은 최대 1440px JPEG로 압축되어 휴대폰 용량을 아낍니다.</small></div></div>
      </div>

      <div class="section-title"><h2>데이터 안전 수칙</h2></div>
      <div class="card form-card">
        <ul style="margin:0; padding-left:18px; line-height:1.7; color:var(--muted); font-size:0.82rem;">
          <li>브라우저 방문 기록/데이터 전체 삭제 시 저장 데이터가 지워질 수 있습니다.</li>
          <li>[설정] 메뉴의 <strong>[백업 내보내기]</strong>로 월 1회 이상 JSON 백업을 저장해 주세요.</li>
          <li>시크릿(InPrivate) 모드에서는 데이터가 유지되지 않으므로 일반 모드로 사용하세요.</li>
        </ul>
        <button class="btn btn-primary btn-block top-gap" data-view-target="home">다이어리 시작하기</button>
      </div>
    `;
  }

  function navigate(view) {
    if (!views[view]) return;
    currentView = view;
    Object.entries(views).forEach(([name, element]) => element.classList.toggle('active', name === view));
    document.querySelectorAll('.nav-item').forEach((button) => button.classList.toggle('active', button.dataset.view === view));
    document.querySelector('.bottom-nav').classList.toggle('hidden', ['editor', 'create', 'completion'].includes(view));
    document.getElementById('fab-write-btn').classList.toggle('hidden', ['editor', 'create', 'completion', 'onboarding'].includes(view));
    document.querySelector('.view-container').scrollTo({ top: 0, behavior: 'instant' });
    window.scrollTo({ top: 0, behavior: 'instant' });
    if (view === 'editor') renderEditor();
    if (view === 'settings') void refreshSystemInfo();
  }

  function openEditor(date) {
    editorDate = date;
    const draft = store.getDraft(date);
    const entry = store.getProject().entries[date];
    selectedMood = draft?.mood || entry?.mood || 'calm';
    editorPhoto = draft?.photo || entry?.photo || null;
    navigate('editor');
  }

  function closeEditor() {
    const draft = store.getDraft(editorDate);
    if (draft && (draft.title.trim() || draft.content.trim() || draft.photo)) {
      showToast('작성 중인 내용은 자동 저장되었습니다.');
    }
    navigate('calendar');
  }

  async function handleDelegatedClick(event) {
    const viewTarget = event.target.closest('[data-view-target]');
    if (viewTarget) {
      navigate(viewTarget.dataset.viewTarget);
      return;
    }

    const dateTarget = event.target.closest('[data-date]');
    if (dateTarget) {
      openEditor(dateTarget.dataset.date);
      return;
    }

    const moodTarget = event.target.closest('[data-mood]');
    if (moodTarget) {
      selectedMood = moodTarget.dataset.mood;
      document.querySelectorAll('.mood-choice').forEach((item) => item.classList.toggle('active', item.dataset.mood === selectedMood));
      saveEditorDraft();
      return;
    }

    const actionTarget = event.target.closest('[data-action]');
    if (!actionTarget || actionTarget.disabled) return;
    const action = actionTarget.dataset.action;

    if (action === 'write-today') openEditor(store.today());
    if (action === 'new-project') navigate('create');
    if (action === 'close-editor') closeEditor();
    if (action === 'new-prompt') {
      const promptText = prompts[Math.floor(Math.random() * prompts.length)] || '오늘의 이야기를 기록해보세요.';
      const target = document.getElementById('daily-prompt');
      if (target) target.textContent = `“${promptText}”`;
    }
    if (action === 'clear-search') {
      memorySearch = '';
      renderMemories();
      document.getElementById('memory-search')?.focus();
    }
    if (action === 'discard-draft') {
      store.clearDraft(editorDate);
      showToast('임시 저장을 삭제하고 원래 일기로 복원했습니다.');
      renderEditor();
    }
    if (action === 'remove-photo') {
      editorPhoto = null;
      saveEditorDraft();
      renderEditor();
    }
    if (action === 'delete-entry' && confirm('이 기록을 삭제할까요? 삭제 전 자동 복구 지점이 만들어집니다.')) {
      store.deleteEntry(editorDate);
      showToast('기록을 삭제했습니다.');
      navigate('calendar');
    }
    if (action === 'toggle-pin') await togglePin();
    if (action === 'toggle-privacy') {
      store.updateSettings({ privacyOnBackground: !store.getState().settings.privacyOnBackground });
    }
    if (action === 'toggle-reminder') await toggleReminder();
    if (action === 'request-persistent') await requestPersistentStorage();
    if (action === 'export') await exportData();
    if (action === 'create-snapshot') await createSnapshot();
    if (action === 'restore-latest') await restoreLatestSnapshot();
    if (action === 'install-app') await installApp();
    if (action === 'check-update') await checkForUpdate();
    if (action === 'delete-project') await deleteCurrentProject();
    if (action === 'reset') await resetAllData();
  }

  function handleInput(event) {
    if (event.target.id === 'memory-search') {
      memorySearch = event.target.value;
      renderMemories();
      const input = document.getElementById('memory-search');
      input?.focus();
      input?.setSelectionRange(memorySearch.length, memorySearch.length);
    }
    if (['entry-title', 'entry-content', 'entry-tags'].includes(event.target.id)) {
      if (event.target.id === 'entry-content') {
        const counter = document.getElementById('content-count');
        if (counter) counter.textContent = `${event.target.value.length.toLocaleString()}자`;
      }
      saveEditorDraft();
    }
  }

  async function handleChange(event) {
    if (event.target.id === 'project-select') {
      store.setActiveProject(event.target.value);
      navigate('home');
    }
    if (event.target.id === 'theme-select') store.updateSettings({ theme: event.target.value });
    if (event.target.id === 'reminder-time') {
      store.updateSettings({ reminderTime: event.target.value || '21:00' });
      checkInAppReminder();
    }
    if (event.target.id === 'import-file') await importFile(event);
    if (event.target.id === 'entry-photo-input') await addPhoto(event);
  }

  async function handleSubmit(event) {
    if (event.target.id === 'entry-form') {
      event.preventDefault();
      const data = new FormData(event.target);
      const tags = String(data.get('tags') || '').split(',').map((tag) => tag.trim().replace(/^#/, '')).filter(Boolean).slice(0, 10);
      store.saveEntry(data.get('date'), {
        title: data.get('title'),
        content: data.get('content'),
        mood: selectedMood,
        tags,
        photo: editorPhoto
      });
      await store.flush();
      showToast('오늘의 기록을 휴대폰에 저장했습니다.');
      navigate('home');
    }
    if (event.target.id === 'project-form') {
      event.preventDefault();
      const data = new FormData(event.target);
      store.createProject({ title: data.get('title'), description: data.get('description'), startDate: data.get('startDate') });
      showToast('새로운 여정을 만들었습니다.');
      navigate('home');
    }
    if (event.target.id === 'project-settings-form') {
      event.preventDefault();
      const data = new FormData(event.target);
      store.updateProject({ title: data.get('title'), description: data.get('description'), startDate: data.get('startDate') });
      showToast('여정 정보를 저장했습니다.');
    }
  }

  function bindEditorAutosave() {
    const form = document.getElementById('entry-form');
    if (!form) return;
    const status = document.getElementById('autosave-status');
    if (status) status.textContent = store.getDraft(editorDate) ? '임시 내용 복구됨' : '자동 저장 준비됨';
  }

  function saveEditorDraft() {
    const title = document.getElementById('entry-title');
    const content = document.getElementById('entry-content');
    const tagsInput = document.getElementById('entry-tags');
    if (!title || !content || !tagsInput) return;
    const tags = tagsInput.value.split(',').map((tag) => tag.trim().replace(/^#/, '')).filter(Boolean).slice(0, 10);
    store.saveDraft(editorDate, { title: title.value, content: content.value, mood: selectedMood, tags, photo: editorPhoto });
    const status = document.getElementById('autosave-status');
    if (status) {
      status.textContent = '휴대폰에 임시 저장됨';
      clearTimeout(saveEditorDraft.timer);
      saveEditorDraft.timer = setTimeout(() => {
        if (status.isConnected) status.textContent = '자동 저장됨';
      }, 1000);
    }
  }

  async function addPhoto(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('이미지 파일만 선택할 수 있습니다.');
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      alert('사진 원본은 25MB 이하만 사용할 수 있습니다.');
      return;
    }
    showToast('사진을 휴대폰 저장용으로 압축하고 있습니다…', 3000);
    try {
      editorPhoto = await compressImage(file, 1440, 0.8);
      saveEditorDraft();
      renderEditor();
      showToast('사진을 압축해 임시 저장했습니다.');
    } catch (error) {
      console.error(error);
      alert('이 사진 형식을 읽지 못했습니다. JPG 또는 PNG 사진을 사용해 주세요.');
    } finally {
      event.target.value = '';
    }
  }

  async function compressImage(file, maxDimension, quality) {
    let source;
    let width;
    let height;
    let close = () => {};

    if ('createImageBitmap' in window) {
      try {
        source = await createImageBitmap(file, { imageOrientation: 'from-image' });
      } catch (error) {
        source = await createImageBitmap(file);
      }
      width = source.width;
      height = source.height;
      close = () => source.close();
    } else {
      source = await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = URL.createObjectURL(file);
      });
      width = source.naturalWidth;
      height = source.naturalHeight;
    }

    const scale = Math.min(1, maxDimension / Math.max(width, height));
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const context = canvas.getContext('2d', { alpha: false });
    context.drawImage(source, 0, 0, targetWidth, targetHeight);
    close();

    return {
      dataUrl: canvas.toDataURL('image/jpeg', quality),
      name: file.name.replace(/\.[^.]+$/, '') + '.jpg',
      type: 'image/jpeg',
      width: targetWidth,
      height: targetHeight
    };
  }

  async function togglePin() {
    const settings = store.getState().settings;
    if (settings.pinEnabled) {
      const entered = window.prompt('PIN 잠금을 끄려면 현재 4자리 PIN을 입력하세요.');
      if (!entered) return;
      if (!(await store.verifyPin(entered))) {
        alert('PIN이 올바르지 않습니다.');
        return;
      }
      store.disablePin();
      showToast('PIN 잠금을 껐습니다.');
      return;
    }

    const first = window.prompt('사용할 4자리 PIN을 입력하세요.');
    if (!first) return;
    if (!/^\d{4}$/.test(first)) {
      alert('PIN은 숫자 4자리여야 합니다.');
      return;
    }
    const second = window.prompt('같은 PIN을 한 번 더 입력하세요.');
    if (first !== second) {
      alert('두 PIN이 일치하지 않습니다.');
      return;
    }
    await store.setPin(first);
    showToast('PIN을 암호화해 저장했습니다.');
  }

  async function toggleReminder() {
    const enabled = !store.getState().settings.reminderEnabled;
    if (enabled && 'Notification' in window && Notification.permission === 'default') {
      try { await Notification.requestPermission(); } catch (error) { /* ignored */ }
    }
    store.updateSettings({ reminderEnabled: enabled });
    showToast(enabled ? '앱 실행 시 기록 알림을 켰습니다.' : '기록 알림을 껐습니다.');
  }

  function checkInAppReminder() {
    const { settings } = store.getState();
    if (!settings.reminderEnabled || store.getProject().entries[store.today()]) return;
    const [hour, minute] = String(settings.reminderTime || '21:00').split(':').map(Number);
    const now = new Date();
    const target = new Date();
    target.setHours(hour, minute, 0, 0);
    const key = `centum-reminded-${store.today()}`;
    if (now >= target && sessionStorage.getItem(key) !== '1') {
      sessionStorage.setItem(key, '1');
      showToast('오늘의 기록이 아직 없어요. 잠시 마음을 남겨보세요.', 4500);
      if ('Notification' in window && Notification.permission === 'granted') {
        try { new Notification('100일 여정 다이어리', { body: '오늘의 기록이 아직 없어요.', icon: 'assets/icon-192.png' }); } catch (error) { /* ignored */ }
      }
    }
  }

  async function requestPersistentStorage() {
    const allowed = await store.requestPersistentStorage();
    await refreshSystemInfo();
    showToast(allowed ? '브라우저가 저장 데이터 보호를 허용했습니다.' : '보호 요청이 허용되지 않았습니다. 정기 백업을 권장합니다.', 3500);
  }

  async function exportData() {
    await store.flush();
    const blob = new Blob([store.exportData()], { type: 'application/json' });
    const file = new File([blob], `centum-diary-backup-${store.today()}.json`, { type: 'application/json' });
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: 'Centum Diary 백업', text: '100일 다이어리 백업 파일', files: [file] });
      } else {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = file.name;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      store.markBackupComplete();
      showToast('백업 파일을 만들었습니다. 안전한 곳에 보관하세요.');
    } catch (error) {
      if (error?.name !== 'AbortError') alert('백업 파일을 만들지 못했습니다. 다시 시도해 주세요.');
    }
  }

  async function importFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 60 * 1024 * 1024) {
      alert('백업 파일은 60MB 이하만 가져올 수 있습니다.');
      event.target.value = '';
      return;
    }
    if (!confirm('선택한 백업으로 현재 데이터를 교체할까요? 현재 상태는 내부 복구 지점으로 먼저 저장됩니다.')) {
      event.target.value = '';
      return;
    }
    try {
      await store.importData(await file.text());
      await refreshSystemInfo();
      showToast('백업 데이터를 복원했습니다.');
      navigate('home');
    } catch (error) {
      console.error(error);
      alert('올바른 Centum Diary 백업 파일이 아닙니다.');
    } finally {
      event.target.value = '';
    }
  }

  async function createSnapshot() {
    await store.createSnapshot('사용자가 만든 복구 지점');
    await refreshSystemInfo();
    showToast('휴대폰 내부에 복구 지점을 만들었습니다.');
  }

  async function restoreLatestSnapshot() {
    if (!snapshots.length) return;
    if (!confirm(`${formatDateTime(snapshots[0].createdAt)} 상태로 되돌릴까요? 현재 상태는 먼저 별도 복구 지점으로 저장됩니다.`)) return;
    await store.createSnapshot('복구 실행 전 상태');
    await store.restoreSnapshot(snapshots[0].id);
    await refreshSystemInfo();
    showToast('최근 복구 지점으로 되돌렸습니다.');
    navigate('home');
  }

  async function deleteCurrentProject() {
    const project = store.getProject();
    if (!confirm(`“${project.title}” 여정과 모든 기록을 삭제할까요? 삭제 전 복구 지점이 만들어집니다.`)) return;
    await store.createSnapshot('여정 삭제 전 상태');
    try {
      store.deleteProject(project.id);
      showToast('여정을 삭제했습니다.');
      navigate('home');
    } catch (error) {
      alert(error.message);
    }
  }

  async function resetAllData() {
    const confirmation = window.prompt('모든 기록을 초기화하려면 “초기화”라고 입력하세요. 초기화 전 복구 지점은 남겨둡니다.');
    if (confirmation !== '초기화') return;
    await store.reset();
    await refreshSystemInfo();
    showToast('모든 데이터를 초기화했습니다.');
    navigate('home');
  }

  async function refreshSystemInfo() {
    try {
      [storageStatus, snapshots] = await Promise.all([store.storageInfo(), store.listSnapshots()]);
      if (currentView === 'settings') renderSettings();
    } catch (error) {
      console.warn('시스템 정보를 갱신하지 못했습니다.', error);
    }
  }

  function applyTheme() {
    document.documentElement.dataset.theme = store.getState().settings.theme || 'forest';
  }

  function updateNetworkStatus() {
    const element = document.getElementById('network-status');
    if (!element) return;
    element.textContent = navigator.onLine ? '온라인' : '오프라인';
    element.classList.toggle('offline', !navigator.onLine);
  }

  function setupPinPad() {
    document.querySelectorAll('.pin-key').forEach((key) => {
      key.addEventListener('click', async () => {
        if (isVerifyingPin) return;
        const value = key.dataset.key || key.textContent.trim();
        if (/^\d$/.test(value) && pinBuffer.length < 4) pinBuffer += value;
        if (value === 'clear') pinBuffer = '';
        if (value === 'confirm') await verifyPin();
        updatePinDots();
        if (pinBuffer.length === 4 && /^\d$/.test(value)) setTimeout(() => void verifyPin(), 120);
      });
    });
  }

  function openPinLock() {
    pinBuffer = '';
    appLocked = true;
    updatePinDots();
    document.getElementById('pin-lock-modal').classList.add('open');
    document.body.classList.remove('privacy-cover');
  }

  function updatePinDots() {
    document.querySelectorAll('.pin-dot').forEach((dot, index) => dot.classList.toggle('filled', index < pinBuffer.length));
  }

  async function verifyPin() {
    if (isVerifyingPin) return;
    isVerifyingPin = true;
    try {
      if (await store.verifyPin(pinBuffer)) {
        document.getElementById('pin-lock-modal').classList.remove('open');
        pinBuffer = '';
        appLocked = false;
      } else if (pinBuffer.length === 4) {
        pinBuffer = '';
        updatePinDots();
        showToast('PIN이 올바르지 않습니다.');
      }
    } finally {
      isVerifyingPin = false;
    }
  }

  function handleVisibilityChange() {
    const settings = store.getState().settings;
    if (document.hidden) {
      lastHiddenAt = Date.now();
      if (settings.privacyOnBackground) document.body.classList.add('privacy-cover');
      void store.flush();
      return;
    }
    document.body.classList.remove('privacy-cover');
    if (settings.pinEnabled && !appLocked && Date.now() - lastHiddenAt > 15000) openPinLock();
    checkInAppReminder();
    void checkForUpdate(false);
  }

  function setupPwa() {
    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      installPrompt = event;
      if (currentView === 'settings') renderSettings();
    });
    window.addEventListener('appinstalled', () => {
      installPrompt = null;
      showToast('홈 화면에 앱을 설치했습니다.');
    });

    if (!('serviceWorker' in navigator)) return;
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      location.reload();
    });

    const registerServiceWorker = async () => {
      try {
        const registration = await navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' });
        if (registration.waiting) showUpdateBanner(registration.waiting);
        registration.addEventListener('updatefound', () => {
          const worker = registration.installing;
          worker?.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) showUpdateBanner(worker);
          });
        });
        setInterval(() => registration.update().catch(() => {}), 60 * 60 * 1000);
      } catch (error) {
        console.warn('서비스 워커 등록 실패:', error);
      }
    };

    if (document.readyState === 'complete') void registerServiceWorker();
    else window.addEventListener('load', () => void registerServiceWorker(), { once: true });
  }

  function showUpdateBanner(worker) {
    waitingWorker = worker;
    document.getElementById('update-banner')?.classList.add('show');
  }

  function hideUpdateBanner() {
    document.getElementById('update-banner')?.classList.remove('show');
  }

  function applyUpdate() {
    if (!waitingWorker) return;
    waitingWorker.postMessage({ type: 'SKIP_WAITING' });
  }

  async function checkForUpdate(showResult = true) {
    if (!('serviceWorker' in navigator)) {
      if (showResult) showToast('이 브라우저는 앱 업데이트 기능을 지원하지 않습니다.');
      return;
    }
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration) {
        if (showResult) showToast('앱 설치 정보를 찾지 못했습니다. 페이지를 다시 열어주세요.');
        return;
      }
      await registration.update();
      if (registration.waiting) showUpdateBanner(registration.waiting);
      else if (showResult) showToast('현재 최신 버전입니다.');
    } catch (error) {
      if (showResult) showToast(navigator.onLine ? '업데이트 확인에 실패했습니다.' : '오프라인에서는 업데이트를 확인할 수 없습니다.');
    }
  }

  async function installApp() {
    if (installPrompt) {
      installPrompt.prompt();
      await installPrompt.userChoice;
      installPrompt = null;
      return;
    }
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    alert(isIos
      ? 'Safari 하단의 공유 버튼을 누른 뒤 “홈 화면에 추가”를 선택하세요.'
      : '브라우저 메뉴에서 “앱 설치” 또는 “홈 화면에 추가”를 선택하세요.');
  }

  function showToast(message, duration = 2200) {
    let toast = document.querySelector('.toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'toast';
      toast.setAttribute('role', 'status');
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove('show'), duration);
  }

  document.addEventListener('DOMContentLoaded', () => {
    init().catch((error) => {
      console.error(error);
      document.body.innerHTML = '<main class="fatal-error"><h1>앱을 시작하지 못했습니다.</h1><p>브라우저를 완전히 닫았다가 다시 열어주세요.</p></main>';
    });
  });
})();
