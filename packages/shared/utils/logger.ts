import {existsSync, mkdirSync} from 'fs';
import * as winston from 'winston';
import {join} from 'path';
import {app} from 'electron';

// const colorizer = winston.format.colorize();

export function createLogger(label: string) {
  const isDevelopment = process.env.NODE_ENV !== 'production';

  if (!winston.loggers.has(label)) {
    const transports: winston.transport[] = [];

    if (isDevelopment) {
      //Development environment: Output to console and file simultaneously
      transports.push(new winston.transports.Console({level: 'debug'}));
    }

    //File output (both development and production environments)
    const logsPath = join(app.getPath('userData'), 'logs');
    if (!existsSync(logsPath)) {
      mkdirSync(logsPath, {recursive: true});
    }
    if (!existsSync(join(logsPath, label))) {
      mkdirSync(join(logsPath, label));
    }
    console.log('Logger path', logsPath);
    const date = new Date();

    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const formattedDate = `${year}-${month.toString().padStart(2, '0')}-${day
      .toString()
      .padStart(2, '0')}`;
    //Define the location of the log file and record a log file every day
    const logFile = join(logsPath, label, `${formattedDate}.log`);
    //Production environment: all logs are output to files
    transports.push(new winston.transports.File({level: 'info', filename: logFile}));

    winston.loggers.add(label, {
      transports: transports,
      format: winston.format.combine(
        winston.format.label({label}),
        winston.format.timestamp({format: 'YYYY-MM-DD HH:mm:ss'}),
        winston.format.printf(info => {
          const {timestamp, level, message, [Symbol.for('splat')]: splat} = info;
          const metaString =
            splat && Array.isArray(splat) && splat.length
              ? splat.map(item => JSON.stringify(item)).join(' ')
              : '';
          const formattedMessage = `${message} ${metaString}`.trim();
          return `${label} | ${timestamp} - ${level}: ${formattedMessage}`;
        }),
      ),
    });
  }
  return winston.loggers.get(label);
}
