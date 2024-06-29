require('dotenv').config();
const { Rcon } = require("rcon-client");
const { WebcastPushConnection } = require('tiktok-live-connector');
const setTitle = require('node-bash-title');
const axios = require('axios');

console.log("TikTok-Game API by kuezese");
console.log("Version: 1.0.0-SNAPSHOT");
console.log();

let rcon = null;
let diamondsAll = 0;
let cash = 0;
let viewers = 0;
let likes = 0;
let followers = [];

async function connectRcon() {
    rcon = await Rcon.connect({
        host: process.env.RCON_HOST, port: process.env.RCON_PORT, password: process.env.RCON_PASS
    });
    console.log(await rcon.send("ver"))
    console.log("Connected to RCON.");
}

async function checkLicense(license) {
    try {
      // Replace the URL with the actual endpoint URL
      const apiUrl = `http://api.cmclient.pl:2086/tikauth?license=${license}`;
      const response = await axios.get(apiUrl);
  
      // Check if "success" field is "true" or "false"
      const { success, message } = response.data;
  
      if (!success) {
        // Log the message
        console.warn("Failed to authorize license! Response:", message);
      }
  
      return success;
    } catch (error) {
      console.error("Error occurred:", error.message);
      return false;
    }
  }

async function sendRcon(command) {
    if (rcon != null) {
        try {
            await rcon.send(command);
        } catch (error) {
            console.error("An error occurred while sending the RCON command:", error.message);
        }
    }
}

const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
});

async function setTitleBar() {
    var money = formatter.format(cash);
    await setTitle(`TikTok Live (${process.env.TIKTOK_USERNAME}) 💲: ${money} | 👀: ${viewers} | ❤: ${likes}`);
}

async function main() {
    // Create title bar
    await setTitleBar();

    console.log(`Checking license (${process.env.LICENSE_KEY})...`);
    const licenseSuccess = /*await checkLicense(process.env.LICENSE_KEY)*/ true;

    if (licenseSuccess) {
        console.log('Successfully authorized license');
    } else {
        process.exit();
        return;
    }

    // Connect to RCON
    console.log("Connecting to RCON...");
    await connectRcon();

    // Connect to TikTok
    console.log("Connecting to TikTok...");

    // Username of someone who is currently live
    const tiktokUsername = process.env.TIKTOK_USERNAME;

    console.log("Connecting to TikTok live: " + tiktokUsername);

    // Create a new wrapper object and pass the username
    let tiktokLiveConnection = new WebcastPushConnection(tiktokUsername, {
        processInitialData: false,
        enableExtendedGiftInfo: true,
        enableWebsocketUpgrade: true,
        requestPollingIntervalMs: 500,
        clientParams: {
            "app_language": "en-US",
            "device_platform": "web"
        }
    });

    // Connect to the chat (await can be used as well)
    tiktokLiveConnection.connect().then(state => {
        console.info(`Connected to roomId ${state.roomId}`);
    }).catch(err => {
        console.error('Failed to connect', err);
    })

    // Define the events that you want to handle
    // In this case we listen to chat messages (comments)
    tiktokLiveConnection.on('chat', async data => {
        console.log(`[CHAT] ${data.uniqueId} (userId:${data.userId}): ${data.comment}`);
        sendRcon(`tiktokchat ${data.uniqueId} ${data.comment}`);
    })

    tiktokLiveConnection.on('member', async data => {
        console.log(`[JOIN] ${data.uniqueId} joins the stream`);
        sendRcon(`tiktokjoin ${data.uniqueId}`);
    })

    // And here we receive gifts sent to the streamer
    tiktokLiveConnection.on('gift', async data => {
        if (data.giftType === 1 && !data.repeatEnd) {
            console.log(`[GIFT] ${data.uniqueId} is sending gift ${data.giftName} x${data.repeatCount}`);
            const giftData = {
                player: data.uniqueId,
                giftName: data.giftName,
                amount: data.repeatCount
            };
            sendRcon(`stopcountdown ${JSON.stringify(giftData)}`);
        } else {
            console.log(`[GIFT] ${data.uniqueId} ${data.giftName} x${data.repeatCount}`);
            diamondsAll = diamondsAll + data.diamondCount * data.repeatCount;
            cash += data.diamondCount * data.repeatCount * 0.005;
            setTitleBar();
            const giftData = {
                player: data.uniqueId,
                giftName: data.giftName,
                amount: data.repeatCount
            };
            sendRcon(`tiktokgift ${JSON.stringify(giftData)}`);
            sendRcon(`update gifter ${data.uniqueId}`);
        }
    })

    // Likes
    tiktokLiveConnection.on('like', async data => {
        likes = data.totalLikeCount;
        sendRcon(`tiktoklikes ${data.uniqueId} ${data.likeCount} ${data.totalLikeCount}`);
        sendRcon(`update likes ${data.totalLikeCount}`);
        setTitleBar();
    })

    // Follows
    tiktokLiveConnection.on('follow', async data => {
        console.log(`[FOLLOW] ${data.uniqueId} followed`);
        if (data.uniqueId !== 'undefined') {
            if (!followers.includes(data.uniqueId)) {
                sendRcon(`update follower ${data.uniqueId}`);
                followers.push(data.uniqueId);
            }
        }
    })

    // Viewers
    tiktokLiveConnection.on('roomUser', async data => {
        viewers = data.viewerCount;
        sendRcon(`update viewers ${data.viewerCount}`);
        setTitleBar();
    })
}

main();