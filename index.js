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

const aiRoomState = {
    rooms:{},
    setAIEnabled:function(room, enabled){
        if (!this.rooms[room]) {
            this.rooms[room] = { enabled: false, lastN: 1 }
        }
        this.rooms[room].enabled = enabled
    },
    isAIEnabled:function(room){
        return this.rooms[room]?.enabled || false
    },
    setLastNMessages:function(room, num){
        if (!this.rooms[room]) {
            this.rooms[room] = { enabled: false, lastN: 1 }
        }
        this.rooms[room].lastN = num
    },
    getLastNMessages:function(room){
        return this.rooms[room]?.lastN || 1
    }
}

const app = express()

app.use(express.static(path.join(__dirname, "public")))

const expressServer = app.listen(PORT, ()=>{
    console.log(`Listening on port ${PORT}`)
})

const io = new Server(expressServer ,{
    cors:["*"]
    // {
        // origin:process.env.NODE_ENV === "production" ? false : ["http://localhost:5500","http://127.0.0.1:5500"]
    // }
})

io.on("connection",socket=>{
    console.log(`User ${socket.id} connected`)
    // to only to connected user
    socket.emit("message", buildMsg(ADMIN,"Welcome to ChatRoomAI"))
    io.emit("roomList",{
        rooms: getAllActiveRooms()
    })

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
    socket.on("message", async ({name, text}) => {
        const room = getUser(socket.id).room
        if (room){
            io.to(room).emit("message", buildMsg(name,text))
            MessagesState.addMessage(room, text)
            if(text.trim() === "/clear") {
                io.to(room).emit("message", buildMsg(ADMIN, "Chat cleared"))
                MessagesState.rooms[room] = []
                return
            }
            if (aiRoomState.isAIEnabled(room)) {
                const aiResponse = await callAI(room)
                if (aiResponse) {
                    io.to(room).emit("message", aiResponse)
                    if (aiResponse.name === AI) {
                        // Add AI response to messages state
                        MessagesState.addMessage(room, aiResponse.text, "assistant")
                    }
                    MessagesState.addMessage(room, aiResponse.text, "assistant")
                } else {
                    console.error("No AI response received")
                }
            }
            if(text.substring(0, 4) === "/ai ") {
                const aiCommand = text.substring(4).trim()
                console.log(`AI command received: ${aiCommand}`)
                const aiResponse = await fetchAIResponse([{role: "user", message: aiCommand}])
                if (aiResponse) {
                    const aiMessage = buildMsg(AI, aiResponse)
                    io.to(room).emit("message", aiMessage)
                }
            }
        }
    })

    socket.on("aiEnable", ({room, enabled})=>{
        if (enabled) {
            io.to(room).emit("aiChange", {enabled: true})
            io.to(room).emit("message", buildMsg(ADMIN, "AI is now enabled for this room"))
            aiRoomState.setAIEnabled(room, true)
        }
        else {
            io.to(room).emit("aiChange", {enabled: false})
            io.to(room).emit("message", buildMsg(ADMIN, "AI is now disabled for this room"))
            aiRoomState.setAIEnabled(room, false)
        }
    })
    
    socket.on("numMsgChange", ({room, num})=>{
        if (num < 1 || num > 10) {
            console.error("Invalid number of messages:", num)
            return
        }
        io.to(room).emit("aiChange", { lastN: num })    
        aiRoomState.setLastNMessages(room, num)
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
    // Remove user from UsersState
    UsersState.setUsers(UsersState.users.filter(user => user.id !== id))
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
async function callAI(room){
    let messages = getAllMessagesInRoom(room)
    const lastN = aiRoomState.getLastNMessages(room)
    console.log(`Calling AI with last ${lastN} messages in room ${room}`)
    // Only send the last N messages, and avoid sending the last AI message again
    messages = messages.slice((-lastN - (messages.length > 1 ? 1 : 0)))
    try {
        const response = await fetchAIResponse(messages)
        if (response) {
            const aiMessage = buildMsg(AI, response)
            return aiMessage
        } else {
            console.error("No response from AI")
            return buildMsg(ADMIN, "No response from AI")
        }
    } catch (err) {
        console.error("Error calling AI:", err)
        return buildMsg(ADMIN, "Error fetching AI response")
    }
}