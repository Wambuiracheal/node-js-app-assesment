'use strict';


const Transport = require('winston-transport');
const amqp = require('amqplib');
const { LOG_EXCHANGE, LOG_QUEUE } = require('../messaging/topology');

const MESSAGE = Symbol.for('message'); // the fully formatted (JSON) line winston produced

class AmqpLogTransport extends Transport {
  constructor({ url, service, maxBuffer = 1000, reconnectDelayMs = 5000, connect = amqp.connect, ...options }) {
    super(options);
    this.url = url;
    this.service = service;
    this.maxBuffer = maxBuffer;
    this.reconnectDelayMs = reconnectDelayMs;
    this.connectFn = connect;
    this.buffer = [];
    this.dropped = 0;
    this.channel = null;
    this.connection = null;
    this.closed = false;
    this.scheduleConnect(0);
  }

  scheduleConnect(delayMs) {
    if (this.closed) return;
    this.timer = setTimeout(() => this.connect(), delayMs);
    this.timer.unref?.(); // never keep the process alive just to ship logs
  }

  async connect() {
    try {
      const connection = await this.connectFn(this.url);
      connection.on('error', () => {}); 
      connection.on('close', () => {
        this.channel = null;
        this.connection = null;
        this.scheduleConnect(this.reconnectDelayMs);
      });

      const channel = await connection.createChannel();
      channel.on('error', () => {});
      await channel.assertExchange(LOG_EXCHANGE, 'topic', { durable: true });
      // Declared here too, so lines are retained even if the aggregator starts later.
      await channel.assertQueue(LOG_QUEUE.name, LOG_QUEUE.options);
      for (const key of LOG_QUEUE.bindings) await channel.bindQueue(LOG_QUEUE.name, LOG_EXCHANGE, key);

      this.connection = connection;
      this.channel = channel;
      this.flush();
    } catch {
      this.scheduleConnect(this.reconnectDelayMs);
    }
  }

  log(info, callback) {
    setImmediate(() => this.emit('logged', info));
    const line = info[MESSAGE] ?? JSON.stringify(info);

    if (this.channel) this.publish(info.level, line);
    else this.enqueue(info.level, line);

    callback();
  }

  enqueue(level, line) {
    if (this.buffer.length >= this.maxBuffer) {
      this.buffer.shift();
      this.dropped += 1;
    }
    this.buffer.push({ level, line });
  }

  publish(level, line) {
    try {
      this.channel.publish(LOG_EXCHANGE, `logs.${this.service}.${level}`, Buffer.from(line), {
        contentType: 'application/json',
        persistent: true,
        appId: this.service,
      });
    } catch {
      this.enqueue(level, line);
    }
  }

  flush() {
    if (this.dropped > 0) {
      const notice = JSON.stringify({
        level: 'warn',
        message: `Log shipping buffer overflowed; ${this.dropped} lines were dropped while RabbitMQ was unreachable`,
        service: this.service,
        timestamp: new Date().toISOString(),
      });
      this.dropped = 0;
      this.publish('warn', notice);
    }
    while (this.channel && this.buffer.length) {
      const { level, line } = this.buffer.shift();
      this.publish(level, line);
    }
  }

  close() {
    this.closed = true;
    clearTimeout(this.timer);
    this.connection?.close().catch(() => {});
  }
}

module.exports = { AmqpLogTransport };
