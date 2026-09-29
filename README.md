# Compiler Translator — AI Error Explainer

> **Understand your errors in plain English (or Bangla!) instantly.**  
> Powered by **Groq AI** + **Firebase**. Supports ALL programming languages.

[![VS Code Marketplace](https://img.shields.io/badge/VS%20Code-Extension-blue?logo=visual-studio-code)](https://marketplace.visualstudio.com)
[![Firebase](https://img.shields.io/badge/Firebase-Firestore-orange?logo=firebase)](https://firebase.google.com)
[![Groq AI](https://img.shields.io/badge/Groq-AI-green)](https://groq.com)

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🔍 **Auto Error Detection** | Watches your terminal in real-time |
| 🤖 **AI Explanation** | Groq LLaMA explains errors in plain language |
| 🌍 **Multi-Language** | Supports 6 human languages (Bangla, English, etc.) |
| 🔄 **3 API Keys** | Round-robin key rotation — no rate limits! |
| 🔥 **Firebase Logging** | Error sessions saved online for history |
| 💻 **All Languages** | Python, JS, TS, Java, C++, C#, Rust, Go, PHP, Ruby, Kotlin + more |

---

## 🚀 How It Works

```
Your Code → Terminal Output → Error Detected → Groq AI → Human Explanation
                                                    ↓
                                            Firebase (saved online)
```

1. Run your code normally in any terminal
2. Extension detects errors automatically
3. Groq AI explains what went wrong in simple words
4. Explanation appears in **"Compiler Translator" output panel**
5. Session logged to Firebase for history

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+E` | Explain last error manually |

---

## 📋 Commands

Open Command Palette (`Ctrl+Shift+P`) and search:

- `Compiler Translator: Explain Last Error`
- `Compiler Translator: Toggle Auto-Explain`  
- `Compiler Translator: Show Error History`
- `Compiler Translator: Clear Error History`
- `Compiler Translator: Configure API Keys`

---

## ⚙️ Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `compilerTranslator.autoExplain` | `true` | Auto-explain on error detection |
| `compilerTranslator.groqModel` | `llama-3.3-70b-versatile` | AI model to use |
| `compilerTranslator.language` | `English` | Explanation language |
| `compilerTranslator.enableFirebase` | `true` | Log sessions to Firebase |
| `compilerTranslator.groqApiKeys` | `[]` | Your own Groq API keys |

---

## 🔥 Firebase Setup

The extension uses Firebase project `compiler-85122`. Error sessions are stored in **Firestore** under the `errorSessions` collection.

---

## 🛠️ Development

```bash
# Clone
git clone https://github.com/rahat300809/Compiler-Translator.git
cd Compiler-Translator

# Install dependencies
npm install

# Build
npm run compile

# Package as .vsix
npm run package

# Install locally
code --install-extension compiler-translator-1.0.0.vsix
```

---

## 📦 Supported Languages

| Language | Error Types |
|----------|-------------|
| Python | SyntaxError, TypeError, ImportError, etc. |
| JavaScript | ReferenceError, TypeError, UnhandledPromise |
| TypeScript | TS compiler errors (TS2345, etc.) |
| Java | NullPointerException, ClassCastException |
| C/C++ | Compiler errors, linker errors, Segfault |
| C# | CS errors, runtime exceptions |
| Rust | Borrow checker, type errors |
| Go | Compile errors, panics |
| PHP | Parse errors, fatal errors |
| Ruby | NameError, NoMethodError |
| Kotlin | Compiler errors |

---

## 🤝 Author

**rahat300809** — [GitHub](https://github.com/rahat300809)

---

*Built with ❤️ using Groq AI + Firebase + VS Code Extension API*
