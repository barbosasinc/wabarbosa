const axios = require('axios');

function createWhatsAppService({ dbPool, token, phoneNumberId, version = 'v18.0' }) {
    const apiUrl = `https://graph.facebook.com/${version}/${phoneNumberId}/messages`;

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

    async function sendWhatsAppMessage(to, messageText) {
        console.log(apiUrl);

        try {
            const response = await axios.post(apiUrl, {
                messaging_product: 'whatsapp',
                to,
                type: 'text',
                text: {
                    body: messageText
                }
            }, {
                headers: {
                    Authorization: `Bearer ${token}`,
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

    return {
        saveMessageToDb,
        sendWhatsAppMessage
    };
}

module.exports = {
    createWhatsAppService
};
