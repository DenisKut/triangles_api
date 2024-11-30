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
		const availableIps = results.filter(result => result !== null) as {
			ip: string;
			port: number;
		}[];

		console.log('Available IPs:', availableIps);
		return availableIps;
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

		console.log('Local IP ranges:', ranges);
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
		const tasks = this.createTriangleTasks(points);
		const socket = createSocket('udp4');
		socket.bind(this.nestPort);

		const taskPromises = [];
		tasks.forEach((task, index) => {
			const ipObj = ips[index % ips.length];
			console.log(
				`Sending task ${JSON.stringify(task)} to ${ipObj.ip}:${ipObj.port}`
			);
			taskPromises.push(this.sendUdpTask(socket, ipObj.ip, ipObj.port, task));
		});

		const results = await Promise.allSettled(taskPromises);
		console.log('All tasks distributed');
		console.log('Task results:', results);
		console.log('============================');

		const validResults = results.filter(
			(result): result is PromiseFulfilledResult<any> =>
				result.status === 'fulfilled' && result.value !== null
		);
		const obtuseTriangles = validResults
			.map(result => result.value)
			.flat()
			.filter((triangle: any) => triangle !== null);
		obtuseTriangles.forEach((triangle, index) => {
			console.log(`Obtuse triangle ${index}:`, triangle);
		});
		console.log('Final obtuse triangles:', obtuseTriangles);
		return obtuseTriangles;
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
			const message = Buffer.from(JSON.stringify([data]));
			console.log(`Sending message to ${ip}:${port}: ${message.toString()}`);

			const timeout = setTimeout(() => {
				console.warn(`Timeout waiting for response from ${ip}:${port}`);
				cleanup();
				resolve([]);
			}, 2000);

			const messageHandler = msg => {
				console.log(
					`Raw MSG received from ${ip}:${port}: ${msg.toString().trim()}`
				);

				try {
					const response = JSON.parse(msg.toString().trim());
					console.log(
						`Parsed response from ${ip}:${port}: ${JSON.stringify(response)}`
					);

					if (response && Array.isArray(response) && response.length > 0) {
						cleanup();
						resolve(response);
					} else {
						console.warn(`Empty or invalid response from ${ip}:${port}`);
						cleanup();
						resolve([]);
					}
				} catch (error) {
					console.error(`Error parsing response from ${ip}:${port}`, error);
					cleanup();
					resolve([]);
				}
			};

			const errorHandler = err => {
				console.error(`Socket error with ${ip}:${port}`, err);
				cleanup();
				reject(err);
			};

			const cleanup = () => {
				clearTimeout(timeout);
				socket.off('message', messageHandler);
				socket.off('error', errorHandler);
			};

			socket.send(message, port, ip, err => {
				if (err) {
					console.error(`Error sending message to ${ip}:${port}`, err);
					cleanup();
					return reject(err);
				}
				console.log(`Message successfully sent to ${ip}:${port}`);
				socket.on('message', messageHandler);
				socket.on('error', errorHandler);
			});
		});
	}
}
