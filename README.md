# WebSocket Messenger

A desktop messenger built with Electron + Node.js using raw WebSocket protocol.
Supports real-time chat and file transfer between clients.

---

## 💻 Features

- Connect to custom WebSocket server by IP and port  
- Send and receive text messages  
- Select and send files of any type  
- Show progress bar for file transfer  
- Display system messages (user joined/left)  
- Multiple clients supported  
- Electron UI — local desktop app

---
## 🚀 How to Run

### 1. Clone the project

```bash
git clone https://github.com/yourname/ws-messenger.git
cd ws-messenger
```

### 2. Install dependencies

```bash
npm install
```

### 3. Start the server

```bash
node server.js
```

→ Enter IP and port when prompted. Example:
`0.0.0.0`, `3000`

### 4. Start client(s)

```bash
npm start
```

→ Enter server IP and port in the UI.

You can launch multiple clients (same machine or LAN).

---

## 📁 Project Structure

```
├── main.js         # Electron main process (window, dialog)
├── renderer.js     # Client logic (UI, WebSocket, file handling)
├── server.js       # WebSocket server (Node.js + ws)
├── index.html      # Chat UI
├── style.css       # UI styles
└── README.md       # This file
```

---

## ⚙️ Dependencies

* Electron
* Node.js `fs`, `path`, `os`, `http`
* ws (WebSocket server)

---

## ⚠️ Notes

* File chunks are sent as binary `ArrayBuffer` over WebSocket.
* Transfer is one-way broadcast: all clients receive the file.
* File is saved as `received_ws_<filename>` in current folder.
* Works offline in LAN.

---

## 🧪 Tested On

* Windows 11 

---