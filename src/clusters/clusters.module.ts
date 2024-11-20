import { Module } from '@nestjs/common';
import { ClustersService } from './clusters.service';
import { ClustersGateway } from './clusters.gateway';

@Module({
  providers: [ClustersGateway, ClustersService],
})
export class ClustersModule {}
