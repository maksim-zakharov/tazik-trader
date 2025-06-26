import { Logger, Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AppService } from './app.service';
import { AlorApi, Endpoint, WssEndpoint, WssEndpointBeta } from 'alor-api';
import { TradingService } from './trading/trading.service';
import * as path from 'path';

const envFilePath = path.resolve('.env');

const logger = new Logger('AppModule');

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath,
    }),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: AlorApi,
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => {
        const client = new AlorApi({
          token: configService.get<string>('ALOR_REFRESH_TOKEN'),
          endpoint: Endpoint.PROD,
          wssEndpoint: WssEndpoint.PROD,
          wssEndpointBeta: WssEndpointBeta.PROD,
        });

        client.subscriptions.setMaxListeners(0);

        await client.refresh();

        logger.log(`AlorApi initialized`);

        return client;
      },
    },
    TradingService,
  ],
})
export class AppModule {}
