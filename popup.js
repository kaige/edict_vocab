// iciba生词本 - Popup Script with chrome.storage.sync

document.addEventListener('DOMContentLoaded', function() {
  const wordListEl = document.getElementById('wordList');
  const wordCountEl = document.getElementById('wordCount');
  const searchInput = document.getElementById('searchInput');
  const exportBtn = document.getElementById('exportBtn');
  const clearAllBtn = document.getElementById('clearAllBtn');
  const syncBtn = document.getElementById('syncBtn');
  const syncStatusEl = document.getElementById('syncStatus');

  let allWords = [];
  let isSyncing = false;

  // 加载生词 - 同时从云端和本地加载，合并去重后使用
  function loadWords() {
    chrome.storage.sync.get({ words: [] }, function(syncResult) {
      chrome.storage.local.get({ words: [] }, function(localResult) {
        const syncWords = syncResult.words || [];
        const localWords = localResult.words || [];

        console.log('iciba生词本: 云端', syncWords.length, '个单词, 本地', localWords.length, '个单词');

        // 合并两个列表，使用时间戳最新的版本
        const mergedMap = new Map();

        // 先添加本地的
        localWords.forEach(word => {
          mergedMap.set(word.word.toLowerCase(), word);
        });

        // 再添加云端的，如果时间戳更新则覆盖
        syncWords.forEach(word => {
          const key = word.word.toLowerCase();
          const existing = mergedMap.get(key);
          if (!existing || (word.timestamp && word.timestamp > (existing.timestamp || 0))) {
            mergedMap.set(key, word);
          }
        });

        // 转换为数组并按时间戳排序
        allWords = Array.from(mergedMap.values()).sort((a, b) => {
          return (b.timestamp || 0) - (a.timestamp || 0);
        });

        updateWordCount();
        renderWords(allWords);
        console.log('iciba生词本: 合并后共', allWords.length, '个单词');

        // 如果合并后的数据与云端不一致，同步到云端
        if (allWords.length > syncWords.length) {
          console.log('iciba生词本: 检测到本地有更多数据，同步到云端');
          chrome.storage.sync.set({ words: allWords }, function() {
            if (chrome.runtime.lastError) {
              console.error('iciba生词本: 同步失败', chrome.runtime.lastError.message);
            }
          });
        }
      });
    });
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

  // 保存单词到本地和云端
  function saveWordsToStorage(words, callback) {
    // 先保存到本地
    chrome.storage.local.set({ words: words }, function() {
      // 再保存到云端
      chrome.storage.sync.set({ words: words }, function() {
        if (chrome.runtime.lastError) {
          console.log('iciba生词本: 云端同步失败', chrome.runtime.lastError.message);
          showSyncStatus('⚠️ 同步失败: ' + chrome.runtime.lastError.message, 3000);
        }
        if (callback) callback();
      });
    });
  }

  // 删除单词
  function deleteWord(index) {
    const word = allWords[index];
    if (!word) return;

    allWords.splice(index, 1);
    saveWordsToStorage(allWords, function() {
      updateWordCount();
      renderWords(allWords);
    });
  }

  // 清空所有
  clearAllBtn.addEventListener('click', function() {
    if (confirm('确定要清空所有生词吗？此操作不可恢复。')) {
      allWords = [];
      saveWordsToStorage(allWords, function() {
        updateWordCount();
        renderWords([]);
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

  // 同步按钮 - 长按显示调试信息
  let pressTimer = null;
  syncBtn.addEventListener('mousedown', function() {
    pressTimer = setTimeout(function() {
      showDebugInfo();
    }, 1000);
  });
  syncBtn.addEventListener('mouseup', function() {
    clearTimeout(pressTimer);
  });
  syncBtn.addEventListener('mouseleave', function() {
    clearTimeout(pressTimer);
  });
  syncBtn.addEventListener('click', function() {
    if (isSyncing) return;
    manualSync(allWords);
  });

  // 手动同步
  function manualSync(wordsToSync) {
    isSyncing = true;
    showSyncStatus('正在同步...');

    // 使用传入的单词列表，如果没有则从allWords获取
    const words = wordsToSync || allWords;

    console.log('iciba生词本: 正在同步', words.length, '个单词到云端');

    chrome.storage.sync.set({ words: words }, function() {
      if (chrome.runtime.lastError) {
        console.error('iciba生词本: 同步失败', chrome.runtime.lastError);
        showSyncStatus('⚠️ 同步失败: ' + chrome.runtime.lastError.message, 3000);
      } else {
        console.log('iciba生词本: 已同步到云端', words.length, '个单词');
        showSyncStatus('✓ 已同步到云端', 2000);
      }
      isSyncing = false;
    });
  }

  // 显示同步状态
  function showSyncStatus(message, duration) {
    syncStatusEl.textContent = message;
    syncStatusEl.style.display = 'block';

    if (duration) {
      setTimeout(function() {
        syncStatusEl.style.display = 'none';
      }, duration);
    }
  }

  // 显示调试信息 - 长按同步按钮触发
  function showDebugInfo() {
    chrome.storage.sync.get(null, function(syncData) {
      chrome.storage.local.get(null, function(localData) {
        const syncWords = (syncData.words || []).length;
        const localWords = (localData.words || []).length;
        const syncBytes = JSON.stringify(syncData).length;
        const localBytes = JSON.stringify(localData).length;

        const debugInfo = `
=== iciba生词本 调试信息 ===
云端存储: ${syncWords} 个单词 (${syncBytes} 字节)
本地存储: ${localWords} 个单词 (${localBytes} 字节)

云端数据:
  ${syncData.words ? JSON.stringify(syncData.words, null, 2) : '无数据'}

本地数据:
  ${localData.words ? JSON.stringify(localData.words, null, 2) : '无数据'}
        `;

        console.log(debugInfo);
        alert(debugInfo);

        if (syncWords === 0 && localWords > 0) {
          alert('⚠️ 检测到本地有数据但云端为空！\n\n可能原因：\n1. Chrome同步未开启\n2. 网络问题导致同步失败\n3. 超出存储配额\n\n建议：点击同步按钮手动同步');
        }
      });
    });
  }

  // HTML转义
  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // 监听存储变化（从content script或其他设备同步过来）
  chrome.storage.onChanged.addListener(function(changes, areaName) {
    if (changes.words) {
      console.log('iciba生词本: 检测到单词列表变化', areaName, '新值数量:', (changes.words.newValue || []).length);

      const newWords = changes.words.newValue || [];

      // 优先使用sync存储的数据（如果是其他设备同步来的）
      // 否则使用local存储的数据（content script刚保存的）
      allWords = newWords;
      updateWordCount();
      renderWords(allWords);

      if (areaName === 'sync') {
        showSyncStatus('✓ 已从云端同步', 2000);
      }
    }
  });

  // 初始化
  loadWords();
});
