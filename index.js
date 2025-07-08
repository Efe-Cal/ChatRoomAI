import express from "express"
import { Server } from "socket.io"
import path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PORT = process.env.PORT || 3500
const ADMIN = "Admin"
const AI = "AI"

// state
const UsersState = {
    users:[],
    setUsers:function(newUsersArray){
        this.users = newUsersArray
    }
}

//{rooms:[room:message[]]}
const MessagesState = {
    rooms:{},
    addMessage:function(room, message, role="user"){
        if (!this.rooms[room]) {
            this.rooms[room] = [];
        }
        this.rooms[room].push({message:message,role:role})
    }
}

const app = express()

app.use(express.static(path.join(__dirname, "public")))

const expressServer = app.listen(PORT, ()=>{
    console.log(`Listening on port ${PORT}`)
})

const io = new Server(expressServer ,{
    cors:{
        origin:process.env.NODE_ENV === "production" ? false : ["http://localhost:5500","http://127.0.0.1:5500"]
    }
})

io.on("connection",socket=>{
    console.log(`User ${socket.id} connected`)
    // to only to connected user
    socket.emit("message", buildMsg(ADMIN,"Welcome to ChatRoomAI"))

    socket.on("enterRoom", ({name,room})=>{
        const prevRoom = getUser(socket.id)?.room
        if(prevRoom){
            socket.leave(prevRoom)
            io.to(prevRoom).emit("message",buildMsg(ADMIN,`${name} has left the room`))
        }
        const user = activateUser(socket.id, name, room)
        if(prevRoom){
            io.to(prevRoom).emit("userList",{
                users: getUsersInRoom(prevRoom)
            })
        }

        socket.join(user.room)
        // to joiner
        socket.emit("message", buildMsg(ADMIN, `You have joined the ${user.room} chat room`))
        
        // to everyone else
        socket.broadcast.emit("message",buildMsg(ADMIN, `${user.name} has joined the room`))

        // update user list for the room
        io.to(user.room).emit("userList",{
            users: getUsersInRoom(user.room)
        })
        io.emit("roomList",{
            rooms: getAllActiveRooms()
        })
    })

    // listen for messages
    socket.on("message", ({name, text}) => {
        const room = getUser(socket.id).room
        if (room){
            io.to(room).emit("message",buildMsg(name,text))
            MessagesState.addMessage(room, text)
            // send messages to ai
            callAI(room)
        }
    })

    socket.on("disconnect", ()=>{
        const user = getUser(socket.id)
        userLeaves(socket.id)
        if(user){
            io.to(user.room).emit("message",buildMsg(ADMIN,`User ${user.name} disconnected`))
            io.to(user.room).emit("userList",{
                users: getUsersInRoom(user.id)
            })
            io.emit("roomList",{
                rooms: getAllActiveRooms()
            })
        }
    });

    socket.on("activity", (name)=>{
        const room = getUser(socket.id)?.room
        if(room){
            socket.broadcast.to(room).emit("activity",name)
        }
    })
})

function buildMsg(name, text){
    return {
        name,
        text,
        time: Intl.DateTimeFormat("default",{
            hour:"numeric",
            minute:"numeric",
            second:"numeric"
        }).format(new Date())
    }
}

// User Functions
function activateUser(id, name, room){
    const user = { id, name, room }
    UsersState.setUsers([
        ...UsersState.users.filter(user => user.id !== id),
        user
    ])
    return user
}

function userLeaves(id){
    UsersState.users.filter(user => user.id !== id)
    
}

function getUser(id) {
    return UsersState.users.find(user => user.id === id)
}

function getUsersInRoom(room){
    return UsersState.users.filter(user => user.room===room)
}

function getAllActiveRooms(){
    return Array.from(new Set(UsersState.users.map(user => user.room)))
}

function getAllMessagesInRoom(room){
    return MessagesState.rooms[room] || []
}

function fetchAIResponse(messages){
    if (messages.length === 0) {
        return "No messages to process."
    }
    messages = messages.map(msg => ({
        role: msg.role || "user",
        content: msg.message || msg.text
    }))
    console.log("Messages for AI:", messages)
    return fetch("https://ai.hackclub.com/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            messages: messages
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.error) {
            console.error("AI Error:", data.error)
            return "Error fetching AI response"
        }
        return data.choices[0].message.content
    })
    
}
function callAI(room){
    const messages = getAllMessagesInRoom(room)
    fetchAIResponse(messages).then(response => {
        if (response) {
            const aiMessage = buildMsg(AI, response)
            io.to(room).emit("message", aiMessage)
            MessagesState.addMessage(room, aiMessage.text, "assistant")
        } else {
            console.error("No response from AI")
        }
    }).catch(err => {
        console.error("Error calling AI:", err)
        io.to(room).emit("message", buildMsg(ADMIN, "Error fetching AI response"))
    })
}