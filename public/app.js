const socket = io('ws://localhost:3500')

const msgInput = document.querySelector("#message")
const nameInput = document.querySelector("#name")
const chatRoom = document.querySelector("#room")
const aiCheckbox = document.querySelector("#ai")
const numMsgInput = document.querySelector("#numMsg")
const activity = document.querySelector(".activity")
const usersList = document.querySelector(".user-list")
const roomList = document.querySelector(".room-list")
const chatDisplay = document.querySelector(".chat-display")
const msgForm = document.querySelector('.form-message')
const msgFormBtn = msgForm.querySelector('button[type="submit"]')

// Disable inputs and button on load
msgInput.disabled = true
aiCheckbox.disabled = true
numMsgInput.disabled = true
msgFormBtn.disabled = true

function enableMessageInputs() {
    msgInput.disabled = false
    aiCheckbox.disabled = false
    numMsgInput.disabled = false
    msgFormBtn.disabled = false
}

function sendMessage(e) {
    e.preventDefault()
    if (msgInput.value && chatRoom.value && nameInput.value ) {
        socket.emit("message", {
            name:nameInput.value,
            text:msgInput.value
        })
        msgInput.value = ""
    }
    msgInput.focus()
}

function enterRoom(e){
    e.preventDefault()
    if( nameInput.value && chatRoom.value ){
        socket.emit("enterRoom",{
            name:nameInput.value,
            room:chatRoom.value
        })
        enableMessageInputs()
    }
}

document.querySelector('.form-message')
    .addEventListener('submit', sendMessage)

document.querySelector(".form-join")
    .addEventListener("submit",enterRoom)
    
msgInput.addEventListener("keypress", ()=>{
    socket.emit("activity",nameInput.value)
})

aiCheckbox.addEventListener("change", (e)=>{
    e.preventDefault()
    if (aiCheckbox.checked) {
        socket.emit("aiEnable", { room:chatRoom.value, enabled: true })
    } else {
        socket.emit("aiEnable", { room:chatRoom.value, enabled: false })
    }
})
numMsgInput.addEventListener("keydown", (e) => {
    // Prevent form submission when Enter is pressed in the numMsgInput
    if (e.key === "Enter") {
        e.preventDefault()
        const num = parseInt(numMsgInput.value, 10)
        if (isNaN(num) || num < 1 || num > 10) {
            numMsgInput.value = 1 // Reset to default if invalid
        } else {
            socket.emit("numMsgChange", { room: chatRoom.value, num: num })
        }
    }
})

numMsgInput.addEventListener("change", (e) => {
    const num = parseInt(numMsgInput.value, 10)
    if (isNaN(num) || num < 1 || num > 10) {
        numMsgInput.value = 1 // Reset to default if invalid
    } else {
        socket.emit("numMsgChange", { room: chatRoom.value, num: num })
    }
})


// Listen for messages 
socket.on("message", (data) => {
    activity.textContent = ""
    const { name, text, time } = data
    const li = document.createElement('li')
    li.className = "post"
    if (name===nameInput.value) li.className = "post post--right"
    if (name!==nameInput.value && name !== "Admin") li.className = "post post--left"
    if (name!=="Admin"){
        li.innerHTML = `<div class="post__header ${name === nameInput.value
            ? 'post__header--user'
            : 'post__header--reply'
            }">
        <span class="post__header--name">${name}</span> 
        <span class="post__header--time">${time}</span> 
        </div>
        <div class="post__text">${text}</div>`
    }
    else{
        li.innerHTML = `<div class="post__text">${text}</div>`
    }
    
    document.querySelector('.chat-display').appendChild(li)
    chatDisplay.scrollTop = chatDisplay.scrollHeight
})

let activityTimer
socket.on("activity", (name)=>{
    activity.textContent = name + "is typing"

    // Clear after 1.5 seconds
    clearTimeout(activityTimer)
    activityTimer = setTimeout(()=>{
        activity.textContent=""
    },1500)
})

socket.on("userList", ({users})=>{
    showUsers(users)
})

socket.on("roomList", ({rooms})=>{
    showRooms(rooms)
})

socket.on("aiChange", (aiUsageState)=>{
    console.log("AI enabled:", aiUsageState.enabled)
    if (!isNaN(aiUsageState.enabled) && aiUsageState.enabled) {
        aiCheckbox.checked = true
    } else if (!isNaN(aiUsageState.enabled) && !aiUsageState.enabled) {
        aiCheckbox.checked = false
    }
    if (aiUsageState.lastN) {
        numMsgInput.value = aiUsageState.lastN
    }
})

function showUsers(users){
    usersList.textContent = ""
    if (users && users.length > 0) {
        usersList.innerHTML = `<em>User in ${chatRoom.value}: </em>`
        usersList.innerHTML += users.map(user => user.name).join(", ")
    }
}

function showRooms(rooms){
    roomList.textContent = ""
    if (rooms && rooms.length > 0) {
        roomList.innerHTML = `<em>Active Rooms: </em>`
        roomList.innerHTML += rooms.join(", ")
    }
}