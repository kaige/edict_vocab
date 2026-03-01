// iciba生词本 - Popup Script

document.addEventListener('DOMContentLoaded', function() {
  const wordListEl = document.getElementById('wordList');
  const wordCountEl = document.getElementById('wordCount');
  const searchInput = document.getElementById('searchInput');
  const exportBtn = document.getElementById('exportBtn');
  const clearAllBtn = document.getElementById('clearAllBtn');

  let allWords = [];

  // 加载生词
  function loadWords() {
    chrome.storage.local.get({ words: [] }, function(result) {
      allWords = result.words || [];
      updateWordCount();
      renderWords(allWords);
    });
  }

  // 更新单词计数
  function updateWordCount() {
    wordCountEl.textContent = allWords.length + ' 个单词';
  }

  // 渲染单词列表
  function renderWords(words) {
    if (!words || words.length === 0) {
      wordListEl.innerHTML = '<div class="empty-state">暂无生词，去查几个单词吧！</div>';
      return;
    }

    wordListEl.innerHTML = words.map((word, index) => {
      const date = new Date(word.timestamp);
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

    chrome.storage.local.get({ words: [] }, function(result) {
      let words = result.words || [];
      words = words.filter((w, i) => i !== index);

      chrome.storage.local.set({ words: words }, function() {
        loadWords();
      });
    });
  }

  // 清空所有
  clearAllBtn.addEventListener('click', function() {
    if (confirm('确定要清空所有生词吗？此操作不可恢复。')) {
      chrome.storage.local.set({ words: [] }, function() {
        loadWords();
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

  // 初始化
  loadWords();
});
