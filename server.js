const express = require('express');
const cors = require('cors');
const { makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const Boom = require('@hapi/boom');
const qrcode = require('qrcode-terminal');
const OpenAI = require('openai');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Use CORS
// Allow specific origins or an array of origins
app.use(cors({
    origin: ['http://localhost:5173', 'https://caawiye-bots.vercel.app']
}));

// Initialize OpenAI
const openai = new OpenAI({
    apiKey: process.env.API_KEY
});

let currentQR = null; // Store the QR code

// Generate a response from OpenAI
async function generateResponse(prompt) {
    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4o", // Token-efficient model
            messages: [
                { "role": "system", "content": 
                    `
                    You're a bot for a company (Caawiye Bots) that makes AI bots for businesses:


                    1. Our services:
                        We make efficient and advanced AI bots for businesses to help improve their customer service.
                    2. Our billing plans :
                        -We offer monthly at $30 and yearly at $300.
                    3. Benefits of our AI bots:
                        - Helps improve customer service for businesses.
                        - Makes businesses available 24/7.
                    4.if customer ask where your comany located at :
                        - now we are virtually online
                    5.if customer asks a person or real person :
                        -let them now we call them asap or give it my number : +252611430930.
                    6. If the customer agrees to the plan or wants a bot ask more about the business he/she has/have that wants for a bot:
                        -Let them know we will call them later to confirm their order and ask more about their custom bot. Thank them!
                    
                    Make sure you respond in Somali to each question appropriately each one when asked.
                    `
                },
                { "role": "user", "content": prompt }
            ]
        });

        return response.choices[0].message.content;
    } catch (error) {
        console.error("Error generating response:", error);
        return "Sorry, there was an issue generating a response.";
    }
}
// WhatsApp connection setup
async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false 
    });

    // Connection update handler
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            currentQR = qr; // Save the QR code
            console.log("New QR code generated");
        }

        if (connection === 'close') {
            const shouldReconnect = Boom.isBoom(lastDisconnect?.error) && lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                connectToWhatsApp();  // Reconnect if not logged out
            }
        } else if (connection === 'open') {
            currentQR = null;  // Clear QR when connected
            console.log('WhatsApp connected');
        }
    });

    // Save credentials on update
    sock.ev.on('creds.update', saveCreds);

    // Message handler
    sock.ev.on('messages.upsert', async (m) => {
        const message = m.messages[0];
        if (!message.message || message.key.fromMe) return; // Ignore if no message or from self

        const userId = message.key.remoteJid;
        const textMessage = message.message.conversation || message.message.extendedTextMessage?.text || '';

        // console.log(`Received message from ${userId}: ${textMessage}`);

        // Generate response using OpenAI
        const responseText = await generateResponse(textMessage);
        // console.log(`Sending response: ${responseText}`);

        // Send the response back to the user
        await sock.sendMessage(userId, { text: responseText });
    });
}

// Start WhatsApp connection
connectToWhatsApp();

// API route to get the current QR code
app.get('/get-qr', (req, res) => {
    if (currentQR) {
        res.json({ qr: currentQR });
    } else {
        res.json({ message: 'No QR code available. Please wait or try regenerating.' });
    }
});

// API route to regenerate the QR code
app.get('/regenerate-qr', async (req, res) => {
    await connectToWhatsApp();  // Reconnect to regenerate QR
    res.json({ message: 'QR code is being regenerated. Please check back shortly.' });
});

// Start the Express server
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
