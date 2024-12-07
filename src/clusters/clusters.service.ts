// Импорт необходимых модулей из @nestjs/common, dgram, dotenv, netmask, и os.
import { Injectable } from '@nestjs/common';
import { createSocket } from 'dgram';
import * as dotenv from 'dotenv';
import { Netmask } from 'netmask';
import * as os from 'os';

// dotenv.config() загружает переменные окружения из файла .env
dotenv.config();

// Объявление класса ClustersService с аннотацией @Injectable(), что позволяет инжектировать его в другие компоненты.
// Поля:
// udpPorts: Список UDP-портов, загруженный из переменных окружения или использующий значения по умолчанию.
// nestPort: Порт для сервера NestJS, загруженный из переменных окружения или использующий значение по умолчанию.
// clientClusters: Массив кластеров, заданных клиентом.
// В конструкторе проверяется, если переменная окружения NODE_ENV имеет значение debug, запускается режим отладки.
@Injectable()
export class ClustersService {
	private udpPorts: number[] = process.env.UDP_PORTS
		? process.env.UDP_PORTS.split(',').map(port => parseInt(port, 10))
		: [41234, 41235, 5000, 6000];
	private nestPort: number = process.env.NEST_PORT
		? parseInt(process.env.NEST_PORT, 10)
		: 41231;
	private clientClusters: { ip: string; port: number }[] = []; // Массив кластеров от клиента

	constructor() {
		if (process.env.NODE_ENV === 'debug') {
			this.debugMode();
		}
	}

	// Метод setClientClusters обновляет список кластеров, заданных клиентом, и выводит их в консоль для отладки
	setClientClusters(clusters: { ip: string; port: number }[]): void {
		this.clientClusters = clusters;
		console.log('Client clusters set:', clusters); // Лог для отладки
	}

	// Метод scanNetwork сканирует сеть на наличие доступных кластеров.
	// Генерирует диапазоны IP-адресов и выполняет пинг по каждому IP-адресу и порту.
	// Возвращает список доступных кластеров
	async scanNetwork(): Promise<{ ip: string; port: number }[]> {
		const ipRanges = this.getLocalIpRanges();
		const networkPromises = ipRanges
			.flatMap(range => {
				const baseIp = range.base.split('.').slice(0, 3).join('.'); // Генерация IP-диапазонов
				return Array.from(
					{ length: range.lastOctet - range.firstOctet + 1 },
					(_, i) => `${baseIp}.${range.firstOctet + i}`
				);
			})
			.flatMap(ip => this.udpPorts.map(port => this.pingUdp(ip, port))); // Пинг по диапазону IP

		const results = await Promise.all(networkPromises);
		return results.filter(Boolean) as { ip: string; port: number }[];
	}

	// Метод pingUdp отправляет UDP-сообщение "ping" по заданному IP-адресу и порту.
	// Если ответ "pong" получен в течение 2 секунд, возвращает IP-адрес и порт. В противном случае возвращает null
	private pingUdp(
		ip: string,
		port: number
	): Promise<{ ip: string; port: number } | null> {
		return new Promise(resolve => {
			const socket = createSocket('udp4');
			const message = Buffer.from('ping');
			let timeout;

			socket.send(message, port, ip, err => {
				if (err) {
					clearTimeout(timeout);
					socket.close();
					return resolve(null);
				}

				timeout = setTimeout(() => {
					socket.close();
					resolve(null);
				}, 2000);

				socket.on('message', msg => {
					if (msg.toString() === 'pong') {
						clearTimeout(timeout);
						socket.close();
						resolve({ ip, port });
					}
				});

				socket.on('error', () => {
					socket.close();
					resolve(null);
				});
			});
		});
	}

	// Метод getLocalIpRanges получает диапазоны локальных IP-адресов для сканирования.
	// Фильтрует интерфейсы по параметрам IPv4 и ненаблюдаемым (не внутренним)
	private getLocalIpRanges(): {
		base: string;
		firstOctet: number;
		lastOctet: number;
	}[] {
		const nets = os.networkInterfaces();
		const ranges = [];

		for (const name of Object.keys(nets)) {
			for (const net of nets[name]) {
				// console.log(
				// 	`Interface: ${name}, IP: ${net.address}, Internal: ${net.internal}`
				// );
				// Фильтруем по интерфейсу, если это Ethernet или тот интерфейс, который нам нужен
				if (
					net.family === 'IPv4' &&
					!net.internal &&
					(net.address.startsWith(
						process.env.IP_BASIC_OCTETS ?? '192.168.1.'
					) ||
						name === 'Ethernet') // добавляем проверку на Ethernet интерфейс
				) {
					const block = new Netmask(net.cidr);
					const firstOctet = parseInt(block.first.split('.').pop() ?? '0');
					const lastOctet = parseInt(block.last.split('.').pop() ?? '255');
					ranges.push({ base: block.base, firstOctet, lastOctet });
				}
			}
		}

		return ranges;
	}

