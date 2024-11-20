import {
	ConnectedSocket,
	MessageBody,
	SubscribeMessage,
	WebSocketGateway,
	WebSocketServer
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ClustersService } from './clusters.service';

@WebSocketGateway({
	cors: {
		origin: '*'
	}
})
export class ClustersGateway {
	@WebSocketServer() server: Server;
	private clients: Socket[] = [];

	constructor(private readonly clustersService: ClustersService) {
		setInterval(async () => {
			const clusters = await this.clustersService.scanNetwork();
			this.broadcastClusters(clusters);
		}, 500);
	}

	handleConnection(client: Socket) {
		this.clients.push(client);
		console.log(`Client connected: ${client.id}`);
	}

	handleDisconnect(client: Socket) {
		this.clients = this.clients.filter(c => c !== client);
		console.log(`Client disconnected: ${client.id}`);
	}

	private broadcastClusters(clusters: string[]) {
		this.clients.forEach(client => {
			client.emit('scanner', clusters);
		});
	}

	@SubscribeMessage('customMessage')
	handleCustomMessage(
		@MessageBody() data: any,
		@ConnectedSocket() client: Socket
	): void {
		console.log('Received custom message:', data);
		// Обработка сообщения и отправка ответа клиенту
		client.emit('response', { message: 'Custom message received' });
	}

	@SubscribeMessage('calculate')
	async handleCalculate(
		@MessageBody() data: { ips: string[] },
		@ConnectedSocket() client: Socket
	): Promise<void> {
		console.log('Received calculation request with IPs:', data.ips);
		// Пример обработки: просто вернуть список IP-адресов обратно
		const calculatedData = data.ips.map(ip => `Processed ${ip}`);
		client.emit('calculationResult', { result: calculatedData });
	}
}
