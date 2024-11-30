import { Injectable } from '@nestjs/common';
import { createSocket } from 'dgram';
import * as dotenv from 'dotenv';
import { Netmask } from 'netmask';
import { networkInterfaces } from 'os';

dotenv.config();

@Injectable()
export class ClustersService {
	private udpPorts: number[] = process.env.UDP_PORTS
		? process.env.UDP_PORTS.split(',').map(port => parseInt(port, 10))
		: [41234, 41235, 5000, 6000];
	private nestPort: number = process.env.NEST_PORT
		? parseInt(process.env.NEST_PORT, 10)
		: 41231;

	constructor() {
		if (process.env.NODE_ENV === 'debug') {
			this.debugMode();
		}
	}

	async scanNetwork(): Promise<{ ip: string; port: number }[]> {
		const ipRanges = this.getLocalIpRanges();
		const networkPromises = ipRanges
			.flatMap(range => {
				const baseIp = range.base.split('.').slice(0, 3).join('.');
				return Array.from(
					{ length: range.lastOctet - range.firstOctet + 1 },
					(_, i) => `${baseIp}.${range.firstOctet + i}`
				);
			})
			.flatMap(ip => this.udpPorts.map(port => this.pingUdp(ip, port)));

		const results = await Promise.all(networkPromises);
		return results.filter(Boolean) as { ip: string; port: number }[];
	}

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

	private getLocalIpRanges(): {
		base: string;
		firstOctet: number;
		lastOctet: number;
	}[] {
		const nets = networkInterfaces();
		const ranges = [];

		for (const name of Object.keys(nets)) {
			for (const net of nets[name]) {
				if (
					net.family === 'IPv4' &&
					!net.internal &&
					net.address.startsWith(process.env.IP_BASIC_OCTETS ?? '192.168.1.')
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

	private async debugMode() {
		setInterval(async () => {
			const ips = await this.scanNetwork();
			console.log('Debug mode: Found UDP clients:', ips);
		}, 3000);
	}

	async distributeTasks(
		jsonData: any,
		ips: { ip: string; port: number }[]
	): Promise<any> {
		if (!ips.length) {
			console.error('No available IPs for task distribution');
			return [];
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
			const { ip, port } = ips[Math.floor(Math.random() * ips.length)];
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

	private createTriangleTasks(
		points: { x: number; y: number; z: number }[]
	): any[] {
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
				resolve([]); // Возвращаем пустой результат при таймауте
			}, 2000);

			socket.send(message, port, ip, err => {
				if (err) {
					clearTimeout(timeout); // Таймер сбрасывается в случае ошибки
					console.error(`Error sending message to ${ip}:${port}`, err);
					reject(err);
				} else {
					socket.once('message', msg => {
						clearTimeout(timeout); // Таймер сбрасывается при успешном получении
						try {
							const response = JSON.parse(msg.toString());
							resolve(response);
						} catch {
							console.warn(`Invalid JSON response from ${ip}:${port}`);
							resolve([]); // Возвращаем пустой результат в случае ошибки JSON
						}
					});
				}
			});
		});
	}
}
