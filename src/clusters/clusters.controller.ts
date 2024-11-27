import { Controller, Get } from '@nestjs/common';
import { ClustersService } from './clusters.service';

@Controller('clusters')
export class ClustersController {
	constructor(private readonly clustersService: ClustersService) {}

	@Get('available')
	async getAvailableClusters(): Promise<{ ip: string; port: number }[]> {
		return await this.clustersService.scanNetwork();
	}
}
