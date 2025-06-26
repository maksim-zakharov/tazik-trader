import { createLogger, format, transports } from 'winston';
import * as chalk from 'chalk';
import { WinstonModule } from 'nest-winston';

const instance = createLogger({
  // options of WinstonModule
  transports: [
    new transports.Console({
      format: format.combine(
        format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        format.colorize(), // Включаем цветовое оформление
        format.printf(({ level, message, timestamp, context }) => {
          // Кастомные цвета для разных уровней
          const levelColors = {
            error: chalk.red.bold,
            warn: chalk.yellow.bold,
            info: chalk.green.bold,
            debug: chalk.magenta.bold,
            verbose: chalk.cyan.bold,
          };

          // Цвет для уровня
          const levelColor = levelColors[level] || chalk.white;

          return (
            `${timestamp} ` +
            `${levelColor(level.padEnd(7))} ` + // Уровень с паддингом
            `${chalk.yellow.bold(`[${context}]`)} ` + // Оранжевый контекст
            `${message}`
          );
        }),
      ),
    }),
  ],
});

const logger = WinstonModule.createLogger({
  instance,
});

export default logger;
