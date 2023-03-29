import { Prisma, User } from '@prisma/client';
import { InjectBot, Start, Update, Action, Command } from 'nestjs-telegraf';
import { message } from 'telegraf/filters';
import { Context, Telegraf, Markup } from 'telegraf';
import { ZoomService } from './zoom.service';
import { PrismaService } from './prisma/prisma.service';
require('dotenv').config();

@Update()
export class BotUpdate {
  constructor(
    @InjectBot() private readonly bot: Telegraf<Context>,
    private zoomService: ZoomService,
    private prisma: PrismaService,
  ) {}
  private readableDate: number;
  private requestMeetToChatId: number;
  private requestMeetFrom: any;
  private monthArr = [
    'января',
    'февраля',
    'марта',
    'апреля',
    'мая',
    'июня',
    'июля',
    'августа',
    'сентября',
    'октября',
    'ноября',
    'декабря',
  ];
  private isFirstRequest: boolean;
  private isSecondRequest: boolean;
  private isMeetingTheme: boolean;
  private meetingTheme: string;

  @Action('start')
  @Command('start')
  @Start()
  async startCommand(ctx: Context) {
    const chat = await ctx.getChat();
    const from = ctx.message && ctx.message.from.first_name;

    await this.bot.telegram.sendMessage(
      chat.id,
      from
        ? `Привет, ${from} 👋 это официальный бот-помощник EVO-controls.`
        : 'Выберите опцию: ',
      Markup.inlineKeyboard([
        // [Markup.button.callback(`Добавить лид`, 'addLead')],
        // [Markup.button.callback('Добавить сделку', 'addDeal')],
        [Markup.button.callback('Совещания', 'meetings')],
        // [
        //   Markup.button.callback(
        //     'Узнать статус проекта в сборке',
        //     'getProjectStatus',
        //   ),
        // ],
        // [Markup.button.callback('Запрос складского запаса', 'getStorage')],
        [Markup.button.callback('Запрос ID чата', 'getChatID')],
      ]),
    );
  }

  @Command('getchatid')
  @Action('getChatID')
  async getChatID(ctx: Context) {
    const chat = await ctx.getChat();
    await this.bot.telegram.sendMessage(chat.id, `Ваш ID чата: ${chat.id}`);
  }

  @Command('addlead')
  @Action('addLead')
  async addLead(ctx: Context) {
    const chat = await ctx.getChat();

    await this.bot.telegram.sendMessage(
      chat.id,
      'Добавление лида: ',
      Markup.inlineKeyboard([
        [Markup.button.callback(`Новый партнёр`, 'addPartner')],
        [Markup.button.callback(`Корпоративный конечник`, 'addCorporate')],
        [Markup.button.callback(`Частный конечник`, 'addPartial')],
        [Markup.button.callback(`Назад`, 'start')],
      ]),
    );
  }

  @Action('addPartner')
  async sendFeedback(ctx: Context) {
    const chat = await ctx.getChat();

    await this.bot.telegram.sendMessage(
      chat.id,
      'Добавление партнёра: ',
      Markup.inlineKeyboard([
        [Markup.button.callback(`Новый интегратор`, 'addIntegrator')],
        [Markup.button.callback(`Новый агент`, 'addAgent')],
        [Markup.button.callback(`Новый дилер`, 'addDealer')],
        [Markup.button.callback(`Запрос на интеграцию`, 'addIntegration')],
        [Markup.button.callback(`Назад`, 'addLead')],
      ]),
    );
  }

  @Command('meetings')
  @Action('meetings')
  async meetings(ctx: Context) {
    const chat = await ctx.getChat();

    await this.bot.telegram.sendMessage(
      chat.id,
      'Совещания: ',
      Markup.inlineKeyboard([
        [
          Markup.button.callback(
            `Консультация с коллегой`,
            'meetingWithColleague',
          ),
        ],
        // [
        //   Markup.button.callback(
        //     `Консультация со всем отделом`,
        //     'meetingWithDepartment',
        //   ),
        // ],
        [
          Markup.button.callback(
            `Запрос списка планируемых со мной совещаний`,
            'listOfMeetings',
          ),
        ],
        [Markup.button.callback(`Назад`, 'start')],
      ]),
    );
  }

