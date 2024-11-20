import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ClustersModule } from './clusters/clusters.module';

@Module({
  imports: [ClustersModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
