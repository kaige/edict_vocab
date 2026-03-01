// Firebase Service - Handles authentication and cloud sync

// Firebase will be initialized from CDN
let db = null;
let auth = null;

// Initialize Firebase
function initFirebase() {
  return new Promise((resolve, reject) => {
    if (window.firebase) {
      try {
        firebase.initializeApp(firebaseConfig);
        db = firebase.database();
        auth = firebase.auth();
        resolve();
      } catch (e) {
        reject(e);
      }
    } else {
      reject(new Error('Firebase not loaded'));
    }
  });
}

// Get current user
function getCurrentUser() {
  return auth ? auth.currentUser : null;
}

// Sign in with Google
function signInWithGoogle() {
  const provider = new firebase.auth.GoogleAuthProvider();
  return auth.signInWithPopup(provider);
}

// Sign out
function signOut() {
  return auth.signOut();
}

// Auth state change listener
function onAuthStateChanged(callback) {
  if (auth) {
    auth.onAuthStateChanged(callback);
  }
}

// Save words to Firebase (merge with existing)
function saveWordsToFirebase(words) {
  const user = getCurrentUser();
  if (!user) return Promise.reject(new Error('Not authenticated'));

  const wordsRef = db.ref('users/' + user.uid + '/words');

  // Get existing words first
  return wordsRef.once('value').then(snapshot => {
    const existingWords = snapshot.val() || {};

    // Merge new words with existing (use word as key for deduplication)
    const wordMap = {};
    for (const word of existingWords) {
      if (word) {
        wordMap[word.word.toLowerCase()] = word;
      }
    }
    for (const word of words) {
      if (word) {
        wordMap[word.word.toLowerCase()] = word;
      }
    }

    // Convert back to array and save
    const mergedWords = Object.values(wordMap);
    return wordsRef.set(mergedWords);
  });
}

// Load words from Firebase
function loadWordsFromFirebase() {
  const user = getCurrentUser();
  if (!user) return Promise.reject(new Error('Not authenticated'));

  return db.ref('users/' + user.uid + '/words').once('value').then(snapshot => {
    return snapshot.val() || [];
  });
}

// Delete a word from Firebase
function deleteWordFromFirebase(wordIndex) {
  const user = getCurrentUser();
  if (!user) return Promise.reject(new Error('Not authenticated'));

  return loadWordsFromFirebase().then(words => {
    if (words && words.length > wordIndex) {
      words.splice(wordIndex, 1);
      return db.ref('users/' + user.uid + '/words').set(words);
    }
  });
}

// Clear all words from Firebase
function clearAllWordsFromFirebase() {
  const user = getCurrentUser();
  if (!user) return Promise.reject(new Error('Not authenticated'));

  return db.ref('users/' + user.uid + '/words').set([]);
}
