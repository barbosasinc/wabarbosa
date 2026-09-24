const express = require('express');
const axios = require('axios');

function createRoutes({ dbPool, whatsappService, phoneNumberId }) {
    const router = express.Router();

    router.get('/message', async (req, res) => {
        console.log('/message');
        res.sendStatus(200);
    });

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
        const body = req.body;

        if (body.object === 'whatsapp_business_account') {
            for (const entry of body.entry) {
                for (const change of entry.changes) {
                    if (change.field === 'messages') {
                        console.log('new message');

                        change.value.messages.forEach((messageData) => {
                            if (messageData.type === 'text') {
                                const from = messageData.from;
                                const messageId = messageData.id;
                                const timestamp = messageData.timestamp;
                                const textBody = messageData.text.body;
                                const to = change.value.metadata.display_phone_number;

                                console.log(`Received message: "${textBody}" from ${from}`);
                                whatsappService.saveMessageToDb(messageId, from, to, textBody, 'received', timestamp);
                            }

                            try {
                                axios.post('https://wabarbosa.bubbleapps.io/msg_new', messageData);
                            } catch (error) {
                                console.log('Erro ao enviar msg para bubble');
                            }
                        });
                    }
                }
            }
        }

        return res.sendStatus(200);
    });

    router.get('/api/conversations', async (req, res) => {
        console.log('received');

        try {
            const sql = `
                SELECT
                    LEAST(from_phone, to_phone) AS party1,
                    GREATEST(from_phone, to_phone) AS party2,
                    MAX(timestamp) AS last_message_time
                FROM messages
                GROUP BY party1, party2
                ORDER BY last_message_time DESC;
            `;

            const [rows] = await dbPool.query(sql);
            return res.json(rows);
        } catch (error) {
            console.error('Database query failed:', error);
            return res.status(500).json({ error: 'Failed to fetch conversations from the database.' });
        }
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
