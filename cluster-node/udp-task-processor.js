// Импорт модулей и настройка окружения
const dgram = require('dgram'); // dgram: Модуль для работы с UDP-сокетами
const dotenv = require('dotenv'); //dotenv: Модуль для загрузки переменных окружения из файла .env

dotenv.config();

// Создается UDP-сокет, используя протокол IPv4.
const server = dgram.createSocket('udp4');
// Устанавливается порт для прослушивания. Если переменная окружения UDP_PORT задана, используется ее значение, иначе порт по умолчанию - 41234
const port = process.env.UDP_PORT ? parseInt(process.env.UDP_PORT, 10) : 41234;

// Устанавливает обработчик для входящих сообщений
server.on('message', (msg, rinfo) => {
	const trimmedMsg = msg.toString().trim();
	console.log(`Received message from ${rinfo.address}:${rinfo.port}`);

	// Если получено сообщение "ping", сервер отвечает "pong"
	if (trimmedMsg === 'ping') {
		server.send('pong', rinfo.port, rinfo.address, err => {
			if (!err)
				console.log(`Ping response sent to ${rinfo.address}:${rinfo.port}`);
		});
	} else {
		// Пытаемся разобрать сообщение как JSON. Если формат задачи неверен (не массив или не массив тройки точек), выбрасывается ошибка
		try {
			const tasks = JSON.parse(trimmedMsg);

			if (
				!Array.isArray(tasks) ||
				tasks.some(task => !Array.isArray(task) || task.length !== 3)
			) {
				throw new Error('Invalid task format');
			}

			// Обрабатываются задачи с помощью функции processTask. Только допустимые результаты отправляются обратно клиенту
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

// Обработка одной задачи
// Проверка валидности треугольника с помощью validateTriangle
// Если треугольник валиден, рассчитываются его свойства
function processTask(task) {
	const isValid = validateTriangle(task);
	if (!isValid) return null;

	return calculateTriangleProperties(task);
}

// Валидация треугольника через проверку, что сумма длин двух сторон больше длины третьей стороны
function validateTriangle([A, B, C]) {
	const AB = calculateDistance(A, B);
	const BC = calculateDistance(B, C);
	const CA = calculateDistance(C, A);

	return AB + BC > CA && AB + CA > BC && BC + CA > AB;
}

// Вычисляются длины сторон треугольника.
// Рассчитываются углы и площадь.
// Проверяется, является ли треугольник тупоугольным.
function calculateTriangleProperties([A, B, C]) {
	const AB = calculateDistance(A, B);
	const BC = calculateDistance(B, C);
	const CA = calculateDistance(C, A);

	const angles = calculateAngles(AB, BC, CA);
	const area = calculateArea(AB, BC, CA);
	const isObtuse = angles.some(angle => angle > 90);

	return isObtuse ? { vertices: [A, B, C], angles, area } : null;
}

// Вычисляется евклидово расстояние между двумя точками
function calculateDistance(p1, p2) {
	return Math.sqrt(
		Math.pow(p2.x - p1.x, 2) +
			Math.pow(p2.y - p1.y, 2) +
			Math.pow(p2.z - p1.z, 2)
	);
}

// Используется теорема косинусов для вычисления углов в треугольнике
function calculateAngles(a, b, c) {
	const angleA =
		Math.acos((b ** 2 + c ** 2 - a ** 2) / (2 * b * c)) * (180 / Math.PI);
	const angleB =
		Math.acos((a ** 2 + c ** 2 - b ** 2) / (2 * a * c)) * (180 / Math.PI);
	return [angleA, angleB, 180 - angleA - angleB];
}

// Используется формула Герона для вычисления площади треугольника
function calculateArea(a, b, c) {
	const s = (a + b + c) / 2;
	return Math.sqrt(s * (s - a) * (s - b) * (s - c));
}

// Вывод сообщения о начале прослушивания порта.
server.on('listening', () => {
	console.log(`Server listening on port ${port}`);
});

// Привязка сервера к заданному порту
server.bind(port);
