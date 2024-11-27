const dgram = require('dgram');
const server = dgram.createSocket('udp4');

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

server.bind(41234); // Порт для приема UDP сообщений
