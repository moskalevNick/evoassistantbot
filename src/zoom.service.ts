import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import zoomApi from 'zoomapi';
import { PrismaService } from './prisma/prisma.service';

type zoomServiceTyp = {
  start_time: number;
  duration?: number;
  userChatIds: number[];
  topic: string;
};

@Injectable()
export class ZoomService {
  constructor(private prisma: PrismaService) {}
  async newMeeting({
    start_time,
    duration = 40,
    userChatIds,
    topic,
  }: zoomServiceTyp) {
    const client = zoomApi({
      apiKey: process.env.ZOOM_API_KEY,
      apiSecret: process.env.ZOOM_API_SECRET,
    });
    const { users } = await client.users.ListUsers();
    const newMeet = await client.meetings.CreateMeeting(users[0].id, {
      start_time: new Date(start_time).toISOString(),
      duration: duration,
      timezone: 'Europe/Minsk',
      topic,
    });

    const currentUserIDs = [];

    for (const chatId of userChatIds) {
      const user = await this.prisma.user.findFirst({
        where: { chatId },
      });

      if (user && !currentUserIDs.includes(user?.id)) {
        currentUserIDs.push(user.id);
      }
    }

    const data: Prisma.MeetingUncheckedCreateInput = {
      topic: newMeet.topic,
      start_time: newMeet.start_time,
      duration: newMeet.duration,
      start_url: newMeet.start_url,
      userIDs: currentUserIDs,
    };

    return this.prisma.meeting.create({
      data,
    });
  }
}
