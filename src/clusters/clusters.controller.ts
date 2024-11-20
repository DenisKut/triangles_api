import { Controller, Get, Sse } from '@nestjs/common';
import { Observable, interval } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { ClustersService } from './clusters.service';

@Controller('clusters')
export class ClustersController {
	constructor(private readonly clustersService: ClustersService) {}

	@Get()
	async getClusters(): Promise<string[]> {
		return await this.clustersService.scanNetwork();
	}

	@Sse('stream')
	streamClusters(): Observable<{ data: string[] }> {
		return interval(1000).pipe(
			switchMap(() => this.clustersService.scanNetwork()),
			map(clusters => ({ data: clusters }))
		);
	}
}
