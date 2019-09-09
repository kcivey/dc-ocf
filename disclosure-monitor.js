#!/usr/bin/env node

require('dotenv').config();
const fs = require('fs');
const sendEmail = require('./lib/send-email');
const cacheFile = __dirname + '/last-seen-committees.json';
const Browser = require('zombie');
const browser = new Browser({waitDuration: '30s'});

browser.visit('https://efiling.ocf.dc.gov/Disclosure')
    .then(getTypes)
    .then(getLastSeen)
    .then(findNewRecords)
    .then(sendNotification);

function getTypes() {
    const types = [];
    const options = browser.field('#FilerTypeId').options;
    for (const option of options) {
        if (option.value) {
            types.push(option.text);
        }
    }
    return types;
}

function getLastSeen(types) {
    return new Promise(function (resolve, reject) {
        fs.readFile(cacheFile, function (err, json) {
            let lastSeen = {};
            if (err) {
                if (err.code !== 'ENOENT') {
                    return reject(err);
                }
            }
            else {
                lastSeen = JSON.parse(json);
            }
            for (const type of types) {
                if (!lastSeen[type]) {
                    lastSeen[type] = null;
                }
            }
            return resolve(lastSeen);
        });
    });
}

async function findNewRecords(lastSeen) {
    const allNewRecords = {};
    let changed = false;
    for (const [type, lastSeenId] of Object.entries(lastSeen)) {
        const newRecords = await findNewRecordsForType(type, lastSeenId);
        if (newRecords.length) {
            lastSeen[type] = newRecords[0].Id;
            changed = true;
            allNewRecords[type] = newRecords;
        }
    }
    if (changed) {
        fs.writeFileSync(cacheFile, JSON.stringify(lastSeen, null, 2));
    }
    return allNewRecords;
}

function findNewRecordsForType(type, lastSeenId) {
    return browser.select('#FilerTypeId', type)
        .then(pause)
        .then(() => browser.click('#btnSubmitSearch'))
        .then(getSearchData)
        .then(function (records) {
            const newRecords = [];
            for (const record of records) {
                if (lastSeenId && record.Id <= lastSeenId) {
                    break;
                }
                newRecords.push(record);
            }
            return newRecords;
        });
}

function pause() {
    return new Promise(resolve => setTimeout(resolve, 5000));
}

function getSearchData() {
    let i = browser.resources.length;
    while (i > 0) {
        i--;
        const resource = browser.resources[i];
        if (resource.request.url.match(/\/Search$/)) {
            return JSON.parse(resource.response.body).data;
        }
    }
    throw new Error('Search data not found');
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
            count++;
        }
        text += '\n';
    }
    if (count) {
        sendEmail({
            text,
            from: process.env.EMAIL_SENDER,
            to: process.env.EMAIL_RECIPIENT,
            subject: `${count} new OCF filing${count === 1 ? '' : 's'}`,
        });
    }
}
