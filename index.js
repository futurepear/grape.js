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

//bind a port for the server to listen on
server.listen(process.env.PORT);
