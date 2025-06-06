// renderer.js
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const { ipcRenderer } = require('electron');


let clientSocket = null;
let receivingFile = null;

const hostInput = document.getElementById('host');
const portInput = document.getElementById('port');
const connectBtn = document.getElementById('connect-btn');
const chatContainer = document.getElementById('chat-container');
const chat = document.getElementById('chat');
const messageInput = document.getElementById('message');
const sendBtn = document.getElementById('send-btn');
const fileBtn = document.getElementById('file-btn');
const disconnectBtn = document.getElementById('disconnect-btn');
const progressBar = document.getElementById('progress');
const progressText = document.getElementById('progress-text');
const progressContainer = document.getElementById('progress-bar');

connectBtn.addEventListener('click', () => {
    const host = hostInput.value || 'localhost';
    const port = parseInt(portInput.value) || 3000;
    const serverUrl = `ws://${host}:${port}`;
    connectToServer(serverUrl);
});

sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

fileBtn.addEventListener('click', async () => {
  if (!clientSocket) return;
  const { canceled, filePaths } = await ipcRenderer.invoke('dialog:open-file');
  if (canceled || filePaths.length === 0) return;
  sendFile(clientSocket, filePaths[0]);
});

disconnectBtn.addEventListener('click', () => {
    if (clientSocket) clientSocket.close();
});

function sendMessage() {
    const input = messageInput.value.trim();
    if (!input || !clientSocket) return;

    if (input === '/exit') {
        clientSocket.close();
        console.log(`Отключение...`);
    } else if (input.startsWith('/send ')) {
        const filePath = input.substring(6).trim();
        console.log(`Отправка файла клиенту...`);
        if (filePath) sendFile(clientSocket, filePath);
    } else {
        clientSocket.send(JSON.stringify({ type: 'text', payload: input }));
        appendMessage('Вы', input, true);
    }
    messageInput.value = '';
}

function connectToServer(url) {
    const socket = new WebSocket(url);
    socket.binaryType = "arraybuffer";
    clientSocket = socket;

    socket.onopen = () => {
        appendMessage('Система', `Подключено к серверу ${url}`);
        chatContainer.style.display = 'block';
        connectBtn.style.display = 'none';
    };

    socket.onmessage = (event) => {
        data = event.data;
        if (receivingFile && data instanceof ArrayBuffer) {

            const bufferChunk = Buffer.from(data);

            fs.appendFile(receivingFile.path, bufferChunk, (err) => {
                if (err) {
                    appendMessage('Система', `Ошибка записи файла ${receivingFile.name}: ${err.message}`);
                    receivingFile = null;
                    progressContainer.style.display = 'none';
                    return;
                }
                receivingFile.receivedSize += bufferChunk.length;
                const progress = Math.min(100, (receivingFile.receivedSize / receivingFile.size * 100));
                progressBar.value = progress;
                progressText.textContent = `Получение файла "${receivingFile.name}": ${progress.toFixed(2)}%`;
                if (receivingFile.receivedSize >= receivingFile.size) {
                    appendMessage('Система', `Файл "${receivingFile.name}" (${receivingFile.size} байт) сохранен как "${receivingFile.path}"`);
                    receivingFile = null;
                    progressContainer.style.display = 'none';
                }
            });
            return;
        }

        if (typeof data === 'string') {
            try {
                const message = JSON.parse(data.toString());
                console.log('Полученное сообщение:', message);
                if (message.type === 'text') {
                    appendMessage(message.sender || 'Сервер', message.payload);
                } else if (message.type === 'system') {
                    appendMessage('Система', message.payload);
                } else if (message.type === 'file_info') {

                    const savePath = path.join('.', `received_ws_${message.name}`);
                    receivingFile = { name: message.name, size: message.size, receivedSize: 0, path: savePath };
                    if (fs.existsSync(savePath)) fs.unlinkSync(savePath);
                    appendMessage('Система', `Начало получения файла "${message.name}" (${message.size} байт) от ${message.sender}`);
                    progressContainer.style.display = 'block';
                    progressText.textContent = `Получение файла "${message.name}": 0%`;
                    progressBar.value = 0;
                }
            } catch (e) {
                appendMessage('Система', `Ошибка обработки сообщения: ${e.message}`);
            }
        } else {
            console.warn('Получен неожиданный бинарный пакет без file_info');
        }
    };

    socket.onclose = (event) => {
        appendMessage('Система', `Соединение закрыто. Код: ${event.code}`);
        chatContainer.style.display = 'none';
        connectBtn.style.display = 'block';
        clientSocket = null;
    };

    socket.onerror = (err) => {
        appendMessage('Система', `Ошибка соединения: ${err.message}`);
    };
}

function appendMessage(sender, text, isOwn = false) {
    const div = document.createElement('div');  
    div.className = 'message' + (isOwn ? ' self' : '');
    div.innerHTML = `<span class="sender">${sender}:</span> ${text}`;
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
}

function sendFile(socket, filePath) {
    if (!fs.existsSync(filePath)) {
        appendMessage('Система', `Файл не найден: ${filePath}`);
        return;
    }

    try {
        const stats = fs.statSync(filePath);
        const fileSize = stats.size;
        const fileName = path.basename(filePath);

        socket.send(JSON.stringify({ type: 'file_info', name: fileName, size: fileSize }));
        appendMessage('Система', `Отправка файла "${fileName}" (${fileSize} байт)...`);
        progressContainer.style.display = 'block';
        progressText.textContent = `Отправка файла "${fileName}": 0%`;
        progressBar.value = 0;

        const fileStream = fs.createReadStream(filePath, { highWaterMark: 64 * 1024 });
        let sentBytes = 0;

        fileStream.on('data', (chunk) => { 
            const arrayBufferChunk = chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength);
            socket.send(arrayBufferChunk);

            sentBytes += chunk.length;
            const progress = Math.min(100, (sentBytes / fileSize * 100));
            progressBar.value = progress;
            progressText.textContent = `Отправка файла "${fileName}": ${progress.toFixed(2)}%`;
        });

        fileStream.on('end', () => {
            appendMessage('Система', `Файл "${fileName}" полностью отправлен`);
            progressContainer.style.display = 'none';
        });

        fileStream.on('error', (err) => {
            appendMessage('Система', `Ошибка отправки файла ${fileName}: ${err.message}`);
            progressContainer.style.display = 'none';
        });
    } catch (error) {
        appendMessage('Система', `Ошибка подготовки к отправке файла: ${error.message}`);
        progressContainer.style.display = 'none';
    }
}