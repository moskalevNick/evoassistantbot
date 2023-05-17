import { Meeting, Prisma, User } from '@prisma/client';
import { InjectBot, Start, Update, Action, Command } from 'nestjs-telegraf';
import { message } from 'telegraf/filters';
import { Context, Telegraf, Markup } from 'telegraf';
import { ZoomService } from './zoom.service';
import { PrismaService } from './prisma/prisma.service';
import { google } from 'googleapis';
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
  private isFeedback: boolean;
  // private isEditTime: boolean;
  private meetingTheme: string;
  private generalMeetingTheme: string;
  private generalMeet: Meeting;
  private currentProject: string;

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
        [Markup.button.callback('Оставить отзыв', 'sendfeedback')],
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

    this.bot.on(message(), async (ctx: any) => {
      const chat = await ctx.getChat();
      if (this.isFeedback) {
        const newFeedbackText = ctx.update.message.text;

        let from = `${ctx.update.message.from.username} ${ctx.update.message.from.first_name}`;

        if (ctx.update.message.from.last_name) {
          from = `${from} ${ctx.update.message.from.last_name}`;
        }

        const auth = new google.auth.GoogleAuth({
          keyFile: 'credentials.json',
          scopes: 'https://www.googleapis.com/auth/spreadsheets',
        });

        const client = await auth.getClient();

        const googleSheets = google.sheets({ version: 'v4', auth: client });

        const spreadsheetId = '1fQOFenTyu1rvZqoNl23T6hK0uRsDQHjoxQv5AZQhi50';

        await googleSheets.spreadsheets.values.append({
          auth,
          spreadsheetId,
          range: this.currentProject,
          valueInputOption: 'USER_ENTERED',
          requestBody: {
            values: [[from, newFeedbackText]],
          },
        });

        this.isFeedback = false;
        return ctx.reply(
          `Ваше предложение для ${this.currentProject} сохранено`,
        );
      } else if (this.isMeetingTheme) {
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
              creatorChatID: this.requestMeetFrom.id,
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
  async addPartner(ctx: Context) {
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
          \n<b>Cсылка</b>: <a href="${currentMeeting.start_url}">🔗</a>`,
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

    const isCreator = currentMeeting.creatorChatID === chat.id;

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
        \n<b>Cсылка для присоединения</b>: <a href="${
          isCreator ? currentMeeting.start_url : currentMeeting.join_url
        }">🔗</a>`,
      { parse_mode: 'HTML' },
    );
    return;
  }

  @Action(/^requestMeeting-(\d+)$/)
  async requestMeeting(ctx: any) {
    const chat = await ctx.getChat();

    this.isMeetingTheme = false;
    this.isGeneralMeetingTheme = false;
    this.isFeedback = false;
    this.isFirstRequest = false;
    this.isSecondRequest = false;

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
    const Creator = await this.prisma.user.findFirst({
      where: {
        chatId: chat.id,
      },
    });

    const newMeet = await this.zoomService.newMeeting({
      start_time: this.readableDate,
      userChatIds: [
        Number(this.requestMeetToChatId),
        Number(this.requestMeetFrom.id),
      ],
      topic: this.meetingTheme,
      creatorChatID: Creator.chatId,
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
      `Ссылка на совещание:\n${newMeet.start_url}`,
    );
    return;
  }

  @Action('createOfflineMeeting')
  async createOfflineMeeting(ctx: any) {
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
    this.isMeetingTheme = false;
    this.isGeneralMeetingTheme = false;
    this.isFeedback = false;
    this.isFirstRequest = false;
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

      const isCreator = meeting.creatorChatID === currentUser.chatId;

      await this.bot.telegram.sendMessage(
        chat.id,
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
          ? `Cсылка: <a href="${
              isCreator ? meeting.start_url : meeting.join_url
            }">🔗</a>`
          : 'Личная встреча'
      }\n\n\n`,
        {
          reply_markup: {
            inline_keyboard: [
              // [
              //   Markup.button.callback(
              //     'Изменить время',
              //     `editMeet-${meeting.id}`,
              //   ),
              // ],
              [Markup.button.callback('Удалить', `removeMeet-${meeting.id}`)],
            ],
          },
          parse_mode: 'HTML',
        },
      );
    }
  }

  // @Action(/^editMeet-(\w+)$/)
  // async editMeet(ctx: any) {
  //   const chat = await ctx.getChat();

  //   const meetingID = ctx.match[1];

  //   console.log(meetingID);

  //   return;
  // }

  @Action(/^removeMeet-(\w+)$/)
  async removeMeet(ctx: any) {
    const chat = await ctx.getChat();

    const meetingID = ctx.match[1];
    try {
      const deletedMeeting = await this.zoomService.removeMeet(meetingID);

      await this.bot.telegram.sendMessage(
        chat.id,
        `Встреча ${deletedMeeting.topic} удалена`,
      );
    } catch (e) {
      console.log(e);

      await this.bot.telegram.sendMessage(chat.id, 'Проблема с удалением');
    }
    return;
  }

  //ideas bot

  @Command('sendfeedback')
  @Action('sendfeedback')
  async sendfeedback(ctx: Context) {
    const chat = await ctx.getChat();

    await this.bot.telegram.sendMessage(
      chat.id,
      `Наши проекты: `,
      Markup.inlineKeyboard([
        [
          Markup.button.callback(
            `Интерфейс контроллера`,
            'controllerInterface',
          ),
        ],
        [Markup.button.callback('Облако', 'cloud')],
        [Markup.button.callback('Софт для проектирования', 'softForGrafics')],
        [Markup.button.callback('Распознавание лиц', 'faceRecognition')],
        [Markup.button.callback('Мобильное приложение', 'mobileApp')],
        [Markup.button.callback('Сайт evocontrols', 'evocontrolscom')],
        [Markup.button.callback('Телеграм бот', 'telegramBot')],
      ]),
    );
  }

  @Action('controllerInterface')
  async conrollerInterface(ctx: Context) {
    const chat = await ctx.getChat();

    this.currentProject = 'Интерфейс контроллера';

    await this.bot.telegram.sendMessage(
      chat.id,
      `Этим проектом занимается Александр Макаров`,
      Markup.inlineKeyboard([
        Markup.button.callback(`Оставить пожелание`, 'sendFeedback'),
      ]),
    );
  }

  @Action('cloud')
  async cloud(ctx: Context) {
    const chat = await ctx.getChat();
    this.currentProject = 'Облако';

    await this.bot.telegram.sendMessage(
      chat.id,
      `Этим проектом занимается Александр Макаров`,
      Markup.inlineKeyboard([
        Markup.button.callback(`Оставить пожелание`, 'sendFeedback'),
      ]),
    );
  }

  @Action('softForGrafics')
  async softForGrafics(ctx: Context) {
    const chat = await ctx.getChat();
    this.currentProject = 'Софт для проектирования';

    await this.bot.telegram.sendMessage(
      chat.id,
      `Этим проектом занимается Александр Макаров`,
      Markup.inlineKeyboard([
        Markup.button.callback(`Оставить пожелание`, 'sendFeedback'),
      ]),
    );
  }

  @Action('faceRecognition')
  async faceRecognition(ctx: Context) {
    const chat = await ctx.getChat();
    this.currentProject = 'Распознавание лиц';

    await this.bot.telegram.sendMessage(
      chat.id,
      `Этим проектом занимается Николай Москалёв`,
      Markup.inlineKeyboard([
        Markup.button.callback(`Оставить пожелание`, 'sendFeedback'),
      ]),
    );
  }

  @Action('telegramBot')
  async telegramBot(ctx: Context) {
    const chat = await ctx.getChat();
    this.currentProject = 'Телеграм бот';

    await this.bot.telegram.sendMessage(
      chat.id,
      `Этим проектом занимается Николай Москалёв`,
      Markup.inlineKeyboard([
        Markup.button.callback(`Оставить пожелание`, 'sendFeedback'),
      ]),
    );
  }

  @Action('mobileApp')
  async mobileApp(ctx: Context) {
    const chat = await ctx.getChat();
    this.currentProject = 'Мобильное приложение';

    await this.bot.telegram.sendMessage(
      chat.id,
      `Этим проектом занимается Николай Москалёв`,
      Markup.inlineKeyboard([
        Markup.button.callback(`Оставить пожелание`, 'sendFeedback'),
      ]),
    );
  }

  @Action('evocontrolscom')
  async evocontrolscom(ctx: Context) {
    const chat = await ctx.getChat();
    this.currentProject = 'Сайт evocontrols';

    await this.bot.telegram.sendMessage(
      chat.id,
      `Этим проектом занимается Николай Москалёв`,
      Markup.inlineKeyboard([
        Markup.button.callback(`Оставить пожелание`, 'sendFeedback'),
      ]),
    );
  }

  @Action('sendFeedback')
  async sendFeedback(ctx: Context) {
    const chat = await ctx.getChat();

    await this.bot.telegram.sendMessage(
      chat.id,
      `следующее сообщение будет сохранено как пожелание для проекта ${this.currentProject}`,
    );

    this.isFeedback = true;
    this.isSecondRequest = false;
    this.isMeetingTheme = false;
    this.isGeneralMeetingTheme = false;
    this.isFirstRequest = false;
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
