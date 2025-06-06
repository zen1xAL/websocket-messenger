// server.js
const http = require('http');
const WebSocket = require('ws');
const readline = require('readline');
const os = require('os');

// --- configuration and server start ---

function getLocalIpAddresses() {
    const interfaces = os.networkInterfaces();
    const addresses = [];
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                addresses.push(iface.address);
            }
        }
    }
    return addresses;
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

console.log("Доступные IP адреса для этого компьютера:", getLocalIpAddresses().join(', ') || 'Нет доступных IPv4');
rl.question('Введите IP адрес для сервера (оставьте пустым для 0.0.0.0 - слушать на всех): ', (hostInput) => {
    const serverHost = hostInput || '0.0.0.0';

    rl.question('Введите порт для сервера (например, 3000): ', (portInput) => {
        const serverPort = parseInt(portInput) || 3000;

        if (isNaN(serverPort) || serverPort <= 0 || serverPort > 65535) {
            console.error('Ошибка: Неверный номер порта.');
            rl.close();
            process.exit(1);
        }
        startServer(serverHost, serverPort);
    });
});


function startServer(host, port) {
    const httpServer = http.createServer((req, res) => {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found. This is a WebSocket server.');
    });

    const wss = new WebSocket.Server({ server: httpServer });

    console.log(`\nСервер WebSocket запущен и слушает на ws://${host}:${port}`);
    console.log('Ожидание подключений...');
    setupServerInput(wss);

    wss.on('connection', (ws, req) => {
        const clientId = `${req.socket.remoteAddress}:${req.socket.remotePort}`;
        ws.clientId = clientId;
        console.log(`\n[Сервер] Новый клиент подключился: ${clientId}`);

        ws.send(JSON.stringify({
            type: 'text',
            payload: `Добро пожаловать на сервер! Ваш ID: ${clientId}`
        }));

        broadcast(JSON.stringify({
            type: 'system',
            payload: `Клиент ${clientId} присоединился к чату.`
        }), ws, wss);

        ws.on('message', (message, isBinary) => {

            console.log(`\n[Сервер] Получено сообщение от ${ws.clientId}`);


            if (isBinary) {
                console.log(`[Сервер] Получен бинарный чанк от ${ws.clientId}, рассылка...`);
                broadcast(message, ws, wss);
            } else {
                try {
                    const parsedMessage = JSON.parse(message.toString());
                    console.log(`[Сервер] Тип сообщения: ${parsedMessage.type}`);

                    if (parsedMessage.type === 'text') {
                        broadcast(JSON.stringify({
                            type: 'text',
                            sender: ws.clientId,
                            payload: parsedMessage.payload
                        }), ws, wss);
                    } else if (parsedMessage.type === 'file_info') {
                        console.log(`[Сервер] Получена информация о файле от ${ws.clientId}: ${parsedMessage.name}, ${parsedMessage.size} байт. Рассылка...`);
                        broadcast(JSON.stringify({
                            type: 'file_info',
                            sender: ws.clientId,
                            name: parsedMessage.name,
                            size: parsedMessage.size
                        }), ws, wss);
                    }
                } catch (e) {
                    console.error(`[Сервер] Ошибка парсинга JSON от ${ws.clientId}: ${e.message}`);
                    console.error(`[Сервер] Получено: ${message}`);
                }
            }
        });

        ws.on('close', () => {
            console.log(`\n[Сервер] Клиент ${ws.clientId} отключился.`);
            broadcast(JSON.stringify({
                type: 'system',
                payload: `Клиент ${ws.clientId} покинул чат.`
            }), ws, wss);
        });

        ws.on('error', (err) => {
            console.error(`\n[Сервер] Ошибка сокета клиента ${ws.clientId}: ${err.message}`);
            broadcast(JSON.stringify({
                type: 'system',
                payload: `Клиент ${ws.clientId} отключился из-за ошибки.`
            }), ws, wss);
        });
    });

    httpServer.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.error(`Ошибка: Порт ${port} уже используется на адресе ${host}.`);
            console.error('Попробуйте другой порт или освободите текущий.');
        } else {
            console.error(`\n[Сервер] Ошибка HTTP сервера: ${err.message}`);
        }
        rl.close();
        process.exit(1);
    });

    httpServer.listen(port, host);
}

function broadcast(data, senderWs, wss) {
    const senderId = senderWs ? senderWs.clientId : 'Сервер';
    console.log(`[Сервер] Рассылка данных от ${senderId}`);

    if (wss.clients.size > 0) {
        wss.clients.forEach((client) => {

            if (client !== senderWs && client.readyState === WebSocket.OPEN) {
                console.log(` -> Отправка клиенту ${client.clientId || 'неизвестному'}`);
                client.send(data);
            }
        });
    } else if (senderWs && wss.clients.size <= 1) {
        console.log(`[Сервер] Нет других клиентов для рассылки.`);
    }
}

function setupServerInput(wss) {
    console.log('\nВы можете отправлять сообщения всем клиентам от имени сервера.');
    console.log('Для этого введите сообщение и нажмите Enter.');
    rl.on('line', (input) => {
        const message = JSON.stringify({
            type: 'text',
            sender: 'Сервер',
            payload: input
        });
        console.log(`[Сервер] Отправка сообщения всем: ${input}`);

        broadcast(message, null, wss);
    });

    rl.on('close', () => {
        console.log('\n[Сервер] Завершение работы сервера...');
        const shutdownMessage = JSON.stringify({
            type: 'system',
            payload: 'Сервер отключается.'
        });
        wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(shutdownMessage);
                client.terminate();
            }
        });
        wss.close(() => {
            console.log('[Сервер] WebSocket сервер остановлен.');
        });

        if (wss._server) {
            wss._server.close(() => {
                console.log('[Сервер] HTTP сервер полностью остановлен.');
                process.exit(0);
            });
        } else {
            process.exit(0);
        }

        setTimeout(() => {
            process.exit(0);
        }, 2000);
    });
}