  @Action('meetingWithColleague')
  async meetingWithColleague(ctx: Context) {
    const chat = await ctx.getChat();

    let collegues: User[] = await this.prisma.user.findMany();
    // const users: User[] = await this.prisma.user.findMany();
    // const collegues = users.filter((collegue) => collegue.chatId !== chat.id);

    if (collegues.length) {
      await this.bot.telegram.sendMessage(
        chat.id,
        'Сделайте выбор: ',
        Markup.inlineKeyboard([
          collegues.map((collegue) =>
            Markup.button.callback(
              `${collegue.name}`,
              `requestMeeting-${collegue.chatId}`,
            ),
          ),
        ]),
      );
    } else {
      await this.bot.telegram.sendMessage(chat.id, 'Коллеги не найдены');
    }
  }

  @Action(/^requestMeeting-(\d+)$/)
  async requestMeeting(ctx: any) {
    const chat = await ctx.getChat();

    this.requestMeetToChatId = ctx.match[1];

    await this.bot.telegram.sendMessage(chat.id, 'Напишите тему совещания');

    this.isMeetingTheme = true;

    this.bot.on(message(), async (ctx: any) => {
      if (this.isMeetingTheme) {
        this.meetingTheme = ctx.update.message.text;

        await this.bot.telegram.sendMessage(
          chat.id,
          `Тема для совещания ${this.meetingTheme}`,
        );

        this.isMeetingTheme = false;

        await this.bot.telegram.sendMessage(
          chat.id,
          'Напишите желаемую дату в формате 27 марта 12:00',
        );

        this.isFirstRequest = true;
        return;
      } else if (this.isFirstRequest) {
        const newMeetingDate = ctx.update.message.text;

        try {
          const dateTimeArr = newMeetingDate.split(' ');
          const timeArr = dateTimeArr[2].split(':');

          this.readableDate = new Date(
            Number(new Date().getFullYear()),
            Number(this.monthArr.indexOf(dateTimeArr[1])),
            Number(dateTimeArr[0]),
          ).setHours(Number(timeArr[0]) + 3, Number(timeArr[1]));
        } catch (e) {
          await this.bot.telegram.sendMessage(chat.id, `Неверный формат даты`);
          return;
        }
        if (this.readableDate < Number(new Date())) {
          await this.bot.telegram.sendMessage(chat.id, `Дата прошла`);
          return;
        } else {
          this.requestMeetFrom = chat;

          await this.bot.telegram.sendMessage(
            this.requestMeetToChatId,
            `Пользователь ${this.requestMeetFrom.username} просит конференции ${newMeetingDate}`,
            Markup.inlineKeyboard([
              [Markup.button.callback(`Принять`, `createMeeting`)],
              [
                Markup.button.callback(
                  `Отклонить`,
                  `rejectMeeting-${this.requestMeetFrom.id}`,
                ),
              ],
              [
                Markup.button.callback(
                  `Предложить другое время`,
                  `requestAnotherTime`,
                ),
              ],
            ]),
          );
          this.isFirstRequest = false;

          return this.bot.telegram.sendMessage(
            chat.id,
            `Запрос конференции отправлен, ожидайте подтверждения`,
          );
        }
      } else if (this.isSecondRequest) {
        const newMeetingDate = ctx.update.message.text;

        try {
          const dateTimeArr = newMeetingDate.split(' ');
          const timeArr = dateTimeArr[2].split(':');

          this.readableDate = new Date(
            Number(new Date().getFullYear()),
            Number(this.monthArr.indexOf(dateTimeArr[1])),
            Number(dateTimeArr[0]),
          ).setHours(Number(timeArr[0]) + 3, Number(timeArr[1]));
        } catch (e) {
          await this.bot.telegram.sendMessage(chat.id, `Неверный формат даты`);
          return;
        }

        if (this.readableDate < Number(new Date())) {
          await this.bot.telegram.sendMessage(chat.id, `Дата прошла`);
          return;
        } else {
          await this.bot.telegram.sendMessage(
            this.requestMeetFrom.id,
            `В ответ на ваш запрос предложено время ${newMeetingDate}`,
            Markup.inlineKeyboard([
              [Markup.button.callback(`Принять`, `createMeeting`)],
              [
                Markup.button.callback(
                  `Отклонить`,
                  `rejectMeeting-${this.requestMeetFrom.id}`,
                ),
              ],
            ]),
          );
        }

        this.isSecondRequest = false;
      }
      this.isFirstRequest = false;
      this.isSecondRequest = false;
      this.isMeetingTheme = false;
    });
  }

