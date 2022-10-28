const cluster = require("node:cluster");
const os = require("node:os");
const net = require("node:net");
const cpus = os.cpus();
const child_process = require("child_process");

const symbolServer = Symbol("subServer");

function parseHTTP(rawreq) {
  let firstsplit = rawreq.split(/\r\n\r\n/);
  let body = firstsplit[1];
  let req = firstsplit[0].split(/\r\n/);
  let headers = {};
  for (let i in req) {
    let key = req[i].split(':', 1)[0];
    headers[key] = req[i].substring(key.length + 2);
  }
  let firstline = Object.keys(headers)[0];
  delete headers[firstline];
  firstline = firstline.split(" ");
  headers.Method = firstline[0];
  headers.Path = firstline[1];
  headers.Version = firstline[2];
  headers.body = body;
  return headers;
}

class Grape {
  constructor(id, parent) {
    this.id = id;
    this.parent = parent;
    this.open = true;
  }
  exclude() {
    delete this.parent._avaliableServers[this.id];
    this.open = false;
    return this;
  }
  include() {
    this.parent._avaliableServers[this.id] = 1;
    this.open = true;
    return this;
  }
}

class Worker extends Grape {
  constructor(worker, controller, id, parent) {
    super(id, parent);
    this.worker = worker;
    this.controller = controller;
    this.data = {};
  }
  send(id, msg) {
    this.parent.send(this.id, id, msg);
  }
  connect(socket, data) {
    this.worker.send(
      ["FORWARD-HTTP-REQ",
        { rawheaders: data.toString() }],
      socket, { keepOpen: false });
  }
}

class SubServer extends Grape {
  constructor(server, id, parent) {
    super(id, parent);
    this.server = server;
  }
  connect(socket, data) {
    this.server.emit("connection", socket);
    socket.zaz = true;
    socket.emit("data", data);
  }
}

class loadBalancer {
  constructor(callback, options) {
    if (typeof callback == "object")
      options = callback;
    if (callback == null || typeof callback == "object")
      callback = () => { };
    this._events = {
      "pong": (data) => {
        this._workers[data.id].data = data.data;
      },
      "error": (err, id) => {

      },
      "branch": (id) => {

      }
    };
    this._balancer = () => { return null; };
    this._workers = {};
    this._avaliableServers = {};
    this._grapes = {};
    this.server = net.createServer();
    this.options = {
      pingInterval: options?.pingInterval ?? 3000,
    }
    if (options?.ping) {
      this._pingInterval = setInterval(() => {
        for (let i in this._workers) {
          this._workers[i].worker.send("ping");
        }
      }, this.options.pingInterval);
    }
    //new net server to listen for TCP connections
    this.server.ID = "GRAPE_LOAD_BALANCER";

    this.server.on("connection", (socket) => {
      callback(socket);
      this.emit("connection", socket);
      let selectedWorker = null;
      let awaitingBody = false;
      let savedData = null;
      //waits for the client to send the headers 
      socket.on("data", (data) => {
        if (awaitingBody) {
          selectedWorker.connect(socket, savedData.toString() + data.toString());
          return;
        }

        if (socket.zaz) return;
        let req = parseHTTP(data.toString());
        let key = this._balancer(socket, req, data);
        let worker = this._grapes[key];
        //if the worker doesnt exist choose random worker
        if (worker == null) {
          let keys = Object.keys(this._avaliableServers);
          worker = this._grapes[keys[Math.round(Math.random() * (keys.length - 1))]];
        }
        selectedWorker = worker;
        if ('Content-Length' in req && (req.body.length != req['Content-Length'])) {
          savedData = data;
          awaitingBody = true;
          return;
        }

        //this.emit("redirect", worker);
        if (worker == null) return;
        worker.connect(socket, data);
      });
    });
  }
  balance(callback) {
    this._balancer = callback;
  }
  on(event, callback) {
    this._events[event] = callback;
  }
  servers() {
    let pack = {};
    for (let i in this._workers) {
      pack[i] = {
        id: i,
        info: this._workers[i].data
      }
    }
    return pack;
  }
  emit(event, ...args) {
    if (event in this._events)
      return this._events[event](...args);
  }
  send(id, id2, msg) {
    this._workers[id].worker.send([id2, msg]);
  }
  broadcast(id, msg) {
    for (let i in this._workers) {
      this._workers[i].worker.send([id, msg]);
    }
  }
  get workers() {
    return this._workers;
  }
  listen() {
    this.server.listen(...arguments);
  }
  branch(id, file, options) {
    if (typeof file == "object") {
      if (file.type == symbolServer) {
        let server1 = new SubServer(file.server, id, this);
        this._grapes[id] = server1;
        this._avaliableServers[id] = 1;
        return server1;
      }
    }

    let opt = {
      "env": options?.env ?? {},
    }
    opt.env["CHILD_PROCESS_ID"] = id;
    const controller = new AbortController();
    const { signal } = controller;
    const worker = child_process.fork(file, ["child", id], {
      env: opt.env,
      signal: signal
    });
    this._workers[id] = new Worker(worker, controller, id, this);
    this.emit("branch", id);
    this._grapes[id] = this._workers[id];
    this._avaliableServers[id] = 1;
    worker.on("message", (msg, socket) => {
      this.emit(msg[0], msg[1], socket);
    });
    worker.on("error", (err) => {
      //console.log(err);
      this.delete(id);
      this.emit("error", err, id);
    });
    return this._workers[id];
  }
  delete(id) {
    delete this._workers[id];
    delete this._grapes[id];
    delete this._avaliableServers[id];
  }
  abort(id) {
    try {
      this._workers[id].controller.abort();
      this.delete(id);
    } catch (e) {

    }
  }
}

function createLoadBalancer() {
  return new loadBalancer(...arguments);
}

class Branch {
  constructor(server) {
    this.server = server;
    this._events = {
      "FORWARD-HTTP-REQ": (msg, socket) => {
        if (socket == null) return;
        let buffer = Buffer.from(msg.rawheaders);
        this.server.emit("connection", socket);
        socket.emit("data", buffer);
      },
      "CONFIGURE": () => {

      },
      "ping": () => {

      }
    };
  }
  pong(data) {
    this.send("pong", { id: process.argv[3], data: data });
  }
  send(id, msg) {
    process.send([id, msg]);
  }
  emit(event, ...args) {
    if (event in this._events)
      this._events[event](...args);
  }
  on(id, callback) {
    this._events[id] = callback;
  }
  get id() {
    return process.argv[3];
  }
}

function setupBranch(server) {
  let branch = new Branch(server);
  process.on("message", (msg, socket) => {
    if (msg === "ping") {
      branch.emit("ping");
      return;
    }
    branch.emit(msg[0], msg[1], socket);
  });
  return branch;
}

function subServer(server) {
  return {
    type: symbolServer,
    server: server
  }
}

module.exports = {
  createLoadBalancer,
  setupBranch,
  subServer
}
