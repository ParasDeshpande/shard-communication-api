import Server from '../structures/Server';

const server = new Server({ port: 8080, password: "thePasswordIsSomebodyOnceToldMeTheWorldIsGonnaRollMeIAin'tTheSharpestToolInTheShedSheWasLookingKindOfDumbWithHerFingerAndHerThumbInTheShapeOfAn'L'OnHerForehead" });

server.init();

server.on('connection', (server, socket, req) => {
    console.log(`Client accepted- ${req.headers.clientid} ConnectionID- ${socket.connectionid}`);
});

server.on('wsClose', (deletedClient, code, reason) => {
    console.log(`Client disconnected- ${deletedClient.id} ConnectionID- ${deletedClient.connectionid}`);
});