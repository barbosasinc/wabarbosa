// index.js
// This is the main file for the Node.js Express server.

// =================================================================
// 1. DEPENDENCIES
// =================================================================
const express = require('express');
const bodyParser = require('body-parser');
const mysql = require('mysql2/promise');
const axios = require('axios');
require('dotenv').config();

// =================================================================
// 2. EXPRESS APP INITIALIZATION
// =================================================================
const app = express();
// It's crucial to use bodyParser.json() to parse the incoming webhook requests.
// WhatsApp sends data in JSON format.
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;

// =================================================================
// 3. MYSQL DATABASE CONNECTION
// =================================================================
// We use a connection pool to manage database connections efficiently.
const dbPool = mysql.createPool({
    host: process.env.HOST_DATABASE,
    user: process.env.USER_DATABASE,
    password: process.env.PWD_DATABASE,
    database: process.env.NAME_DATABASE,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Function to test the database connection on startup.
async function testDbConnection() {
    try {
        const connection = await dbPool.getConnection();
        console.log('Successfully connected to the MySQL database.');
        connection.release();
    } catch (error) {
        console.error('Error connecting to the MySQL database:', error);
        // Exit the process if the database connection fails, as the app cannot function without it.
        process.exit(1);
    }
}

// =================================================================
// 4. DATABASE LOGIC
// =================================================================
/**
 * Saves a message (either sent or received) into the database.
 * @param {string} messageId - The unique ID of the WhatsApp message.
 * @param {string} fromPhone - The sender's phone number.
 * @param {string} toPhone - The recipient's phone number.
 * @param {string} body - The content of the message.
 * @param {'sent' | 'received'} type - The type of the message.
 * @param {number} timestamp - The Unix timestamp of the message.
 */
async function saveMessageToDb(messageId, fromPhone, toPhone, body, type, timestamp) {
    const query = `
        INSERT INTO messages (message_id, from_phone, to_phone, body, type, timestamp)
        VALUES (?, ?, ?, ?, ?, ?)
    `;
    try {
        // Convert Unix timestamp to a MySQL DATETIME format.
        const messageTime = new Date(timestamp * 1000);
        await dbPool.execute(query, [messageId, fromPhone, toPhone, body, type, messageTime]);
        console.log(`Message ${messageId} saved to the database.`);
    } catch (error) {
        console.error(`Failed to save message ${messageId} to DB:`, error);
    }
}


// =================================================================
// 5. WHATSAPP API LOGIC
// =================================================================
const WHATSAPP_API_TOKEN = process.env.WHATSAPP_API_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WHATSAPP_VERSION_API =  process.env.WHATSAPP_VERSION_API || "v18.0";
const WHATSAPP_API_URL = `https://graph.facebook.com/${WHATSAPP_VERSION_API}/${PHONE_NUMBER_ID}/messages`;

/**
 * Sends a text message using the WhatsApp Business API.
 * @param {string} to - The recipient's phone number.
 * @param {string} messageText - The text message to send.
 * @returns {Promise<string|null>} The message ID of the sent message, or null on failure.
 */
async function sendWhatsAppMessage(to, messageText) {
    try {
        const response = await axios.post(WHATSAPP_API_URL, {
            messaging_product: 'whatsapp',
            recipient_type: "individual",
            to: to,
            type: 'text',
            text: {
                preview_url: false,
                body: messageText
            }
        }, {
            headers: {
                'Authorization': `Bearer ${WHATSAPP_API_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });

        // Extract the message ID from the response
        const messageId = response.data.messages[0].id;
        console.log(`Message sent successfully to ${to}. Message ID: ${messageId}`);
        return messageId;
    } catch (error) {
        console.error('Error sending WhatsApp message:', error.response ? error.response.data : error.message);
        return null;
    }
}


// =================================================================
// 6. API ENDPOINTS
// =================================================================

// -----------------------------------------------------------------
// Endpoint for sending messages
// -----------------------------------------------------------------
app.post('/send', async (req, res) => {
    const { to, message } = req.body;

    if (!to || !message) {
        return res.status(400).json({ error: 'Missing "to" or "message" in request body.' });
    }

    const sentMessageId = await sendWhatsAppMessage(to, message);

    if (sentMessageId) {
        // Save the sent message to our database
        // The sender is our business phone number ID.
        // The timestamp is generated now.
        await saveMessageToDb(sentMessageId, PHONE_NUMBER_ID, to, message, 'sent', Math.floor(Date.now() / 1000));
        res.status(200).json({ success: true, messageId: sentMessageId });
    } else {
        res.status(500).json({ success: false, error: 'Failed to send message.' });
    }
});

// -----------------------------------------------------------------
// Endpoints for WhatsApp Webhook (Verification and Receiving Messages)
// -----------------------------------------------------------------

// This endpoint is for webhook verification, as required by Meta.
app.get('/webhook', (req, res) => {
    const verify_token = process.env.WEBHOOK_VERIFY_TOKEN;

    // Parse params from the webhook verification request
    let mode = req.query['hub.mode'];
    let token = req.query['hub.verify_token'];
    let challenge = req.query['hub.challenge'];

    // Check if a token and mode were sent
    if (mode && token) {
        // Check the mode and token sent are correct
        if (mode === 'subscribe' && token === verify_token) {
            // Respond with 200 OK and challenge token from the request
            console.log('WEBHOOK_VERIFIED');
            res.status(200).send(challenge);
        } else {
            // Responds with '403 Forbidden' if verify tokens do not match
            res.sendStatus(403);
        }
    } else {
        res.sendStatus(400);
    }
});

// This endpoint receives incoming messages from WhatsApp.
app.post('/webhook', async (req, res) => {
    const body = req.body;

    // Check if this is a WhatsApp notification
    if (body.object === 'whatsapp_business_account') {
        // It's good practice to iterate through entries, although there's usually only one.
        for (const entry of body.entry) {
            for (const change of entry.changes) {
                // We only care about the 'messages' field
                if (change.field === 'messages') {
                    const messageData = change.value.messages[0];
                    
                    // We only process text messages in this example
                    if (messageData.type === 'text') {
                        const from = messageData.from; // Sender's phone number
                        const messageId = messageData.id;
                        const timestamp = messageData.timestamp;
                        const textBody = messageData.text.body;
                        
                        // The 'to' number is our business phone number, which we get from the metadata
                        const to = change.value.metadata.display_phone_number;

                        console.log(`Received message: "${textBody}" from ${from}`);

                        // Save the received message to the database
                        await saveMessageToDb(messageId, from, to, textBody, 'received', timestamp);
                    }
                }
            }
        }
    }

    // Respond with 200 OK to acknowledge receipt of the event
    res.sendStatus(200);
});


// =================================================================
// 7. SERVER STARTUP
// =================================================================
app.listen(PORT, async () => {
    console.log(`Server is running on port ${PORT}`);
    await testDbConnection();
});
