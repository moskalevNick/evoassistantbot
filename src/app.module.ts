import { ZoomService } from './zoom.service';
import { Module } from '@nestjs/common';
import { TelegrafModule } from 'nestjs-telegraf';
import { BotUpdate } from './bot.update';
import { PrismaModule } from './prisma/prisma.module';
require('dotenv').config();

@Module({
  imports: [
    TelegrafModule.forRoot({
      token: process.env.BOT_TOKEN,
    }),
    PrismaModule,
  ],
  controllers: [],
  providers: [BotUpdate, ZoomService],
})
export class AppModule {}
