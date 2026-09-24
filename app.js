// index.js
const express = require('express');
const bodyParser = require('body-parser');
const mysql = require('mysql2/promise');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();
const urlfrontend = process.env.URLFRONTEND || '*';
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(cors({
    origin: urlfrontend,
    credentials: true
}));

const dbPool = mysql.createPool({
    host: process.env.HOST_DATABASE,
    user: process.env.USER_DATABASE,
    password: process.env.PWD_DATABASE,
    database: process.env.NAME_DATABASE,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

async function testDbConnection() {
    try {
        const connection = await dbPool.getConnection();
        console.log('Successfully connected to the MySQL database.');
        connection.release();
    } catch (error) {
        console.error('Error connecting to the MySQL database:', error);
        process.exit(1);
    }
}

async function saveMessageToDb(messageId, fromPhone, toPhone, body, type, timestamp) {
    const query = `
        INSERT INTO messages (message_id, from_phone, to_phone, body, type, timestamp)
        VALUES (?, ?, ?, ?, ?, ?)
    `;

    try {
        const messageTime = new Date(timestamp * 1000);
        await dbPool.execute(query, [messageId, fromPhone, toPhone, body, type, messageTime]);
        console.log(`Message ${messageId} saved to the database.`);
    } catch (error) {
        console.error(`Failed to save message ${messageId} to DB:`, error);
    }
}

const WHATSAPP_API_TOKEN = process.env.WHATSAPP_API_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WHATSAPP_VERSION_API = process.env.WHATSAPP_VERSION_API || 'v18.0';
const WHATSAPP_API_URL = `https://graph.facebook.com/${WHATSAPP_VERSION_API}/${PHONE_NUMBER_ID}/messages`;

async function sendWhatsAppMessage(to, messageText) {
    console.log(WHATSAPP_API_URL);

    try {
        const response = await axios.post(WHATSAPP_API_URL, {
            messaging_product: 'whatsapp',
            to,
            type: 'text',
            text: {
                body: messageText
            }
        }, {
            headers: {
                Authorization: `Bearer ${WHATSAPP_API_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });

        const messageId = response.data.messages[0].id;
        console.log(`Message sent successfully to ${to}. Message ID: ${messageId}`);
        return messageId;
    } catch (error) {
        console.error('Error sending WhatsApp message:', error.response ? error.response.data : error.message);
        return null;
    }
}

const { createWhatsAppService } = require('./services/whatsappService');
const { createRoutes } = require('./routes');

const whatsappService = createWhatsAppService({
    dbPool,
    token: process.env.WHATSAPP_API_TOKEN,
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    version: process.env.WHATSAPP_VERSION_API || 'v18.0'
});

app.use(createRoutes({
    dbPool,
    whatsappService,
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID
}));

app.listen(PORT, async () => {
    console.log(`Server is running on port ${PORT}`);
    await testDbConnection();
});
