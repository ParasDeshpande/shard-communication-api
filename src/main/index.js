"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const Server_1 = __importDefault(require("../structures/Server"));
const server = new Server_1.default({ port: 8080, password: "thePasswordIsSomebodyOnceToldMeTheWorldIsGonnaRollMeIAin'tTheSharpestToolInTheShedSheWasLookingKindOfDumbWithHerFingerAndHerThumbInTheShapeOfAn'L'OnHerForehead" });
server.init();
server.on('connection', (server, socket, req) => {
    console.log(`Client accepted- ${req.headers.clientid} ConnectionID- ${socket.connectionid}`);
});
server.on('wsClose', (deletedClient, code, reason) => {
    console.log(`Client disconnected- ${deletedClient.id} ConnectionID- ${deletedClient.connectionid}`);
});
