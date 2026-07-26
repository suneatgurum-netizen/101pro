(function () {
  'use strict';

  const APP_VERSION = window.CENTUM_VERSION || '3.0.3';
  const DB_NAME = 'centum-diary-db';
  const DB_VERSION = 1;
  const STATE_STORE = 'state';
  const SNAPSHOT_STORE = 'snapshots';
  const STATE_KEY = 'main';
  const FALLBACK_KEY = 'centumDiaryStateV3Fallback';
  const LEGACY_KEYS = ['centumDiaryStateV2', 'centumDiaryState'];
  const MAX_SNAPSHOTS = 7;

  let db = null;
  let state = null;
  let storageMode = 'memory';
  let saveTimer = null;
  let saveChain = Promise.resolve();

  const formatDate = (date = new Date()) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const addDays = (dateString, amount) => {
    const date = new Date(`${dateString}T00:00:00`);
    date.setDate(date.getDate() + amount);
    return formatDate(date);
  };

  function defaultState() {
    const today = formatDate();
    return {
      version: 3,
      appVersion: APP_VERSION,
      activeProjectId: 'project-1',
      settings: {
        displayName: '나의 100일 여정',
        pinEnabled: false,
        pinHash: null,
        pinSalt: null,
        pin: null,
        reminderEnabled: false,
        reminderTime: '21:00',
        theme: 'forest',
        lastBackupAt: null,
        lastSnapshotDate: null,
        privacyOnBackground: true
      },
      projects: [
        {
          id: 'project-1',
          title: '나의 100일 여정',
          description: '하루 한 편, 나를 위한 기록',
          startDate: today,
          createdAt: new Date().toISOString(),
          goals: [
            { id: 'goal-1', name: '러닝', target: 600, unit: 'KM' },
            { id: 'goal-2', name: '독서', target: 30, unit: '권' },
            { id: 'goal-3', name: '소설 쓰기', target: 600, unit: 'PAGE' },
            { id: 'goal-4', name: '체중 감량', target: 10, unit: 'kg' }
          ],
          entries: {}
        }
      ],
      drafts: {}
    };
  }

  function clone(value) {
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function normalizeGoal(goal, index) {
    const safe = goal && typeof goal === 'object' ? goal : {};
    return {
      id: String(safe.id || `goal-${index + 1}`),
      name: String(safe.name || '').trim().slice(0, 40),
      target: Math.max(0, Number(safe.target || 0)),
      unit: String(safe.unit || '').trim().slice(0, 10)
    };
  }

  function normalizeEntry(entry) {
    const safe = entry && typeof entry === 'object' ? entry : {};
    const rawGoals = safe.goals && typeof safe.goals === 'object' ? safe.goals : {};
    const goals = {};
    Object.entries(rawGoals).forEach(([gId, val]) => {
      const num = Number(val);
      if (!isNaN(num) && num >= 0) goals[gId] = num;
    });

    let photos = [];
    if (Array.isArray(safe.photos)) {
      photos = safe.photos
        .map((p) => (p && typeof p === 'object' && typeof p.dataUrl === 'string' ? {
          dataUrl: p.dataUrl,
          name: String(p.name || 'photo.jpg'),
          type: String(p.type || 'image/jpeg'),
          width: Number(p.width || 0),
          height: Number(p.height || 0)
        } : null))
        .filter(Boolean)
        .slice(0, 6);
    } else if (safe.photo && typeof safe.photo === 'object' && typeof safe.photo.dataUrl === 'string') {
      photos = [{
        dataUrl: safe.photo.dataUrl,
        name: String(safe.photo.name || 'photo.jpg'),
        type: String(safe.photo.type || 'image/jpeg'),
        width: Number(safe.photo.width || 0),
        height: Number(safe.photo.height || 0)
      }];
    }

    return {
      title: String(safe.title || '').slice(0, 120),
      content: String(safe.content || ''),
      mood: ['happy', 'good', 'calm', 'tired', 'sad'].includes(safe.mood) ? safe.mood : 'calm',
      tags: Array.isArray(safe.tags)
        ? safe.tags.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 10)
        : [],
      goals,
      photo: photos[0] || null,
      photos,
      createdAt: safe.createdAt || safe.updatedAt || new Date().toISOString(),
      updatedAt: safe.updatedAt || new Date().toISOString()
    };
  }

  function normalize(input) {
    const base = defaultState();
    const source = input && typeof input === 'object' ? clone(input) : base;
    const settings = { ...base.settings, ...(source.settings || {}) };

    const projects = Array.isArray(source.projects) && source.projects.length
      ? source.projects.map((project, index) => {
          const entries = {};
          Object.entries(project.entries && typeof project.entries === 'object' ? project.entries : {}).forEach(([date, entry]) => {
            if (/^\d{4}-\d{2}-\d{2}$/.test(date)) entries[date] = normalizeEntry(entry);
          });
          const rawGoals = Array.isArray(project.goals) ? project.goals : null;
          const goals = rawGoals
            ? rawGoals.map(normalizeGoal).filter((g) => g.name).slice(0, 6)
            : [
                { id: 'goal-1', name: '러닝', target: 600, unit: 'KM' },
                { id: 'goal-2', name: '독서', target: 30, unit: '권' },
                { id: 'goal-3', name: '소설 쓰기', target: 600, unit: 'PAGE' },
                { id: 'goal-4', name: '체중 감량', target: 10, unit: 'kg' }
              ];
          return {
            id: String(project.id || `project-${index + 1}`),
            title: String(project.title || '나의 100일 여정').slice(0, 80),
            description: String(project.description || '').slice(0, 500),
            startDate: /^\d{4}-\d{2}-\d{2}$/.test(project.startDate || '') ? project.startDate : formatDate(),
            createdAt: project.createdAt || new Date().toISOString(),
            goals,
            entries
          };
        })
      : base.projects;

    const activeProjectId = projects.some((project) => project.id === source.activeProjectId)
      ? source.activeProjectId
      : projects[0].id;

    const drafts = source.drafts && typeof source.drafts === 'object' ? source.drafts : {};

    return {
      version: 3,
      appVersion: APP_VERSION,
      activeProjectId,
      settings,
      projects,
      drafts
    };
  }

  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) return reject(new Error('IndexedDB unavailable'));
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STATE_STORE)) database.createObjectStore(STATE_STORE);
        if (!database.objectStoreNames.contains(SNAPSHOT_STORE)) {
          const snapshots = database.createObjectStore(SNAPSHOT_STORE, { keyPath: 'id' });
          snapshots.createIndex('createdAt', 'createdAt');
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB open failed'));
      request.onblocked = () => reject(new Error('IndexedDB upgrade blocked'));
    });
  }

  function idbGet(storeName, key) {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readonly');
      const request = transaction.objectStore(storeName).get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function idbPut(storeName, value, key) {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const objectStore = transaction.objectStore(storeName);
      const request = key === undefined ? objectStore.put(value) : objectStore.put(value, key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      transaction.onerror = () => reject(transaction.error);
    });
  }

  function idbDelete(storeName, key) {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const request = transaction.objectStore(storeName).delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  function idbGetAll(storeName) {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readonly');
      const request = transaction.objectStore(storeName).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  function readFallback() {
    for (const key of [FALLBACK_KEY, ...LEGACY_KEYS]) {
      try {
        const raw = localStorage.getItem(key);
        if (raw) return { key, value: JSON.parse(raw) };
      } catch (error) {
        console.warn('로컬 저장 데이터를 읽지 못했습니다.', error);
      }
    }
    return null;
  }

  async function initialize() {
    let loaded = null;
    let migratedKey = null;

    try {
      db = await openDatabase();
      loaded = await idbGet(STATE_STORE, STATE_KEY);
      storageMode = 'indexeddb';
    } catch (error) {
      console.warn('IndexedDB를 사용할 수 없어 대체 저장소를 사용합니다.', error);
      storageMode = 'localstorage';
    }

    if (!loaded) {
      const fallback = readFallback();
      if (fallback) {
        loaded = fallback.value;
        migratedKey = fallback.key;
      }
    }

    state = normalize(loaded || defaultState());
    await persistNow();

    if (migratedKey && storageMode === 'indexeddb') {
      try {
        LEGACY_KEYS.forEach((key) => localStorage.removeItem(key));
        localStorage.removeItem(FALLBACK_KEY);
      } catch (error) {
        console.warn('이전 저장 데이터 정리에 실패했습니다.', error);
      }
    }

    window.dispatchEvent(new CustomEvent('centum:ready', { detail: { storageMode } }));
    return state;
  }

  const ready = initialize();

  function emitChange(reason = 'update') {
    window.dispatchEvent(new CustomEvent('centum:statechange', { detail: { state, reason } }));
  }

  async function persistNow() {
    clearTimeout(saveTimer);
    const snapshot = clone(state);
    saveChain = saveChain.catch(() => {}).then(async () => {
      if (storageMode === 'indexeddb' && db) {
        try {
          await idbPut(STATE_STORE, snapshot, STATE_KEY);
          return;
        } catch (error) {
          console.error('IndexedDB 저장 실패, 대체 저장소로 전환합니다.', error);
          storageMode = 'localstorage';
          window.dispatchEvent(new CustomEvent('centum:storageerror', { detail: error }));
        }
      }
      try {
        localStorage.setItem(FALLBACK_KEY, JSON.stringify(snapshot));
      } catch (error) {
        console.error('로컬 저장소 저장에 실패했습니다.', error);
        window.dispatchEvent(new CustomEvent('centum:storageerror', { detail: error }));
        throw error;
      }
    });
    return saveChain;
  }

  function schedulePersist({ emit = true, reason = 'update', delay = 120 } = {}) {
    if (emit) emitChange(reason);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => persistNow().catch(() => {}), delay);
  }

  function activeProject() {
    return state.projects.find((project) => project.id === state.activeProjectId) || state.projects[0];
  }

  function dayNumber(dateString, project = activeProject()) {
    const start = new Date(`${project.startDate}T00:00:00`);
    const target = new Date(`${dateString}T00:00:00`);
    return Math.floor((target - start) / 86400000) + 1;
  }

  function dateForDay(day, project = activeProject()) {
    return addDays(project.startDate, day - 1);
  }

  async function sha256(text) {
    if (!crypto?.subtle) {
      const bytes = new TextEncoder().encode(text);
      let bin = '';
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      return btoa(bin);
    }
    const encoded = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest('SHA-256', encoded);
    return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  function randomSalt() {
    if (crypto?.getRandomValues) {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('');
    }
    return `${Date.now()}-${Math.random()}`;
  }

  async function writeSnapshot(snapshotState, reason) {
    const record = {
      id: `snapshot-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      createdAt: new Date().toISOString(),
      reason,
      state: clone(snapshotState)
    };

    if (storageMode === 'indexeddb' && db) {
      await idbPut(SNAPSHOT_STORE, record);
      const all = (await idbGetAll(SNAPSHOT_STORE)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      await Promise.all(all.slice(MAX_SNAPSHOTS).map((item) => idbDelete(SNAPSHOT_STORE, item.id)));
    } else {
      const current = JSON.parse(localStorage.getItem(`${FALLBACK_KEY}:snapshots`) || '[]');
      current.unshift(record);
      localStorage.setItem(`${FALLBACK_KEY}:snapshots`, JSON.stringify(current.slice(0, MAX_SNAPSHOTS)));
    }
    return { id: record.id, createdAt: record.createdAt, reason: record.reason };
  }

  async function createSnapshot(reason = '수동 복구 지점') {
    await ready;
    return writeSnapshot(state, reason);
  }

  async function maybeCreateDailySnapshot() {
    const today = formatDate();
    if (state.settings.lastSnapshotDate === today) return;
    const snapshotState = clone(state);
    state.settings.lastSnapshotDate = today;
    schedulePersist({ reason: 'snapshot-marker' });
    try {
      await writeSnapshot(snapshotState, '오늘의 자동 복구 지점');
    } catch (error) {
      console.warn('자동 복구 지점 생성에 실패했습니다.', error);
    }
  }

  async function listSnapshots() {
    await ready;
    let records = [];
    if (storageMode === 'indexeddb' && db) {
      records = await idbGetAll(SNAPSHOT_STORE);
    } else {
      try {
        records = JSON.parse(localStorage.getItem(`${FALLBACK_KEY}:snapshots`) || '[]');
      } catch (error) {
        records = [];
      }
    }
    return records
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(({ id, createdAt, reason }) => ({ id, createdAt, reason }));
  }

  async function restoreSnapshot(id) {
    await ready;
    let record = null;
    if (storageMode === 'indexeddb' && db) record = await idbGet(SNAPSHOT_STORE, id);
    else {
      const records = JSON.parse(localStorage.getItem(`${FALLBACK_KEY}:snapshots`) || '[]');
      record = records.find((item) => item.id === id);
    }
    if (!record?.state) throw new Error('복구 지점을 찾을 수 없습니다.');
    state = normalize(record.state);
    await persistNow();
    emitChange('snapshot-restored');
  }

  async function storageInfo() {
    const result = { mode: storageMode, persisted: false, usage: 0, quota: 0 };
    try {
      if (navigator.storage?.persisted) result.persisted = await navigator.storage.persisted();
      if (navigator.storage?.estimate) {
        const estimate = await navigator.storage.estimate();
        result.usage = Number(estimate.usage || 0);
        result.quota = Number(estimate.quota || 0);
      }
    } catch (error) {
      console.warn('저장 공간 정보를 확인하지 못했습니다.', error);
    }
    return result;
  }

  async function requestPersistentStorage() {
    if (!navigator.storage?.persist) return false;
    try {
      return await navigator.storage.persist();
    } catch (error) {
      return false;
    }
  }

  window.CentumStore = {
    ready,
    getState: () => state,
    getProject: activeProject,
    getStorageMode: () => storageMode,
    today: formatDate,
    dateForDay,
    dayNumber,
    async flush() {
      await ready;
      return persistNow();
    },
    setActiveProject(id) {
      if (state.projects.some((project) => project.id === id)) {
        state.activeProjectId = id;
        schedulePersist({ reason: 'active-project' });
      }
    },
    createProject({ title, description, startDate }) {
      const project = {
        id: `project-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        title: String(title || '').trim().slice(0, 80) || '새로운 100일 여정',
        description: String(description || '').trim().slice(0, 500),
        startDate: startDate || formatDate(),
        createdAt: new Date().toISOString(),
        entries: {}
      };
      state.projects.push(project);
      state.activeProjectId = project.id;
      schedulePersist({ reason: 'project-created' });
      return project;
    },
    updateProject(patch) {
      const project = activeProject();
      if (patch.title !== undefined) project.title = String(patch.title).trim().slice(0, 80) || project.title;
      if (patch.description !== undefined) project.description = String(patch.description).trim().slice(0, 500);
      if (patch.startDate && /^\d{4}-\d{2}-\d{2}$/.test(patch.startDate)) project.startDate = patch.startDate;
      schedulePersist({ reason: 'project-updated' });
    },
    updateProjectGoals(newGoals) {
      const project = activeProject();
      const sanitized = (Array.isArray(newGoals) ? newGoals : [])
        .map(normalizeGoal)
        .filter((g) => g.name)
        .slice(0, 6);
      project.goals = sanitized;
      schedulePersist({ reason: 'goals-updated' });
      return project.goals;
    },
    deleteProject(id) {
      if (state.projects.length <= 1) throw new Error('최소 한 개의 여정은 필요합니다.');
      const index = state.projects.findIndex((project) => project.id === id);
      if (index < 0) return;
      state.projects.splice(index, 1);
      Object.keys(state.drafts).filter((key) => key.startsWith(`${id}:`)).forEach((key) => delete state.drafts[key]);
      if (state.activeProjectId === id) state.activeProjectId = state.projects[0].id;
      schedulePersist({ reason: 'project-deleted' });
    },
    saveEntry(date, entry) {
      void maybeCreateDailySnapshot();
      const project = activeProject();
      const existing = project.entries[date] || {};
      project.entries[date] = normalizeEntry({
        ...existing,
        ...entry,
        createdAt: existing.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      delete state.drafts[`${project.id}:${date}`];
      schedulePersist({ reason: 'entry-saved' });
      return project.entries[date];
    },
    deleteEntry(date) {
      void maybeCreateDailySnapshot();
      const project = activeProject();
      delete project.entries[date];
      delete state.drafts[`${project.id}:${date}`];
      schedulePersist({ reason: 'entry-deleted' });
    },
    saveDraft(date, draft) {
      const key = `${activeProject().id}:${date}`;
      const photos = Array.isArray(draft.photos) ? draft.photos.slice(0, 6) : (draft.photo ? [draft.photo] : []);
      state.drafts[key] = {
        title: String(draft.title || ''),
        content: String(draft.content || ''),
        mood: draft.mood || 'calm',
        tags: Array.isArray(draft.tags) ? draft.tags : [],
        goals: draft.goals && typeof draft.goals === 'object' ? draft.goals : {},
        photo: photos[0] || null,
        photos,
        updatedAt: new Date().toISOString()
      };
      schedulePersist({ emit: false, reason: 'draft', delay: 350 });
    },
    getDraft(date) {
      return state.drafts[`${activeProject().id}:${date}`] || null;
    },
    clearDraft(date) {
      delete state.drafts[`${activeProject().id}:${date}`];
      schedulePersist({ emit: false, reason: 'draft-cleared' });
    },
    updateSettings(patch) {
      state.settings = { ...state.settings, ...patch };
      schedulePersist({ reason: 'settings-updated' });
    },
    async setPin(pin) {
      if (!/^\d{4}$/.test(pin)) throw new Error('PIN은 숫자 4자리여야 합니다.');
      const salt = randomSalt();
      state.settings.pinSalt = salt;
      state.settings.pinHash = await sha256(`${salt}:${pin}`);
      state.settings.pin = null;
      state.settings.pinEnabled = true;
      schedulePersist({ reason: 'pin-updated' });
    },
    async verifyPin(pin) {
      if (!state.settings.pinEnabled) return true;
      if (state.settings.pinHash && state.settings.pinSalt) {
        return (await sha256(`${state.settings.pinSalt}:${pin}`)) === state.settings.pinHash;
      }
      if (state.settings.pin && pin === state.settings.pin) {
        await this.setPin(pin);
        return true;
      }
      return false;
    },
    disablePin() {
      state.settings.pinEnabled = false;
      schedulePersist({ reason: 'pin-disabled' });
    },
    exportData() {
      return JSON.stringify({
        format: 'centum-diary-backup',
        backupVersion: 1,
        appVersion: APP_VERSION,
        exportedAt: new Date().toISOString(),
        state
      }, null, 2);
    },
    async importData(raw) {
      await ready;
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      const importedState = parsed?.format === 'centum-diary-backup' ? parsed.state : parsed;
      if (!importedState || !Array.isArray(importedState.projects)) throw new Error('지원하지 않는 백업 형식입니다.');
      await createSnapshot('가져오기 전 자동 복구 지점');
      state = normalize(importedState);
      state.settings.lastBackupAt = new Date().toISOString();
      await persistNow();
      emitChange('data-imported');
    },
    async reset() {
      await createSnapshot('초기화 전 자동 복구 지점');
      state = defaultState();
      await persistNow();
      emitChange('reset');
    },
    createSnapshot,
    listSnapshots,
    restoreSnapshot,
    storageInfo,
    requestPersistentStorage,
    markBackupComplete() {
      state.settings.lastBackupAt = new Date().toISOString();
      schedulePersist({ reason: 'backup-complete' });
    }
  };

  window.addEventListener('pagehide', () => {
    void persistNow();
  });
})();
