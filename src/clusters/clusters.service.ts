import { Injectable } from '@nestjs/common';
import { createConnection } from 'net';
import { Netmask } from 'netmask';
import { networkInterfaces } from 'os';

@Injectable()
export class ClustersService {
	private port: number = 80; // Порт для проверки

	async scanNetwork(): Promise<string[]> {
		const ipRanges = this.getLocalIpRanges();
		const promises = [];

		ipRanges.forEach(range => {
			for (let i = range.firstOctet; i <= range.lastOctet; i++) {
				const ip = `${range.base}.${i}`;
				promises.push(this.checkConnection(ip, this.port));
			}
		});

		const results = await Promise.all(promises);
		const availableIps = results.filter(ip => ip !== null);
		if (availableIps.length === 0) {
			console.log('No available IP addresses found in the network.');
		} else {
			console.log('Available IP addresses:', availableIps);
		}
		return availableIps;
	}

	private checkConnection(ip: string, port: number): Promise<string | null> {
		return new Promise(resolve => {
			const socket = createConnection({ host: ip, port }, () => {
				socket.destroy();
				resolve(ip);
			});

			socket.on('error', () => {
				socket.destroy();
				resolve(null);
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
				if (net.family === 'IPv4' && !net.internal) {
					const block = new Netmask(net.cidr);
					ranges.push({
						base: block.base,
						firstOctet: block.first.split('.').pop(),
						lastOctet: block.last.split('.').pop()
					});
				}
			}
		}

		return ranges;
	}
}
