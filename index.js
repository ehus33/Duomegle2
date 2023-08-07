const express = require("express");
const cors = require("cors");
const socketIO = require("socket.io");
const { createServer } = require("http");

const app = express();
app.use(cors());
app.use(express.urlencoded({ extended: true }))
app.set("view engine", "ejs");
app.set("views", __dirname + "/views");

const server = createServer(app);
const io = socketIO(server);
const rooms = {}

app.get("/w3.css", (_, res) => {
  res.sendFile("w3.css", { root: __dirname })
});

app.get("/", (_, res) => res.render("index"))
app.get("/room", (_, res) => res.render("index"))

app.post("/room", (req, res) => {
  const { roomid } = req.body;
  if (!roomid) {
    res.send("Invalid room id");
    return;
  }

  if (!rooms[roomid]) {
    rooms[roomid] = [];
    res.redirect("/room/" + roomid)
    return;
  } else {
    const room = rooms[roomid]
    if (!Array.isArray(room)) {
      delete room[roomid];
      res.send("Invalid room id");
      return;
    }
    if (room.length >= 2) {
      res.send("Room is full");
      return;
    }
    res.redirect("/room/" + roomid)
  }
})

app.get("/room/:roomId", (req, res) => {
  const { roomId } = req.params;
  if (!roomId || !Array.isArray(rooms[roomId])) {
    res.redirect("/")
    return;
  }

  res.render("room", { roomId })
})

io.on("connection", socket => {
  console.log(`Connected: ${socket.id}`)
  socket.emit("ping");

  socket.on("pong", () => {
    console.log(`Ping succeeded: ${socket.id}`)
  });

  socket.on("join-room", (roomId) => {
    if (!rooms[roomId]) {
      socket.emit("err", { redir: true, event: "join-room", message: "Invalid room id" });
      return;
    }

    const room = rooms[roomId];
    if (room.length >= 2) {
      socket.emit("err", { redir: true, event: "join-room", message: "Room is full" });
      return;
    }

    if (room.length === 1) {
      console.log("joined room: " + roomId)
      const opp = room[0];
      socket.roomId = roomId;
      socket.isOwner = false;
      socket.emit("cb:join-room", { roomId, isOwner: false })
      socket.emit("new-member", { sid: opp.id })
      rooms[roomId] = [opp, socket];
      opp.emit("new-member", { sid: socket.id })
      return;
    } else if (room.length === 0) {
      console.log("Joined room: " + roomId)
      rooms[roomId] = [socket];
      socket.roomId = roomId;
      socket.isOwner = false;
      socket.emit("cb:join-room", { roomId, isOwner: true })
      return;
    }
  })

  socket.on("signal", data => {
    console.log(`${socket.id} is signalling ${data}`)
    const room = rooms[socket.roomId];
    if (!Array.isArray(room)) {
      socket.emit("err", { redir: true, event: "signal", message: "Not in a room" });
      return;
    }

    if (room.length !== 2) {
      socket.emit("err", { redir: true, event: "signal", message: "Opp not there" });
      return;
    }

    const opp = room.find(i => i.id !== socket.id);
    try {
      opp.emit("signal", { data: JSON.parse(data) })
      console.log(`${socket.id} signalled to ${opp.id}`)
    } catch {
      socket.emit("err", { redir: true, event: "signal", message: "Invalid signal" });
      return;
    }
  })

  socket.on("disconnect", () => {
    console.log(`${socket.id} disconnected`)
    if (!socket.roomId) return;
    const room = rooms[socket.roomId];
    if (!Array.isArray(room)) return
    if (room.length === 2) {
      const opp = room.find(i => i.id !== socket.id);
      if (opp) {
        opp.emit("member-left", { sid: socket.id });
        opp.isOwner = true
        rooms[socket.roomId] = [opp];
      }
    } else {
      delete rooms[socket.roomId];
    }
  })
})

server.listen(process.env.PORT || 5000, () => {
  console.log("Server started on port " + (process.env.PORT || 5000))
})
