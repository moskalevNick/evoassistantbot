import { Injectable } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import zoomApi from 'zoomapi';
import { PrismaService } from './prisma/prisma.service';

type zoomServiceType = {
  start_time: number;
  duration?: number;
  userChatIds: number[];
  topic: string;
};

type zoomServiceEditType = {
  meetingId: string;
  duration?: number;
  userIDs?: string[];
  topic?: string;
};

@Injectable()
export class ZoomService {
  constructor(private prisma: PrismaService) {}

  async newMeeting({
    start_time,
    duration = 40,
    userChatIds,
    topic,
  }: zoomServiceType) {
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

  async editMeet({ meetingId, duration, userIDs, topic }: zoomServiceEditType) {
    const users: User[] = [];

    for (const userId of userIDs) {
      const user = await this.prisma.user.findFirst({
        where: {
          id: userId,
        },
      });

      if (user) {
        users.push(user);
      }
    }

    const data: Prisma.MeetingUncheckedUpdateInput = {
      duration,
      userIDs,
      topic,
    };

    await this.prisma.meeting.update({
      where: { id: meetingId },
      data: { ...data },
    });
  }
}
