const fs = require('fs');
const io = require('socket.io-client');

const filePath = './points.json'; // Укажите путь к вашему JSON-файлу
const serverUrl = 'http://localhost:3000'; // Укажите URL вашего сервера

const socket = io(serverUrl);

socket.on('connect', () => {
  console.log('Connected to server');
  
  const jsonContent = fs.readFileSync(filePath, 'utf8');
  console.log('Sending JSON content:', jsonContent);
  socket.emit('uploadJson', { jsonContent });
});

socket.on('uploadResult', data => {
  console.log('Received upload result:', data);
});

socket.on('scanner', data => {
  console.log('Received IP addresses:', data);
  // Здесь можете выполнять действия с полученными IP-адресами
});

socket.on('disconnect', () => {
  console.log('Disconnected from server');
});
