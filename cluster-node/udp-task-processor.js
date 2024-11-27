const dgram = require('dgram');
const server = dgram.createSocket('udp4');

// Получаем порт из аргументов командной строки или устанавливаем по умолчанию
const port = process.argv[2] ? parseInt(process.argv[2], 10) : 41234;

server.on('message', (msg, rinfo) => {
	const trimmedMsg = msg.toString().trim(); // Удаляем лишние пробелы и символы новой строки
	let response;
	if (trimmedMsg === 'ping') {
		response = 'pong';
	} else {
		response = `Processed task: ${trimmedMsg}`;
	}
	server.send(response, rinfo.port, rinfo.address, err => {
		if (err) {
			console.error(
				`Error sending response to ${rinfo.address}:${rinfo.port}: ${err}`
			);
		}
	});
});

server.on('listening', () => {
	const address = server.address();
	console.log(`Server listening on ${address.address}:${address.port}`);
});

server.bind(port); // Используем порт из аргументов или по умолчанию
