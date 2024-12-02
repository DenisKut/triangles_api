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
		}, 5000); // Обновление списка кластеров каждые 5 секунд
	}

	handleConnection(client: Socket) {
		this.clients.push(client);
		console.log(`Client connected: ${client.id}`);
	}

	handleDisconnect(client: Socket) {
		this.clients = this.clients.filter(c => c !== client);
		console.log(`Client disconnected: ${client.id}`);
	}

	private broadcastClusters(clusters: { ip: string; port: number }[]) {
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
		client.emit('response', { message: 'Custom message received' });
	}

	@SubscribeMessage('uploadJson')
	async handleUploadJson(
		@MessageBody() data: { jsonContent: string },
		@ConnectedSocket() client: Socket
	): Promise<void> {
		console.log('Received JSON file:', data.jsonContent);
		const jsonData = JSON.parse(data.jsonContent);
		const clusters = await this.clustersService.scanNetwork();
		const results = await this.clustersService.distributeTasks(
			jsonData,
			clusters
		);
		console.log('Obtuse triangles:', JSON.stringify(results));

		client.emit('uploadResult', {
			message: 'JSON file processed successfully',
			data: results
		});

		console.log('Sent upload result to client:', client.id);
	}

	@SubscribeMessage('setClusters')
	handleSetClusters(
		@MessageBody() data: { clusters: { ip: string; port: number }[] },
		@ConnectedSocket() client: Socket
	): void {
		if (Array.isArray(data.clusters)) {
			this.clustersService.setClientClusters(data.clusters);
			console.log('Client-defined clusters updated:', data.clusters);
			client.emit('response', { message: 'Clusters updated successfully' });
		} else {
			client.emit('response', { message: 'Invalid cluster data' });
		}
	}
}
