// iciba生词本 - Popup Script with Firebase Integration

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
  const signInBtn = document.getElementById('signInBtn');
  const signOutBtn = document.getElementById('signOutBtn');
  const userAvatar = document.getElementById('userAvatar');
  const userName = document.getElementById('userName');
  const syncBtn = document.getElementById('syncBtn');
  const syncStatus = document.getElementById('syncStatus');

  let allWords = [];
  let isSyncing = false;
  let currentUser = null;

  // Initialize Firebase and set up auth listeners
  initFirebase().then(() => {
    console.log('Firebase initialized');

    // Listen for auth state changes
    onAuthStateChanged((user) => {
      currentUser = user;
      if (user) {
        // User is signed in
        userInfo.style.display = 'flex';
        signInPrompt.style.display = 'none';
        userAvatar.src = user.photoURL || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23666"><circle cx="12" cy="8" r="4"/><path d="M12 14c-6.1 0-8 4-8 4v2h16v-2s-1.9-4-8-4z"/></svg>';
        userName.textContent = user.displayName || user.email;
        loadWords();
      } else {
        // User is signed out
        userInfo.style.display = 'none';
        signInPrompt.style.display = 'flex';
        loadWords();
      }
    });
  }).catch(err => {
    console.error('Firebase init error:', err);
    // If Firebase fails to load, still show local words
    loadWords();
  });

  // Sign in with Google
  signInBtn.addEventListener('click', function() {
    showSyncStatus('正在登录...');
    signInWithGoogle()
      .then(() => {
        showSyncStatus('登录成功！', 2000);
      })
      .catch(err => {
        console.error('Sign in error:', err);
        showSyncStatus('登录失败: ' + err.message, 3000);
      });
  });

  // Sign out
  signOutBtn.addEventListener('click', function() {
    signOut().then(() => {
      showSyncStatus('已退出登录', 2000);
    });
  });

  // Sync button - manual sync to cloud
  syncBtn.addEventListener('click', function() {
    if (!currentUser) return;
    syncToCloud();
  });

  // 加载生词
  function loadWords() {
    // First load from local storage
    chrome.storage.local.get({ words: [], lastSync: 0 }, function(result) {
      allWords = result.words || [];
      const lastSync = result.lastSync || 0;
      updateWordCount();
      renderWords(allWords);

      // If logged in, sync with Firebase
      if (currentUser) {
        // Check if we need to sync (there are new local words since last sync)
        const hasNewWords = allWords.some(w => w.timestamp && w.timestamp > lastSync);

        if (hasNewWords) {
          // First push local changes to Firebase
          saveWordsToFirebase(allWords).then(() => {
            chrome.storage.local.set({ lastSync: Date.now() });
            // Then pull any Firebase changes
            return loadWordsFromFirebase();
          }).then(firebaseWords => {
            if (firebaseWords && firebaseWords.length > 0) {
              mergeAndSaveWords(firebaseWords);
            }
          }).catch(err => {
            console.error('Sync error:', err);
          });
        } else {
          // Just pull Firebase changes
          loadWordsFromFirebase().then(firebaseWords => {
            if (firebaseWords && firebaseWords.length > 0) {
              // Check if Firebase has newer words
              const firebaseHasNewer = firebaseWords.some(w =>
                !allWords.find(lw => lw.word.toLowerCase() === w.word.toLowerCase())
              );
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

  // Merge Firebase words with local words
  function mergeAndSaveWords(firebaseWords) {
    // Merge Firebase words with local words
    const wordMap = {};
    allWords.forEach(w => wordMap[w.word.toLowerCase()] = w);
    firebaseWords.forEach(w => {
      if (w) {
        const key = w.word.toLowerCase();
        // Keep the one with more complete data or newer timestamp
        if (!wordMap[key] || (w.definition && !wordMap[key].definition) || w.timestamp > wordMap[key].timestamp) {
          wordMap[key] = w;
        }
      }
    });
    allWords = Object.values(wordMap);

    // Sort by timestamp (newest first)
    allWords.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    // Save merged data locally
    chrome.storage.local.set({ words: allWords, lastSync: Date.now() }, () => {
      updateWordCount();
      renderWords(allWords);
    });
  }

  // Sync to cloud
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

  // Show sync status message
  function showSyncStatus(message, duration = 0) {
    syncStatus.textContent = message;
    syncStatus.style.display = 'block';

    if (duration > 0) {
      setTimeout(() => {
        syncStatus.style.display = 'none';
      }, duration);
    }
  }

  // 更新单词计数
  function updateWordCount() {
    const count = allWords.length;
    wordCountEl.textContent = count + ' 个单词';
  }

  // 渲染单词列表
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

    // 绑定删除事件
    document.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        const index = parseInt(this.dataset.index);
        deleteWord(index);
      });
    });
  }

  // 删除单词
  function deleteWord(index) {
    const word = allWords[index];
    if (!word) return;

    // Delete from local storage
    chrome.storage.local.get({ words: [] }, function(result) {
      let words = result.words || [];
      words.splice(index, 1);

      chrome.storage.local.set({ words: words }, function() {
        allWords = words;
        updateWordCount();
        renderWords(allWords);

        // If logged in, also delete from Firebase
        if (currentUser) {
          deleteWordFromFirebase(index).catch(err => {
            console.error('Firebase delete error:', err);
          });
        }
      });
    });
  }

  // 清空所有
  clearAllBtn.addEventListener('click', function() {
    if (confirm('确定要清空所有生词吗？此操作不可恢复。')) {
      chrome.storage.local.set({ words: [] }, function() {
        allWords = [];
        updateWordCount();
        renderWords([]);

        // If logged in, also clear from Firebase
        if (currentUser) {
          clearAllWordsFromFirebase().catch(err => {
            console.error('Firebase clear error:', err);
          });
        }
      });
    }
  });

  // 导出JSON
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

  // 搜索过滤
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

  // HTML转义
  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
});
