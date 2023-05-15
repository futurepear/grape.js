const grape = require("./grape");

//initialize the load balancer which creates a TCP server to listen for connections
const server = grape.createLoadBalancer();

//function that balances requests based on HTTP requests
//return ID to connect to a specific server or null for random 
server.balance((socket, req, rawheaders) => {
  return null;
});

//create a new child process with id server1 and run the file server.js
server.branch("server1", "subserver.js", {
  env: {
    environment: "env vars go here";
  }
});

//you can send data over to processes by pinging them, send updateServers event to all child processes
setInterval(() => {
  server.broadcast("updateServers", "ANY DATA AS STRING");
}, 1000);

//you can recieve data with server.prototype.on("event", eventHandler)
//RECIEVE MESSAGES SENT FROM SUBSERVERS WITH server.on method
server.on("serverInfo", (data) => {

});

//send data to subserver like this:
server.send("server1", "any data");

//bind a port for the server to listen on
server.listen(process.env.PORT);
