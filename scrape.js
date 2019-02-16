#!/usr/bin/env node

const fs = require('fs');
const cacheFile = 'cache/last-seen-committees.json';
const Browser = require('zombie');
const browser = new Browser({waitDuration: '30s'});

browser.visit('https://efiling.ocf.dc.gov/Disclosure')
    .then(getTypes)
    .then(getLastSeen)
    .then(findNewRecords);

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
            const lastSeen = err ? {} : JSON.parse(json);
            for (const type of types) {
                if (!lastSeen[type]) {
                    lastSeen[type] = null;
                }
            }
            resolve(lastSeen);
        });
    });
}

async function findNewRecords(lastSeen) {
    let changed = false;
    for (const [type, lastSeenId] of Object.entries(lastSeen)) {
        const newRecords = await findNewRecordsForType(type, lastSeenId);
        console.log(type, newRecords);
        if (newRecords[0]) {
            lastSeen[type] = newRecords[0].Id;
            changed = true;
        }
    }
    if (changed) {
        fs.writeFileSync(cacheFile, JSON.stringify(lastSeen, null, 2));
    }
    return lastSeen;
}

function findNewRecordsForType(type, lastSeenId) {
    return browser.select('#FilerTypeId', type)
        .then(pause)
        .then(() => browser.click('#btnSubmitSearch'))
        .then(getSearchData)
        .then(function (records) {
            const newRecords = [];
            for (const record of records) {
                if (lastSeenId && record.Id === lastSeenId) {
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
}
