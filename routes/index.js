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