  @Action('createMeeting')
  async createMeeting(ctx: any) {
    const chat = await ctx.getChat();

    const newMeet = await this.zoomService.newMeeting({
      start_time: this.readableDate,
      userChatIds: [
        Number(this.requestMeetToChatId),
        Number(this.requestMeetFrom.id),
      ],
      topic: this.meetingTheme,
    });

    const oneHour = 60 * 60 * 1000;
    const timeToRemind =
      this.readableDate - 3 * oneHour - Number(new Date()) - oneHour;

    setTimeout(async () => {
      await this.bot.telegram.sendMessage(
        this.requestMeetToChatId,
        `До совещания остался 1 час. \n${newMeet.start_url}`,
      );
    }, timeToRemind);

    await this.bot.telegram.sendMessage(
      this.requestMeetToChatId,
      `Ссылка на совещание:\n${newMeet.start_url}`,
    );

    await this.bot.telegram.sendMessage(
      this.requestMeetFrom.id,
      `Вас приглашает ${chat.first_name} ${
        chat.last_name ? chat.last_name : ''
      }на совещание:\n${newMeet.start_url}`,
    );
  }

  @Action(/^rejectMeeting-(\d+)$/)
  async rejectMeeting(ctx: any) {
    const chat = await ctx.getChat();

    const adresser = ctx.match[1];

    await this.bot.telegram.sendMessage(adresser, 'В конференции отказано');
    await this.bot.telegram.sendMessage(chat.id, 'В конференции отказано');
  }

  @Action('requestAnotherTime')
  async requestAnotherTime(ctx: any) {
    const chat = await ctx.getChat();

    await this.bot.telegram.sendMessage(
      chat.id,
      'Напишите дату в формате 27 марта 12:00',
    );

    this.isSecondRequest = true;
  }

  @Action('listOfMeetings')
  async listOfMeetings(ctx: any) {
    const chat = await ctx.getChat();

    const currentUser = await this.prisma.user.findFirst({
      where: { chatId: chat.id },
    });

    const userMeetings = await this.prisma.meeting.findMany({
      where: {
        userIDs: { hasSome: currentUser.id },
        start_time: { gt: new Date() },
      },
    });

    await this.bot.telegram.sendMessage(
      chat.id,
      `У вас ${userMeetings.length} совещаний: `,
    );

    // const sortesMeetings = userMeetings.sort((a, b) => {
    //   console.log(Number(a.start_time) - Number(b.start_time));

    //   return Number(a.start_time) - Number(b.start_time);
    // });

    userMeetings.forEach(async (meeting) => {
      let opponentNamesString: string = '';

      for (const userID of meeting.userIDs) {
        const opponent = await this.prisma.user.findFirst({
          where: {
            id: userID,
          },
        });
        opponentNamesString = opponentNamesString + `${opponent.name}, `;
      }

      await this.bot.telegram.sendMessage(
        chat.id,
        `<b>Совещание с ${opponentNamesString} ${meeting.start_time.toLocaleDateString(
          'ru-RU',
          {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          },
        )} в ${meeting.start_time.toLocaleTimeString('ru-RU', {
          hour: '2-digit',
          minute: '2-digit',
        })}</b>
        \nТема: ${meeting.topic}
        \nCсылка: <a href="${meeting.start_url}">🔗</a>`,
        { parse_mode: 'HTML' },
      );
    });
  }

  @Command('adddeal')
  @Command('projectstatus')
  @Command('getstorage')
  @Action('getStorage')
  @Action('getProjectStatus')
  @Action('addIntegrator')
  @Action('addAgent')
  @Action('addDealer')
  @Action('addIntegration')
  @Action('addCorporate')
  @Action('addPartial')
  @Action('addDeal')
  async inProgress(ctx: Context) {
    const chat = await ctx.getChat();

    await this.bot.telegram.sendMessage(chat.id, 'в процессе разработки');
  }
}