	// Метод distributeTasks распределяет задачи по кластерам.
	// Если нет доступных кластеров, задачи обрабатываются локально.
	// Задачи распределяются по кластерам с использованием UDP-сообщений и результат возвращается
	async distributeTasks(
		jsonData: any,
		ips: { ip: string; port: number }[]
	): Promise<any> {
		// Используем клиентские кластеры, если они заданы
		const clusters = this.clientClusters.length > 0 ? this.clientClusters : ips;

		// console.log('Distribute tasks: Using clusters:', clusters); // Лог для отладки

		if (this.clientClusters.length === 0) {
			console.warn(
				'No available IPs for task distribution, processing locally.'
			);
			return this.processTasksLocally(jsonData); // Обработка локально, если кластеров нет
		}

		const points = jsonData.points;
		const tasks = this.createTriangleTasks(points).map(task => [
			{ x: task[0].x, y: task[0].y, z: task[0].z },
			{ x: task[1].x, y: task[1].y, z: task[1].z },
			{ x: task[2].x, y: task[2].y, z: task[2].z }
		]);

		const socket = createSocket('udp4');
		socket.bind(this.nestPort);

		const results: any[] = [];
		for (const task of tasks) {
			const { ip, port } =
				clusters[Math.floor(Math.random() * clusters.length)];
			try {
				const result = await this.sendUdpTask(socket, ip, port, [task]);
				results.push(...result);
			} catch (err) {
				console.error(`Error processing task for ${ip}:${port}`, err);
			}
		}

		socket.close();
		return results;
	}

	// Метод processTasksLocally обрабатывает задачи локально, если нет доступных кластеров.
	// Создает задачи, проверяет их валидность и вычисляет свойства треугольников
	private processTasksLocally(jsonData: any): any[] {
		// Локальная обработка задач
		console.log('Processing tasks locally...');
		const points = jsonData.points;
		const tasks = this.createTriangleTasks(points);

		return tasks
			.map(task => {
				if (
					task.length === 3 &&
					this.isValidTriangle(task as [any, any, any])
				) {
					return this.calculateTriangleProperties(task as [any, any, any]);
				}
				return null;
			})
			.filter(result => result !== null);
	}

	// Создание задач по всем возможным треугольникам
	private createTriangleTasks(
		points: { x: number; y: number; z: number }[]
	): { x: number; y: number; z: number }[][] {
		const tasks = [];
		for (let i = 0; i < points.length; i++) {
			for (let j = i + 1; j < points.length; j++) {
				for (let k = j + 1; k < points.length; k++) {
					tasks.push([points[i], points[j], points[k]]);
				}
			}
		}
		return tasks;
	}

	// Методы схожие с кластерными
	private isValidTriangle([A, B, C]): boolean {
		const AB = this.calculateDistance(A, B);
		const BC = this.calculateDistance(B, C);
		const CA = this.calculateDistance(C, A);
		return AB + BC > CA && AB + CA > BC && BC + CA > AB;
	}

	private calculateTriangleProperties([A, B, C]) {
		const AB = this.calculateDistance(A, B);
		const BC = this.calculateDistance(B, C);
		const CA = this.calculateDistance(C, A);

		const angles = this.calculateAngles(AB, BC, CA);
		const area = this.calculateArea(AB, BC, CA);
		const isObtuse = angles.some(angle => angle > 90);

		return isObtuse ? { vertices: [A, B, C], angles, area } : null;
	}

	private calculateDistance(p1, p2): number {
		return Math.sqrt(
			Math.pow(p2.x - p1.x, 2) +
				Math.pow(p2.y - p1.y, 2) +
				Math.pow(p2.z - p1.z, 2)
		);
	}

	private calculateAngles(a: number, b: number, c: number): number[] {
		const angleA =
			Math.acos((b ** 2 + c ** 2 - a ** 2) / (2 * b * c)) * (180 / Math.PI);
		const angleB =
			Math.acos((a ** 2 + c ** 2 - b ** 2) / (2 * a * c)) * (180 / Math.PI);
		return [angleA, angleB, 180 - angleA - angleB];
	}

	private calculateArea(a: number, b: number, c: number): number {
		const s = (a + b + c) / 2;
		return Math.sqrt(s * (s - a) * (s - b) * (s - c));
	}

	// sendUdpTask: Метод для отправки задачи по UDP и ожидания ответа. Если ответ получен, возвращается результат.
	private sendUdpTask(
		socket,
		ip: string,
		port: number,
		data: any
	): Promise<any> {
		return new Promise((resolve, reject) => {
			const message = Buffer.from(JSON.stringify(data));
			console.log(`Sending message to ${ip}:${port}: ${message.toString()}`);

			const timeout = setTimeout(() => {
				console.warn(`Timeout waiting for response from ${ip}:${port}`);
				resolve([]);
			}, 2000);

			socket.send(message, port, ip, err => {
				if (err) {
					clearTimeout(timeout);
					console.error(`Error sending message to ${ip}:${port}`, err);
					reject(err);
				} else {
					socket.once('message', msg => {
						clearTimeout(timeout);
						try {
							const response = JSON.parse(msg.toString());
							resolve(response);
						} catch {
							console.warn(`Invalid JSON response from ${ip}:${port}`);
							resolve([]);
						}
					});
				}
			});
		});
	}

	// debugMode: Метод для режима отладки. Запускает регулярное сканирование сети каждые 3 секунды, если клиентские кластеры не заданы, и логирует найденные IP-адреса.
	private async debugMode() {
		if (this.clientClusters.length === 0) {
			// Только если кластеры не заданы, проводим поиск
			setInterval(async () => {
				const ips = await this.scanNetwork();
				console.log('Debug mode: Found UDP clients:', ips);
			}, 3000);
		} else {
			console.log('Debug mode: No network scan as clusters are set');
		}
	}
}
