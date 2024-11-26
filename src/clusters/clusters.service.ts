import { Injectable } from '@nestjs/common';
import { createSocket } from 'dgram';
import * as dotenv from 'dotenv';
import { Netmask } from 'netmask';
import { networkInterfaces } from 'os';

dotenv.config();

@Injectable()
export class ClustersService {
	private udpPorts: number[] = [41234, 41235, 5000, 6000]; // Диапазон портов для проверки
	private knownIps = ['192.168.1.100', '192.168.1.101'];

	constructor() {
		if (process.env.NODE_ENV === 'debug') {
			this.debugMode();
		}
	}

	async scanNetwork(): Promise<{ ip: string; port: number }[]> {
		const knownIpPromises = this.knownIps.flatMap(ip =>
			this.udpPorts.map(port => this.pingUdp(ip, port))
		);
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

		const results = await Promise.all([...knownIpPromises, ...networkPromises]);
		const availableIps = results.filter(result => result !== null) as {
			ip: string;
			port: number;
		}[];

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
				}, 1000); // Timeout через 1 секунду

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
		}, 3000); // Вывод каждые 3 секунды
	}

	async distributeTasks(
		jsonData: any,
		ips: { ip: string; port: number }[]
	): Promise<any> {
		const socket = createSocket('udp4');
		const results = await Promise.all(
			ips.map(ipObj => this.sendUdpTask(socket, ipObj.ip, ipObj.port, jsonData))
		);
		return results;
	}

	private sendUdpTask(
		socket,
		ip: string,
		port: number,
		data: any
	): Promise<any> {
		return new Promise((resolve, reject) => {
			const message = Buffer.from(JSON.stringify(data));
			socket.send(message, port, ip, err => {
				if (err) {
					return reject(err);
				}

				socket.once('message', msg => {
					resolve(JSON.parse(msg.toString()));
				});

				socket.on('error', err => {
					reject(err);
				});
			});
		});
	}
}
