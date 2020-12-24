import { EventEmitter } from 'events';
import ws from 'ws';

const defaultOptions = {
    host: 'localhost',
    port: 8080,
    password: 'youshallnotpass',
    retryAmount: 3,
    retryDelay: 30e3,
    secure: false,
}

export default class Client extends EventEmitter {
    // Class props //
    options: ClientOptions;
    socket: ws | null;
    reconnectAttempts: number = 0;
    reconnectTimeout: any;
    // Class props //

    /**
     * Creates an instance of the server with the given options.
     * @param {ClientOptions} options.host *The ip of the server.
     * @param {ClientOptions} options.port *The port of the server.
     * @param {ClientOptions} options.password *The password to connect to the server.
     * @param {ClientOptions} options.retryAmount The amount of retries before failing ton connect, default: 3.
     * @param {ClientOptions} options.retryDelay The delay between each retry, default: 30e3
     * @param {ClientOptions} options.secure If the server uses https set this to true.
     * @param {ClientOptions} options.clientid *The id of this client.
     * @param {ClientOptions} options.shardid *The shard of this client.
     */
    constructor(options: ClientOptions = {}) {
        super();
        this.options = Object.assign(defaultOptions, options);
        //Check if options are valid
        if (typeof this.options.host !== 'string') throw new TypeError("Client option 'host' must be a 'string'.");
        if (typeof this.options.port !== 'number') throw new TypeError("Client option 'port' must be a 'number'.");
        if (typeof this.options.password !== 'string') throw new TypeError("Client option 'password' must be a 'string'.");
        if (typeof this.options.retryAmount !== 'number') throw new TypeError("Client option 'retryAmount' must be a 'number'.");
        if (typeof this.options.retryDelay !== 'number') throw new TypeError("Client option 'retryDelay' must be a 'number'.");
        if (typeof this.options.secure !== 'boolean') throw new TypeError("Client option 'secure' must be a 'boolean'.");
        if (typeof this.options.clientid !== 'string') throw new TypeError("Client option 'clientid' must be a 'string'.");
        if (typeof this.options.shardid !== 'string') throw new TypeError("Client option 'shardid' must be a 'string'.");
        this.socket = null;
    }

    /**
     * Connect to the server.
     */
    connect() {
        if (this.socket) return;
        const headers = { "authorization": this.options.password, "clientid": this.options.clientid, "shardid": this.options.shardid };
        this.socket = new ws(`ws${this.options.secure ? "s" : ""}://${this.options.host}:${this.options.port}/`, { headers });
        this.socket.on("open", this.open.bind(this));
        this.socket.on("close", this.close.bind(this));
        this.socket.on("message", this.message.bind(this));
        this.socket.on("error", this.error.bind(this));
        this.socket.on('upgrade', this.ready.bind(this));
    }

    /**
     * Attempt to reconnect to the server
     */
    private reconnect() {
        this.reconnectTimeout = setTimeout(() => {
            if (this.reconnectAttempts >= this.options.retryAmount!) {
                const error = new Error(`Unable to connect after ${this.options.retryAmount} attempts.`);
                this.emit("error", this, error);
                return this.destroy();
            }
            this.socket!.removeAllListeners();
            this.socket = null;
            this.emit("reconnect", this);
            this.connect();
            this.reconnectAttempts++;
        }, this.options.retryDelay);
    }

    /**
     * Destroy the client
     */
    destroy() {
        if (!this.socket) return;
        this.socket.close(1000, "destroy");
        this.socket.removeAllListeners();
        this.socket = null;
        this.reconnectAttempts = 1;
        clearTimeout(this.reconnectTimeout);
        this.emit("destroy", this);
    }

    /**
     * Client events
     */
    ready(socket: ws, message: ws.MessageEvent) {
        if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
        this.emit("ready", this, socket, message);
    }
    open() {
        if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
        this.emit("connect", this);
    }
    close(code: number, reason: string) {
        this.emit("disconnect", this, { code, reason });
        if (code !== 1000 || reason !== "destroy") this.reconnect();
    }
    error(error: Error) {
        if (!error) return;
        this.emit("error", this, error);
    }
    message(data: Buffer | typeof ArrayBuffer | string) {
        if (Array.isArray(data)) data = Buffer.concat(data);
        else if (data instanceof ArrayBuffer) data = Buffer.from(data);

        //first esacpes the string
        let payload = JSON.parse(data.toString());
        //then parses into json
        if (typeof payload === "string") payload = JSON.parse(payload);

        this.emit("message", payload);
    }

    /**
     * Client methods
     */
    send(recieverFilter: recieverFilter, d: any) {
        return new Promise((resolve, reject) => {
            if (!this.socket) return reject("Not connected.");
            if (!recieverFilter) return reject("No reciever filter provided.");
            if (!recieverFilter.clientid || Array.isArray(recieverFilter.clientid)) return reject("'clientid' in reciever filter must be a string array.");
            if (recieverFilter.shardid && !Array.isArray(recieverFilter.shardid)) return reject("'shardid' in reciever filter must be a string array.");
            if (!d || !JSON.stringify(d).startsWith("{")) return reject("no json data provided");

            const message = {
                recieverFilter: {
                    clientid: recieverFilter.clientid,
                    shardid: recieverFilter.shardid
                },
                data: d
            }
            const stringifiedData = JSON.stringify(message);

            this.socket.send(stringifiedData, (error) => error ? reject(error) : resolve(true))
        });
    }
}

export interface ClientOptions {
    host?: string,
    port?: number,
    password?: string,
    retryAmount?: number,
    retryDelay?: number,
    secure?: boolean,
    clientid?: string,
    shardid?: string
}

export interface recieverFilter {
    clientid?: string[],
    shardid?: string[]
}