import { Meeting, Prisma, User } from '@prisma/client';
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
  private rawDate: string;
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
  private isOfflineMeeting: boolean;
  private isGeneralMeetingTheme: boolean;
  private isGeneralMeetingDate: boolean;
  private meetingTheme: string;
  private generalMeetingTheme: string;
  private generalMeet: Meeting;

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
        [Markup.button.callback('Общее совещание', 'requestMeeting-0')],
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

    // const collegues: User[] = await this.prisma.user.findMany();
    const users: User[] = await this.prisma.user.findMany({
      orderBy: { name: 'asc' },
    });
    const collegues = users.filter((collegue) => collegue.chatId !== chat.id);

    if (collegues.length) {
      await this.bot.telegram.sendMessage(
        chat.id,
        'Сделайте выбор: ',
        Markup.inlineKeyboard(
          collegues.map((collegue) =>
            Array(
              Markup.button.callback(
                `${collegue.name}`,
                `requestMeeting-${collegue.chatId}`,
              ),
            ),
          ),
        ),
      );
    } else {
      await this.bot.telegram.sendMessage(chat.id, 'Коллеги не найдены');
    }
  }

  @Action(/^requestAddToGeneralMeeting-(\d+)$/)
  async requestAddToGeneralMeeting(ctx: any) {
    const chat = await ctx.getChat();

    const currentMeeting = await this.prisma.meeting.findFirst({
      where: {
        id: this.generalMeet.id,
      },
    });

    if (ctx.match[1] === 0) {
      await this.bot.telegram.sendMessage(
        chat.id,
        `<b>Совещание ${currentMeeting.start_time.toLocaleDateString('ru-RU', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })} в ${currentMeeting.start_time.toLocaleTimeString('ru-RU', {
          hour: '2-digit',
          minute: '2-digit',
        })}</b>
          \n<b>Тема</b>: ${currentMeeting.topic}
          \n<b>Cсылка</b>: <a href="${currentMeeting.join_url}">🔗</a>`,
        { parse_mode: 'HTML' },
      );
      return;
    }

    this.requestMeetToChatId = ctx.match[1];

    const currentUser = await this.prisma.user.findFirst({
      where: {
        chatId: Number(this.requestMeetToChatId),
      },
    });

    if (currentMeeting) {
      await this.zoomService.editMeet({
        meetingId: this.generalMeet.id,
        userIDs: [...currentMeeting.userIDs, currentUser.id],
      });

      await this.bot.telegram.sendMessage(
        chat.id,
        `${currentUser.name} добавлен на совещание на тему ${currentMeeting.topic}`,
      );

      await this.bot.telegram.sendMessage(
        currentUser.chatId,
        `<b>Вас добавили на совещание ${currentMeeting.start_time.toLocaleDateString(
          'ru-RU',
          {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          },
        )} в ${currentMeeting.start_time.toLocaleTimeString('ru-RU', {
          hour: '2-digit',
          minute: '2-digit',
        })}</b>
        \n<b>Тема</b>: ${currentMeeting.topic}
        \n<b>Cсылка</b>: <a href="${currentMeeting.join_url}">🔗</a>`,
        { parse_mode: 'HTML' },
      );
    }
  }

  @Action('getLinkGeneralMeeting')
  async getLinkGeneralMeeting(ctx: any) {
    const chat = await ctx.getChat();

    const currentMeeting = await this.prisma.meeting.findFirst({
      where: {
        id: this.generalMeet.id,
      },
    });

    await this.bot.telegram.sendMessage(
      chat.id,
      `<b>Совещание ${currentMeeting.start_time.toLocaleDateString('ru-RU', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })} в ${currentMeeting.start_time.toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
      })}</b>
        \n<b>Тема</b>: ${currentMeeting.topic}
        \n<b>Cсылка</b>: <a href="${currentMeeting.join_url}">🔗</a>`,
      { parse_mode: 'HTML' },
    );
    return;
  }

  @Action(/^requestMeeting-(\d+)$/)
  async requestMeeting(ctx: any) {
    const chat = await ctx.getChat();

    if (ctx.match[1] === '0') {
      await this.bot.telegram.sendMessage(
        chat.id,
        'Напишите тему общего совещания: ',
      );

      this.requestMeetFrom = chat;
      this.isGeneralMeetingTheme = true;
    } else {
      await this.bot.telegram.sendMessage(
        chat.id,
        'Напишите тему совещания с коллегой: ',
      );

      this.isMeetingTheme = true;

      this.requestMeetToChatId = ctx.match[1];
    }

    this.bot.on(message(), async (ctx: any) => {
      const chat = await ctx.getChat();
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
        this.rawDate = ctx.update.message.text;

        try {
          const dateTimeArr = this.rawDate.split(' ');
          const timeArr = dateTimeArr[2].split(':');

          const days_in_month =
            32 -
            new Date(
              new Date().getFullYear(),
              this.monthArr.indexOf(dateTimeArr[1]),
              32,
            ).getDate();

          if (days_in_month < Number(dateTimeArr[0])) {
            await this.bot.telegram.sendMessage(
              this.requestMeetFrom.id,
              `Неправильное число месяца`,
            );
            return;
          }

          if (Number(timeArr[0]) > 23 || Number(timeArr[1]) > 59) {
            await this.bot.telegram.sendMessage(
              this.requestMeetFrom.id,
              `Неправильное значение времени`,
            );
            return;
          }

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
            chat.id,
            `Выберите формат: `,
            Markup.inlineKeyboard([
              [
                Markup.button.callback(
                  `Zoom-конференция`,
                  `sendRequestToOpponent`,
                ),
              ],
              [Markup.button.callback(`Лично`, `requestOfflineMeeting`)],
            ]),
          );
        }
        this.isFirstRequest = false;
        return;
      } else if (this.isSecondRequest) {
        this.rawDate = ctx.update.message.text;

        try {
          const dateTimeArr = this.rawDate.split(' ');
          const timeArr = dateTimeArr[2].split(':');

          const days_in_month =
            32 -
            new Date(
              new Date().getFullYear(),
              this.monthArr.indexOf(dateTimeArr[1]),
              32,
            ).getDate();

          if (days_in_month < Number(dateTimeArr[0])) {
            await this.bot.telegram.sendMessage(
              this.requestMeetToChatId,
              `Неправильное число месяца`,
            );
            return;
          }

          if (Number(timeArr[0]) > 23 || Number(timeArr[1]) > 59) {
            await this.bot.telegram.sendMessage(
              this.requestMeetToChatId,
              `Неправильное значение времени`,
            );
            return;
          }

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
            `В ответ на ваш запрос предложено время ${this.rawDate}`,
            Markup.inlineKeyboard([
              [
                Markup.button.callback(
                  `Принять`,
                  `${
                    this.isOfflineMeeting
                      ? 'createOfflineMeeting'
                      : 'createMeeting'
                  }`,
                ),
              ],
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
        this.isOfflineMeeting = false;
      } else {
        const users: User[] = await this.prisma.user.findMany({
          orderBy: { name: 'asc' },
        });

        let collegues = users.filter((collegue) => collegue.chatId !== chat.id);

        collegues.push({
          id: '0',
          name: 'Завершить добавление',
          chatId: 0,
          meetingIDs: [],
        });

        if (this.isGeneralMeetingTheme) {
          this.generalMeetingTheme = ctx.update.message.text;

          await this.bot.telegram.sendMessage(
            this.requestMeetFrom.id,
            `Тема для общего совещания ${this.generalMeetingTheme}`,
          );

          this.isGeneralMeetingTheme = false;

          await this.bot.telegram.sendMessage(
            this.requestMeetFrom.id,
            'Напишите дату общего собрания в формате 27 марта 12:00',
          );

          this.isGeneralMeetingDate = true;
          return;
        } else if (this.isGeneralMeetingDate) {
          this.rawDate = ctx.update.message.text;

          try {
            const dateTimeArr = this.rawDate.split(' ');
            const timeArr = dateTimeArr[2].split(':');
            const days_in_month =
              32 -
              new Date(
                new Date().getFullYear(),
                this.monthArr.indexOf(dateTimeArr[1]),
                32,
              ).getDate();

            if (days_in_month < Number(dateTimeArr[0])) {
              await this.bot.telegram.sendMessage(
                this.requestMeetFrom.id,
                `Неправильное число месяца`,
              );
              return;
            }

            if (Number(timeArr[0]) > 23 || Number(timeArr[1]) > 59) {
              await this.bot.telegram.sendMessage(
                this.requestMeetFrom.id,
                `Неправильное значение времени`,
              );
              return;
            }

            this.readableDate = new Date(
              Number(new Date().getFullYear()),
              Number(this.monthArr.indexOf(dateTimeArr[1])),
              Number(dateTimeArr[0]),
            ).setHours(Number(timeArr[0]) + 3, Number(timeArr[1]));
          } catch (e) {
            await this.bot.telegram.sendMessage(
              this.requestMeetFrom.id,
              `Неверный формат даты`,
            );
            return;
          }
          if (this.readableDate < Number(new Date())) {
            await this.bot.telegram.sendMessage(
              this.requestMeetFrom.id,
              `Дата прошла`,
            );
            return;
          } else {
            const newMeet = await this.zoomService.newMeeting({
              start_time: this.readableDate,
              userChatIds: [this.requestMeetFrom.id],
              topic: this.generalMeetingTheme,
            });

            this.generalMeet = newMeet;
            this.isGeneralMeetingDate = false;

            if (collegues.length) {
              await this.bot.telegram.sendMessage(
                this.requestMeetFrom.id,
                'Добавить коллег на совещание: ',
                Markup.inlineKeyboard(
                  collegues.map((collegue) =>
                    Array(
                      Markup.button.callback(
                        `${collegue.name}`,
                        `${
                          collegue.id === '0'
                            ? `getLinkGeneralMeeting`
                            : `requestAddToGeneralMeeting-${collegue.chatId}`
                        }`,
                      ),
                    ),
                  ),
                ),
              );
            } else {
              await this.bot.telegram.sendMessage(
                this.requestMeetFrom.id,
                'Список пуст',
              );
            }
          }
        }
      }
      this.isFirstRequest = false;
      this.isSecondRequest = false;
      this.isMeetingTheme = false;
    });
  }

  @Action('sendRequestToOpponent')
  async sendRequestToOpponent(ctx: any) {
    const chat = await ctx.getChat();

    const chatFrom = await this.prisma.user.findFirst({
      where: {
        chatId: this.requestMeetFrom.id,
      },
    });

    await this.bot.telegram.sendMessage(
      this.requestMeetToChatId,
      `Пользователь ${
        chatFrom ? chatFrom.name : this.requestMeetFrom.username
      } просит zoom-конференции ${this.rawDate}`,
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

    await this.bot.telegram.sendMessage(
      chat.id,
      `Запрос zoom-конференции отправлен, ожидайте подтверждения`,
    );
  }

  @Action('requestOfflineMeeting')
  async requestOfflineMeeting(ctx: any) {
    const chat = await ctx.getChat();

    this.isOfflineMeeting = true;

    const nameFrom = await this.prisma.user.findFirst({
      where: {
        chatId: this.requestMeetFrom.id,
      },
    });

    await this.bot.telegram.sendMessage(
      this.requestMeetToChatId,
      `Пользователь ${
        nameFrom ? nameFrom.name : this.requestMeetFrom.username
      } просит личную встречу ${this.rawDate}`,
      Markup.inlineKeyboard([
        [Markup.button.callback(`Принять`, `createOfflineMeeting`)],
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

    await this.bot.telegram.sendMessage(
      chat.id,
      `Запрос личной встречи отправлен, ожидайте подтверждения`,
    );
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

    try {
      if (2147483647 > timeToRemind) {
        setTimeout(async () => {
          await this.bot.telegram.sendMessage(
            this.requestMeetToChatId,
            `До совещания остался 1 час. \n${newMeet.join_url}`,
          );
        }, timeToRemind);
        console.log('set timeout');
      } else {
        console.log('too long for meeeting');
      }
    } catch (e) {
      console.log('problem with timeout');
    }

    await this.bot.telegram.sendMessage(
      this.requestMeetToChatId,
      `Ссылка на совещание:\n${newMeet.join_url}`,
    );

    await this.bot.telegram.sendMessage(
      this.requestMeetFrom.id,
      `Ссылка на совещание:\n${newMeet.join_url}`,
    );
    return;
  }

  @Action('createOfflineMeeting')
  async createOfflineMeeting(ctx: any) {
    const chat = await ctx.getChat();

    const userFrom = await this.prisma.user.findFirst({
      where: {
        chatId: Number(this.requestMeetFrom.id),
      },
    });

    const userTo = await this.prisma.user.findFirst({
      where: {
        chatId: Number(this.requestMeetToChatId),
      },
    });

    const data = {
      start_time: new Date(this.readableDate).toISOString(),
      userIDs: [userFrom.id, userTo.id],
      topic: this.meetingTheme,
    };

    const newMeet = await this.prisma.meeting.create({ data });

    const oneHour = 60 * 60 * 1000;
    const timeToRemind =
      this.readableDate - 3 * oneHour - Number(new Date()) - oneHour;

    try {
      if (2147483647 > timeToRemind) {
        setTimeout(async () => {
          await this.bot.telegram.sendMessage(
            this.requestMeetToChatId,
            `До личной встречи на тему ${newMeet.topic} остался 1 час.`,
          );
        }, timeToRemind);
        console.log('set timeout');
      } else {
        console.log('too long for meeeting');
      }
    } catch (e) {
      console.log('problem with timeout');
    }

    await this.bot.telegram.sendMessage(
      this.requestMeetToChatId,
      `Встреча подтверждена`,
    );

    await this.bot.telegram.sendMessage(
      this.requestMeetFrom.id,
      `Встреча подтверждена`,
    );
  }

  @Action(/^rejectMeeting-(\d+)$/)
  async rejectMeeting(ctx: any) {
    const chat = await ctx.getChat();

    const adresser = ctx.match[1];

    await this.bot.telegram.sendMessage(adresser, 'В конференции отказано');
    await this.bot.telegram.sendMessage(chat.id, 'В конференции отказано');
    return;
  }

  @Action('requestAnotherTime')
  async requestAnotherTime(ctx: any) {
    const chat = await ctx.getChat();

    await this.bot.telegram.sendMessage(
      chat.id,
      'Напишите дату в формате 27 марта 12:00',
    );

    this.isSecondRequest = true;
    return;
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
      orderBy: {
        start_time: 'asc',
      },
    });

    if (userMeetings.length === 0) {
      await this.bot.telegram.sendMessage(chat.id, `У вас пока нет совещаний`);
      return;
    }

    await this.bot.telegram.sendMessage(
      chat.id,
      `У вас ${userMeetings.length} совещаний: `,
    );

    let message: string = '';

    for (const [index, meeting] of userMeetings.entries()) {
      let opponentNamesString: string = '';

      for (const userID of meeting.userIDs) {
        const opponent = await this.prisma.user.findFirst({
          where: {
            id: userID,
          },
        });
        if (opponent && opponent.chatId !== chat.id) {
          opponentNamesString = opponentNamesString + `${opponent?.name}, `;
        }
      }

      message =
        message +
        `${
          index + 1
        }) <b>Совещание c ${opponentNamesString} ${meeting.start_time.toLocaleDateString(
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
          \n${
            meeting.join_url
              ? `Cсылка: <a href="${meeting.join_url}">🔗</a>`
              : 'Личная встреча'
          }\n\n\n`;
    }

    await this.bot.telegram.sendMessage(chat.id, message, {
      parse_mode: 'HTML',
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
