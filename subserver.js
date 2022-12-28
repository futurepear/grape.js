//example using Express JS 

const express = require('express');
const http = require('node:http');
const app = express();

//create a http server and pass the express app instance into it, all requests will be done automatically
const server = http.createServer(app);

//set up a branch with the http server to recieve connections
const grape = require("./grape").setupBranch(server);

//receieve data from main process with subserver.prototype.on("event", handler)
grape.on("serverInfo", (data) => {

});

//express routing
app.get('/', (req, res) => {
  res.send("foo");
});
