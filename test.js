const net = require("node:net");
const crypto = require("crypto");

let server = net.createServer();

server.on("connection", (socket) => {
  socket.on("data", (data) => {
    let str = data.toString();
    
    //try decrypting https here
    str = crypto.publicDecrypt("PUT YOUR KEY THING HERE!!!!!!", str);
    //a
    
    console.log(str);
  });
});

server.listen(3000);
