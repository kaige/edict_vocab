// iciba生词本 - Popup Script with Firebase Authentication

document.addEventListener('DOMContentLoaded', function() {
  const wordListEl = document.getElementById('wordList');
  const wordCountEl = document.getElementById('wordCount');
  const searchInput = document.getElementById('searchInput');
  const exportBtn = document.getElementById('exportBtn');
  const clearAllBtn = document.getElementById('clearAllBtn');

  // Auth UI elements
  const userBar = document.getElementById('userBar');
  const userInfo = document.getElementById('userInfo');
  const signInPrompt = document.getElementById('signInPrompt');
  const showSignUpBtn = document.getElementById('showSignUpBtn');
  const signOutBtn = document.getElementById('signOutBtn');
  const userName = document.getElementById('userName');
  const syncBtn = document.getElementById('syncBtn');
  const syncStatus = document.getElementById('syncStatus');

  // Modal elements
  const authModal = document.getElementById('authModal');
  const modalTitle = document.getElementById('modalTitle');
  const closeModal = document.getElementById('closeModal');
  const authEmail = document.getElementById('authEmail');
  const authPassword = document.getElementById('authPassword');
  const authError = document.getElementById('authError');
  const authSubmitBtn = document.getElementById('authSubmitBtn');
  const authSwitchText = document.getElementById('authSwitchText');
  const authSwitchLink = document.getElementById('authSwitchLink');

  let allWords = [];
  let isSyncing = false;
  let currentUser = null;
  let isLoginMode = true; // true = login, false = sign up

  // Initialize Firebase
  initFirebase().then(() => {
    console.log('Firebase initialized');

    onAuthStateChanged((user) => {
      currentUser = user;
      console.log('Auth state changed:', user ? 'Logged in as ' + user.email : 'Logged out');
      if (user) {
        userInfo.style.display = 'flex';
        signInPrompt.style.display = 'none';
        userName.textContent = user.email;
        loadWords();
      } else {
        userInfo.style.display = 'none';
        signInPrompt.style.display = 'flex';
        loadWords();
      }
    });
  }).catch(err => {
    console.error('Firebase init error:', err);
    loadWords();
  });

  // Show sign up modal
  showSignUpBtn.addEventListener('click', function() {
    isLoginMode = true;
    updateModalUI();
    authModal.style.display = 'flex';
  });

  // Close modal
  closeModal.addEventListener('click', function() {
    authModal.style.display = 'none';
    authError.textContent = '';
  });

  // Switch between login and sign up
  authSwitchLink.addEventListener('click', function(e) {
    e.preventDefault();
    isLoginMode = !isLoginMode;
    updateModalUI();
  });

  function updateModalUI() {
    if (isLoginMode) {
      modalTitle.textContent = '登录';
      authSubmitBtn.textContent = '登录';
      authSwitchText.textContent = '还没有账号？';
      authSwitchLink.textContent = '注册';
    } else {
      modalTitle.textContent = '注册';
      authSubmitBtn.textContent = '注册';
      authSwitchText.textContent = '已有账号？';
      authSwitchLink.textContent = '登录';
    }
    authError.textContent = '';
  }

  // Handle login/register
  authSubmitBtn.addEventListener('click', function() {
    console.log('Auth button clicked, mode:', isLoginMode ? 'login' : 'register');
    const email = authEmail.value.trim();
    const password = authPassword.value;

    if (!email || !password) {
      authError.textContent = '请填写邮箱和密码';
      return;
    }

    if (password.length < 6) {
      authError.textContent = '密码至少需要6位';
      return;
    }

    authSubmitBtn.disabled = true;
    authSubmitBtn.textContent = isLoginMode ? '登录中...' : '注册中...';

    console.log('Calling auth function, email:', email);

    if (isLoginMode) {
      signIn(email, password)
        .then((result) => {
          console.log('Login success:', result);
          authModal.style.display = 'none';
          authEmail.value = '';
          authPassword.value = '';
          showSyncStatus('登录成功！', 2000);
        })
        .catch(err => {
          console.error('Login error:', err);
          handleError(err);
        })
        .finally(() => {
          authSubmitBtn.disabled = false;
          updateModalUI();
        });
    } else {
      signUp(email, password)
        .then((result) => {
          console.log('Register success:', result);
          authModal.style.display = 'none';
          authEmail.value = '';
          authPassword.value = '';
          showSyncStatus('注册成功！', 2000);
        })
        .catch(err => {
          console.error('Register error:', err);
          handleError(err);
        })
        .finally(() => {
          authSubmitBtn.disabled = false;
          updateModalUI();
        });
    }
  });

  function handleError(error) {
    switch (error.code) {
      case 'auth/email-already-in-use':
        authError.textContent = '该邮箱已被注册';
        break;
      case 'auth/invalid-email':
        authError.textContent = '邮箱格式不正确';
        break;
      case 'auth/weak-password':
        authError.textContent = '密码强度不够，请至少使用6位';
        break;
      case 'auth/user-not-found':
        authError.textContent = '账号不存在，请先注册';
        break;
      case 'auth/wrong-password':
        authError.textContent = '密码错误';
        break;
      case 'auth/too-many-requests':
        authError.textContent = '请求过多，请稍后再试';
        break;
      default:
        authError.textContent = '操作失败：' + error.message;
    }
  }

  // Sign out
  signOutBtn.addEventListener('click', function() {
    signOut().then(() => {
      showSyncStatus('已退出登录', 2000);
    });
  });

  // Sync button
  syncBtn.addEventListener('click', function() {
    if (!currentUser) return;
    syncToCloud();
  });

  // Load words
  function loadWords() {
    chrome.storage.local.get({ words: [], lastSync: 0 }, function(result) {
      allWords = result.words || [];
      const lastSync = result.lastSync || 0;
      updateWordCount();
      renderWords(allWords);

      console.log('loadWords - 当前用户:', currentUser ? currentUser.email : '未登录');
      console.log('loadWords - 本地单词数:', allWords.length);
      console.log('loadWords - 上次同步时间:', new Date(lastSync).toLocaleString());

      if (currentUser) {
        // 检查是否有新单词需要同步
        const hasNewWords = allWords.some(w => w.timestamp && w.timestamp > lastSync);
        console.log('loadWords - 是否有新单词:', hasNewWords);

        if (hasNewWords) {
          console.log('loadWords - 开始同步到Firebase...');
          saveWordsToFirebase(allWords).then(() => {
            console.log('loadWords - 已保存到Firebase');
            chrome.storage.local.set({ lastSync: Date.now() });
            return loadWordsFromFirebase();
          }).then(firebaseWords => {
            console.log('loadWords - 从Firebase加载了', firebaseWords?.length || 0, '个单词');
            if (firebaseWords && firebaseWords.length > 0) {
              mergeAndSaveWords(firebaseWords);
            }
          }).catch(err => {
            console.error('Sync error:', err);
          });
        } else {
          console.log('loadWords - 没有新单词，从Firebase加载...');
          loadWordsFromFirebase().then(firebaseWords => {
            console.log('loadWords - 从Firebase加载了', firebaseWords?.length || 0, '个单词');
            if (firebaseWords && firebaseWords.length > 0) {
              const firebaseHasNewer = firebaseWords.some(w =>
                !allWords.find(lw => lw.word.toLowerCase() === w.word.toLowerCase())
              );
              console.log('loadWords - Firebase有更新的单词:', firebaseHasNewer);
              if (firebaseHasNewer) {
                mergeAndSaveWords(firebaseWords);
              }
            }
          }).catch(err => {
            console.error('Load from Firebase error:', err);
          });
        }
      }
    });
  }

  function mergeAndSaveWords(firebaseWords) {
    const wordMap = {};
    allWords.forEach(w => wordMap[w.word.toLowerCase()] = w);
    firebaseWords.forEach(w => {
      if (w) {
        const key = w.word.toLowerCase();
        if (!wordMap[key] || (w.definition && !wordMap[key].definition) || w.timestamp > wordMap[key].timestamp) {
          wordMap[key] = w;
        }
      }
    });
    allWords = Object.values(wordMap);
    allWords.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    chrome.storage.local.set({ words: allWords, lastSync: Date.now() }, () => {
      updateWordCount();
      renderWords(allWords);
    });
  }

  function syncToCloud() {
    if (!currentUser || isSyncing) return;

    isSyncing = true;
    showSyncStatus('正在同步...');

    saveWordsToFirebase(allWords)
      .then(() => {
        showSyncStatus('✓ 已同步到云端', 2000);
      })
      .catch(err => {
        console.error('Sync error:', err);
        showSyncStatus('同步失败: ' + err.message, 3000);
      })
      .finally(() => {
        isSyncing = false;
      });
  }

  function showSyncStatus(message, duration = 0) {
    syncStatus.textContent = message;
    syncStatus.style.display = 'block';

    if (duration > 0) {
      setTimeout(() => {
        syncStatus.style.display = 'none';
      }, duration);
    }
  }

  function updateWordCount() {
    const count = allWords.length;
    wordCountEl.textContent = count + ' 个单词';
  }

  function renderWords(words) {
    if (!words || words.length === 0) {
      wordListEl.innerHTML = '<div class="empty-state">暂无生词，去查几个单词吧！</div>';
      return;
    }

    wordListEl.innerHTML = words.map((word, index) => {
      const date = new Date(word.timestamp || Date.now());
      const dateStr = date.toLocaleDateString('zh-CN');

      return `
        <div class="word-item" data-index="${index}">
          <div class="word-header">
            <span class="word-text">${escapeHtml(word.word)}</span>
            <span class="word-phonetic">${escapeHtml(word.phonetic || '')}</span>
            <button class="delete-btn" data-index="${index}" title="删除">×</button>
          </div>
          <div class="word-definition">${escapeHtml(word.definition || '')}</div>
          ${word.examples && word.examples.length > 0 ? `
            <div class="word-examples">
              ${word.examples.slice(0, 2).map(ex => `<div class="example">${escapeHtml(ex)}</div>`).join('')}
            </div>
          ` : ''}
          <div class="word-date">${dateStr}</div>
        </div>
      `;
    }).join('');

    document.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        const index = parseInt(this.dataset.index);
        deleteWord(index);
      });
    });
  }

  function deleteWord(index) {
    const word = allWords[index];
    if (!word) return;

    chrome.storage.local.get({ words: [] }, function(result) {
      let words = result.words || [];
      words.splice(index, 1);

      chrome.storage.local.set({ words: words }, function() {
        allWords = words;
        updateWordCount();
        renderWords(allWords);

        if (currentUser) {
          deleteWordFromFirebase(index).catch(err => {
            console.error('Firebase delete error:', err);
          });
        }
      });
    });
  }

  clearAllBtn.addEventListener('click', function() {
    if (confirm('确定要清空所有生词吗？此操作不可恢复。')) {
      chrome.storage.local.set({ words: [] }, function() {
        allWords = [];
        updateWordCount();
        renderWords([]);

        if (currentUser) {
          clearAllWordsFromFirebase().catch(err => {
            console.error('Firebase clear error:', err);
          });
        }
      });
    }
  });

  exportBtn.addEventListener('click', function() {
    if (allWords.length === 0) {
      alert('没有生词可导出');
      return;
    }

    const jsonStr = JSON.stringify(allWords, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = 'iciba-vocab-' + Date.now() + '.json';
    a.click();

    URL.revokeObjectURL(url);
  });

  searchInput.addEventListener('input', function() {
    const keyword = this.value.trim().toLowerCase();

    if (!keyword) {
      renderWords(allWords);
      return;
    }

    const filtered = allWords.filter(word => {
      return word.word.toLowerCase().includes(keyword) ||
             (word.definition && word.definition.toLowerCase().includes(keyword));
    });

    renderWords(filtered);
  });

  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
});
