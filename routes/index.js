const express = require('express');
const axios = require('axios');

function createRoutes({ dbPool, whatsappService, phoneNumberId }) {
    const router = express.Router();


    router.post('/api/send', async (req, res) => {
        console.log(req.body);
        const { to, message } = req.body;

        if (!to || !message) {
            return res.status(400).json({ error: 'Missing "to" or "message" in request body.' });
        }

        const sentMessageId = await whatsappService.sendWhatsAppMessage(to, message);

        if (sentMessageId) {
            await whatsappService.saveMessageToDb(sentMessageId, phoneNumberId, to, message, 'sent', Math.floor(Date.now() / 1000));
            return res.status(200).json({ success: true, messageId: sentMessageId });
        }

        return res.status(500).json({ success: false, error: 'Failed to send message.' });
    });

    router.get('/', (req, res) => {
        const verifyToken = process.env.WEBHOOK_VERIFY_TOKEN;
        console.log(verifyToken);

        const mode = req.query['hub.mode'];
        const token = req.query['hub.verify_token'];
        const challenge = req.query['hub.challenge'];

        if (mode && token) {
            if (mode === 'subscribe' && token === verifyToken) {
                console.log('WEBHOOK_VERIFIED');
                return res.status(200).send(challenge);
            }

            return res.sendStatus(403);
        }

        return res.sendStatus(400);
    });

    router.post('/', async (req, res) => {
       console.log('Received webhook event:', JSON.stringify(req.body, null, 2));
       
        const entry = req.body.entry && req.body.entry[0];
        if (entry && entry.changes && entry.changes[0] && entry.changes[0].value) {
            const value = entry.changes[0].value;
            const messages = value.messages;

            if (messages && messages.length > 0) {
                for (const message of messages) {
                    const messageId = message.id;
                    const fromPhone = message.from;
                    const toPhone = value.metadata.phone_number_id;
                    const body = message.text ? message.text.body : '';
                    const type = message.type;
                    const timestamp = parseInt(message.timestamp, 10);

                    await whatsappService.saveMessageToDb(messageId, fromPhone, toPhone, body, type, timestamp);
                }
            }
        }

        return res.sendStatus(200);

        
    });

    router.use((req, res) => {
        console.warn(`Route not found: ${req.method} ${req.originalUrl}`);
        return res.status(404).json({
            success: false,
            message: `Route not found: ${req.method} ${req.originalUrl}`
        });
    });

    return router;
}

module.exports = {
    createRoutes
};
