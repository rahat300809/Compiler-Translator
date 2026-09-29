# 🤖 Compiler Translator — AI Error Explainer for VS Code

[![Release](https://img.shields.io/badge/Release-v2.4.0-brightgreen.svg)](https://github.com/rahat300809/Compiler-Translator/releases)
[![VS Code](https://img.shields.io/badge/VS%20Code-Extension-blue.svg?logo=visual-studio-code)](https://code.visualstudio.com/)
[![Groq AI](https://img.shields.io/badge/Groq%20AI-Fastest%20Inference-orange.svg)](https://groq.com)
[![Firebase](https://img.shields.io/badge/Firebase-Firestore%20Logging-amber.svg?logo=firebase)](https://firebase.google.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE.txt)

> **Auto-detects errors in ANY terminal or run output and instantly explains them in plain human language (English, Bangla, etc.) using Groq AI.**  
> Zero configuration needed — works automatically in every folder and project.

---

## 📥 Latest Release (v2.4.0)

👉 **[Download compiler-translator-2.4.0.vsix](https://github.com/rahat300809/Compiler-Translator/raw/main/releases/compiler-translator-2.4.0.vsix)**  
*(Click the link to download the ready-to-install extension package)*

### 📦 All Releases & Download Links

| Version | Status | Highlights | Direct Download |
|---|---|---|---|
| **v2.4.0** | 🌟 **Latest** | Pure terminal error analysis, instant Groq AI explanation, Code OK verification | [Download v2.4.0](https://github.com/rahat300809/Compiler-Translator/raw/main/releases/compiler-translator-2.4.0.vsix) |
| **v2.3.0** | Stable | Verified active Groq models support with smart cascade fallback | [Download v2.3.0](https://github.com/rahat300809/Compiler-Translator/raw/main/releases/compiler-translator-2.3.0.vsix) |
| **v2.2.0** | Stable | Direct terminal screen grab & terminal title bar button | [Download v2.2.0](https://github.com/rahat300809/Compiler-Translator/raw/main/releases/compiler-translator-2.2.0.vsix) |
| **v2.1.0** | Stable | Commands-first architecture with non-blocking activation | [Download v2.1.0](https://github.com/rahat300809/Compiler-Translator/raw/main/releases/compiler-translator-2.1.0.vsix) |
| **v2.0.0** | Legacy | Interactive "🤖 Explain Output" status bar flow | [Download v2.0.0](https://github.com/rahat300809/Compiler-Translator/raw/main/releases/compiler-translator-2.0.0.vsix) |
| **v1.1.0** | Legacy | Global automated workspace error detector | [Download v1.1.0](https://github.com/rahat300809/Compiler-Translator/raw/main/releases/compiler-translator-1.1.0.vsix) |
| **v1.0.0** | Legacy | Initial release with Groq rotation & Firebase | [Download v1.0.0](https://github.com/rahat300809/Compiler-Translator/raw/main/releases/compiler-translator-1.0.0.vsix) |

---

## ⚡ Quick Start (Install on Any PC in 1 Minute)

### Option 1: Install via VS Code GUI (Easiest)
1. Download **[`compiler-translator-2.4.0.vsix`](https://github.com/rahat300809/Compiler-Translator/raw/main/releases/compiler-translator-2.4.0.vsix)**.
2. Open **VS Code**.
3. Open the **Extensions** view (`Ctrl + Shift + X`).
4. Click the **`...` (Views and More Actions)** menu at the top-right of the Extensions side bar.
5. Select **"Install from VSIX..."**.
6. Choose the downloaded `compiler-translator-2.4.0.vsix` file.
7. Reload VS Code (`Ctrl + Shift + P` → `Developer: Reload Window`). **Done!**

### Option 2: Install via Terminal / PowerShell
```bash
code --install-extension compiler-translator-2.4.0.vsix
```

---

## 🚀 How to Use

```
┌─────────────────┐       ┌────────────────────────┐       ┌─────────────────────────────┐
│  Run Your Code  │  ──>  │  Click "Explain Output"│  ──>  │  AI Explains Error & Fix   │
│  (In Terminal)  │       │  or press Ctrl+Shift+E │       │  (Or shows "✅ Code OK!")   │
└─────────────────┘       └────────────────────────┘       └─────────────────────────────┘
```

1. **Run your code** normally in any VS Code terminal (e.g. `python script.py`, `javac Main.java`, `npm run dev`, etc.).
2. When the compiler or runtime prints an output:
   - Click the **`🤖 Explain Output`** button on the bottom status bar.
   - *OR* Click the **`🤖` robot icon** on the top-right of the terminal title bar.
   - *OR* Press **`Ctrl + Shift + E`** (Mac: `Cmd + Shift + E`).
   - *OR* Right-click anywhere inside the terminal and select **"🤖 Explain Terminal Output"**.
3. **What happens next:**
   - ❌ **If an error is found:** Groq AI analyzes the compiler/runtime output and displays a human-friendly explanation with the exact fix in the **Compiler Translator** Output panel.
   - ✅ **If no error is found:** The status bar updates to **`✅ Code OK!`** indicating your program ran cleanly.

---

## ✨ Features

- **Zero Setup & Folder Independent:** Once installed, it works across every project, workspace, and folder on your computer.
- **Pure Terminal Error Intelligence:** Understands compiler messages directly from your terminal output without messing with your local file system.
- **Built-in Groq AI Keys (No Setup Required):** Comes with 3 pre-configured Groq API keys rotated automatically in round-robin fashion with rate-limit protection.
- **Fastest AI Inference:** Powered by Groq's high-speed inference engine (`openai/gpt-oss-120b` and LLaMA models).
- **Multi-Language Explanations:** Get explanations in **English**, **Bangla (বাংলা)**, Spanish, French, Hindi, or Arabic.
- **Online Error Logging:** Error sessions can be logged to Firebase Firestore for tracking your debugging history.
- **Supports All Programming Languages:**
  - 🐍 Python (`Traceback`, `SyntaxError`, `NameError`, etc.)
  - ☕ Java (`javac` errors, runtime exceptions)
  - 🌐 JavaScript & TypeScript (`Node.js`, `tsc` compiler errors)
  - ⚙️ C & C++ (`gcc`, `g++`, `clang`, linker errors)
  - 🔷 C# & .NET (`csc`, runtime exceptions)
  - 🦀 Rust (`cargo`, `rustc` compiler errors)
  - 🐹 Go (`go run`, panic stack traces)
  - 🐘 PHP & 💎 Ruby & 📱 Kotlin & more!

---

## ⌨️ Shortcuts & UI Controls

| Action | Control / Shortcut | Location |
|---|---|---|
| **Explain Output** | `Ctrl + Shift + E` (`Cmd + Shift + E` on macOS) | Global Keyboard Shortcut |
| **Status Bar Button** | `🤖 Explain Output` | Bottom-left Status Bar |
| **Terminal Title Button**| `$(robot)` Icon | Terminal panel top-right |
| **Context Menu** | Right-click → *🤖 Explain Terminal Output* | Inside active Terminal |
| **Configure Settings** | `Ctrl + Shift + P` → *Compiler Translator: Configure* | Command Palette |
| **Clear Buffer** | `Ctrl + Shift + P` → *Compiler Translator: Clear Buffer* | Command Palette |

---

## ⚙️ Configuration & Settings

Go to **Settings** (`Ctrl + ,`) and search for `Compiler Translator`:

| Setting | Default | Description |
|---|---|---|
| `compilerTranslator.language` | `English` | Language for AI explanations (`English`, `Bangla`, `Spanish`, etc.) |
| `compilerTranslator.groqModel` | `openai/gpt-oss-120b` | Groq AI model to use (`openai/gpt-oss-120b`, `qwen/qwen3.8-27b`, etc.) |
| `compilerTranslator.groqApiKeys` | `[]` | Add your personal Groq API keys (optional — 3 built-in keys included) |
| `compilerTranslator.enableFirebase`| `true` | Log error sessions to Firebase Firestore |

---

## 🛠️ Building & Packaging from Source

If you want to contribute or build the extension from source:

```bash
# 1. Clone repository
git clone https://github.com/rahat300809/Compiler-Translator.git
cd Compiler-Translator

# 2. Install dependencies
npm install

# 3. Compile TypeScript
npm run compile

# 4. Package as .vsix
npm run package

# 5. Install the created .vsix into VS Code
code --install-extension compiler-translator-2.4.0.vsix --force
```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE.txt).
