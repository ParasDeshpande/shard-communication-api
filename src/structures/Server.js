"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = __importDefault(require("http"));
const ws_1 = __importDefault(require("ws"));
const events_1 = require("events");
const collection_1 = __importDefault(require("@discordjs/collection"));
const uniqid_1 = __importDefault(require("uniqid"));
class Server extends events_1.EventEmitter {
    // Class props //
    /**
     * Creates an instance of the server with the given options.
     * @param {ServerOptions} options.port *The port to be used by the server.
     * @param {ServerOptions} options.password *The password to create a websocket connection with the server.
     */
    constructor(options) {
        super();
        //Check if options are valid
        if (typeof options !== 'object')
            throw new TypeError("Invalid Server options provided.");
        if (typeof options.password !== "string")
            throw new TypeError("Server option 'password' must be a string.");
        if (typeof options.port !== "number")
            throw new TypeError("Server option 'port' must be a number.");
        this.options = options;
        this.clients = new collection_1.default();
        this.server = http_1.default.createServer();
        this.socket = new ws_1.default.Server({ noServer: true });
    }
    /**
     * Resolves a request to a boolean to check if it is an authorized and valid request.
     * @param req The upgrade request.
     */
    isAuthorized(req) {
        if (!req.headers ||
            !req.headers.clientid ||
            !req.headers.shardid ||
            req.headers.authorization !== this.options.password)
            return false;
        else
            return true;
    }
    /**
     * Initialize the server.
     */
    init() {
        /**
         * Handle connection upgrades
         */
        this.server.on('upgrade', (req, socket, head) => {
            if (this.isAuthorized(req)) {
                this.socket.handleUpgrade(req, socket, head, (ws) => {
                    //Generate a connection id
                    const connectionid = uniqid_1.default(req.headers.clientid + "-" + req.headers.shardid + "-");
                    ws.connectionid = connectionid;
                    //Add the client to the connected collection
                    const client = {
                        "id": req.headers.clientid,
                        "shard": req.headers.shardid,
                        "connectionid": connectionid,
                        "ws": ws
                    };
                    this.clients.set(this.clients.size, client);
                    //Handle websocket events
                    ws.on('close', (code, reason) => this.wsClose(ws, code, reason));
                    ws.on('error', (error) => this.wsError(ws, error));
                    ws.on('message', (message) => this.wsMessage(ws, message));
                    //ws.on('ping', (message) => this.wsPing(ws, message));
                    this.socket.emit('connection', ws, req);
                });
            }
            else {
                this.emit('rejected', req, socket, head);
                socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
                return socket.destroy();
            }
        });
        //Handle socket events
        this.socket.on('connection', this.connection.bind(this));
        this.socket.on('close', this.close.bind(this));
        this.socket.on('error', this.error.bind(this));
        //Start listening on the given port
        this.server.listen(this.options.port, this.listening.bind(this, this.options.port));
    }
    /**
     * Server events
     */
    listening() {
        this.emit('listening', this, arguments);
    }
    connection(ws, request) {
        this.emit('connection', this, ws, request);
    }
    close() {
        this.emit('close', this);
    }
    error() {
        this.emit('error', this, arguments);
    }
    /**
     * WS Events
     */
    wsClose(ws, code, reason) {
        //Get the connected client info
        const clientKey = this.clients.findKey(c => c.connectionid === ws.connectionid);
        if (typeof clientKey !== 'number')
            return;
        //Delete the connected client
        const deletedClient = this.clients.get(clientKey);
        this.clients.delete(clientKey);
        //Emit the wsClose event with the client info
        this.emit('wsClose', this, deletedClient, code, reason);
    }
    wsError(ws, error) {
        this.emit('wsError', this, this.clients.find(c => c.connectionid === ws.connectionid), error);
    }
    wsMessage(ws, data) {
        let parsedMessage = JSON.parse(data.toString());
        if (typeof parsedMessage === "string")
            parsedMessage = JSON.parse(parsedMessage);
        //If the parsed message does not have an op then return
        if (!parsedMessage.op)
            return;
        switch (parsedMessage.op) {
            case 'test': console.log('works');
            case 'annc':
                if (parsedMessage.recieverFilter && parsedMessage.recieverFilter.clientid && parsedMessage.recieverFilter.shardid && parsedMessage.data && Array.isArray(parsedMessage.recieverFilter.clientid) && Array.isArray(parsedMessage.recieverFilter.shardid)) {
                    const client = this.clients.find(c => c.connectionid === ws.connectionid);
                    if (!client)
                        return;
                    this.send(client, { clientid: parsedMessage.recieverFilter.clientid, shardid: parsedMessage.recieverFilter.shardid }, parsedMessage.data);
                    //Emit announced event
                    this.emit('announced', this, client, parsedMessage);
                }
            default:
                //Emit message event
                this.emit('message', this, this.clients.find(c => c.connectionid === ws.connectionid), parsedMessage);
        }
    }
    /**
     * Methods
     */
    send(sender, recieverFilter = {}, data) {
        return new Promise((resolve, reject) => {
            //Handle errors
            if (!sender)
                reject("No sender");
            if (!sender.id)
                reject("No sender clientid");
            if (!sender.shard)
                reject("No sender shardid");
            if (!data || !JSON.stringify(data).startsWith("{"))
                return reject("no json data provided");
            //Handle data
            const stringifiedData = JSON.stringify(data);
            //Get the clients to send to
            const clients = this.clients.filter(c => c.connectionid !== sender.connectionid
                &&
                    (typeof recieverFilter.clientid !== 'undefined' ? recieverFilter.clientid.includes(c.id) : true)
                &&
                    (typeof recieverFilter.shardid !== 'undefined' ? recieverFilter.shardid.includes(c.shard) : true));
            clients.forEach(c => {
                try {
                    c.ws.send(stringifiedData);
                }
                catch (e) {
                    console.error(e);
                }
            });
        });
    }
}
exports.default = Server;
