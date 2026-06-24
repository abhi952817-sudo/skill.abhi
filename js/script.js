// skill.abhi - SPA with hardcoded Firebase config and category support
// Categories: biology | physics | chemistry
// Firebase is initialized with the provided config; if initialization fails the app falls back to localStorage.

(function () {
  // ---------- Config ----------
  const CATEGORIES = {
    biology: 'Biology Study Materials',
    physics: 'Physics Simplified Formulas',
    chemistry: 'Chemistry Problem Methods'
  };

  // Hardcoded Firebase config (as requested)
  const firebaseConfig = {
    apiKey: "AIzaSyDZANU-V7IIyvCGbZc3SmcHIQdNHuJOiHw",
    authDomain: "skill-abhi.firebaseapp.com",
    projectId: "skill-abhi",
    storageBucket: "skill-abhi.firebasestorage.app",
    messagingSenderId: "961890678182",
    appId: "1:961890678182:web:4a44fc13dff8ea7da68b67",
    measurementId: "G-EYKGKW6PQD"
    // Add databaseURL if your Realtime DB requires it, e.g.
    // databaseURL: "https://your-db-name.firebaseio.com"
  };

  // ---------- Utilities ----------
  const qs = (s, el = document) => el.querySelector(s);
  const qsa = (s, el = document) => Array.from(el.querySelectorAll(s));
  const el = id => document.getElementById(id);
  const now = () => Date.now();

  function uid(prefix = 'id') {
    return prefix + '_' + Math.random().toString(36).slice(2, 9) + '_' + Date.now();
  }

  function formatDate(ts) {
    try {
      const d = new Date(ts);
      return d.toLocaleString();
    } catch {
      return '';
    }
  }

  function extractYouTubeID(url) {
    if (!url) return null;
    const re = /(?:youtube\.com\/(?:watch\?.*v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/;
    const m = url.match(re);
    return m ? m[1] : null;
  }

  // ---------- Storage Adapter ----------
  const LOCAL_KEY = 'skillabhi_local_data_v1';
  const ADMIN_PW_KEY = 'skillabhi_admin_password_v1';
  const DEFAULT_ADMIN_PASSWORD = 'skillabhi_admin';

  const defaultData = { notices: {}, videos: {}, pdfs: {} };

  let firebaseReady = false;
  let firebaseRootRef = null;

  // callbacks for realtime update notifications (per-collection)
  const listeners = { notices: [], videos: [], pdfs: [] };

  function emit(collection, items) {
    listeners[collection].forEach(cb => {
      try { cb(items); } catch (e) { console.error(e); }
    });
  }

  // Local Storage helpers
  function readLocal() {
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      if (!raw) return JSON.parse(JSON.stringify(defaultData));
      const data = JSON.parse(raw);
      return Object.assign(JSON.parse(JSON.stringify(defaultData)), data);
    } catch (e) {
      console.warn('readLocal error', e);
      return JSON.parse(JSON.stringify(defaultData));
    }
  }
  function writeLocal(obj) {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(obj));
    emit('notices', obj.notices);
    emit('videos', obj.videos);
    emit('pdfs', obj.pdfs);
  }

  // Firebase initialization (hardcoded config)
  function tryInitFirebaseHardcoded() {
    try {
      if (!window.firebase) {
        console.warn('Firebase SDK not loaded; falling back to localStorage.');
        firebaseReady = false;
        return false;
      }
      // initialize app if not already
      if (!firebase.apps || firebase.apps.length === 0) {
        firebase.initializeApp(firebaseConfig);
      }
      firebaseRootRef = firebase.database().ref('/skillabhi');
      firebaseReady = true;

      // set up collection listeners
      ['notices', 'videos', 'pdfs'].forEach(col => {
        firebaseRootRef.child(col).on('value', snap => {
          const val = snap.exists() ? snap.val() : {};
          emit(col, val);
        });
      });

      console.log('Firebase initialized (hardcoded config).');
      return true;
    } catch (e) {
      console.error('Firebase init failed:', e);
      firebaseReady = false;
      return false;
    }
  }

  // Generic get/push/update/delete helpers that use Firebase when available, otherwise localStorage
  async function storageGetAll(collection) {
    if (firebaseReady && firebaseRootRef) {
      const snap = await firebaseRootRef.child(collection).get();
      const val = snap.exists() ? snap.val() : {};
      return val;
    } else {
      const local = readLocal();
      return local[collection] || {};
    }
  }

  async function storagePush(collection, item) {
    if (firebaseReady && firebaseRootRef) {
      const pushRef = firebaseRootRef.child(collection).push();
      const id = pushRef.key;
      item.id = id;
      await pushRef.set(item);
      return item;
    } else {
      const local = readLocal();
      const id = uid(collection);
      item.id = id;
      local[collection] = local[collection] || {};
      local[collection][id] = item;
      writeLocal(local);
      return item;
    }
  }

  async function storageUpdate(collection, id, item) {
    if (firebaseReady && firebaseRootRef) {
      await firebaseRootRef.child(collection).child(id).update(item);
      return true;
    } else {
      const local = readLocal();
      if (local[collection] && local[collection][id]) {
        local[collection][id] = Object.assign({}, local[collection][id], item);
        writeLocal(local);
        return true;
      }
      return false;
    }
  }

  async function storageDelete(collection, id) {
    if (firebaseReady && firebaseRootRef) {
      await firebaseRootRef.child(collection).child(id).remove();
      return true;
    } else {
      const local = readLocal();
      if (local[collection] && local[collection][id]) {
        delete local[collection][id];
        writeLocal(local);
        return true;
      }
      return false;
    }
  }

  function onCollectionChange(collection, callback) {
    if (!listeners[collection]) listeners[collection] = [];
    listeners[collection].push(callback);
    // emit current data immediately
    storageGetAll(collection).then(data => callback(data));
    return () => {
      listeners[collection] = listeners[collection].filter(fn => fn !== callback);
    };
  }

  // ---------- UI wiring ----------
  document.addEventListener('DOMContentLoaded', initApp);

  function initApp() {
    // Try to init firebase with the hardcoded config
    const fbOk = tryInitFirebaseHardcoded();
    if (!fbOk) {
      // ensure local data exists
      const curr = readLocal();
      if (!curr.notices) curr.notices = {};
      if (!curr.videos) curr.videos = {};
      if (!curr.pdfs) curr.pdfs = {};
      writeLocal(curr);
    }

    // Cache elements
    const viewStudentBtn = el('viewStudent');
    const viewAdminBtn = el('viewAdmin');
    const studentPanel = el('studentPanel');
    const adminPanel = el('adminPanel');

    const adminGate = el('adminGate');
    const adminContent = el('adminContent');
    const adminSignInBtn = el('adminSignInBtn');
    const adminPasswordInput = el('adminPasswordInput');
    const adminGateMessage = el('adminGateMessage');
    const adminStatus = el('adminStatus');
    const adminLogoutBtn = el('adminLogoutBtn');
    const adminNameDisplay = el('adminNameDisplay');

    const noticeForm = el('noticeForm');
    const videoForm = el('videoForm');
    const pdfForm = el('pdfForm');

    const adminNoticesList = el('adminNoticesList');
    const adminVideosList = el('adminVideosList');
    const adminPdfsList = el('adminPdfsList');

    // student category containers
    const containers = {
      biology: {
        notices: el('bioNoticesList'), videos: el('bioVideosList'), pdfs: el('bioPdfsList'),
        noNotices: el('bioNoNotices'), noVideos: el('bioNoVideos'), noPdfs: el('bioNoPdfs')
      },
      physics: {
        notices: el('phyNoticesList'), videos: el('phyVideosList'), pdfs: el('phyPdfsList'),
        noNotices: el('phyNoNotices'), noVideos: el('phyNoVideos'), noPdfs: el('phyNoPdfs')
      },
      chemistry: {
        notices: el('chemNoticesList'), videos: el('chemVideosList'), pdfs: el('chemPdfsList'),
        noNotices: el('chemNoNotices'), noVideos: el('chemNoVideos'), noPdfs: el('chemNoPdfs')
      }
    };

    const adminTabs = qsa('.admin-tab');
    const dashboardTab = el('dashboardTab');
    const settingsTab = el('settingsTab');

    const adminPasswordForm = el('adminPasswordForm');
    const saveAdminPasswordBtn = el('saveAdminPasswordBtn');
    const resetAdminPasswordBtn = el('resetAdminPasswordBtn');
    const passwordMessage = el('passwordMessage');

    const yearEl = el('year');
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    // Navigation: view switch
    viewStudentBtn.addEventListener('click', () => {
      viewStudentBtn.classList.add('active');
      viewAdminBtn.classList.remove('active');
      studentPanel.classList.remove('hidden');
      adminPanel.classList.add('hidden');
    });
    viewAdminBtn.addEventListener('click', () => {
      viewAdminBtn.classList.add('active');
      viewStudentBtn.classList.remove('active');
      adminPanel.classList.remove('hidden');
      studentPanel.classList.add('hidden');
    });

    // Admin tab switch
    adminTabs.forEach(t => {
      t.addEventListener('click', () => {
        adminTabs.forEach(x => x.classList.remove('active'));
        t.classList.add('active');
        const target = t.getAttribute('data-tab');
        if (target === 'dashboard') {
          dashboardTab.classList.remove('hidden');
          settingsTab.classList.add('hidden');
        } else {
          dashboardTab.classList.add('hidden');
          settingsTab.classList.remove('hidden');
        }
      });
    });

    // Admin auth
    function getSavedAdminPassword() {
      return localStorage.getItem(ADMIN_PW_KEY) || DEFAULT_ADMIN_PASSWORD;
    }
    function isSignedIn() {
      return sessionStorage.getItem('skillabhi_admin_signed_in') === '1';
    }
    function setSignedIn(name = 'admin') {
      sessionStorage.setItem('skillabhi_admin_signed_in', '1');
      sessionStorage.setItem('skillabhi_admin_name', name);
      adminStatus.textContent = 'Signed in';
      adminLogoutBtn.style.display = 'inline-block';
      adminNameDisplay.textContent = name;
      adminGate.classList.add('hidden');
      adminContent.classList.remove('hidden');
      el('adminContent').scrollIntoView({behavior: 'smooth', block: 'start'});
    }
    function signOut() {
      sessionStorage.removeItem('skillabhi_admin_signed_in');
      sessionStorage.removeItem('skillabhi_admin_name');
      adminStatus.textContent = 'Not signed in';
      adminLogoutBtn.style.display = 'none';
      adminNameDisplay.textContent = '-';
      adminGate.classList.remove('hidden');
      adminContent.classList.add('hidden');
    }

    adminSignInBtn.addEventListener('click', () => {
      const val = adminPasswordInput.value || '';
      const saved = getSavedAdminPassword();
      if (val === saved) {
        adminGateMessage.textContent = '';
        setSignedIn('admin');
      } else {
        adminGateMessage.textContent = 'Incorrect password.';
      }
    });

    adminLogoutBtn.addEventListener('click', () => {
      signOut();
    });

    if (isSignedIn()) {
      setSignedIn(sessionStorage.getItem('skillabhi_admin_name') || 'admin');
    } else {
      signOut();
    }

    // Admin password management
    function loadAdminPasswordForm() {
      adminPasswordForm.adminPassword.value = '';
      passwordMessage.textContent = 'Set or change the admin password. Default: skillabhi_admin';
    }
    loadAdminPasswordForm();

    saveAdminPasswordBtn.addEventListener('click', () => {
      const v = adminPasswordForm.adminPassword.value;
      if (!v || v.trim().length < 4) {
        passwordMessage.textContent = 'Password must be at least 4 characters.';
        return;
      }
      localStorage.setItem(ADMIN_PW_KEY, v.trim());
      passwordMessage.textContent = 'Admin password saved.';
    });
    resetAdminPasswordBtn.addEventListener('click', () => {
      localStorage.removeItem(ADMIN_PW_KEY);
      passwordMessage.textContent = 'Reset to default password.';
    });

    // Handle forms: include category when pushing
    noticeForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(noticeForm);
      const title = (fd.get('title') || '').toString().trim();
      const message = (fd.get('message') || '').toString().trim();
      const category = (fd.get('category') || '').toString().trim();
      if (!title || !message || !category) return;
      const item = { id: null, title, message, category, createdAt: now() };
      await storagePush('notices', item);
      noticeForm.reset();
      showAdminFlash('Notice posted.');
    });

    videoForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(videoForm);
      const title = (fd.get('title') || '').toString().trim();
      const url = (fd.get('url') || '').toString().trim();
      const category = (fd.get('category') || '').toString().trim();
      if (!title || !url || !category) return;
      const videoId = extractYouTubeID(url);
      if (!videoId) {
        showAdminFlash('Could not parse YouTube URL.');
        return;
      }
      const item = { id: null, title, url, ytId: videoId, category, createdAt: now() };
      await storagePush('videos', item);
      videoForm.reset();
      showAdminFlash('Video added.');
    });

    pdfForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(pdfForm);
      const title = (fd.get('title') || '').toString().trim();
      const url = (fd.get('url') || '').toString().trim();
      const category = (fd.get('category') || '').toString().trim();
      if (!title || !url || !category) return;
      const item = { id: null, title, url, category, createdAt: now() };
      await storagePush('pdfs', item);
      pdfForm.reset();
      showAdminFlash('PDF link added.');
    });

    function showAdminFlash(msg) {
      const elmsg = el('adminGateMessage');
      if (elmsg) {
        elmsg.textContent = msg;
        setTimeout(() => { elmsg.textContent = ''; }, 3000);
      }
    }

    // Admin management lists
    function renderAdminList(container, collectionObj, collectionName) {
      container.innerHTML = '';
      const keys = Object.keys(collectionObj || {});
      if (keys.length === 0) {
        const n = document.createElement('div');
        n.className = 'muted small';
        n.textContent = 'No items';
        container.appendChild(n);
        return;
      }
      keys.sort((a, b) => (collectionObj[b].createdAt || 0) - (collectionObj[a].createdAt || 0));
      keys.forEach(id => {
        const it = collectionObj[id];
        const row = document.createElement('div');
        row.className = 'item';
        const left = document.createElement('div');
        left.style.flex = '1';
        const title = document.createElement('div');
        title.style.fontWeight = '700';
        title.textContent = it.title || '(no title)';
        const meta = document.createElement('div');
        meta.className = 'meta';
        meta.textContent = `${CATEGORIES[it.category] || it.category || '-'} • ${formatDate(it.createdAt)}`;
        const body = document.createElement('div');
        body.style.marginTop = '6px';
        if (collectionName === 'notices') body.textContent = it.message || '';
        else if (collectionName === 'videos') body.textContent = it.url || '';
        else if (collectionName === 'pdfs') body.textContent = it.url || '';
        left.appendChild(title);
        left.appendChild(meta);
        left.appendChild(body);

        const controls = document.createElement('div');
        controls.className = 'controls';
        const del = document.createElement('button');
        del.className = 'ghost small';
        del.textContent = 'Delete';
        del.addEventListener('click', async () => {
          if (!confirm('Delete this item?')) return;
          await storageDelete(collectionName, id);
          showAdminFlash('Deleted.');
        });
        controls.appendChild(del);

        if (collectionName === 'notices') {
          const edit = document.createElement('button');
          edit.className = 'ghost small';
          edit.textContent = 'Edit';
          edit.addEventListener('click', () => {
            const newTitle = prompt('Edit title', it.title) || it.title;
            const newMsg = prompt('Edit message', it.message) || it.message;
            const newCat = prompt('Edit category (biology/physics/chemistry)', it.category) || it.category;
            storageUpdate('notices', id, { title: newTitle, message: newMsg, category: newCat });
          });
          controls.appendChild(edit);
        }

        row.appendChild(left);
        row.appendChild(controls);
        container.appendChild(row);
      });
    }

    // Student render: group items by category and render into category containers
    function groupByCategory(collectionObj) {
      const result = { biology: {}, physics: {}, chemistry: {} };
      Object.keys(collectionObj || {}).forEach(id => {
        const it = collectionObj[id];
        const cat = it.category || 'biology';
        if (!result[cat]) result[cat] = {};
        result[cat][id] = it;
      });
      return result;
    }

    function renderNoticesAll(collectionObj) {
      const grouped = groupByCategory(collectionObj || {});
      Object.keys(containers).forEach(cat => {
        const arr = grouped[cat] || {};
        const container = containers[cat].notices;
        container.innerHTML = '';
        const keys = Object.keys(arr);
        if (keys.length === 0) {
          containers[cat].noNotices.style.display = 'block';
          continue;
        } else containers[cat].noNotices.style.display = 'none';
        keys.sort((a, b) => (arr[b].createdAt || 0) - (arr[a].createdAt || 0));
        keys.forEach(id => {
          const it = arr[id];
          const card = document.createElement('div');
          card.className = 'card';
          const t = document.createElement('div');
          t.style.fontWeight = '700';
          t.textContent = it.title || 'Notice';
          const meta = document.createElement('div');
          meta.className = 'muted small';
          meta.textContent = formatDate(it.createdAt);
          const msg = document.createElement('div');
          msg.style.marginTop = '6px';
          msg.textContent = it.message || '';
          card.appendChild(t);
          card.appendChild(meta);
          card.appendChild(msg);
          container.appendChild(card);
        });
      });
    }

    function renderVideosAll(collectionObj) {
      const grouped = groupByCategory(collectionObj || {});
      Object.keys(containers).forEach(cat => {
        const arr = grouped[cat] || {};
        const container = containers[cat].videos;
        container.innerHTML = '';
        const keys = Object.keys(arr);
        if (keys.length === 0) {
          containers[cat].noVideos.style.display = 'block';
          continue;
        } else containers[cat].noVideos.style.display = 'none';
        keys.sort((a, b) => (arr[b].createdAt || 0) - (arr[a].createdAt || 0));
        keys.forEach(id => {
          const it = arr[id];
          const vid = it.ytId || extractYouTubeID(it.url);
          const wrap = document.createElement('div');
          wrap.className = 'video-card';
          const iframe = document.createElement('iframe');
          iframe.setAttribute('allowfullscreen','');
          iframe.setAttribute('loading','lazy');
          iframe.src = vid ? `https://www.youtube.com/embed/${vid}` : '';
          const caption = document.createElement('div');
          caption.style.padding = '0.6rem';
          caption.style.display = 'flex';
          caption.style.justifyContent = 'space-between';
          caption.style.alignItems = 'center';
          const title = document.createElement('div');
          title.style.fontWeight = '600';
          title.textContent = it.title || '';
          const meta = document.createElement('div');
          meta.className = 'muted small';
          meta.textContent = formatDate(it.createdAt);
          caption.appendChild(title);
          caption.appendChild(meta);

          wrap.appendChild(iframe);
          wrap.appendChild(caption);
          container.appendChild(wrap);
        });
      });
    }

    function renderPdfsAll(collectionObj) {
      const grouped = groupByCategory(collectionObj || {});
      Object.keys(containers).forEach(cat => {
        const arr = grouped[cat] || {};
        const container = containers[cat].pdfs;
        container.innerHTML = '';
        const keys = Object.keys(arr);
        if (keys.length === 0) {
          containers[cat].noPdfs.style.display = 'block';
          continue;
        } else containers[cat].noPdfs.style.display = 'none';
        keys.sort((a, b) => (arr[b].createdAt || 0) - (arr[a].createdAt || 0));
        keys.forEach(id => {
          const it = arr[id];
          const row = document.createElement('div');
          row.className = 'item';
          const left = document.createElement('div');
          left.style.flex = '1';
          const title = document.createElement('div');
          title.style.fontWeight = '600';
          title.textContent = it.title || '';
          const meta = document.createElement('div');
          meta.className = 'muted';
          meta.textContent = formatDate(it.createdAt);
          left.appendChild(title);
          left.appendChild(meta);

          const controls = document.createElement('div');
          controls.className = 'controls';
          const view = document.createElement('a');
          view.className = 'btn';
          view.textContent = 'View';
          view.href = it.url || '#';
          view.target = '_blank';
          view.rel = 'noreferrer';
          const dl = document.createElement('a');
          dl.className = 'ghost';
          dl.textContent = 'Download';
          dl.href = it.url || '#';
          dl.target = '_blank';
          dl.rel = 'noreferrer';
          controls.appendChild(view);
          controls.appendChild(dl);

          row.appendChild(left);
          row.appendChild(controls);
          container.appendChild(row);
        });
      });
    }

    // Subscribe to collection changes
    onCollectionChange('notices', (data) => {
      renderNoticesAll(data || {});
      renderAdminList(adminNoticesList, data || {}, 'notices');
    });
    onCollectionChange('videos', (data) => {
      renderVideosAll(data || {});
      renderAdminList(adminVideosList, data || {}, 'videos');
    });
    onCollectionChange('pdfs', (data) => {
      renderPdfsAll(data || {});
      renderAdminList(adminPdfsList, data || {}, 'pdfs');
    });

    // seed local to firebase if firebase is empty (only do when firebase is available)
    async function syncLocalToFirebaseIfEmpty() {
      if (!firebaseReady || !firebaseRootRef) return;
      const rootSnap = await firebaseRootRef.get();
      const rootVal = rootSnap.exists() ? rootSnap.val() : {};
      if (Object.keys(rootVal).length > 0) return;
      const local = readLocal();
      for (const col of ['notices', 'videos', 'pdfs']) {
        const items = local[col] || {};
        for (const id in items) {
          const item = Object.assign({}, items[id]);
          item.id = null;
          await storagePush(col, item);
        }
      }
    }
    if (firebaseReady) syncLocalToFirebaseIfEmpty();

    // initial emit to populate UIs
    storageGetAll('notices').then(data => emit('notices', data));
    storageGetAll('videos').then(data => emit('videos', data));
    storageGetAll('pdfs').then(data => emit('pdfs', data));
  }

  // Expose small debugging helpers
  window.skillabhi = {
    readLocal: () => {
      try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}'); } catch { return {}; }
    },
    firebaseReady: () => firebaseReady
  };
})();
