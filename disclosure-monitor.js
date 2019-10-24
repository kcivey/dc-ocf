#!/usr/bin/env node

require('dotenv').config();
const argv = require('yargs')
    .options({
        verbose: {
            type: 'boolean',
            describe: 'print something about what\'s going on',
            alias: 'v',
        },
    })
    .strict(true)
    .argv;
const OcfDisclosures = require('./lib/ocf-disclosures');
const sendEmail = require('./lib/send-email');

main().catch(console.trace);

async function main() {
    const ocf = new OcfDisclosures({
        verbose: argv.verbose,
        year: null,
        withDetails: false,
        useLastSeen: true,
    });
    const types = await ocf.getFilerTypes();
    const lastSeen = await ocf.getLastSeen(types);
    const allNewRecords = await ocf.findNewRecords(lastSeen);
    await sendNotification(allNewRecords);
}

function sendNotification(allNewRecords) {
    let text = '';
    let count = 0;
    for (const [type, records] of Object.entries(allNewRecords)) {
        text += type + '\n';
        for (const record of records) {
            text += '\n';
            for (const [key, value] of Object.entries(record)) {
                text += `  ${key}: ${value}\n`;
            }
            text += `  https://efiling.ocf.dc.gov/Disclosure/FilingHistory/${record.Id}\n`;
            count++;
        }
        text += '\n';
    }
    const subject = `${count} new OCF filing${count === 1 ? '' : 's'}`;
    log(subject);
    if (count) {
        log(`Sending email to ${process.env.EMAIL_RECIPIENT}`);
        sendEmail({
            text,
            from: process.env.EMAIL_SENDER,
            to: process.env.EMAIL_RECIPIENT,
            subject,
        });
    }
}

function log(...args) {
    if (argv.verbose) {
        console.warn(...args);
    }
}
