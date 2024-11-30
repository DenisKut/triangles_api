const dgram = require('dgram');
const os = require('os');
const dotenv = require('dotenv');

dotenv.config();

const server = dgram.createSocket('udp4');
const port = process.env.UDP_PORT ? parseInt(process.env.UDP_PORT, 10) : 41234;

server.on('message', (msg, rinfo) => {
	const trimmedMsg = msg.toString().trim();
	console.log(`Received message from ${rinfo.address}:${rinfo.port}`);

	if (trimmedMsg === 'ping') {
		server.send('pong', rinfo.port, rinfo.address, err => {
			if (!err)
				console.log(`Ping response sent to ${rinfo.address}:${rinfo.port}`);
		});
	} else {
		try {
			const tasks = JSON.parse(trimmedMsg);

			if (
				!Array.isArray(tasks) ||
				tasks.some(task => !Array.isArray(task) || task.length !== 3)
			) {
				throw new Error('Invalid task format');
			}

			const results = tasks
				.map(task => processTask(task))
				.filter(result => result !== null);

			server.send(JSON.stringify(results), rinfo.port, rinfo.address, err => {
				if (!err)
					console.log(`Response sent to ${rinfo.address}:${rinfo.port}`);
			});
		} catch (err) {
			console.error('Error processing message:', err.message);
		}
	}
});

function processTask(task) {
	const isValid = validateTriangle(task);
	if (!isValid) return null;

	return calculateTriangleProperties(task);
}

function validateTriangle([A, B, C]) {
	const AB = calculateDistance(A, B);
	const BC = calculateDistance(B, C);
	const CA = calculateDistance(C, A);

	return AB + BC > CA && AB + CA > BC && BC + CA > AB;
}

function calculateTriangleProperties([A, B, C]) {
	const AB = calculateDistance(A, B);
	const BC = calculateDistance(B, C);
	const CA = calculateDistance(C, A);

	const angles = calculateAngles(AB, BC, CA);
	const isObtuse = angles.some(angle => angle > 90);

	return isObtuse ? { vertices: [A, B, C], angles } : null;
}

function calculateDistance(p1, p2) {
	return Math.sqrt(
		Math.pow(p2.x - p1.x, 2) +
			Math.pow(p2.y - p1.y, 2) +
			Math.pow(p2.z - p1.z, 2)
	);
}

function calculateAngles(a, b, c) {
	const angleA =
		Math.acos((b ** 2 + c ** 2 - a ** 2) / (2 * b * c)) * (180 / Math.PI);
	const angleB =
		Math.acos((a ** 2 + c ** 2 - b ** 2) / (2 * a * c)) * (180 / Math.PI);
	return [angleA, angleB, 180 - angleA - angleB];
}

server.on('listening', () => {
	console.log(`Server listening on port ${port}`);
});

server.bind(port);
