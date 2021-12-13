#!/usr/bin/env node

require('dotenv').config();
const {SMTPClient} = require('emailjs');
let client = null;
const config = {
    user: process.env.EMAIL_USER,
    password: process.env.EMAIL_PASSWORD,
    host: process.env.EMAIL_HOST || 'email-smtp.us-east-1.amazonaws.com',
    port: +process.env.EMAIL_PORT || 587,
    tls: process.env.EMAIL_TLS ? process.env.EMAIL_TLS === 'true' : true,
};

if (require.main === module) {
    // Called directly
    sendEmail({
        text: 'Test message from ' + __filename,
        from: process.env.EMAIL_SENDER,
        to: process.env.EMAIL_RECIPIENT,
        subject: 'Test message ' + new Date().toLocaleTimeString(),
    })
        .then(() => console.log('Test email sent'));
}

function sendEmail(message, callback) { // eslint-disable-line consistent-return
    if (!client) {
        client = new SMTPClient(config);
    }
    if (callback) {
        client.send(message, callback);
    }
    else {
        return new Promise(function (resolve, reject) {
            client.send(message, function (err, message) {
                if (err) {
                    reject(err);
                }
                else {
                    resolve(message);
                }
            });
        });
    }
}

module.exports = sendEmail;
