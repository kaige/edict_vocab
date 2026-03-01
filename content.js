// iciba生词本 - Content Script
// 检测iciba.com查词并提取数据保存到Storage

(function() {
  'use strict';

  // 从URL获取当前搜索的单词
  function getWordFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get('w') || '';
  }

  // 从 __NEXT_DATA__ 提取单词数据
  function extractFromNextData() {
    const data = {
      word: '',
      phonetic: '',
      definition: '',
      examples: [],
      timestamp: Date.now()
    };

    try {
      const nextDataScript = document.getElementById('__NEXT_DATA__');
      if (!nextDataScript) return data;

      const json = JSON.parse(nextDataScript.textContent);
      const wordInfo = json.props?.pageProps?.initialReduxState?.word?.wordInfo;
      if (!wordInfo) return data;

      // 获取单词
      data.word = wordInfo.bidec?.word_name || wordInfo.baesInfo?.word_name || '';

      // 获取音标
      const symbols = wordInfo.baesInfo?.symbols?.[0];
      if (symbols) {
        const enPhonetic = symbols.ph_en || '';
        const amPhonetic = symbols.ph_am || '';
        if (enPhonetic || amPhonetic) {
          data.phonetic = (enPhonetic ? '英 ' + enPhonetic : '') +
                         (enPhonetic && amPhonetic ? ' / ' : '') +
                         (amPhonetic ? '美 ' + amPhonetic : '');
        }
      }

      // 获取释义
      const parts = wordInfo.baesInfo?.symbols?.[0]?.parts || [];
      if (parts.length > 0) {
        const means = parts[0].means || [];
        data.definition = means.map(m => {
          if (typeof m === 'string') return m;
          return m.word_mean || m.mean || '';
        }).filter(Boolean).join('; ');
      }

      // 获取例句
      if (wordInfo.new_sentence?.sentences) {
        const sentences = wordInfo.new_sentence.sentences.slice(0, 3);
        sentences.forEach(s => {
          if (s.en && s.cn) {
            data.examples.push(s.en + ' - ' + s.cn);
          } else if (s.en) {
            data.examples.push(s.en);
          }
        });
      }

    } catch (e) {
      console.log('iciba生词本: 解析__NEXT_DATA__出错', e);
    }

    return data;
  }

  // 从DOM提取单词数据（备用方法）
  function extractFromDOM() {
    const data = {
      word: '',
      phonetic: '',
      definition: '',
      examples: [],
      timestamp: Date.now()
    };

    try {
      // 获取单词 - 使用实际页面的class名
      const wordEl = document.querySelector('h2[class*="Mean_word"]') ||
                     document.querySelector('h2.Mean_word');
      if (wordEl) {
        data.word = wordEl.textContent.trim();
      }

      // 获取音标
      const symbolsEl = document.querySelector('ul[class*="Mean_symbols"]');
      if (symbolsEl) {
        // 提取英式和美式音标
        const lis = symbolsEl.querySelectorAll('li');
        const phonetics = [];
        lis.forEach(li => {
          const text = li.textContent.trim();
          // 去掉 "英 " 和 "美 " 前缀，只保留音标
          const cleanText = text.replace(/^(英|美)\s*/, '');
          if (cleanText && cleanText.match(/\[.*\]/)) {
            phonetics.push(cleanText);
          }
        });
        data.phonetic = phonetics.join(' / ');
      }

      // 获取释义 - 匹配实际的class结构
      const defDiv = document.querySelector('div[class*="Mean_definition"]');
      if (defDiv) {
        // 找到所有的释义span
        const spans = defDiv.querySelectorAll('div.Mean_normal__mkzjn span');
        const means = [];
        spans.forEach(span => {
          const text = span.textContent.trim();
          if (text && !text.includes('；')) {
            means.push(text);
          }
        });
        data.definition = means.join('；');
      }

      // 如果上面没找到，尝试其他选择器
      if (!data.definition) {
        const defSelectors = [
          'div.Mean_normal__mkzjn',
          'div[class*="Mean_definition"]',
          'div[class*="definition"]',
          'ul.Mean_part__UI9M6'
        ];
        for (const selector of defSelectors) {
          const defEl = document.querySelector(selector);
          if (defEl) {
            const text = defEl.textContent.trim().replace(/\s+/g, ' ');
            if (text && text.length > 2 && text.length < 500) {
              data.definition = text;
              break;
            }
          }
        }
      }

      // 获取例句
      const exampleEls = document.querySelectorAll('div[class*="NormalSentence_sentence"]');
      if (exampleEls && exampleEls.length > 0) {
        exampleEls.forEach((el, i) => {
          if (i < 3) {
            const enEl = el.querySelector('p[class*="NormalSentence_en"]');
            const cnEl = el.querySelector('p[class*="NormalSentence_cn"]');
            if (enEl) {
              let text = enEl.textContent.trim();
              if (cnEl) {
                text += ' - ' + cnEl.textContent.trim();
              }
              data.examples.push(text);
            }
          }
        });
      }

    } catch (e) {
      console.log('iciba生词本: DOM提取出错', e);
    }

    return data;
  }

  // 保存单词到Storage
  function saveWord(word) {
    if (!word || word.length < 2) return;

    const wordData = {
      word: word,
      phonetic: '',
      definition: '',
      examples: [],
      timestamp: Date.now()
    };

    chrome.storage.local.get({ words: [] }, function(result) {
      const words = result.words || [];

      // 检查是否已存在
      const exists = words.some(w => w.word.toLowerCase() === word.toLowerCase());
      if (exists) {
        console.log('iciba生词本: 单词已存在', word);
        enrichWordData(word);
        return;
      }

      // 添加新单词
      words.unshift(wordData);

      // 限制保存数量
      if (words.length > 1000) {
        words.pop();
      }

      chrome.storage.local.set({ words: words }, function() {
        console.log('iciba生词本: 已保存', word);
        // 延迟开始获取详细数据，给页面更多时间加载
        setTimeout(function() {
          enrichWordData(word);
        }, 2000);
      });
    });
  }

  // 尝试补充单词的详细数据
  function enrichWordData(word) {
    let retries = 0;
    const maxRetries = 60;
    const delay = 500;

    function tryEnrich() {
      // 先尝试从 __NEXT_DATA__ 获取
      let nextData = extractFromNextData();

      // 从DOM获取
      let domData = extractFromDOM();

      const urlWord = getWordFromUrl();

      console.log('iciba生词本: 词汇数据获取', word, {
        nextDataWord: nextData.word,
        domDataWord: domData.word,
        urlWord: urlWord,
        nextDataDef: !!nextData.definition,
        domDataDef: !!domData.definition,
        retry: retries
      });

      // 优先使用匹配的数据源
      let dataToUse = null;

      // 检查 __NEXT_DATA__ 是否匹配
      if (nextData.word && nextData.word.toLowerCase() === word.toLowerCase() && (nextData.definition || nextData.phonetic)) {
        dataToUse = nextData;
      }
      // 检查 DOM 是否匹配
      else if (domData.word && domData.word.toLowerCase() === word.toLowerCase() && (domData.definition || domData.phonetic)) {
        dataToUse = domData;
      }
      // URL已更新，但数据还不匹配 - 继续等待
      else if (urlWord && urlWord.toLowerCase() === word.toLowerCase()) {
        if (retries < maxRetries) {
          console.log('iciba生词本: URL已更新到 ' + urlWord + '，但DOM还是旧内容，继续等待...');
          retries++;
          setTimeout(tryEnrich, delay);
          return;
        } else {
          // 超时，使用当前DOM数据（即使不完全匹配）
          if (domData.definition || domData.phonetic) {
            dataToUse = domData;
          } else if (nextData.definition || nextData.phonetic) {
            dataToUse = nextData;
          }
        }
      }

      if (dataToUse) {
        saveEnrichedData(word, dataToUse);
        return;
      }

      if (retries < maxRetries) {
        retries++;
        setTimeout(tryEnrich, delay);
      } else {
        console.log('iciba生词本: 无法获取详细数据', word);
      }
    }

    function saveEnrichedData(targetWord, data) {
      chrome.storage.local.get({ words: [] }, function(result) {
        const words = result.words || [];
        const index = words.findIndex(w => w.word.toLowerCase() === targetWord.toLowerCase());
        if (index !== -1) {
          words[index] = {
            ...words[index],
            phonetic: data.phonetic,
            definition: data.definition,
            examples: data.examples || []
          };
          chrome.storage.local.set({ words: words }, function() {
            console.log('iciba生词本: 已更新单词详细数据', targetWord, data.definition);
          });
        }
      });
    }

    tryEnrich();
  }

  // 设置搜索监听
  function setupSearchListener() {
    // 尝试多种可能的搜索输入选择器
    const searchInput = document.querySelector('input[type="search"]') ||
                        document.querySelector('input[placeholder*="搜"]') ||
                        document.querySelector('input[placeholder*="查"]') ||
                        document.querySelector('input[class*="search"]') ||
                        document.querySelector('input[class*="input"]') ||
                        document.querySelector('input[class*="Search_input"]') ||
                        document.querySelector('#input');

    if (searchInput) {
      console.log('iciba生词本: 找到搜索输入框', searchInput);

      // 监听键盘事件 - Enter键
      searchInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
          const newWord = searchInput.value.trim();
          console.log('iciba生词本: 检测到Enter键搜索，输入的词:', newWord);

          if (newWord && newWord.length >= 2) {
            // 直接保存用户输入的单词
            saveWord(newWord);
          }
        }
      });

      // 监听搜索按钮点击
      const searchBtn = document.querySelector('[class*="Search_btn"]') ||
                        document.querySelector('[class*="search-btn"]') ||
                        document.querySelector('button[class*="search"]');
      if (searchBtn) {
        console.log('iciba生词本: 找到搜索按钮', searchBtn);
        searchBtn.addEventListener('click', function() {
          const newWord = searchInput.value.trim();
          if (newWord && newWord.length >= 2) {
            saveWord(newWord);
          }
        });
      }
    } else {
      console.log('iciba生词本: 未找到搜索输入框');
    }
  }

  // 初始化
  function init() {
    console.log('iciba生词本: 插件已加载');

    // 设置搜索监听
    setupSearchListener();
  }

  // 启动
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
