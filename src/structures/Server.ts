import http, { RequestOptions, Server as SV } from 'http';
import ws, { Server as WSV } from 'ws';
import { EventEmitter } from 'events';
import Collection from '@discordjs/collection';
import uniqid from 'uniqid';

export default class Server extends EventEmitter {
    // Class props //
    options: ServerOptions;
    clients: Collection<number, ConnectedClient>;
    server: SV;
    socket: WSV;
    // Class props //

    /**
     * Creates an instance of the server with the given options.
     * @param {ServerOptions} options.port *The port to be used by the server.
     * @param {ServerOptions} options.password *The password to create a websocket connection with the server.
     */
    constructor(options: ServerOptions) {
        super();
        //Check if options are valid
        if (typeof options !== 'object') throw new TypeError("Invalid Server options provided.");
        if (typeof options.password !== "string") throw new TypeError("Server option 'password' must be a string.");
        if (typeof options.port !== "number") throw new TypeError("Server option 'port' must be a number.");

        this.options = options;
        this.clients = new Collection();
        this.server = http.createServer();
        this.socket = new ws.Server({ noServer: true });
    }

    /**
     * Resolves a request to a boolean to check if it is an authorized and valid request.
     * @param req The upgrade request.
     */
    private isAuthorized(req: RequestOptions): boolean {
        if (!req.headers ||
            !req.headers.clientid ||
            !req.headers.shardid ||
            req.headers.authorization !== this.options.password) return false;
        else return true;
    }

    /**
     * Initialize the server.
     */
    public init() {
        /**
         * Handle connection upgrades
         */
        this.server.on('upgrade', (req, socket, head) => {
            if (this.isAuthorized(req)) {
                this.socket.handleUpgrade(req, socket, head, (ws: ExtendedWS) => {
                    //Generate a connection id
                    const connectionid = uniqid(req.headers.clientid + "-" + req.headers.shardid + "-");
                    ws.connectionid = connectionid;

                    //Add the client to the connected collection
                    const client: ConnectedClient = {
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
        this.socket.on('listening', this.listening.bind(this));

        //Start listening on the given port
        this.server.listen(this.options.port);
    }

    /**
     * Server events
     */
    listening() {
        this.emit('listening', this, arguments);
    }
    connection(ws: ws, request: http.IncomingMessage) {
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
    wsClose(ws: ExtendedWS, code: number, reason: string) {
        //Get the connected client info
        const clientKey = this.clients.findKey(c => c.connectionid === ws.connectionid);
        if (typeof clientKey !== 'number') return;

        //Delete the connected client
        const deletedClient = this.clients.get(clientKey);
        this.clients.delete(clientKey);

        //Emit the wsClose event with the client info
        this.emit('wsClose', this, deletedClient, code, reason);
    }
    wsError(ws: ExtendedWS, error: Error) {
        this.emit('wsError', this, this.clients.find(c => c.connectionid === ws.connectionid), error);
    }
    wsMessage(ws: ExtendedWS, data: ws.Data) {
        let parsedMessage: ParsedMessage = JSON.parse(data.toString());
        if (typeof parsedMessage === "string") parsedMessage = JSON.parse(parsedMessage);

        //If the parsed message does not have an op then return
        if (!parsedMessage.op) return;

        switch (parsedMessage.op) {
            case 'test': console.log('works');
            case 'annc':
                if (parsedMessage.recieverFilter && parsedMessage.recieverFilter.clientid && parsedMessage.recieverFilter.shardid && parsedMessage.data && Array.isArray(parsedMessage.recieverFilter.clientid) && Array.isArray(parsedMessage.recieverFilter.shardid)) {
                    const client = this.clients.find(c => c.connectionid === ws.connectionid);
                    if (!client) return;
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
    send(sender: ConnectedClient, recieverFilter: recieverFilter = {}, data: object) {
        return new Promise((resolve, reject) => {
            //Handle errors
            if (!sender) reject("No sender");
            if (!sender.id) reject("No sender clientid");
            if (!sender.shard) reject("No sender shardid");
            if (!data || !JSON.stringify(data).startsWith("{")) return reject("no json data provided");

            //Handle data
            const stringifiedData = JSON.stringify(data);

            //Get the clients to send to
            const clients = this.clients.filter(c =>
                c.connectionid !== sender.connectionid
                &&
                (typeof recieverFilter.clientid !== 'undefined' ? recieverFilter.clientid.includes(c.id) : true)
                &&
                (typeof recieverFilter.shardid !== 'undefined' ? recieverFilter.shardid.includes(c.shard) : true)
            )

            clients.forEach(c => {
                try { c.ws.send(stringifiedData) }
                catch (e) { console.error(e) }
            })
        });
    }
}

interface ServerOptions {
    port: number,
    password: string
}

interface ExtendedWS extends ws {
    connectionid?: string
}

interface ConnectedClient {
    id: string,
    shard: string,
    connectionid: string,
    ws: ws
}

interface ParsedMessage extends Object {
    op?: string, //annc
    recieverFilter: recieverFilter, //{clientid:[""], shardid:[""]}
    data: any //{}
}

interface sender {
    clientid?: string,
    shardid?: string
}

interface recieverFilter {
    clientid?: string[],
    shardid?: string[]
}